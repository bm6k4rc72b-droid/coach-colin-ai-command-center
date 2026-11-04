#!/usr/bin/env python3
"""ViralX highlight reel: turn a long video into a ~20 s vertical reel with an emotional hook
and a solution payoff.

    highlight.py <youtube-url | video file> [--length 20] [--hook "TEXT"] [--out reel.mp4]

Pipeline
  1. Source     yt-dlp downloads up to 1080p plus YouTube's own captions (json3, word timed).
                A local file works too (add --subs file.json3/.vtt if you have captions).
  2. Signals    the same formulas as the ViralX app, measured every 0.25 s: motion, cuts, faces
                and face size (OpenCV), loudness and its rise (PCM RMS), saturation, sharpness.
                attention = .30 motion + .25 cut nearby + .20 face + .25 max(rise, loud/2)
                emotion   = .55 face closeness + .25 loudness swing + .20 saturation
  3. Story      candidate windows snap to caption sentences (else to cuts). Three roles:
                  HOOK      highest emotion + problem/stakes words, 2.5-4.5 s, played first
                  PEAKS     highest attention, kept in source order
                  SOLUTION  solution/answer words + clarity, 3.5-6 s, played last
  4. Look       9:16 crop that follows the face, ESPCN x2 neural upscale (OpenCV dnn_superres)
                then Lanczos to 1080x1920, contrast/saturation grade, teal-shadow/warm-highlight
                split tone, vignette, fine grain, 0.25 s cross-fades, loudness to -14 LUFS.
  5. Text       hook title for the first 3 s, word-by-word captions (active word in pink), a
                progress bar, and a source credit.

The scores rank moments inside this one video. They do not predict views.
Re-uploading someone else's video can infringe copyright: use your own footage or get permission.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
FONT_DIR = HERE / "fonts"
ESPCN = HERE / "models" / "ESPCN_x2.pb"
STEP = 0.25  # analysis grid, seconds
W, H = 1080, 1920
XF = 0.25  # cross-fade, seconds
PINK = "&H00D84FFF"  # ASS is &HAABBGGRR: #ff4fd8

PROBLEM = re.compile(r"\b(never|nobody|no one|alone|lost|fail\w*|afraid|scared|fear|pain|hurt|struggl\w*|problem|hard(est)?|worst|broke|cry\w*|why|what if|stop|mistake|wrong|dying|died|death|sick|stress\w*|anxi\w*|panic|terrif\w*|danger\w*|risk|gone|miss(ed|ing)?|can't|cannot|couldn't|didn't|almost)\b", re.I)
SOLUTION = re.compile(r"\b(here'?s how|the (answer|key|secret|trick|fix)|solution|solve[ds]?|fix(ed)?|so you can|you can|just|simple|step|start|try|instead|finally|works?|changed|change your|the way to|that'?s why|now you|help(s|ed)?|save[ds]?|protect\w*|safe(ly|ty)?)\b", re.I)
STAKES = re.compile(r"(\?|\byou\b|\byour\b|\d+)", re.I)


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)], capture_output=True, text=True, check=True).stdout
    j = json.loads(out)
    v = next(s for s in j["streams"] if s["codec_type"] == "video")
    has_audio = any(s["codec_type"] == "audio" for s in j["streams"])
    return float(j["format"]["duration"]), int(v["width"]), int(v["height"]), has_audio


# ── 1. source ────────────────────────────────────────────────────────────────

def fetch(url, work: Path):
    import yt_dlp
    opts = {
        "format": "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b",
        "merge_output_format": "mp4", "outtmpl": str(work / "source.%(ext)s"),
        "writesubtitles": True, "writeautomaticsub": True, "subtitleslangs": ["en", "en.*"], "subtitlesformat": "json3",
        "quiet": True, "no_warnings": True, "noplaylist": True,
    }
    with yt_dlp.YoutubeDL(opts) as y:
        info = y.extract_info(url, download=True)
    video = next(p for p in work.glob("source.*") if p.suffix in (".mp4", ".mkv", ".webm"))
    subs = next(iter(sorted(work.glob("source*.json3"))), None)
    meta = {k: info.get(k) for k in ("title", "uploader", "channel", "webpage_url", "duration", "license")}
    return video, subs, meta


# ── captions → words ─────────────────────────────────────────────────────────

def words_from_json3(path):
    j = json.loads(Path(path).read_text())
    words = []
    for ev in j.get("events", []):
        t0 = ev.get("tStartMs", 0) / 1000
        dur = ev.get("dDurationMs", 0) / 1000
        segs = [s for s in ev.get("segs", []) if s.get("utf8", "").strip()]
        for i, s in enumerate(segs):
            st = t0 + s.get("tOffsetMs", 0) / 1000
            nxt = t0 + segs[i + 1].get("tOffsetMs", 0) / 1000 if i + 1 < len(segs) else t0 + dur
            for k, w in enumerate(s["utf8"].split()):
                words.append({"text": w, "start": st + k * 0.01, "end": max(st + 0.15, min(nxt, st + 1.2))})
    words.sort(key=lambda w: w["start"])
    # De-duplicate rolling auto-caption repeats.
    out = []
    for w in words:
        if out and w["text"] == out[-1]["text"] and w["start"] - out[-1]["start"] < 0.4:
            continue
        out.append(w)
    return out


def words_from_vtt(path):
    words = []
    for block in Path(path).read_text().split("\n\n"):
        m = re.search(r"(\d+):(\d+):([\d.]+) --> (\d+):(\d+):([\d.]+)", block)
        if not m:
            continue
        a = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])
        b = int(m[4]) * 3600 + int(m[5]) * 60 + float(m[6])
        text = re.sub(r"<[^>]+>", "", block.split("\n", 1)[1] if "\n" in block else "").split()
        for i, w in enumerate(text):
            words.append({"text": w, "start": a + (b - a) * i / len(text), "end": a + (b - a) * (i + 1) / len(text)})
    return words


def sentences(words, gap=0.6, max_len=6.0):
    out, cur = [], []
    for w in words:
        if cur and (w["start"] - cur[-1]["end"] > gap or w["end"] - cur[0]["start"] > max_len or re.search(r"[.!?]$", cur[-1]["text"])):
            out.append(cur); cur = []
        cur.append(w)
    if cur:
        out.append(cur)
    return [{"start": s[0]["start"], "end": s[-1]["end"], "text": " ".join(w["text"] for w in s), "words": s} for s in out]


# ── 2. signals ───────────────────────────────────────────────────────────────

def lerp01(v, lo, hi):
    return np.clip((np.asarray(v, float) - lo) / (hi - lo), 0, 1)


def analyse(video, dur, has_audio):
    import cv2
    fps = 1 / STEP
    sw = 320
    _, w0, h0, _ = probe(video)
    sh = int(round(h0 * sw / w0 / 2) * 2)
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(video), "-vf", f"fps={fps},scale={sw}:{sh}", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], stdout=subprocess.PIPE)
    casc = None
    for xml in (HERE / "models" / "haarcascade_frontalface_default.xml", Path(getattr(cv2, "data", None).haarcascades if hasattr(cv2, "data") else "") / "haarcascade_frontalface_default.xml"):
        if xml.exists():
            c = cv2.CascadeClassifier(str(xml))
            if not c.empty():
                casc = c; break
    if casc is None:
        print("     (no face detector: scoring without faces)")
    prev, rows = None, []
    size = sw * sh * 3
    while True:
        buf = proc.stdout.read(size)
        if len(buf) < size:
            break
        f = np.frombuffer(buf, np.uint8).reshape(sh, sw, 3)
        g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
        hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
        diff = float(np.mean(np.abs(g.astype(np.int16) - prev.astype(np.int16)))) / 255 if prev is not None else 0.0
        faces = casc.detectMultiScale(g, 1.15, 5, minSize=(int(sh * 0.08), int(sh * 0.08))) if casc is not None else ()
        fh, fx = 0.0, None
        if len(faces):
            x, y, w, hh = max(faces, key=lambda r: r[2] * r[3])
            fh, fx = hh / sh, (x + w / 2) / sw
        rows.append({"diff": diff, "faceH": fh, "faceX": fx, "sat": float(hsv[..., 1].mean()) / 255,
                     "luma": float(g.mean()) / 255, "sharp": float(cv2.Laplacian(g, cv2.CV_64F).var())})
        prev = g
    proc.wait()
    n = len(rows)
    t = np.arange(n) * STEP
    loud = np.full(n, -60.0)
    if has_audio:
        pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], capture_output=True, check=True).stdout
        a = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768
        hop = int(16000 * STEP)
        for i in range(n):
            seg = a[i * hop:(i + 1) * hop]
            if len(seg):
                r = math.sqrt(float(np.mean(seg * seg)))
                loud[i] = 20 * math.log10(r) if r > 1e-5 else -100
    diff = np.array([r["diff"] for r in rows])
    med = np.median(diff[1:]) if n > 2 else 0
    cuts = np.zeros(n)
    for i in range(1, n):
        win = np.concatenate([diff[max(1, i - 3):i], diff[i + 1:i + 4]])
        if diff[i] > 0.12 and diff[i] > 2.5 * max(np.median(win) if len(win) else med, 0.01):
            cuts[i] = 1
    cut_near = np.convolve(cuts, np.ones(5), "same").clip(0, 1)  # ±0.5 s
    L = lerp01(loud, -45, -12)
    rise = lerp01(L - np.concatenate([np.full(2, L[0] if n else 0), L[:-2]]), 0, 0.3)
    motion = lerp01(diff, 0.005, 0.08)
    face = np.array([1.0 if r["faceH"] > 0 else 0.0 for r in rows])
    close = lerp01([r["faceH"] for r in rows], 0.08, 0.5)
    sat = lerp01([r["sat"] for r in rows], 0.15, 0.6)
    swing = np.clip(np.abs(L - np.median(L)) * 2.5, 0, 1)
    clarity = 0.45 * lerp01([r["sharp"] for r in rows], 20, 300) + 0.35 * (1 - np.clip(np.abs(np.array([r["luma"] for r in rows]) - 0.5) / 0.35, 0, 1))
    attention = 0.30 * motion + 0.25 * cut_near + 0.20 * face + 0.25 * np.maximum(rise, L * 0.5)
    emotion = 0.55 * close + 0.25 * swing + 0.20 * sat
    return {"t": t, "attention": attention, "emotion": emotion, "clarity": clarity, "loud": L, "cuts": t[cuts > 0],
            "faceX": [r["faceX"] for r in rows], "n": n}


# ── 3. story ─────────────────────────────────────────────────────────────────

def window_mean(arr, a, b):
    i, j = int(a / STEP), max(int(a / STEP) + 1, int(b / STEP))
    seg = arr[i:j]
    return float(np.mean(seg)) if len(seg) else 0.0


def candidates(sig, sents, dur):
    c = []
    if sents:
        for i, s in enumerate(sents):
            a, b = s["start"], s["end"]
            # Extend short lines with the next one so every candidate is a complete thought.
            j, text = i, s["text"]
            while b - a < 2.5 and j + 1 < len(sents) and sents[j + 1]["start"] - b < 0.8:
                j += 1; b = sents[j]["end"]; text += " " + sents[j]["text"]
            c.append({"start": max(0, a - 0.1), "end": min(dur, b + 0.15), "text": text})
    else:
        cuts = [0.0] + [float(x) for x in sig["cuts"]] + [dur]
        for a, b in zip(cuts, cuts[1:]):
            x = a
            while b - x >= 1.5:
                c.append({"start": x, "end": min(b, x + 4.0), "text": ""}); x += 2.0
    for k in c:
        a, b = k["start"], k["end"]
        k["att"] = window_mean(sig["attention"], a, b)
        k["emo"] = window_mean(sig["emotion"], a, b)
        k["clar"] = window_mean(sig["clarity"], a, b)
        k["problem"] = len(PROBLEM.findall(k["text"]))
        k["solution"] = len(SOLUTION.findall(k["text"]))
        k["stakes"] = len(STAKES.findall(k["text"]))
        k["pos"] = a / max(dur, 1)
    return c


def overlaps(a, picks, pad=0.5):
    return any(a["start"] < p["end"] + pad and a["end"] > p["start"] - pad for p in picks)


def trim(k, lo, hi):
    k = dict(k)
    if k["end"] - k["start"] > hi:
        # keep the middle `hi` seconds of an over-long line
        mid = (k["start"] + k["end"]) / 2
        k["start"], k["end"] = mid - hi / 2, mid + hi / 2
    if k["end"] - k["start"] < lo:
        k["end"] = k["start"] + lo
    return k


def story(cands, length, dur):
    picks = []
    hook_pool = [k for k in cands if k["pos"] < 0.9] or cands
    hook = max(hook_pool, key=lambda k: 1.2 * k["emo"] + 0.6 * k["att"] + 0.25 * min(k["problem"], 3) + 0.08 * min(k["stakes"], 3))
    hook = trim(hook, 2.5, 4.5); hook["role"] = "hook"; picks.append(hook)
    sol_pool = [k for k in cands if not overlaps(k, picks) and k["pos"] > 0.25] or [k for k in cands if not overlaps(k, picks)]
    sol = max(sol_pool, key=lambda k: 0.35 * min(k["solution"], 3) + 0.5 * k["clar"] + 0.4 * k["att"] + 0.3 * k["pos"]) if sol_pool else None
    if sol:
        sol = trim(sol, 3.5, 6.0); sol["role"] = "solution"; picks.append(sol)
    budget = length - sum(p["end"] - p["start"] for p in picks) + XF * 4
    peaks = []
    for k in sorted(cands, key=lambda k: k["att"] + 0.5 * k["emo"], reverse=True):
        if budget < 1.8:
            break
        if overlaps(k, picks + peaks, pad=1.0):
            continue
        k = trim(k, 1.8, min(4.0, budget)); k["role"] = "peak"
        peaks.append(k); budget -= k["end"] - k["start"] - XF
    peaks.sort(key=lambda k: k["start"])
    order = [picks[0]] + peaks + ([sol] if sol else [])
    # Fit the total to the target length (cross-fades overlap the joins).
    total = sum(p["end"] - p["start"] for p in order) - XF * (len(order) - 1)
    if total > length and len(order) > 1:
        excess = total - length
        for p in sorted(order[1:-1] or order, key=lambda p: p["end"] - p["start"], reverse=True):
            cut = min(excess, (p["end"] - p["start"]) - 1.8)
            if cut > 0:
                p["end"] -= cut; excess -= cut
            if excess <= 0:
                break
    return order


# ── 4. look ──────────────────────────────────────────────────────────────────

def crop_x(sig, a, b, w0, h0):
    xs = [x for x in sig["faceX"][int(a / STEP):int(b / STEP) + 1] if x is not None]
    cx = float(np.median(xs)) if xs else 0.5
    cw = h0 * 9 / 16
    if cw >= w0:
        return 0, w0
    x = min(max(cx * w0 - cw / 2, 0), w0 - cw)
    return int(x) // 2 * 2, int(cw) // 2 * 2


def render_segment(src, seg, i, work, sig, w0, h0, upscale, has_audio):
    a, b = seg["start"], seg["end"]
    x, cw = crop_x(sig, a, b, w0, h0)
    crop = f"crop={cw}:{h0 - h0 % 2}:{x}:0" if cw < w0 else f"crop={w0}:{int(w0 * 16 / 9) // 2 * 2 if w0 * 16 / 9 <= h0 else h0}"
    grade = ("eq=contrast=1.07:saturation=1.14:gamma=0.98,"
             "colorbalance=rs=-0.04:bs=0.06:rh=0.05:bh=-0.04,"
             "unsharp=5:5:0.7:5:5:0.0,vignette=PI/5,noise=alls=5:allf=t")
    out = work / f"seg{i:02d}.mp4"
    aud = ["-map", "0:a:0", "-c:a", "aac", "-b:a", "192k", "-ar", "48000"] if has_audio else ["-an"]
    if upscale and ESPCN.exists():
        import cv2
        sr = cv2.dnn_superres.DnnSuperResImpl_create(); sr.readModel(str(ESPCN)); sr.setModel("espcn", 2)
        # Decode the crop, upscale x2 with ESPCN, then hand frames to the grading encoder.
        cw2 = cw if cw < w0 else w0
        ch = h0 - h0 % 2 if cw < w0 else (int(w0 * 16 / 9) // 2 * 2 if w0 * 16 / 9 <= h0 else h0)
        up_aud = ["-map", "1:a:0", "-c:a", "aac", "-b:a", "192k", "-ar", "48000"] if has_audio else ["-an"]
        dec = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{a:.3f}", "-to", f"{b:.3f}", "-i", str(src), "-vf", f"{crop},fps=30", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], stdout=subprocess.PIPE)
        enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{cw2 * 2}x{ch * 2}", "-r", "30", "-i", "-",
                                "-ss", f"{a:.3f}", "-to", f"{b:.3f}", "-i", str(src),
                                "-map", "0:v", *up_aud,
                                "-vf", f"scale={W}:{H}:flags=lanczos,{grade},format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-shortest", str(out)], stdin=subprocess.PIPE)
        size = cw2 * ch * 3
        while True:
            buf = dec.stdout.read(size)
            if len(buf) < size:
                break
            enc.stdin.write(sr.upsample(np.frombuffer(buf, np.uint8).reshape(ch, cw2, 3)).tobytes())
        dec.wait(); enc.stdin.close(); enc.wait()
        if enc.returncode:
            raise RuntimeError(f"encode failed for segment {i}")
    else:
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{a:.3f}", "-to", f"{b:.3f}", "-i", str(src), "-map", "0:v:0", *aud,
             "-vf", f"{crop},scale={W}:{H}:flags=lanczos,fps=30,{grade},format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "16", str(out)])
    d, *_ = probe(out)
    return out, d


# ── 5. text ──────────────────────────────────────────────────────────────────

def ass_time(t):
    t = max(0, t)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def build_ass(path, hook_text, words_reel, total, credit):
    hdr = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,Bebas Neue,118,&H00FFFFFF,&H00FFFFFF,{PINK},&H00000000,0,0,0,0,100,100,2,0,3,22,0,8,70,70,300,1
Style: Cap,Bebas Neue,104,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,1,0,1,7,3,2,80,80,520,1
Style: Credit,DejaVu Sans,30,&H99FFFFFF,&H99FFFFFF,&H64000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,3,40,40,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev = []
    if hook_text:
        ev.append(f"Dialogue: 2,{ass_time(0)},{ass_time(3.0)},Hook,,0,0,0,,{{\\fad(120,200)\\t(0,180,\\fscx104\\fscy104)\\t(180,320,\\fscx100\\fscy100)}}{hook_text.upper()}")
    # Captions: groups of up to 3 words, active word in pink.
    i = 0
    while i < len(words_reel):
        grp = [words_reel[i]]
        while len(grp) < 3 and i + len(grp) < len(words_reel):
            nxt = words_reel[i + len(grp)]
            if nxt["start"] - grp[-1]["end"] > 0.45 or len(" ".join(w["text"] for w in grp + [nxt])) > 18 or re.search(r"[.!?]$", grp[-1]["text"]):
                break
            grp.append(nxt)
        for k, w in enumerate(grp):
            a = w["start"]; b = grp[k + 1]["start"] if k + 1 < len(grp) else w["end"]
            if a < 3.0 and hook_text:  # keep the hook title clean
                continue
            txt = " ".join((f"{{\\c{PINK}}}{x['text'].upper()}{{\\c&H00FFFFFF&}}" if j == k else x["text"].upper()) for j, x in enumerate(grp))
            ev.append(f"Dialogue: 1,{ass_time(a)},{ass_time(min(b, total))},Cap,,0,0,0,,{txt}")
        i += len(grp)
    if credit:
        ev.append(f"Dialogue: 0,{ass_time(0)},{ass_time(total)},Credit,,0,0,0,,{credit}")
    Path(path).write_text(hdr + "\n".join(ev) + "\n")


def esc_filter_path(p):
    return str(p).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source")
    ap.add_argument("--subs", help="captions file (.json3 or .vtt) for a local video")
    ap.add_argument("--length", type=float, default=20)
    ap.add_argument("--hook", help="on-screen hook for the first 3 s (default: the hook line itself)")
    ap.add_argument("--credit", help="credit line (default: the source channel)")
    ap.add_argument("--out", default="viralx-reel.mp4")
    ap.add_argument("--work", default="viralx-work")
    ap.add_argument("--no-upscale", action="store_true", help="Lanczos only (much faster)")
    args = ap.parse_args()

    work = Path(args.work); work.mkdir(parents=True, exist_ok=True)
    meta, subs = {}, args.subs
    if re.match(r"https?://", args.source):
        print("1/5  downloading…", flush=True)
        src, subs_dl, meta = fetch(args.source, work)
        subs = subs or subs_dl
        print(f"     {meta.get('title')!r} by {meta.get('channel') or meta.get('uploader')}")
    else:
        src = Path(args.source)
    dur, w0, h0, has_audio = probe(src)
    words = []
    if subs:
        words = words_from_json3(subs) if str(subs).endswith(".json3") else words_from_vtt(subs)
    sents = sentences(words)
    print(f"2/5  measuring {dur:.0f} s ({w0}x{h0}, {len(words)} caption words)…", flush=True)
    sig = analyse(src, dur, has_audio)
    print("3/5  building the story…", flush=True)
    order = story(candidates(sig, sents, dur), args.length, dur)
    for p in order:
        print(f"     {p['role']:<8} {p['start']:7.2f}-{p['end']:7.2f}s  att {p['att']:.2f} emo {p['emo']:.2f}  {p['text'][:70]!r}")
    print(f"4/5  grading{' + ESPCN x2 upscale' if not args.no_upscale else ''}…", flush=True)
    segs = [render_segment(src, p, i, work, sig, w0, h0, not args.no_upscale, has_audio) for i, p in enumerate(order)]

    # Join with cross-fades and map caption words onto the reel timeline.
    starts, acc = [], 0.0
    for i, (_, d) in enumerate(segs):
        starts.append(acc); acc += d - XF
    total = acc + XF
    words_reel = []
    for p, s0 in zip(order, starts):
        for w in words:
            if w["start"] >= p["start"] and w["end"] <= p["end"] + 0.2:
                words_reel.append({"text": w["text"], "start": w["start"] - p["start"] + s0, "end": min(w["end"], p["end"]) - p["start"] + s0})
    hook_text = args.hook or (" ".join(order[0]["text"].split()[:7]) if order[0]["text"] else "")
    credit = args.credit if args.credit is not None else (f"Source: {meta.get('channel') or meta.get('uploader')}" if meta else "")
    ass = work / "text.ass"
    build_ass(ass, hook_text, words_reel, total, credit)

    print("5/5  joining, captions, loudness…", flush=True)
    inputs = sum((["-i", str(p)] for p, _ in segs), [])
    fc, v, a = [], "[0:v]", "[0:a]"
    for i in range(1, len(segs)):
        off = starts[i]
        fc.append(f"{v}[{i}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}[v{i}]"); v = f"[v{i}]"
        if has_audio:
            fc.append(f"{a}[{i}:a]acrossfade=d={XF}[a{i}]"); a = f"[a{i}]"
    bar = f"drawbox=x=0:y={H - 12}:w='iw*t/{total:.3f}':h=12:color=0xff4fd8@0.95:t=fill"
    fc.append(f"{v}{bar},subtitles='{esc_filter_path(ass)}':fontsdir='{esc_filter_path(FONT_DIR)}',format=yuv420p[vout]")
    if has_audio:
        fc.append(f"{a}loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]")
    run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(fc), "-map", "[vout]", *(["-map", "[aout]"] if has_audio else []),
         "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         *(["-c:a", "aac", "-b:a", "192k"] if has_audio else []), "-t", f"{total:.3f}", args.out])
    report = {"source": meta or str(src), "length": round(total, 2), "segments": [{k: (round(v, 2) if isinstance(v, float) else v) for k, v in p.items()} for p in order], "hook": hook_text}
    Path(args.out).with_suffix(".json").write_text(json.dumps(report, indent=2))
    print(f"done: {args.out} ({total:.1f} s, {W}x{H})")


if __name__ == "__main__":
    main()

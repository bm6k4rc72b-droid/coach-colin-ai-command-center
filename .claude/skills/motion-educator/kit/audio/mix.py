#!/usr/bin/env python3
"""Mixes a film's sound: the narration (when the film has one), one music bed and the sound effects in its cue
sheet, laid onto the silent picture.

    python3 kit/audio/mix.py films/NAME [--no-music] [--no-sfx] [--no-voice] [--lufs -14] [--picture FILE] [--out FILE]

Reads films/NAME/cues.json and films/NAME/out/picture.mp4, writes films/NAME/out/NAME.mp4.
The sounds themselves live in kit/audio/lib (kit/audio/fetch.sh downloads them); a cue names one by its path there.

cues.json:
    music:  {file, start, lufs, fade_in, fade_out, duck_db}   start = where in the track the film begins
    events: [{t, file, db, align, duck, pan, trim, fade, fade_in, note}]   t = film time in seconds
            align "peak" puts the sound's loudest moment on t, "end" its last moment, "start" its first sample.
            db is the level of the sound's own peak, in dBFS, before the master gain.
            duck true dips the music under the sound, so a hit lands in a hole.
    voice:  {lufs, duck_db, sfx_db, chain}   optional; the narration itself is films/NAME/voice/take.mp3, cut as
            voice.json says (kit/audio/voice.mjs). chain is an ffmpeg filter chain for the voice (a high-pass, a
            little presence, de-essing and compression by default). While someone speaks the music sits duck_db
            lower and the effects sfx_db lower.

The picture is copied untouched. Needs ffmpeg and numpy. A report of every placed sound goes beside the film as
NAME.mix.txt, headed by the loudness and true peak measured on the finished file.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
SR = 48000
args = sys.argv[1:]
film = Path(next(arg for arg in args if not arg.startswith("--") and Path(arg).is_dir())).resolve()


def opt(name, default):
    return args[args.index(name) + 1] if name in args else default


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def loudness(x):
    """Integrated loudness, loudness range and true peak of a stereo buffer, measured by ffmpeg's ebur128."""
    raw = np.clip(x, -1, 1).astype(np.float32).tobytes()
    cmd = ["ffmpeg", "-hide_banner", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-af", "ebur128=peak=true", "-f", "null", "-"]
    err = subprocess.run(cmd, input=raw, capture_output=True).stderr.decode()
    summary = err[err.rfind("Summary:") :]
    grab = lambda pattern: float(re.search(pattern, summary).group(1))
    return grab(r"I:\s+(-?[\d.]+) LUFS"), grab(r"LRA:\s+([\d.]+) LU"), grab(r"Peak:\s+(-?[\d.]+) dBFS")


def gain(db):
    return 10 ** (db / 20)


picture = Path(opt("--picture", film / "out" / "picture.mp4"))
out = Path(opt("--out", film / "out" / f"{film.name}.mp4"))

duration = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(picture)], capture_output=True, text=True).stdout)
N = int(round(duration * SR))
plan = json.loads((film / "cues.json").read_text())
events = [] if "--no-sfx" in args else plan["events"]
# A short made to loop (the storyboard's "loop"): the end runs straight into the start, in the sound as in the picture.
board = film / "storyboard.json"
loop = bool(json.loads(board.read_text()).get("loop")) if board.exists() else False
report = []

# Music: the chosen window of the track, levelled to its target, faded at both ends.
music = np.zeros((N, 2))
if "--no-music" not in args:
    m = plan["music"]
    track = load(HERE / m["file"])
    a = int(m.get("start", 0) * SR)
    cut = track[a : a + N]
    music[: len(cut)] = cut
    level = gain(m["lufs"] - loudness(music)[0])
    music *= level
    if loop:
        # A film that loops has no ending: the bed runs on past the last frame, and that run-on is laid over the first
        # second and a half, fading out as the bed's own start fades in. When the player jumps from the last frame
        # back to the first, the music carries straight on.
        X = int(min(1.5, max(0.0, (len(track) - a - N) / SR)) * SR)
        if X >= int(0.3 * SR):
            tail = track[a + N : a + N + X] * level
            ramp = np.linspace(0, np.pi / 2, X)[:, None]
            music[:X] = music[:X] * np.sin(ramp) + tail * np.cos(ramp)
            report.append(f"loop: the bed's {X / SR:.1f} s after the last frame run on into the first")
        else:
            report.append("  <- loop: the bed stops at the last frame, so the music jumps when the film loops: compose it again (music.mjs adds the run-on)")
    else:
        fade_in, fade_out = int(m.get("fade_in", 0.01) * SR), int(m.get("fade_out", 1.5) * SR)
        music[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
        music[N - fade_out :] *= (np.linspace(1, 0, fade_out) ** 1.5)[:, None]
    # Ducking: a quick dip under each marked hit, a slower climb back.
    duck = np.zeros(N)
    depth = m.get("duck_db", -6)
    for e in events:
        if not e.get("duck"):
            continue
        scale = e["duck"] if isinstance(e["duck"], (int, float)) and not isinstance(e["duck"], bool) else 1.0
        i = int(e["t"] * SR)
        attack, hold, release = int(0.04 * SR), int(0.12 * SR), int(0.7 * SR)
        shape = np.concatenate([np.linspace(0, 1, attack), np.ones(hold), np.linspace(1, 0, release) ** 2]) * depth * scale
        start = max(0, i - attack)
        seg = shape[: N - start]
        duck[start : start + len(seg)] = np.minimum(duck[start : start + len(seg)], seg)
    music *= gain(duck)[:, None]
    # A ride: [[seconds, dB], ...] moves the music's level between those points, for a passage that sits too loud.
    if m.get("ride"):
        points = sorted(m["ride"])
        music *= gain(np.interp(np.arange(N) / SR, [p[0] for p in points], [p[1] for p in points]))[:, None]
    report.append(f"music {m['file']} from {m.get('start', 0)}s at {m['lufs']} LUFS, duck {depth} dB")

# Effects: each one normalised to its own peak, then placed and levelled as the plan says.
fx = np.zeros((N, 2))
cache = {}
for e in events:
    if e["file"] not in cache:
        cache[e["file"]] = load(HERE / e["file"])
    s = cache[e["file"]]
    if "trim" in e:
        s = s[int(e["trim"][0] * SR) : int(e["trim"][1] * SR)]
    s = s.copy()
    if e.get("fade"):
        n = min(len(s), int(e["fade"] * SR))
        s[-n:] *= np.linspace(1, 0, n)[:, None]
    if e.get("fade_in"):
        n = min(len(s), int(e["fade_in"] * SR))
        s[:n] *= np.linspace(0, 1, n)[:, None]
    env = np.abs(s).max(axis=1)
    peak_at = int(np.argmax(env))
    s = s / max(env.max(), 1e-9) * gain(e["db"])
    pan = e.get("pan", 0)
    s = s * np.array([min(1, 1 - pan), min(1, 1 + pan)])
    align = e.get("align", "start")
    offset = {"peak": peak_at, "end": len(s), "start": 0}[align]
    i = int(e["t"] * SR) - offset
    a, b = max(0, i), min(N, i + len(s))
    if b > a:
        fx[a:b] += s[a - i : b - i]
    report.append(f"{e['t']:6.2f}s  {e['db']:+5.1f} dB  {align:5s}  {e['file']}  {e.get('note', '')}")

# Narration. The film was cut to one continuous take (kit/audio/voice.mjs): the take is played in the stretches
# voice.json lists, through a voice chain, and the music and the effects make room while someone is speaking.
VOICE_CHAIN = "highpass=f=85,equalizer=f=220:t=q:w=1.1:g=-1.5,equalizer=f=2400:t=q:w=1.4:g=2,deesser=i=0.35:m=0.5:f=0.5,acompressor=threshold=-21dB:ratio=3:attack=8:release=140:knee=6:makeup=2"
voice = np.zeros((N, 2))
spoken = 0
lines_file = film / "voice" / "voice.json"
if lines_file.exists() and "--no-voice" not in args:
    v = plan.get("voice", {})
    recorded = json.loads(lines_file.read_text())
    edge = int(0.008 * SR)

    def place(s, at):
        global spoken
        s = s.copy()
        s[:edge] *= np.linspace(0, 1, edge)[:, None]
        s[-edge:] *= np.linspace(1, 0, edge)[:, None]
        i = int(at * SR)
        a, b = max(0, i), min(N, i + len(s))
        if b > a:
            voice[a:b] += s[a - i : b - i]
            spoken += 1

    if recorded.get("version") == 2:
        chain = v.get("chain", VOICE_CHAIN)
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(film / "voice" / recorded["take"]["file"]), "-af", chain, "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
        take = np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)
        for piece in recorded.get("pieces", []):
            place(take[int(piece["from"] * SR) : int(piece["to"] * SR)], piece["at"])
            report.append(f"{piece['at']:6.2f}s  voice        take {piece['from']:.2f}-{piece['to']:.2f} s")
    else:
        # The old way: one recording a shot, each started on its first sound.
        shots = json.loads((film / "storyboard.json").read_text())["shots"]
        for shot in shots:
            line = recorded.get("lines", {}).get(shot["id"])
            if not line or not shot.get("voice"):
                continue
            s = load(film / "voice" / line["file"])
            a, b = int(line.get("lead", 0) * SR), len(s) - max(0, int(line.get("tail", 0) * SR) - int(0.06 * SR))
            place(s[max(0, a - edge) : b], shot["start"] + v.get("lead", 0.15))
            report.append(f"{shot['start'] + v.get('lead', 0.15):6.2f}s  voice        {line['file']}  {line.get('speech', 0):.2f} s  {shot['voice'][:60]}")
    # "gain": [{"from": s, "to": s, "db": dB}] in the plan's voice lifts (or lowers) a stretch of the narration that
    # came out of the take quieter than the rest, with 60 ms ramps at both ends.
    for g in v.get("gain", []):
        a, b = int(g["from"] * SR), min(N, int(g["to"] * SR))
        if b <= a:
            continue
        env = np.full(b - a, 10 ** (g["db"] / 20))
        r = min(int(0.06 * SR), (b - a) // 2)
        env[:r] = np.linspace(1, env[0], r)
        env[-r:] = np.linspace(env[0], 1, r)
        voice[a:b] *= env[:, None]
        report.append(f"{g['from']:6.2f}s  voice        {g['db']:+.1f} dB to {g['to']:.2f} s")
    if spoken and loop:
        # Across the loop the voice should run on like one sentence: the silence from the last word to the end plus the
        # silence before the first word is the pause the viewer hears at the seam.
        said = np.nonzero(np.abs(voice).max(axis=1) > 1e-4)[0]
        if len(said):
            seam = (N - said[-1]) / SR + said[0] / SR
            note = "" if 0.12 <= seam <= 0.9 else ("  <- longer than a breath: the loop will sound like a restart; end the picture sooner after the last word or start the first word sooner" if seam > 0.9 else "  <- the words collide at the seam: leave a breath")
            report.append(f"loop: {seam:.2f} s between the last word and the first{note}")
    if spoken:
        voice *= gain(v.get("lufs", -16) - loudness(voice)[0])
        # Where speech is: its envelope, opened a little early and closed slowly, so the bed breathes instead of pumping.
        hop = SR // 100
        level = np.abs(voice).max(axis=1)[: N // hop * hop].reshape(-1, hop).max(axis=1)
        talking = (level > gain(-45)).astype(np.float64)
        reach = np.ones(41) / 41
        talking = np.clip(np.convolve(np.maximum.reduce([np.roll(talking, -k) for k in range(0, 14)]), reach, mode="same") * 1.6, 0, 1)
        env = np.interp(np.arange(N), np.arange(len(talking)) * hop + hop / 2, talking)
        # Under a voice the bed sits well down: about 18 dB or more below the speech.
        music *= gain(v.get("duck_db", -11) * env)[:, None]
        fx *= gain(v.get("sfx_db", -4) * env)[:, None]

mix = music + fx + voice
target = float(opt("--lufs", "-14"))
before = loudness(mix)
mix *= gain(target - before[0])
# The level change pushes a few peaks over; a look-ahead limiter holds them, and the encoded file is measured
# afterwards, because the encoder itself can add a decibel or two on the hardest hits.
wav = out.with_suffix(".mix.wav")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-c:a", "pcm_f32le", str(wav)], input=mix.astype(np.float32).tobytes(), check=True)
cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(picture), "-i", str(wav), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-af", "aresample=192000,alimiter=limit=0.84:attack=4:release=80:level=false,aresample=48000", "-c:a", "aac", "-b:a", "320k", "-t", f"{N / SR:.6f}", "-movflags", "+faststart", str(out)]
subprocess.run(cmd, check=True)
after = loudness(load(out))
# The limiter takes a little off the loudest stretches: when that leaves the file more than 0.15 LU off the
# target, level the mix again by the difference and encode it once more.
if abs(after[0] - target) > 0.15:
    mix *= gain(target - after[0])
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-c:a", "pcm_f32le", str(wav)], input=mix.astype(np.float32).tobytes(), check=True)
    subprocess.run(cmd, check=True)
    after = loudness(load(out))
report.insert(0, f"mix: {after[0]:.1f} LUFS, range {after[1]:.1f} LU, true peak {after[2]:.1f} dBFS ({len(events)} effects, {spoken} voice stretches, master gain {target - before[0]:+.1f} dB)")
# A film that goes quiet before its last frame holds its poster in silence: say so, with when it stops.
hop = SR // 20
level = np.abs(mix).max(axis=1)[: N // hop * hop].reshape(-1, hop).max(axis=1)
heard = np.nonzero(level > gain(-50))[0]
last = (heard[-1] + 1) * hop / SR if len(heard) else 0
if N / SR - last > 0.5 and not loop:
    report.insert(1, f"  <- the sound stops at {last:.2f} s, {N / SR - last:.1f} s before the picture ends: let the music ring to the last frame (ride it up over its decay, a shorter fade_out) or end the picture sooner")
wav.unlink()
out.with_suffix(".mix.txt").write_text("\n".join(report) + "\n")
print(report[0])
for line in report[1:]:
    if line.startswith("  <-") or line.startswith("loop:"):
        print(line)

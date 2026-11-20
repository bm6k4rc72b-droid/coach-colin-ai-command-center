#!/usr/bin/env python3
"""Measurement-only screening for the launch-film audio pack.

Usage:  python3 screen.py <file.mp3> [--music]        -> JSON on stdout
        python3 screen.py --batch <cands.json> <out.json>

Nothing here listens to anything: every number comes from the decoded waveform
(ffmpeg -> float32) and ffmpeg's ebur128 filter.
"""
import json
import re
import subprocess
import sys

import numpy as np

SR = 44100


def decode(path, sr=SR):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(sr), "-"],
        capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2)


def ebur128(path, pad=False):
    af = ("apad=pad_dur=0.6," if pad else "") + "ebur128=framelog=info"
    err = subprocess.run(["ffmpeg", "-nostats", "-hide_banner", "-i", path, "-af", af, "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    frames = [(float(t), float(m), float(s)) for t, m, s in
              re.findall(r"t:\s*([\d.]+)\s+TARGET:.*?M:\s*(-?[\d.]+|nan)\s+S:\s*(-?[\d.]+|nan)", err)]
    integ = re.findall(r"I:\s+(-?[\d.]+) LUFS", err.split("Summary:")[-1])
    lra = re.findall(r"LRA:\s+(-?[\d.]+) LU", err.split("Summary:")[-1])
    return (float(integ[0]) if integ else None, float(lra[0]) if lra else None, frames)


def envelope(mono, win_ms=5.0, hop_ms=1.0):
    """Sliding RMS envelope, 1 ms hop."""
    win = max(1, int(SR * win_ms / 1000))
    hop = max(1, int(SR * hop_ms / 1000))
    c = np.concatenate([[0.0], np.cumsum(mono.astype(np.float64) ** 2)])
    idx = np.arange(0, max(1, len(mono) - win), hop)
    env = np.sqrt((c[idx + win] - c[idx]) / win)
    t = (idx + win / 2) / SR
    return t, env


def spectrum(mono):
    n = 4096
    if len(mono) < n:
        mono = np.pad(mono, (0, n - len(mono)))
    hop = n // 4
    w = np.hanning(n)
    p = np.zeros(n // 2 + 1)
    for i in range(0, len(mono) - n + 1, hop):
        p += np.abs(np.fft.rfft(mono[i:i + n] * w)) ** 2
    f = np.fft.rfftfreq(n, 1 / SR)
    tot = p.sum() + 1e-30
    return (float((f * p).sum() / tot), float(100 * p[f < 150].sum() / tot),
            float(100 * p[f > 6000].sum() / tot))


def events(t, env, peak, min_gap_ms=60, thr=0.2):
    """Distinct onsets: envelope crossings of thr*peak after >= min_gap below it."""
    above = env > thr * peak
    out, last_off = [], -1e9
    for i in range(len(above)):
        if above[i] and (i == 0 or not above[i - 1]):
            if (t[i] * 1000 - last_off) >= min_gap_ms:
                out.append(round(t[i] * 1000))
        if not above[i] and i > 0 and above[i - 1]:
            last_off = t[i] * 1000
    return out


def tonal(seg):
    """Dominant frequency overall, and of the <400 Hz band in the first vs last third
    (a falling value = a pitch drop / downer)."""
    def dom(z, fmax=None):
        n = max(8192, 1 << int(np.ceil(np.log2(max(len(z), 2)))))
        p = np.abs(np.fft.rfft(z * np.hanning(len(z)), n)) ** 2
        f = np.fft.rfftfreq(n, 1 / SR)
        m = (f > 25) & ((f < fmax) if fmax else True)
        return float(f[m][int(p[m].argmax())])
    if len(seg) < 512:
        return {}
    third = len(seg) // 3
    out = dict(dominant_hz=round(dom(seg)))
    if third > 2048:
        out["low_pitch_start_hz"] = round(dom(seg[:third], 400))
        out["low_pitch_end_hz"] = round(dom(seg[-third:], 400))
    return out


def bed_window(t, env, wlen=3.0):
    """For long beds (typing, drones): the 3 s window with the most onsets and the
    loudest 3 s window. Onset threshold is relative to the 99.5th percentile so one
    stray loud key does not hide the rest."""
    ref = float(np.percentile(env, 99.5))
    above = env > 0.25 * ref
    on = np.where(above[1:] & ~above[:-1])[0] + 1
    keep, last = [], -1e9
    for i in on:
        if t[i] - last >= 0.04:
            keep.append(t[i])
        last = t[i]
    keep = np.array(keep)
    w = int(wlen * 1000)
    out = dict(onsets_total=int(len(keep)))
    if len(env) <= w:
        return out
    starts = np.arange(0, len(env) - w, 100)
    c = np.concatenate([[0.0], np.cumsum(env ** 2)])
    e = (c[starts + w] - c[starts]) / w
    out["loudest_3s_window_start_s"] = round(float(t[starts[int(e.argmax())]]), 2)
    if len(keep):
        cnt = np.array([np.sum((keep >= t[s0]) & (keep < t[s0] + wlen)) for s0 in starts])
        b = int(cnt.argmax())
        out["densest_3s_window_start_s"] = round(float(t[starts[b]]), 2)
        out["densest_3s_onsets_per_s"] = round(float(cnt[b]) / wlen, 1)
    # steadiness of the loudest window: dB spread of 100 ms RMS inside it
    s0 = starts[int(e.argmax())]
    blk = env[s0:s0 + w][: (w // 100) * 100].reshape(-1, 100)
    db = 20 * np.log10(np.sqrt((blk ** 2).mean(axis=1)) + 1e-9)
    out["loudest_3s_level_spread_db"] = round(float(db.max() - db.min()), 1)
    return out


def analyse(path, music=False):
    x = decode(path)
    mono = x.mean(axis=1)
    dur = len(mono) / SR
    apeak = float(np.abs(x).max())
    peak_db = 20 * np.log10(apeak + 1e-12)
    t, env = envelope(mono)
    epk = float(env.max())
    ipk = int(env.argmax())
    act = np.where(env > 0.05 * epk)[0]
    lead_in = float(t[act[0]] * 1000)
    active_end = float(t[act[-1]] * 1000)
    i10 = int(np.argmax(env >= 0.1 * epk))
    i90 = int(np.argmax(env >= 0.9 * epk))
    after = np.where(env[ipk:] < 0.1 * epk)[0]
    tail_ms = float((t[ipk + after[0]] - t[ipk]) * 1000) if len(after) else float((t[-1] - t[ipk]) * 1000)
    a0, a1 = int(t[act[0]] * SR), min(len(mono), int(t[act[-1]] * SR) + 1)
    cen, lo, hi = spectrum(mono[a0:a1])
    # clipping: flat-topped waveform = many samples sitting at the ceiling
    flat = np.abs(x) >= 0.985 * apeak
    runs = int(np.sum(flat[2:] & flat[1:-1] & flat[:-2]))
    near = float(100 * np.mean(np.abs(x[a0:a1]) >= 0.944 * apeak))  # within 0.5 dB of peak
    clipped = bool((peak_db > -0.3 and (near > 1.0 or runs > 0.0005 * x.size)) or peak_db > 1.0)
    integ, lra, frames = ebur128(path, pad=dur < 3.0)
    m_max = max([m for _, m, _ in frames], default=None)
    ev = events(t, env, epk)
    r = dict(duration_s=round(dur, 3), active_s=round((active_end - lead_in) / 1000, 3),
             lead_in_ms=round(lead_in), active_end_ms=round(active_end),
             peak_time_ms=round(float(t[ipk]) * 1000),
             sample_peak_time_ms=round(int(np.abs(mono).argmax()) / SR * 1000),
             rise_ms=round(float(t[i90] - t[i10]) * 1000), tail_ms=round(tail_ms),
             peak_dbfs=round(peak_db, 2), lufs=integ, lufs_m_max=m_max,
             centroid_hz=round(cen), below150_pct=round(lo, 1), above6k_pct=round(hi, 1),
             clipped=clipped, flat_runs=runs, near_peak_pct=round(near, 3),
             n_events=len(ev), events_ms=ev[:16])
    r.update(tonal(mono[a0:a1]))
    if dur > 4.5:
        r.update(bed_window(t, env))
    if music:
        r.update(music_metrics(mono, frames, integ))
    return r


def music_metrics(mono, frames, integ, horizon=70):
    # --- tempo: spectral-flux onset envelope -> autocorrelation
    sr2 = 22050
    y = mono[::2][: sr2 * 120]
    n, hop = 1024, 256
    w = np.hanning(n)
    nfr = (len(y) - n) // hop
    mag = np.empty((nfr, n // 2 + 1), dtype=np.float32)
    for i in range(nfr):
        mag[i] = np.abs(np.fft.rfft(y[i * hop:i * hop + n] * w))
    lm = np.log1p(100 * mag)
    flux = np.maximum(0, np.diff(lm, axis=0)).sum(axis=1)
    fr = sr2 / hop
    flux = flux - np.convolve(flux, np.ones(int(fr)) / int(fr), mode="same")
    flux = np.maximum(flux, 0)
    ac = np.correlate(flux, flux, mode="full")[len(flux) - 1:]
    ac /= ac[0] + 1e-12
    cands = []
    for bpm in np.arange(60, 200.01, 0.5):
        lag = 60.0 / bpm * fr
        v = 0.0
        for k, wt in ((1, 1.0), (2, 0.5), (4, 0.25)):
            L = lag * k
            i0 = int(np.floor(L))
            if i0 + 1 < len(ac):
                v += wt * ((1 - (L - i0)) * ac[i0] + (L - i0) * ac[i0 + 1])
        prior = np.exp(-0.5 * (np.log2(bpm / 115.0) / 0.9) ** 2)
        cands.append((v * prior, bpm, v))
    cands.sort(reverse=True)
    bpm = float(cands[0][1])
    alt = next((float(b) for _, b, _ in cands if abs(np.log2(b / bpm)) > 0.3), None)
    # --- loudness per second
    st, mm = [], []
    for sec in range(1, horizon + 1):
        s_at = [s for (tt, m, s) in frames if abs(tt - sec) < 0.051]
        st.append(round(s_at[0], 1) if s_at and s_at[0] > -100 and sec >= 3 else None)
        ms = [m for (tt, m, s) in frames if sec - 1 < tt <= sec and m > -100]
        mm.append(round(max(ms), 1) if ms else None)
    L = np.array([v if v is not None else -70.0 for v in mm])
    # --- drop: biggest rise of mean momentary loudness, 4 s after vs 4 s before
    best, drop = -1e9, None
    for k in range(4, min(len(L), horizon) - 4):
        d = L[k:k + 4].mean() - L[k - 4:k].mean()
        if d > best:
            best, drop = d, k
    # low-band drop (kick/sub entry)
    b = np.abs(np.fft.rfft(mono[: SR * horizon].reshape(-1)[: (len(mono[: SR * horizon]) // SR) * SR].reshape(-1, SR), axis=1)) ** 2
    f = np.fft.rfftfreq(SR, 1 / SR)
    lowdb = 10 * np.log10(b[:, (f > 30) & (f < 150)].sum(axis=1) + 1e-9)
    lbest, ldrop = -1e9, None
    for k in range(4, len(lowdb) - 4):
        d = lowdb[k:k + 4].mean() - lowdb[k - 4:k].mean()
        if d > lbest:
            lbest, ldrop = d, k
    ref = integ if integ is not None else float(np.median(L))
    quiet = [i for i, v in enumerate(L) if v < ref - 18]
    # --- 35 s window: loud, no near-silence, with a build (2nd half louder than 1st)
    wbest, wstart = -1e9, 0
    for s in range(0, max(1, len(L) - 35)):
        seg = L[s:s + 35]
        score = seg.mean() + 0.5 * (seg[17:].mean() - seg[:17].mean()) - 2.0 * np.sum(seg < ref - 18)
        if score > wbest:
            wbest, wstart = score, s
    seg = L[wstart:wstart + 35]
    # --- refine tempo on long lags (8 and 16 beats) around the coarse estimate
    rb, rbest = bpm, -1e9
    for cand in np.arange(bpm - 2, bpm + 2.001, 0.02):
        v = 0.0
        for k in (4, 8, 16, 32):
            Lg = 60.0 / cand * fr * k
            i0 = int(np.floor(Lg))
            if i0 + 1 < len(ac):
                v += (1 - (Lg - i0)) * ac[i0] + (Lg - i0) * ac[i0 + 1]
        if v > rbest:
            rbest, rb = v, float(cand)
    bpm = round(rb, 2)
    # --- beat phase: offset (s) of the pulse train that best matches the onset envelope
    period = 60.0 / bpm * fr
    ph_best, ph = -1e9, 0.0
    for off in np.arange(0, period, 0.5):
        idx = np.round(off + period * np.arange(int((len(flux) - off) / period))).astype(int)
        idx = idx[idx < len(flux)]
        v = flux[idx].mean() if len(idx) else 0
        if v > ph_best:
            ph_best, ph = v, off
    beat_offset = (ph * hop + n / 2) / sr2
    # --- precise drop: steepest 1 s-after vs 1 s-before level step near the coarse drop
    blk = SR // 20
    nb = len(mono) // blk
    e50 = 10 * np.log10((mono[: nb * blk].reshape(nb, blk) ** 2).mean(axis=1) + 1e-10)
    pbest, pdrop = -1e9, float(drop)
    for k in range(max(20, (drop - 3) * 20), min(nb - 20, (drop + 3) * 20)):
        d = e50[k:k + 20].mean() - e50[k - 20:k].mean()
        if d > pbest:
            pbest, pdrop = d, k / 20.0
    return dict(beat_offset_s=round(float(beat_offset % (60.0 / bpm)), 3), beat_period_s=round(60.0 / bpm, 4),
                drop_time_precise_s=round(pdrop, 2), bpm=bpm, bpm_alt=alt, drop_time_s=int(drop), drop_rise_lu=round(float(best), 1),
                low_band_drop_time_s=int(ldrop), low_band_rise_db=round(float(lbest), 1),
                first5s_mean_lufs_m=round(float(L[:5].mean()), 1),
                near_silent_seconds=[int(q) for q in quiet[:40]],
                st_lufs_per_s=st, m_lufs_per_s=mm,
                suggested_window_start_s=int(wstart),
                window_mean_lufs_m=round(float(seg.mean()), 1),
                window_build_lu=round(float(seg[17:].mean() - seg[:17].mean()), 1))


if __name__ == "__main__":
    if sys.argv[1] == "--batch":
        cands = json.load(open(sys.argv[2]))
        out = []
        for c in cands:
            m = analyse(c["local"], music=c["kind"] == "music")
            out.append({**c, **m})
            print(c["cue"], c["id"], c["title"], m["duration_s"], file=sys.stderr)
        json.dump(out, open(sys.argv[3], "w"), indent=1)
    else:
        print(json.dumps(analyse(sys.argv[1], music="--music" in sys.argv), indent=1))

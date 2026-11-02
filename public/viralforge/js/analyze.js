/**
 * Reads a clip the way a viewer's thumb does: the first three seconds closely (4 frames a
 * second), the rest more loosely, plus the soundtrack. Produces the measured features that
 * core.js scores.
 *
 * @module viralforge/analyze
 */
import { frameStats, frameDiff, detectCuts, loudnessCurve, soundOnset, rmsDb, kmeansPalette, thumbHeuristic, hookScore } from './core.js';
import { faceDetector, readText } from './ai.js';

export function loadVideo(file) {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
    v.src = URL.createObjectURL(file);
    v.onloadedmetadata = () => (v.duration && isFinite(v.duration) ? res(v) : rej(new Error('Could not read the video length')));
    v.onerror = () => rej(new Error('This browser cannot decode that video. Try an MP4 (H.264).'));
  });
}

export function seek(v, t) {
  return new Promise((res) => {
    const done = () => { v.removeEventListener('seeked', done); requestAnimationFrame(() => res()); };
    v.addEventListener('seeked', done);
    v.currentTime = Math.min(Math.max(0, t), Math.max(0, v.duration - 0.05));
  });
}

/** Decode the soundtrack: native-rate mono for loudness, 16 kHz mono for Whisper. */
export async function decodeAudio(file) {
  const buf = await file.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  let audio;
  try { audio = await ctx.decodeAudioData(buf.slice(0)); } catch { ctx.close(); return null; }
  ctx.close();
  const mono = new Float32Array(audio.length);
  for (let c = 0; c < audio.numberOfChannels; c++) { const d = audio.getChannelData(c); for (let i = 0; i < d.length; i++) mono[i] += d[i] / audio.numberOfChannels; }
  const off = new OfflineAudioContext(1, Math.ceil(audio.duration * 16000), 16000);
  const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start();
  const r = await off.startRendering();
  return { mono, sampleRate: audio.sampleRate, pcm16k: r.getChannelData(0), duration: audio.duration };
}

/** Sample times: dense through the hook, then ~40 across the rest. */
export function sampleTimes(duration) {
  const t = [];
  const hookEnd = Math.min(3, duration);
  for (let x = 0; x <= hookEnd + 1e-6; x += 0.25) t.push(+x.toFixed(2));
  const step = Math.max(0.5, (duration - 3) / 40);
  for (let x = 3 + step; x < duration - 0.05; x += step) t.push(+x.toFixed(2));
  return t;
}

/**
 * Full analysis.
 * @param {File} file
 * @param {(msg:string, frac?:number)=>void} onStatus
 * @param {{ocr?:boolean, faces?:boolean}} opts
 */
export async function analyze(file, onStatus = () => {}, opts = { ocr: true, faces: true }) {
  onStatus('Opening video…', 0);
  const v = await loadVideo(file);
  const W = v.videoWidth, H = v.videoHeight, dur = v.duration;
  const small = document.createElement('canvas');
  const sw = 96, sh = Math.max(16, Math.round((96 * H) / W));
  small.width = sw; small.height = sh;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  const mid = document.createElement('canvas');
  const mw = Math.min(640, W), mh = Math.round((mw * H) / W);
  mid.width = mw; mid.height = mh;
  const mctx = mid.getContext('2d', { willReadFrequently: true });

  let fd = null;
  if (opts.faces !== false) { try { onStatus('Loading face detector…', 0.02); fd = await faceDetector(); } catch (e) { console.warn('face detector', e); } }

  const times = sampleTimes(dur);
  const frames = [];
  let prev = null;
  for (let i = 0; i < times.length; i++) {
    await seek(v, times[i]);
    sctx.drawImage(v, 0, 0, sw, sh);
    const px = sctx.getImageData(0, 0, sw, sh).data;
    mctx.drawImage(v, 0, 0, mw, mh);
    const stats = frameStats(mctx.getImageData(0, 0, mw, mh).data, mw, mh);
    let faces = [];
    if (fd) {
      try {
        const r = fd.detectForVideo(mid, performance.now());
        faces = r.detections.map((d) => ({ ...d.boundingBox, score: d.categories?.[0]?.score ?? 0 }))
          .map((b) => ({ x: b.originX / mw, y: b.originY / mh, w: b.width / mw, h: b.height / mh, score: b.score }));
      } catch (e) { console.warn(e); }
    }
    const faceArea = faces.reduce((a, f) => Math.max(a, f.w * f.h), 0);
    const f = { t: times[i], stats, diff: prev ? frameDiff(prev, px) : 0, faces, faceArea, thumb: thumbHeuristic(stats, { faces: faces.length, faceArea }) };
    if (i % 4 === 0 || times[i] < 3) f.image = mid.toDataURL('image/jpeg', 0.82);
    frames.push(f);
    prev = px;
    onStatus(`Reading frames ${i + 1}/${times.length}`, 0.05 + 0.6 * ((i + 1) / times.length));
  }

  // On-screen text in the hook (OCR at 0.5, 1.5, 2.5 s).
  let hookText = [];
  if (opts.ocr !== false) {
    try {
      for (const t of [0.5, 1.5, 2.5].filter((x) => x < dur)) {
        onStatus(`Reading on-screen text at ${t} s…`, 0.7);
        await seek(v, t);
        mctx.drawImage(v, 0, 0, mw, mh);
        hookText.push(...(await readText(mid)));
      }
    } catch (e) { console.warn('ocr', e); hookText = null; }
  }

  onStatus('Decoding audio…', 0.8);
  let audio = null;
  try { audio = await decodeAudio(file); } catch (e) { console.warn('audio', e); }
  const curve = audio ? loudnessCurve(audio.mono, audio.sampleRate, 0.1) : [];
  const hookDb = audio ? rmsDb(audio.mono, 0, Math.min(audio.mono.length, Math.round(audio.sampleRate * 3))) : -100;

  const hookFrames = frames.filter((f) => f.t <= 3);
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const cuts = detectCuts(frames.map((f) => f.diff), frames.map((f) => f.t));
  const faceFrame = frames.find((f) => f.faces.length);
  const features = {
    motion3: mean(hookFrames.slice(1).map((f) => f.diff)),
    cuts3: cuts.filter((t) => t <= 3).length,
    faceAt: fd ? (faceFrame ? faceFrame.t : null) : null,
    text3: !!(hookText && hookText.length >= 2),
    soundAt: audio ? soundOnset(curve, 0.1) : null,
    hookDb,
    luma3: mean(hookFrames.map((f) => f.stats.luma)),
    color3: mean(hookFrames.map((f) => f.stats.colorfulness)),
    sharp3: mean(hookFrames.map((f) => f.stats.sharpness)),
  };

  // Palette of the first frame.
  await seek(v, Math.min(0.5, dur / 2));
  mctx.drawImage(v, 0, 0, mw, mh);
  const palette = kmeansPalette(mctx.getImageData(0, 0, mw, mh).data, 5, { stride: 16 });

  onStatus('Scoring…', 0.95);
  return {
    file, video: v, width: W, height: H, duration: dur, aspect: W / H,
    frames, cuts, cutsPerMin: dur > 0 ? (cuts.length / dur) * 60 : 0,
    features, hook: hookScore(features), hookText, palette,
    audio, curve, facesAvailable: !!fd, ocrAvailable: hookText !== null,
  };
}

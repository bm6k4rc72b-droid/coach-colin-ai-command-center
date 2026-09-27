// Synthesised sound: no audio files. The context starts on the first click.
let ctx = null, master = null, noiseBuf = null, roar = null;

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 6;
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  // Brown-ish noise: a deep rumble rather than hiss.
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 + w * 0.15; }
}

function blip({ freq = 800, dur = 0.08, type = 'sine', gain = 0.1, noise = false, hp = 0, lp = 0, slide = 0, delay = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let src;
  if (noise) { src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; }
  else { src = ctx.createOscillator(); src.type = type; src.frequency.setValueAtTime(freq, t); if (slide) src.frequency.exponentialRampToValueAtTime(freq * slide, t + dur); }
  let node = src;
  if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
  node.connect(g).connect(master);
  src.start(t); src.stop(t + dur + 0.05);
}

// Cabin ambience: a soft, low airflow hush (studio) that swells in flight.
let amb = null;
export function ambience(level = 0.1) {
  if (!ctx) return;
  if (!amb) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = ctx.createGain(); g.gain.value = 0; src.connect(lp).connect(g).connect(master); src.start(); amb = { g, lp };
  }
  amb.g.gain.setTargetAtTime(level, ctx.currentTime, 0.6);
}

export const sfx = {
  select: () => blip({ freq: 1320, dur: 0.05, gain: 0.05, type: 'triangle' }),
  confirm: () => { blip({ freq: 880, dur: 0.09, gain: 0.07 }); blip({ freq: 1320, dur: 0.12, gain: 0.07, delay: 0.08 }); },
  warn: () => blip({ freq: 520, dur: 0.15, gain: 0.08, type: 'square' }),
  alarm: () => { blip({ freq: 880, dur: 0.18, gain: 0.08, type: 'square' }); blip({ freq: 660, dur: 0.18, gain: 0.08, type: 'square', delay: 0.2 }); },
  deny: () => blip({ freq: 220, dur: 0.12, gain: 0.08, type: 'sawtooth' }),
  valve: () => { blip({ noise: true, hp: 2000, dur: 0.12, gain: 0.08 }); blip({ freq: 180, dur: 0.06, gain: 0.08, type: 'square' }); },
  hiss: () => blip({ noise: true, hp: 3000, dur: 0.6, gain: 0.06 }),
  spark: () => { for (let i = 0; i < 4; i++) blip({ noise: true, hp: 4000, dur: 0.03, gain: 0.12, delay: i * 0.06 }); },
  ignite: () => { blip({ noise: true, lp: 500, dur: 0.9, gain: 0.5 }); blip({ freq: 60, dur: 0.7, gain: 0.35, slide: 0.5 }); },
  bang: () => { blip({ noise: true, lp: 900, dur: 0.7, gain: 0.8 }); blip({ freq: 45, dur: 0.6, gain: 0.6, slide: 0.4 }); },
};

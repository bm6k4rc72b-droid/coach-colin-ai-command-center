// Synthesised sound: no audio files. The context is created on the first click.
let ctx = null, master = null, noiseBuf = null;

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
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

// A crowd bed that swells with the play.
let crowd = null;
export function crowdLevel(level) {
  if (!ctx) return;
  if (!crowd) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(bp).connect(g).connect(master); src.start();
    crowd = g;
  }
  crowd.gain.setTargetAtTime(level, ctx.currentTime, 0.4);
}

export const sfx = {
  select: () => blip({ freq: 1320, dur: 0.05, gain: 0.05, type: 'triangle' }),
  confirm: () => { blip({ freq: 880, dur: 0.09, gain: 0.07 }); blip({ freq: 1320, dur: 0.12, gain: 0.07, delay: 0.08 }); },
  warn: () => blip({ freq: 520, dur: 0.15, gain: 0.08, type: 'square' }),
  deny: () => blip({ freq: 220, dur: 0.12, gain: 0.08, type: 'sawtooth' }),
  whistle: () => { blip({ freq: 2900, dur: 0.35, gain: 0.08, type: 'sine', slide: 1.04 }); blip({ freq: 3100, dur: 0.3, gain: 0.04, type: 'square', lp: 4000 }); },
  hike: () => { blip({ noise: true, hp: 300, lp: 1800, dur: 0.12, gain: 0.25 }); },
  throw: () => blip({ noise: true, hp: 1200, dur: 0.18, gain: 0.12 }),
  catch: () => { blip({ freq: 160, dur: 0.12, gain: 0.3, slide: 0.6 }); blip({ noise: true, lp: 900, dur: 0.08, gain: 0.2 }); },
  hit: () => { blip({ freq: 90, dur: 0.25, gain: 0.45, slide: 0.5 }); blip({ noise: true, lp: 1200, dur: 0.2, gain: 0.35 }); },
  plates: () => { blip({ freq: 2100, dur: 0.18, gain: 0.08, type: 'triangle' }); blip({ freq: 2650, dur: 0.22, gain: 0.05, type: 'triangle', delay: 0.02 }); },
  rep: () => blip({ freq: 700, dur: 0.06, gain: 0.05, type: 'sine' }),
};

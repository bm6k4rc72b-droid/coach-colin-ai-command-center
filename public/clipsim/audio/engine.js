// Web Audio: every sound is synthesised, so there are no audio files.
// The context is created on the first user gesture (the Start button), as browsers require.

let ctx = null, master = null, noiseBuf = null;

export function initAudio() {
  if (ctx) { ctx.resume(); return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export const audioReady = () => !!ctx;

function noiseSource() {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  return s;
}

// A continuous voice with a gain that tools raise and lower each frame.
function loopVoice(build) {
  let v = null;
  return {
    set(level, params) {
      if (!ctx) return;
      if (!v && level > 0.001) v = build();
      if (!v) return;
      v.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.03);
      v.tune?.(params);
    },
  };
}

// Suction: airy hiss that gurgles when it is pulling blood.
export const suctionSound = loopVoice(() => {
  const src = noiseSource();
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 3;
  const gain = ctx.createGain(); gain.gain.value = 0;
  src.connect(lp).connect(bp).connect(gain).connect(master);
  src.start();
  return { gain, tune: ({ wet = 0 } = {}) => { bp.frequency.setTargetAtTime(500 + Math.random() * 900 * wet, ctx.currentTime, 0.02); } };
});

// Bipolar: the electrosurgical unit's buzz while current flows.
export const bipolarSound = loopVoice(() => {
  const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = 440;
  const osc2 = ctx.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = 880;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.5;
  const gain = ctx.createGain(); gain.gain.value = 0;
  osc.connect(bp); osc2.connect(bp); bp.connect(gain).connect(master);
  osc.start(); osc2.start();
  return { gain };
});

// Micro Doppler. Blood velocity shifts the ultrasound frequency into the
// audible range, so a patent artery gives a pulsatile "whoosh" that rises at
// systole. No flow gives silence.
export const dopplerSound = loopVoice(() => {
  const src = noiseSource();
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6; bp.frequency.value = 400;
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 500;
  const oscGain = ctx.createGain(); oscGain.gain.value = 0.25;
  const gain = ctx.createGain(); gain.gain.value = 0;
  src.connect(bp).connect(gain);
  osc.connect(oscGain).connect(gain);
  gain.connect(master);
  src.start(); osc.start();
  return {
    gain,
    tune: ({ pressure = 0 } = {}) => {
      const t = ctx.currentTime;
      bp.frequency.setTargetAtTime(280 + 1500 * pressure, t, 0.015);
      osc.frequency.setTargetAtTime(320 + 1100 * pressure, t, 0.015);
    },
  };
});

function blip({ freq = 1000, dur = 0.06, type = 'sine', gain = 0.2, noise = false, hp = 0, slide = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let src;
  if (noise) { src = noiseSource(); } else { src = ctx.createOscillator(); src.type = type; src.frequency.setValueAtTime(freq, t); if (slide) src.frequency.exponentialRampToValueAtTime(freq * slide, t + dur); }
  let node = src;
  if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
  node.connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  snip: () => { blip({ noise: true, hp: 3500, dur: 0.05, gain: 0.35 }); blip({ freq: 2400, dur: 0.03, gain: 0.08, type: 'triangle' }); },
  clipSnap: () => { blip({ noise: true, hp: 1800, dur: 0.07, gain: 0.4 }); blip({ freq: 180, dur: 0.12, gain: 0.25, slide: 0.5 }); },
  select: () => blip({ freq: 1320, dur: 0.05, gain: 0.05, type: 'triangle' }),
  confirm: () => { blip({ freq: 880, dur: 0.08, gain: 0.07 }); setTimeout(() => blip({ freq: 1320, dur: 0.1, gain: 0.07 }), 80); },
  warn: () => { blip({ freq: 520, dur: 0.14, gain: 0.1, type: 'square' }); },
  deny: () => blip({ freq: 220, dur: 0.1, gain: 0.08, type: 'sawtooth' }),
};

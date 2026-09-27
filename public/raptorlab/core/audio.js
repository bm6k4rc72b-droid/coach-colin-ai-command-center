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

// Engine roar: low rumble + crackle band + turbopump whine, all driven by the model.
export function engineSound({ thrust = 0, rpmF = 0, rpmO = 0, rough = 0 }) {
  if (!ctx) return;
  if (!roar) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const low = ctx.createGain(); low.gain.value = 0;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 0.7;
    const crack = ctx.createGain(); crack.gain.value = 0;
    src.connect(lp).connect(low).connect(master); src.connect(bp).connect(crack).connect(master); src.start();
    const wF = ctx.createOscillator(); wF.type = 'sawtooth'; const gF = ctx.createGain(); gF.gain.value = 0;
    const wO = ctx.createOscillator(); wO.type = 'sawtooth'; const gO = ctx.createGain(); gO.gain.value = 0;
    const wl = ctx.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 2400;
    wF.connect(gF).connect(wl); wO.connect(gO).connect(wl); wl.connect(master); wF.start(); wO.start();
    roar = { low, crack, lp, wF, wO, gF, gO };
  }
  const t = ctx.currentTime, k = Math.min(1, thrust);
  roar.low.gain.setTargetAtTime(0.9 * k, t, 0.08);
  roar.lp.frequency.setTargetAtTime(180 + 260 * k, t, 0.1);
  roar.crack.gain.setTargetAtTime(0.16 * k * (0.6 + rough), t, 0.05);
  // Blade-pass tones scaled down into the audible "whine" range.
  roar.wF.frequency.setTargetAtTime(40 + rpmF / 60 * 0.12, t, 0.05);
  roar.wO.frequency.setTargetAtTime(40 + rpmO / 60 * 0.12, t, 0.05);
  roar.gF.gain.setTargetAtTime(rpmF > 300 ? 0.02 : 0, t, 0.1);
  roar.gO.gain.setTargetAtTime(rpmO > 300 ? 0.02 : 0, t, 0.1);
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

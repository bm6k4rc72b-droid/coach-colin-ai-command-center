/**
 * The vault's sound, synthesised with WebAudio: no files, nothing fetched.
 * Bolts clunk, the seal hisses, the wheel creaks, the alarm hums and the
 * Black Lab drones — two sines a fraction of a hertz apart, so the room
 * beats slowly like something breathing.
 *
 * @module astra/showcase/sfx
 */

let ctx = null;
let muted = false;

function audio() {
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    ctx ||= new Context();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch (error) {
    return null;
  }
}

export function setMuted(value) { muted = value; if (value) stopDrone(); }
export const isMuted = () => muted;

/** A burst of noise through a filter, with an exponential decay. */
function noise(a, at, { duration = 0.3, type = 'bandpass', frequency = 1000, q = 1, gain = 0.5, decay = 0.05 } = {}) {
  const length = Math.max(1, Math.floor(a.sampleRate * duration));
  const buffer = a.createBuffer(1, length, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (a.sampleRate * decay));
  const source = a.createBufferSource();
  source.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const g = a.createGain();
  g.gain.value = gain;
  source.connect(filter).connect(g).connect(a.destination);
  source.start(at);
  return { source, filter, g };
}

/** A falling sine: the body of a heavy thing landing. */
function thump(a, at, { from = 140, to = 45, duration = 0.25, gain = 0.6 } = {}) {
  const osc = a.createOscillator();
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + duration * 0.8);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0008, at + duration);
  osc.connect(g).connect(a.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/** A bolt retracting. */
export function clunk(delay = 0) {
  const a = audio();
  if (!a || muted) return;
  const at = a.currentTime + delay;
  thump(a, at, { from: 120, to: 40, duration: 0.22, gain: 0.45 });
  noise(a, at, { duration: 0.12, frequency: 2400, q: 2, gain: 0.25, decay: 0.012 });
}

/** The pressure seal letting go. */
export function hiss(delay = 0, duration = 1.4) {
  const a = audio();
  if (!a || muted) return;
  const at = a.currentTime + delay;
  const n = noise(a, at, { duration, type: 'highpass', frequency: 2500, q: 0.5, gain: 0.32, decay: duration / 2.5 });
  n.filter.frequency.setValueAtTime(5000, at);
  n.filter.frequency.exponentialRampToValueAtTime(1200, at + duration);
}

/** The locking wheel turning: a slow sawtooth, wobbling. */
export function creak(delay = 0, duration = 1) {
  const a = audio();
  if (!a || muted) return;
  const at = a.currentTime + delay;
  const osc = a.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(70, at);
  osc.frequency.linearRampToValueAtTime(52, at + duration);
  const lfo = a.createOscillator();
  lfo.frequency.value = 13;
  const depth = a.createGain();
  depth.gain.value = 9;
  lfo.connect(depth).connect(osc.frequency);
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 600;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.16, at + 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(filter).connect(g).connect(a.destination);
  osc.start(at);
  lfo.start(at);
  osc.stop(at + duration + 0.05);
  lfo.stop(at + duration + 0.05);
}

/** A short confirmation tone. */
export function beep(frequency = 880, delay = 0, duration = 0.09, gain = 0.12) {
  const a = audio();
  if (!a || muted) return;
  const at = a.currentTime + delay;
  const osc = a.createOscillator();
  osc.type = 'square';
  osc.frequency.value = frequency;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(g).connect(a.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/** A two-tone klaxon, low and quiet: atmosphere, not an emergency. */
export function alarm(cycles = 3) {
  for (let i = 0; i < cycles; i += 1) {
    beep(392, i * 0.8, 0.38, 0.05);
    beep(311, i * 0.8 + 0.4, 0.38, 0.05);
  }
}

/** The heavy door swinging: a long low groan and a final thud. */
export function swing(delay = 0) {
  const a = audio();
  if (!a || muted) return;
  creak(delay, 1.5);
  thump(a, a.currentTime + delay + 1.5, { from: 90, to: 30, duration: 0.6, gain: 0.5 });
}

let drone = null;

/** The Black Lab's room tone: 55 Hz and 55.6 Hz beat 0.6 times a second. */
export function startDrone() {
  const a = audio();
  if (!a || muted || drone) return;
  const out = a.createGain();
  out.gain.setValueAtTime(0.0001, a.currentTime);
  out.gain.exponentialRampToValueAtTime(0.09, a.currentTime + 2);
  out.connect(a.destination);
  const oscs = [55, 55.6, 110.3].map((f, i) => {
    const o = a.createOscillator();
    o.type = i === 2 ? 'triangle' : 'sine';
    o.frequency.value = f;
    const g = a.createGain();
    g.gain.value = i === 2 ? 0.25 : 0.6;
    o.connect(g).connect(out);
    o.start();
    return o;
  });
  drone = { out, oscs };
}

export function stopDrone() {
  if (!drone || !ctx) { drone = null; return; }
  const { out, oscs } = drone;
  drone = null;
  out.gain.cancelScheduledValues(ctx.currentTime);
  out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), ctx.currentTime);
  out.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
  for (const o of oscs) o.stop(ctx.currentTime + 0.9);
}

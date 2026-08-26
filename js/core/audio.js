/* ============================================================
   AUDIO CORE — everything synthesised, zero asset downloads.
   Crowd noise is a real training variable: auditory load narrows
   attention and steals working-memory bandwidth, which is exactly
   the state we want the athlete rehearsing in.
   ============================================================ */
import { state } from './state.js';
import { clamp, rand } from './rng.js';

let ctx = null, master = null, crowdGain = null, crowdSrc = null, crowdFilter = null;
let ready = false;

export const audio = {
  get ready(){ return ready; },

  async unlock(){
    if(ctx) { if(ctx.state === 'suspended') await ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    buildCrowd();
    if(ctx.state === 'suspended') await ctx.resume();
    // silent tick to fully unlock iOS
    const o = ctx.createOscillator(); const g = ctx.createGain();
    g.gain.value = 0.0001; o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + 0.02);
    ready = true;
    return true;
  },

  get enabled(){ return ready && state.s.settings.audio; },

  /* ---------- crowd bed ---------- */
  crowd(level){ // 0..1
    if(!this.enabled || !crowdGain) { if(crowdGain) crowdGain.gain.value = 0; return; }
    const t = ctx.currentTime;
    crowdGain.gain.cancelScheduledValues(t);
    crowdGain.gain.setTargetAtTime(clamp(level, 0, 1) * 0.34, t, 0.5);
    if(crowdFilter) crowdFilter.frequency.setTargetAtTime(420 + level * 2400, t, 0.6);
  },
  crowdSurge(amount = 1){
    if(!this.enabled || !crowdGain) return;
    const t = ctx.currentTime, base = crowdGain.gain.value;
    crowdGain.gain.cancelScheduledValues(t);
    crowdGain.gain.setValueAtTime(base, t);
    crowdGain.gain.linearRampToValueAtTime(clamp(base + 0.3 * amount, 0, 0.7), t + 0.12);
    crowdGain.gain.setTargetAtTime(base, t + 0.4, 0.8);
  },

  /* ---------- one-shots ---------- */
  tone(freq = 440, dur = 0.12, type = 'sine', vol = 0.3, glideTo = null){
    if(!this.enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if(glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, glideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  noiseBurst(dur = 0.09, vol = 0.35, hp = 900){
    if(!this.enabled) return;
    const t = ctx.currentTime;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for(let i = 0; i < len; i++) d[i] = (Math.random()*2 - 1) * (1 - i/len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  },

  /* named cues -------------------------------------------------- */
  cadence(n = 1){ this.tone(196 + n * 22, 0.16, 'sawtooth', 0.16, 150 + n * 20); },
  snap(){ this.noiseBurst(0.07, 0.4, 1400); this.tone(90, 0.16, 'square', 0.2, 46); },
  kill(){ this.tone(880, 0.07, 'square', 0.34); setTimeout(()=>this.tone(880, 0.07, 'square', 0.34), 95); setTimeout(()=>this.tone(660, 0.14, 'square', 0.3), 190); },
  go(){ this.tone(660, 0.06, 'triangle', 0.26, 990); },
  good(){ this.tone(523, 0.09, 'triangle', 0.24); setTimeout(()=>this.tone(784, 0.13, 'triangle', 0.22), 70); },
  great(){ [523,659,784,1046].forEach((f,i)=>setTimeout(()=>this.tone(f, 0.14, 'triangle', 0.22), i*62)); },
  jackpot(){ [392,523,659,784,1046,1318].forEach((f,i)=>setTimeout(()=>this.tone(f, 0.22, 'sine', 0.26), i*70)); this.noiseBurst(0.5, 0.12, 2600); },
  bad(){ this.tone(180, 0.22, 'sawtooth', 0.26, 70); },
  whoosh(){ this.noiseBurst(0.28, 0.16, 380); },
  tick(){ this.tone(1500, 0.025, 'square', 0.1); },
  beat(){ this.tone(120, 0.05, 'sine', 0.2, 70); },
  breathe(dir){ this.tone(dir === 'in' ? 320 : 220, 0.5, 'sine', 0.1, dir === 'in' ? 420 : 160); },
};

function buildCrowd(){
  // pink-ish noise loop → bandpass → gain. Cheap, convincing stadium bed.
  const secs = 3;
  const len = ctx.sampleRate * secs;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0=0,b1=0,b2=0;
  for(let i = 0; i < len; i++){
    const w = Math.random()*2 - 1;
    b0 = 0.99765*b0 + w*0.0990460;
    b1 = 0.96300*b1 + w*0.2965164;
    b2 = 0.57000*b2 + w*1.0526913;
    d[i] = (b0 + b1 + b2 + w*0.1848) * 0.16;
  }
  // gentle swell so it doesn't sound static
  for(let i = 0; i < len; i++) d[i] *= 0.8 + 0.2*Math.sin(i / ctx.sampleRate * 0.7 + rand(6));
  crowdSrc = ctx.createBufferSource();
  crowdSrc.buffer = buf; crowdSrc.loop = true;
  crowdFilter = ctx.createBiquadFilter();
  crowdFilter.type = 'bandpass'; crowdFilter.frequency.value = 700; crowdFilter.Q.value = 0.7;
  crowdGain = ctx.createGain(); crowdGain.gain.value = 0;
  crowdSrc.connect(crowdFilter); crowdFilter.connect(crowdGain); crowdGain.connect(master);
  crowdSrc.start();
}

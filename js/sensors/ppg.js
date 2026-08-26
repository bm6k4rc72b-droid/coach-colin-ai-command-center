/* ============================================================
   PPG — heart rate + heart-rate variability from the camera.
   Finger over the lens: each systolic pulse pushes blood through the
   fingertip capillaries and drops the transmitted red channel. That
   waveform is a photoplethysmogram. From the inter-beat intervals we
   derive BPM, RMSSD (vagal tone proxy) and a coherence score.

   These are ESTIMATES from a phone camera, not medical measurements —
   good enough to see arousal go up under pressure and come back down
   with a physiological sigh, which is the whole point of the drill.
   ============================================================ */
import { clamp } from '../core/rng.js';

export class PPG {
  constructor(){
    this.canvas = document.createElement('canvas');
    this.canvas.width = 48; this.canvas.height = 36;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently:true });
    this.reset();
  }

  reset(){
    this.samples = [];      // { t, v } detrended
    this.raw = [];
    this.beats = [];        // timestamps
    this.ibis = [];         // ms
    this.bpm = 0;
    this.rmssd = 0;
    this.sdnn = 0;
    this.coherence = 0;
    this.quality = 0;
    this.lastBeat = 0;
    this._dc = null;
    this._running = false;
    this.onBeat = null;
  }

  start(videoEl){
    this.video = videoEl;
    this._running = true;
    this._loop();
  }
  stop(){ this._running = false; cancelAnimationFrame(this._raf); }

  _loop(){
    if(!this._running) return;
    this._raf = requestAnimationFrame(() => this._loop());
    const v = this.video;
    if(!v || v.readyState < 2) return;
    const now = performance.now();
    // throttle to ~30 Hz — plenty for a 0.7–3.3 Hz signal
    if(this._lastFrame && now - this._lastFrame < 30) return;
    this._lastFrame = now;

    try{ this.ctx.drawImage(v, 0, 0, this.canvas.width, this.canvas.height); }
    catch(_){ return; }
    const d = this.ctx.getImageData(12, 9, 24, 18).data;
    let r = 0, g = 0, b = 0;
    for(let i = 0; i < d.length; i += 4){ r += d[i]; g += d[i+1]; b += d[i+2]; }
    const n = d.length / 4;
    r /= n; g /= n; b /= n;

    // Signal quality: a covered lens is red-dominant and dim-ish.
    const redness = r / Math.max(1, (g + b) / 2);
    this.quality = clamp((redness - 1.05) / 0.9, 0, 1) * clamp((r - 18) / 70, 0, 1);

    // Green channel carries the strongest PPG when a torch is on;
    // red carries it when only ambient light bleeds through the finger.
    const src = this.quality > 0.55 ? g : r;

    // adaptive DC removal
    this._dc = this._dc == null ? src : this._dc * 0.94 + src * 0.06;
    const ac = src - this._dc;

    this.raw.push({ t:now, v:src });
    this.samples.push({ t:now, v:ac });
    while(this.samples.length && now - this.samples[0].t > 12000){ this.samples.shift(); this.raw.shift(); }

    this._detect(now, ac);
  }

  _detect(now, ac){
    const w = this.samples.slice(-45);           // ~1.5s window
    if(w.length < 20) return;
    const vals = w.map(s => s.v);
    const max = Math.max(...vals), min = Math.min(...vals);
    const amp = max - min;
    if(amp < 0.35) return;                       // no usable pulse
    const thr = min + amp * 0.62;

    const prev = this.samples[this.samples.length - 2];
    if(!prev) return;
    const rising = ac > prev.v;
    const crossed = prev.v <= thr && ac > thr;

    if(crossed && rising && now - this.lastBeat > 330){
      if(this.lastBeat){
        const ibi = now - this.lastBeat;
        if(ibi > 330 && ibi < 1800){            // 33–180 bpm plausibility gate
          this.ibis.push(ibi);
          if(this.ibis.length > 40) this.ibis.shift();
          this._stats();
          if(this.onBeat) this.onBeat({ ibi, bpm:this.bpm, t:now });
        }
      }
      this.lastBeat = now;
      this.beats.push(now);
      if(this.beats.length > 60) this.beats.shift();
    }
  }

  _stats(){
    const n = this.ibis.length;
    if(n < 3) return;
    const recent = this.ibis.slice(-12);
    const sorted = recent.slice().sort((a,b)=>a-b);
    const median = sorted[Math.floor(sorted.length/2)];
    this.bpm = Math.round(60000 / median);

    // RMSSD over successive differences — the standard short-term HRV index.
    let sum = 0, c = 0;
    for(let i = 1; i < recent.length; i++){
      const diff = recent[i] - recent[i-1];
      if(Math.abs(diff) < 400){ sum += diff * diff; c++; }
    }
    this.rmssd = c ? Math.sqrt(sum / c) : 0;

    const mean = recent.reduce((a,b)=>a+b,0) / recent.length;
    this.sdnn = Math.sqrt(recent.reduce((a,b)=>a+(b-mean)**2,0) / recent.length);

    // Coherence proxy: a smooth, single-frequency IBI oscillation (respiratory
    // sinus arrhythmia riding a paced breath) scores high; ragged scatter low.
    if(recent.length >= 6){
      let turns = 0;
      for(let i = 1; i < recent.length - 1; i++){
        const a = recent[i] - recent[i-1], b = recent[i+1] - recent[i];
        if(a * b < 0) turns++;
      }
      const smooth = 1 - clamp(turns / (recent.length - 2), 0, 1);
      const amp = clamp(this.sdnn / 90, 0, 1);
      this.coherence = clamp(smooth * 0.65 + amp * 0.35, 0, 1);
    }
  }

  /* Waveform for the on-screen trace, normalised -1..1 */
  wave(count = 180){
    const s = this.samples.slice(-count);
    if(s.length < 2) return [];
    const vals = s.map(p => p.v);
    const max = Math.max(...vals.map(Math.abs)) || 1;
    return vals.map(v => v / max);
  }

  snapshot(){
    return {
      bpm:this.bpm, rmssd:Math.round(this.rmssd), sdnn:Math.round(this.sdnn),
      coherence:+this.coherence.toFixed(2), quality:+this.quality.toFixed(2),
      beats:this.ibis.length,
    };
  }
}

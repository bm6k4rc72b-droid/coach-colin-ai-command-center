/* ============================================================
   MOTION CORE — gyroscope + accelerometer
   Three jobs:
     1. YAW/PITCH → pans the holographic field. The athlete scans
        with their head/torso instead of a thumb, so we are training
        the actual head-and-eye scan pattern, not a screen habit.
     2. RELEASE DETECTION → an accelerometer spike with a defined
        peak-and-decay signature is a throwing motion. We timestamp
        the release, not the tap.
     3. TREMOR → RMS of the high-passed accelerometer while the athlete
        is supposed to be still. Postural micro-tremor rises with
        sympathetic arousal, which makes it a free, sensor-based
        pressure readout.
   ============================================================ */
import { bus } from '../core/bus.js';
import { clamp } from '../core/rng.js';

const HP_ALPHA = 0.85;     // high-pass coefficient for gravity removal
const THROW_ON  = 14;      // m/s^2 above baseline to arm a release
const THROW_OFF = 0.38;    // fraction of peak that marks the release point

class MotionCore {
  constructor(){
    this.granted = false;
    this.supported = typeof window !== 'undefined' &&
      ('DeviceOrientationEvent' in window || 'DeviceMotionEvent' in window);
    this.needsPermission = typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function';

    this.raw = { alpha:0, beta:0, gamma:0 };
    this.zero = { alpha:0, beta:0 };
    this.yaw = 0;    // degrees, relative to calibration, +right
    this.pitch = 0;  // degrees, +up
    this.roll = 0;

    this.accel = { x:0, y:0, z:0 };
    this.hp = { x:0, y:0, z:0 };
    this.mag = 0;
    this.rot = 0;

    this._tremorBuf = [];
    this.tremor = 0;      // 0..1 normalised instability
    this.peakMag = 0;

    this._armed = false;
    this._throwCb = null;
    this._capture = null;
    this._lastEvent = 0;
    this._sawOrientation = false;
    this._sawMotion = false;
  }

  get live(){ return this.granted && (this._sawOrientation || this._sawMotion); }

  async request(){
    if(!this.supported) return false;
    try{
      if(this.needsPermission){
        const r = await DeviceMotionEvent.requestPermission();
        if(r !== 'granted') return false;
        if(typeof DeviceOrientationEvent?.requestPermission === 'function'){
          try{ await DeviceOrientationEvent.requestPermission(); }catch(_){}
        }
      }
    }catch(e){ console.warn('[motion] permission', e); return false; }
    this._attach();
    this.granted = true;
    // Permission granted is not the same as sensors present — desktop
    // browsers expose the API and then emit nothing. Wait for real events.
    for(let i = 0; i < 12 && !this.live; i++) await new Promise(r => setTimeout(r, 80));
    return this.live;
  }

  _attach(){
    if(this._attached) return;
    this._attached = true;
    window.addEventListener('deviceorientation', e => this._onOrient(e), { passive:true });
    window.addEventListener('devicemotion',      e => this._onMotion(e), { passive:true });
  }

  _onOrient(e){
    if(e.alpha == null && e.beta == null) return;
    this._sawOrientation = true;
    this._lastEvent = performance.now();
    this.raw.alpha = e.alpha ?? this.raw.alpha;
    this.raw.beta  = e.beta  ?? 0;
    this.raw.gamma = e.gamma ?? 0;

    let dy = this.raw.alpha - this.zero.alpha;
    while(dy > 180) dy -= 360;
    while(dy < -180) dy += 360;
    // alpha increases counter-clockwise; invert so turning right = +yaw
    this.yaw   = -dy;
    this.pitch = clamp(this.raw.beta - this.zero.beta, -90, 90);
    this.roll  = this.raw.gamma;
  }

  _onMotion(e){
    const now = performance.now();
    this._sawMotion = true;
    this._lastEvent = now;

    let a = e.acceleration;
    if(!a || (a.x == null && a.y == null && a.z == null)){
      // gravity-included fallback: high-pass to strip the 1g DC term
      const g = e.accelerationIncludingGravity || { x:0, y:0, z:0 };
      this.hp.x = HP_ALPHA * (this.hp.x + (g.x||0) - (this._pg?.x||0));
      this.hp.y = HP_ALPHA * (this.hp.y + (g.y||0) - (this._pg?.y||0));
      this.hp.z = HP_ALPHA * (this.hp.z + (g.z||0) - (this._pg?.z||0));
      this._pg = { x:g.x||0, y:g.y||0, z:g.z||0 };
      a = this.hp;
    }
    this.accel = { x:a.x||0, y:a.y||0, z:a.z||0 };
    this.mag = Math.hypot(this.accel.x, this.accel.y, this.accel.z);

    const rr = e.rotationRate || {};
    this.rot = Math.hypot(rr.alpha||0, rr.beta||0, rr.gamma||0);

    // --- tremor (600ms rolling RMS) ---
    this._tremorBuf.push({ t:now, v:this.mag });
    while(this._tremorBuf.length && now - this._tremorBuf[0].t > 600) this._tremorBuf.shift();
    if(this._tremorBuf.length > 3){
      const mean = this._tremorBuf.reduce((s,p)=>s+p.v,0)/this._tremorBuf.length;
      const rms = Math.sqrt(this._tremorBuf.reduce((s,p)=>s+(p.v-mean)**2,0)/this._tremorBuf.length);
      this.tremor = clamp(rms / 3.2, 0, 1);
    }

    // --- release detection ---
    if(this._armed) this._trackThrow(now);
  }

  _trackThrow(now){
    if(!this._capture){
      if(this.mag > THROW_ON){
        this._capture = { start:now, peak:this.mag, peakT:now, rot:this.rot };
      }
      return;
    }
    const c = this._capture;
    if(this.mag > c.peak){ c.peak = this.mag; c.peakT = now; c.rot = Math.max(c.rot, this.rot); }
    const decayed = this.mag < c.peak * THROW_OFF;
    const timeout  = now - c.start > 420;
    if((decayed && now - c.peakT > 25) || timeout){
      const result = {
        t: c.peakT,
        power: clamp((c.peak - THROW_ON) / 34, 0, 1),
        peak: c.peak,
        spin: c.rot,
        source: 'motion',
      };
      this._capture = null;
      this.disarmThrow();
      if(this._throwCb) this._throwCb(result);
      bus.emit('motion:throw', result);
    }
  }

  /* ---------- public control ---------- */
  calibrate(){
    this.zero.alpha = this.raw.alpha;
    this.zero.beta  = this.raw.beta;
    this.yaw = 0; this.pitch = 0;
  }

  armThrow(cb){ this._armed = true; this._capture = null; this._throwCb = cb || null; }
  disarmThrow(){ this._armed = false; this._capture = null; }

  resetTremor(){ this._tremorBuf.length = 0; this.tremor = 0; }

  /* Peak stillness score over a window: 1 = statue, 0 = falling apart. */
  stillness(){ return clamp(1 - this.tremor, 0, 1); }
}

export const motion = new MotionCore();

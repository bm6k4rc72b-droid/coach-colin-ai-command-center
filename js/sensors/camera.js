/* ============================================================
   OPTIC CORE — camera access, two modes:
     'mirror'  front camera, used as a live HUD backdrop so the
               athlete sees themselves inside the hologram.
     'pulse'   rear camera + torch (where supported) for
               photoplethysmography in PULSE LAB.
   ============================================================ */
export class Camera {
  constructor(){ this.stream = null; this.track = null; this.mode = null; }

  get active(){ return !!this.stream; }

  async start(mode = 'mirror', videoEl = null){
    await this.stop();
    const constraints = mode === 'pulse'
      ? { video:{ facingMode:{ ideal:'environment' }, width:{ ideal:320 }, height:{ ideal:240 }, frameRate:{ ideal:30 } }, audio:false }
      : { video:{ facingMode:'user', width:{ ideal:640 }, height:{ ideal:480 } }, audio:false };
    try{
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    }catch(e){
      console.warn('[camera] denied/unavailable', e.name);
      throw e;
    }
    this.mode = mode;
    this.track = this.stream.getVideoTracks()[0];
    if(mode === 'pulse') await this.torch(true);
    if(videoEl){
      videoEl.srcObject = this.stream;
      videoEl.setAttribute('playsinline','');
      videoEl.muted = true;
      try{ await videoEl.play(); }catch(_){}
    }
    return this.stream;
  }

  /* iOS Safari does not expose the torch. Ambient light through the
     fingertip still carries the pulse signal — just needs more gain. */
  async torch(on){
    if(!this.track) return false;
    try{
      const caps = this.track.getCapabilities?.();
      if(caps && caps.torch){ await this.track.applyConstraints({ advanced:[{ torch:!!on }] }); return true; }
    }catch(_){}
    return false;
  }

  async stop(){
    if(this.track) { try{ await this.torch(false); }catch(_){} }
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null; this.track = null; this.mode = null;
  }
}

export const camera = new Camera();

/* Shared availability probe used by the boot gate. */
export async function cameraProbe(){
  if(!navigator.mediaDevices?.getUserMedia) return false;
  try{
    const s = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user' }, audio:false });
    s.getTracks().forEach(t => t.stop());
    return true;
  }catch(_){ return false; }
}

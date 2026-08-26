/* The loop-race dial: your OODA cycle against the defense's, live.
   The ring fills as your loop burns through the window the coverage
   has left open. Empty ring = you are late. */
import { clamp } from '../core/rng.js';

export class LoopDial {
  constructor(canvas){
    this.c = canvas; this.g = canvas.getContext('2d');
    this.you = 0; this.flare = 0; this.phase = 0;
    this._fit();
  }
  _fit(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const r = this.c.getBoundingClientRect();
    this.S = Math.max(1, r.width);
    this.c.width = Math.round(this.S * dpr);
    this.c.height = Math.round(this.S * dpr);
    this.g.setTransform(dpr,0,0,dpr,0,0);
  }
  set(youMs, themMs, phaseIndex = 0){
    this.you = clamp(youMs / Math.max(1, themMs), 0, 1.35);
    this.phase = phaseIndex;
  }
  fire(){ this.flare = 1; }

  draw(){
    if(!this.S || this.S < 4) this._fit();
    const g = this.g, S = this.S, c = S/2, R = S*0.38;
    g.clearRect(0,0,S,S);
    this.flare *= 0.92;
    const late = this.you >= 1;

    g.lineCap = 'round';
    g.beginPath(); g.arc(c,c,R,0,Math.PI*2);
    g.strokeStyle = 'rgba(77,240,255,.13)'; g.lineWidth = S*0.075; g.stroke();

    if(this.you > 0.012){
      const start = -Math.PI/2;
      g.beginPath(); g.arc(c,c,R,start,start + Math.PI*2*clamp(this.you,0,1));
      g.strokeStyle = late ? '#FF5C5C' : this.you > 0.75 ? '#FFC44D' : '#4DF0FF';
      g.lineWidth = S*0.075;
      g.shadowColor = g.strokeStyle; g.shadowBlur = 10 + this.flare*26;
      g.stroke(); g.shadowBlur = 0;
    }

    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillStyle = late ? '#FF9C9C' : 'rgba(223,246,255,.94)';
    g.font = `700 ${S*0.24}px 'Chakra Petch', ui-monospace, monospace`;
    g.fillText(String(Math.round(clamp(1 - this.you, -0.35, 1) * 100)), c, c + S*0.05);
    g.fillStyle = 'rgba(127,166,189,.75)';
    g.font = `${S*0.085}px ui-monospace, monospace`;
    g.fillText('WINDOW', c, c + S*0.20);
    if(this.phase > 0){
      g.fillStyle = 'rgba(124,255,158,.85)';
      g.font = `700 ${S*0.09}px ui-monospace, monospace`;
      g.fillText(['O','O','D','A'].slice(0, this.phase).join('·'), c, c - S*0.16);
    }
  }
}

/* ============================================================
   HOLOGRAPHIC FIELD RENDERER
   A perspective wireframe projected from the quarterback's own eye
   line. The camera yaws with the phone, so the athlete physically
   turns to find a defender instead of scrolling to one — the scan
   pattern being trained is the real one.
   ============================================================ */
import { clamp, lerp } from '../core/rng.js';

/* The hologram is projected from behind and above the quarterback —
   far enough back to hold both numbers in frame, high enough that
   depth still separates. Tuned by eye on a 390pt phone. */
const CAM_Y = -14;        // yards behind the line of scrimmage
const CAM_H = 22;         // projector height in yards
const YAW_LIMIT = 62;     // degrees each way

export class FieldRenderer {
  constructor(canvas){
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.yaw = 0; this.pitch = 0;
    this.shake = 0; this.jitterPx = 0;
    this.scene = { defense:null, receivers:[], ball:null, t:0, target:null, highlight:null, pocket:1 };
    this.tint = 1;
    this._resize();
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(canvas);
  }

  destroy(){ this._ro?.disconnect(); }

  _resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const r = this.c.getBoundingClientRect();
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.c.width = Math.round(this.W * dpr);
    this.c.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.focal = this.W * 0.36;
    this.horizon = this.H * 0.26;
  }

  setYaw(deg){ this.yaw = clamp(deg, -YAW_LIMIT, YAW_LIMIT); }
  setPitch(deg){ this.pitch = clamp(deg, -28, 28); }
  kick(amount = 1){ this.shake = Math.max(this.shake, amount); }

  /* world (yards) → screen (px) */
  project(x, y){
    const rad = this.yaw * Math.PI / 180;
    const dx = x, dz = y - CAM_Y;
    const rx = dx * Math.cos(rad) - dz * Math.sin(rad);
    const rz = dx * Math.sin(rad) + dz * Math.cos(rad);
    if(rz < 2.2) return null;
    const s = this.focal / rz;
    return {
      x: this.W / 2 + rx * s + this._sx,
      y: this.horizon + CAM_H * s + this.pitch * 6 + this._sy,
      s, rz,
    };
  }

  /* how far off-center (in screen px) an object sits — used for the
     peripheral / foveal split metrics */
  eccentricity(x, y){
    const p = this.project(x, y);
    if(!p) return null;
    return Math.hypot(p.x - this.W/2, p.y - this.H/2);
  }

  draw(dt = 16){
    const g = this.ctx;
    // camera shake decays; pressure kicks it
    this.shake *= 0.90;
    const j = this.jitterPx;
    this._sx = (Math.random()-0.5) * (this.shake * 16 + j);
    this._sy = (Math.random()-0.5) * (this.shake * 10 + j);

    g.clearRect(0, 0, this.W, this.H);
    this._sky();
    this._grid();
    this._pocket();
    this._receivers();
    this._defense();
    this._ball();
    this._reticle();
  }

  _sky(){
    const g = this.ctx;
    const grd = g.createLinearGradient(0, 0, 0, this.H);
    grd.addColorStop(0, 'rgba(6,14,28,0)');
    grd.addColorStop(0.28, 'rgba(10,32,58,0.32)');
    grd.addColorStop(0.55, 'rgba(6,18,34,0.10)');
    grd.addColorStop(1, 'rgba(3,8,16,0.55)');
    g.fillStyle = grd; g.fillRect(0, 0, this.W, this.H);

    // horizon bloom
    g.save();
    g.globalCompositeOperation = 'screen';
    const hg = g.createLinearGradient(0, this.horizon - 40, 0, this.horizon + 40);
    hg.addColorStop(0, 'rgba(77,240,255,0)');
    hg.addColorStop(0.5, `rgba(77,240,255,${0.16 * this.tint})`);
    hg.addColorStop(1, 'rgba(77,240,255,0)');
    g.fillStyle = hg; g.fillRect(0, this.horizon - 40, this.W, 80);
    g.restore();
  }

  _grid(){
    const g = this.ctx;
    g.save();
    g.lineWidth = 1;

    // yard lines
    for(let y = -10; y <= 45; y += 5){
      const los = (y === 0);
      g.beginPath();
      let started = false;
      for(let x = -26.5; x <= 26.5; x += 2){
        const p = this.project(x, y);
        if(!p){ started = false; continue; }
        if(!started){ g.moveTo(p.x, p.y); started = true; } else g.lineTo(p.x, p.y);
      }
      const fade = clamp(1 - (y + 10) / 64, 0.16, 1);
      g.strokeStyle = los ? `rgba(255,196,77,${0.75 * this.tint})` : `rgba(77,240,255,${0.20 * fade * this.tint})`;
      g.lineWidth = los ? 2.2 : 1;
      g.stroke();

      if(y > 0 && y % 10 === 0){
        const p = this.project(-22, y);
        if(p && p.s > 3.4){
          g.fillStyle = `rgba(77,240,255,${0.34 * fade})`;
          g.font = `${clamp(p.s * 1.5, 8, 15)}px ui-monospace, monospace`;
          g.fillText(String(y), p.x, p.y - 2);
        }
      }
    }

    // sidelines + numbers rail
    [-26.5, 26.5].forEach(x => {
      g.beginPath(); let st = false;
      for(let y = -8; y <= 44; y += 2){
        const p = this.project(x, y);
        if(!p){ st = false; continue; }
        if(!st){ g.moveTo(p.x, p.y); st = true; } else g.lineTo(p.x, p.y);
      }
      g.strokeStyle = `rgba(77,240,255,${0.30 * this.tint})`; g.lineWidth = 1.4; g.stroke();
    });

    // hashes
    g.fillStyle = `rgba(77,240,255,${0.22 * this.tint})`;
    for(let y = -5; y <= 40; y += 1){
      [-3.1, 3.1].forEach(x => {
        const p = this.project(x, y);
        if(p && p.s > 2.4) g.fillRect(p.x - 1, p.y - 0.6, 2, 1.4);
      });
    }
    g.restore();
  }

  _pocket(){
    const s = this.scene;
    const g = this.ctx;
    const p = this.project(0, -5.5);
    if(!p) return;
    const r = p.s * 2.0;
    g.save();
    g.globalCompositeOperation = 'screen';
    const grd = g.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, r);
    const heat = 1 - clamp(s.pocket, 0, 1);
    grd.addColorStop(0, `rgba(${heat > 0.5 ? '255,92,92' : '77,240,255'},${0.16 + heat * 0.2})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(p.x, p.y, r, r * 0.34, 0, 0, Math.PI*2); g.fill();
    g.restore();

    // QB glyph
    g.save();
    g.strokeStyle = `rgba(190,250,255,.9)`; g.lineWidth = 1.6;
    g.beginPath(); g.arc(p.x, p.y, clamp(p.s * 0.5, 6, 16), 0, Math.PI*2); g.stroke();
    g.fillStyle = 'rgba(190,250,255,.35)'; g.fill();
    g.restore();
  }

  _receivers(){
    const s = this.scene;
    const g = this.ctx;
    for(const r of s.receivers){
      // route trail
      g.beginPath(); let st = false;
      const steps = 26;
      for(let i = 0; i <= steps; i++){
        const t = (i / steps) * Math.min(s.t, 2.6);
        const pos = r.at(t);
        const p = this.project(pos.x, pos.y);
        if(!p){ st = false; continue; }
        if(!st){ g.moveTo(p.x, p.y); st = true; } else g.lineTo(p.x, p.y);
      }
      const isTarget = s.target === r.slot;
      g.strokeStyle = isTarget ? 'rgba(124,255,158,.85)' : 'rgba(77,240,255,.42)';
      g.lineWidth = isTarget ? 2.4 : 1.4;
      g.setLineDash(isTarget ? [] : [4, 4]);
      g.stroke();
      g.setLineDash([]);

      const pos = r.at(s.t);
      const p = this.project(pos.x, pos.y);
      if(!p) continue;
      const size = clamp(p.s * 1.05, 8, 22);
      g.save();
      g.translate(p.x, p.y);
      g.fillStyle = isTarget ? '#9DFFC0' : '#7FF6FF';
      g.shadowColor = isTarget ? '#7CFF9E' : '#4DF0FF';
      g.shadowBlur = isTarget ? 22 : 11;
      g.beginPath();
      g.moveTo(0, -size); g.lineTo(size*0.8, size*0.7); g.lineTo(0, size*0.3); g.lineTo(-size*0.8, size*0.7);
      g.closePath(); g.fill();
      if(p.s > 3.2){
        g.shadowBlur = 0;
        g.fillStyle = 'rgba(223,246,255,.85)';
        g.font = `700 ${clamp(p.s*1.1, 9, 13)}px 'Chakra Petch', monospace`;
        g.textAlign = 'center';
        g.fillText(r.label, 0, -size - 4);
      }
      g.restore();
    }
  }

  _defense(){
    const s = this.scene;
    if(!s.defense) return;
    const g = this.ctx;
    for(const m of s.defense.men){
      const pos = m.pos || m.show;
      const p = this.project(pos.x, pos.y);
      if(!p) continue;
      const size = clamp(p.s * 0.95, 7, 19);
      const isKey = s.highlight === m.id;
      g.save();
      g.translate(p.x, p.y);
      const col = m.rusher ? '#FF5C5C' : (m.role === 'DB' ? '#FF3DDA' : m.role === 'LB' ? '#FF9E4D' : '#B96BFF');
      g.strokeStyle = col; g.fillStyle = 'rgba(20,6,20,.55)';
      g.shadowColor = col; g.shadowBlur = isKey ? 24 : 9;
      g.lineWidth = isKey ? 2.6 : 1.5;
      g.beginPath();
      if(m.role === 'DB'){                      // diamond
        g.moveTo(0,-size); g.lineTo(size,0); g.lineTo(0,size); g.lineTo(-size,0);
      } else if(m.role === 'LB'){               // chevron box
        g.rect(-size*0.85, -size*0.7, size*1.7, size*1.4);
      } else {                                   // DL bar
        g.rect(-size*0.9, -size*0.45, size*1.8, size*0.9);
      }
      g.closePath(); g.fill(); g.stroke();

      if(isKey){
        g.beginPath(); g.arc(0, 0, size * 2.1, 0, Math.PI*2);
        g.strokeStyle = 'rgba(255,196,77,.9)'; g.lineWidth = 1.6;
        g.setLineDash([3,4]); g.stroke(); g.setLineDash([]);
      }
      if(p.s > 3.2){
        g.shadowBlur = 0;
        g.fillStyle = 'rgba(255,220,245,.9)';
        g.font = `700 ${clamp(p.s*0.95, 8, 12)}px 'Chakra Petch', monospace`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(m.label, 0, 0);
      }
      g.restore();
    }
  }

  _ball(){
    const b = this.scene.ball;
    if(!b) return;
    const g = this.ctx;
    const p = this.project(b.x, b.y);
    if(!p) return;
    const arc = Math.sin(clamp(b.k, 0, 1) * Math.PI) * p.s * 2.6;
    const r = clamp(p.s * 0.42, 4, 12);
    g.save();
    g.globalCompositeOperation = 'screen';
    // trail
    if(b.trail){
      g.beginPath(); let st = false;
      for(const t of b.trail){
        const tp = this.project(t.x, t.y);
        if(!tp){ st = false; continue; }
        const ta = Math.sin(clamp(t.k,0,1)*Math.PI) * tp.s * 2.6;
        if(!st){ g.moveTo(tp.x, tp.y - ta); st = true; } else g.lineTo(tp.x, tp.y - ta);
      }
      g.strokeStyle = 'rgba(255,196,77,.5)'; g.lineWidth = 2; g.stroke();
    }
    g.beginPath(); g.arc(p.x, p.y - arc, r, 0, Math.PI*2);
    g.fillStyle = '#FFE9A8'; g.shadowColor = '#FFC44D'; g.shadowBlur = 24; g.fill();
    g.restore();
  }

  _reticle(){
    const g = this.ctx;
    const cx = this.W/2, cy = this.H/2;
    g.save();
    g.strokeStyle = 'rgba(190,250,255,.42)'; g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, 15, 0, Math.PI*2); g.stroke();
    g.beginPath();
    g.moveTo(cx-26, cy); g.lineTo(cx-19, cy);
    g.moveTo(cx+19, cy); g.lineTo(cx+26, cy);
    g.moveTo(cx, cy-26); g.lineTo(cx, cy-19);
    g.moveTo(cx, cy+19); g.lineTo(cx, cy+26);
    g.stroke();
    // yaw tape, laid along the horizon
    const tapeY = this.horizon - 34;
    g.font = "9px ui-monospace, monospace"; g.textAlign = 'center';
    g.fillStyle = 'rgba(127,166,189,.55)';
    for(let d = -60; d <= 60; d += 15){
      const off = (d - this.yaw) * (this.W / 130);
      if(Math.abs(off) > this.W/2 - 18) continue;
      g.fillRect(cx + off - 0.5, tapeY, 1, d % 30 === 0 ? 8 : 4);
      if(d % 30 === 0) g.fillText(d === 0 ? 'BALL' : `${d > 0 ? 'R' : 'L'}${Math.abs(d)}`, cx + off, tapeY + 19);
    }
    g.restore();
  }
}

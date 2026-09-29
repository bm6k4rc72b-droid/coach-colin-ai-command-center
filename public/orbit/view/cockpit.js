import * as THREE from 'three';
import { JET, breguet } from '../sim/fighter.js';
import { G0 } from '../sim/atmos.js';

// Cockpit attached to the camera: canopy frame, glare shield, two MFDs and a
// collimated HUD. The HUD is conformal: its pitch ladder and flight-path
// marker are drawn at the true angles for the camera's field of view.

const HUD_DIST = 1, HUD_SIZE = 0.5, HUD_PX = 1024;
export const HUD_DEG = 2 * Math.atan(HUD_SIZE / 2 / HUD_DIST) * 180 / Math.PI;
const PPD = HUD_PX / HUD_DEG;                    // pixels per degree
const GREEN = '#4dff7a';

function canvasTex(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return { c, g: c.getContext('2d'), t }; }

export function buildCockpit(camera) {
  const root = new THREE.Group(); camera.add(root);
  const frameMat = new THREE.MeshStandardMaterial({ color: '#1d2127', roughness: 0.7, metalness: 0.3 });
  // Glare shield / dash below the view.
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.7), frameMat); dash.position.set(0, -0.52, -0.95); dash.rotation.x = -0.25; root.add(dash);
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 16), frameMat); lip.rotation.z = Math.PI / 2; lip.position.set(0, -0.3, -0.72); root.add(lip);
  // Canopy bow and rails.
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.025, 8, 48, Math.PI), frameMat); bow.position.set(0, -0.32, -0.25); root.add(bow);
  for (const s of [1, -1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 2), frameMat); rail.position.set(s * 0.95, -0.34, 0.2); root.add(rail); }
  // HUD combiner glass and the HUD symbology plane.
  const hud = canvasTex(HUD_PX, HUD_PX);
  const hudMesh = new THREE.Mesh(new THREE.PlaneGeometry(HUD_SIZE, HUD_SIZE), new THREE.MeshBasicMaterial({ map: hud.t, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
  hudMesh.position.set(0, 0, -HUD_DIST); hudMesh.renderOrder = 10; root.add(hudMesh);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.2), new THREE.MeshPhysicalMaterial({ color: '#9fe8c0', transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0.2 }));
  glass.position.set(0, -0.2, -0.62); glass.rotation.x = -0.35; glass.visible = false;
  // MFDs.
  const L = canvasTex(512, 512), R = canvasTex(512, 512);
  for (const [cv, x] of [[L, -0.33], [R, 0.33]]) {
    const bez = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.27, 0.02), frameMat); bez.position.set(x, -0.5, -0.82); bez.rotation.x = -0.35; root.add(bez);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), new THREE.MeshBasicMaterial({ map: cv.t, toneMapped: false }));
    scr.position.set(x, -0.5, -0.808); scr.rotation.x = -0.35; root.add(scr);
  }
  const emHist = [];
  return {
    root, hud, L, R,
    draw(jet, t, labels) { drawHud(hud, jet, t, labels); drawEng(L, jet, labels); drawEnergy(R, jet, emHist, labels); hud.t.needsUpdate = L.t.needsUpdate = R.t.needsUpdate = true; },
  };
}

function drawHud({ g }, jet, t, lab) {
  const o = jet.out, S = HUD_PX, cx = S / 2, cy = S / 2;
  g.clearRect(0, 0, S, S);
  g.strokeStyle = GREEN; g.fillStyle = GREEN; g.lineWidth = 3.5; g.font = '700 28px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,40,10,.9)'; g.shadowBlur = 4;
  // Boresight "W".
  g.beginPath(); g.moveTo(cx - 30, cy); g.lineTo(cx - 15, cy); g.lineTo(cx - 7, cy + 10); g.lineTo(cx, cy); g.lineTo(cx + 7, cy + 10); g.lineTo(cx + 15, cy); g.lineTo(cx + 30, cy); g.stroke();
  // Pitch ladder, rotated with bank.
  g.save(); g.translate(cx, cy); g.rotate((-o.bank * Math.PI) / 180);
  g.beginPath(); g.rect(-S * 0.42, -S * 0.36, S * 0.84, S * 0.72); g.clip();
  for (let p = -90; p <= 90; p += 5) {
    const y = (o.pitch - p) * PPD; if (Math.abs(y) > S) continue;
    const w = p === 0 ? 320 : 110, gap = 60;
    g.setLineDash(p < 0 ? [10, 8] : []);
    g.beginPath(); g.moveTo(-w, y); g.lineTo(-gap, y); g.moveTo(gap, y); g.lineTo(w, y); g.stroke();
    if (p !== 0) { g.beginPath(); g.moveTo(-w, y); g.lineTo(-w, y + (p > 0 ? 12 : -12)); g.moveTo(w, y); g.lineTo(w, y + (p > 0 ? 12 : -12)); g.stroke(); g.setLineDash([]); g.fillText(Math.abs(p), -w - 28, y); g.fillText(Math.abs(p), w + 28, y); }
  }
  g.setLineDash([]); g.restore();
  // Flight path marker (where the jet is actually going): α below and β beside the boresight.
  const fx = cx + o.beta * PPD, fy = cy + o.alpha * PPD;
  g.beginPath(); g.arc(fx, fy, 11, 0, Math.PI * 2); g.moveTo(fx - 26, fy); g.lineTo(fx - 11, fy); g.moveTo(fx + 11, fy); g.lineTo(fx + 26, fy); g.moveTo(fx, fy - 11); g.lineTo(fx, fy - 22); g.stroke();
  // Heading tape.
  g.save(); g.beginPath(); g.rect(cx - 180, 18, 360, 50); g.clip();
  for (let h = Math.floor(o.heading / 5) * 5 - 25; h <= o.heading + 25; h += 5) {
    const x = cx + (h - o.heading) * 7.2, hh = ((h % 360) + 360) % 360;
    g.beginPath(); g.moveTo(x, 58); g.lineTo(x, hh % 10 === 0 ? 44 : 50); g.stroke();
    if (hh % 10 === 0) g.fillText(String(hh / 10).padStart(2, '0'), x, 30);
  }
  g.restore(); g.beginPath(); g.moveTo(cx, 62); g.lineTo(cx - 8, 72); g.lineTo(cx + 8, 72); g.closePath(); g.fill();
  // Speed (KCAS) and altitude (ft) boxes, Mach, G, AoA.
  const box = (x, y, txt) => { g.strokeRect(x - 62, y - 18, 124, 36); g.fillText(txt, x, y + 1); };
  box(110, cy, Math.round(o.kcas)); g.fillText(`M ${o.M.toFixed(2)}`, 110, cy + 44);
  box(S - 110, cy, Math.round(o.altFt).toLocaleString('en-US')); g.fillText(`${o.vs >= 0 ? '+' : ''}${Math.round(o.vs * 196.85)}`, S - 110, cy + 44);
  g.textAlign = 'left';
  g.fillText(`G ${o.n.toFixed(1)}`, 40, 110); g.fillText(`${jet.maxG.toFixed(1)}`, 40, 138); g.fillText(`α ${o.alpha.toFixed(1)}°`, 40, 166);
  g.fillText(`${lab.thr} ${Math.round(jet.throttle * 100)}%${o.ab ? ' AB' : ''}`, 40, S - 120);
  g.fillText(`${lab.fuel} ${Math.round(o.fuel)} kg`, 40, S - 92);
  g.textAlign = 'right';
  g.fillText(`Ps ${Math.round(o.Ps)} m/s`, S - 40, 110); g.fillText(`${o.turnRate.toFixed(1)}°/s`, S - 40, 138);
  if (jet.ap) g.fillText('AP', S - 40, 166);
  // Bank scale.
  g.textAlign = 'center';
  g.save(); g.translate(cx, cy + 250);
  for (const b of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) { g.save(); g.rotate((b * Math.PI) / 180); g.beginPath(); g.moveTo(0, 60); g.lineTo(0, b % 30 === 0 ? 76 : 70); g.stroke(); g.restore(); }
  g.rotate((-o.bank * Math.PI) / 180); g.beginPath(); g.moveTo(0, 56); g.lineTo(-7, 44); g.lineTo(7, 44); g.closePath(); g.fill(); g.restore();
  // Warnings.
  const tti = o.vs < -5 ? (jet.pos.y - Math.max(0, jet.groundH ?? 0)) / -o.vs : 99;
  g.font = '700 30px "JetBrains Mono", monospace';
  if (jet.crashed) { g.fillStyle = '#ff4466'; g.shadowColor = '#ff4466'; g.fillText(lab.crash, cx, cy - 120); }
  else if (tti < 6 && Math.floor(t * 4) % 2 === 0) { g.fillStyle = '#ff4466'; g.shadowColor = '#ff4466'; g.fillText(lab.pullUp, cx, cy - 120); }
  else if (o.fuel < 700) { g.fillText(lab.bingo, cx, cy - 120); }
  else if (o.n > 8.8) { g.fillText(lab.overG, cx, cy - 120); }
  g.shadowBlur = 0;
}

function mfdFrame(g, title) {
  g.fillStyle = '#020705'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(125,255,154,.25)'; g.lineWidth = 2; g.strokeRect(6, 6, 500, 500);
  g.fillStyle = GREEN; g.font = '600 24px "JetBrains Mono", monospace'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillText(title, 22, 42);
}
const row = (g, y, k, v, col = GREEN) => { g.fillStyle = 'rgba(125,255,154,.65)'; g.font = '20px "JetBrains Mono", monospace'; g.textAlign = 'left'; g.fillText(k, 22, y); g.fillStyle = col; g.font = '600 22px "JetBrains Mono", monospace'; g.textAlign = 'right'; g.fillText(v, 490, y); };

function drawEng({ g }, jet, lab) {
  const o = jet.out; mfdFrame(g, lab.eng);
  // Thrust arc gauge.
  const frac = o.T / (JET.tAB * 1.4);
  g.lineWidth = 16; g.strokeStyle = 'rgba(125,255,154,.18)'; g.beginPath(); g.arc(130, 160, 80, Math.PI * 0.8, Math.PI * 2.2); g.stroke();
  g.strokeStyle = o.ab ? '#ffb86b' : GREEN; g.beginPath(); g.arc(130, 160, 80, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * Math.min(1, frac))); g.stroke();
  g.fillStyle = GREEN; g.font = '600 30px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.fillText(`${(o.T / 1000).toFixed(0)}`, 130, 170); g.font = '16px "JetBrains Mono", monospace'; g.fillText('kN', 130, 194);
  g.textAlign = 'left'; g.font = '20px "JetBrains Mono", monospace'; g.fillStyle = 'rgba(125,255,154,.65)';
  g.fillText(`T/W ${o.TW.toFixed(2)}`, 250, 120); g.fillText(`${o.ab ? 'REHEAT' : 'MIL/DRY'}`, 250, 150); g.fillText(`TSFC ${o.ab ? '1.95' : '0.76'} lb/lbf·h`, 250, 180);
  row(g, 280, lab.ff, `${o.ff.toFixed(2)} kg/s · ${Math.round(o.ffPph)} pph`);
  row(g, 314, lab.fuelRem, `${Math.round(o.fuel)} kg`, o.fuel < 700 ? '#ff4466' : GREEN);
  row(g, 348, lab.endur, Number.isFinite(o.endurance) ? `${Math.floor(o.endurance / 60)}:${String(Math.floor(o.endurance % 60)).padStart(2, '0')}` : '—');
  row(g, 382, lab.spec, Number.isFinite(o.specRange) ? `${o.specRange.toFixed(3)} km/kg` : '—');
  row(g, 416, lab.rangeLeft, Number.isFinite(o.rangeLeft) ? `${Math.round(o.rangeLeft)} km` : '—');
  const wi = o.mass, wf = o.mass - Math.max(0, o.fuel - 400);
  const br = breguet(o.V, Math.max(1, o.LD), JET.tsfcDry, wi, wf) / 1000;
  row(g, 470, 'Breguet (V/g·c)(L/D)ln(Wi/Wf)', `${Math.round(br)} km`);
}

function drawEnergy({ g }, jet, hist, lab) {
  const o = jet.out; mfdFrame(g, lab.energy);
  row(g, 84, 'Ps = V(T−D)/W', `${Math.round(o.Ps)} m/s`, o.Ps < 0 ? '#ffb86b' : GREEN);
  row(g, 116, 'He = h + V²/2g', `${Math.round(o.He)} m`);
  row(g, 148, 'ω = g√(n²−1)/V', `${o.turnRate.toFixed(1)} °/s`);
  row(g, 180, 'r = V²/(g√(n²−1))', Number.isFinite(o.turnRadius) ? `${Math.round(o.turnRadius)} m` : '∞');
  row(g, 212, `n · q̄`, `${o.n.toFixed(2)} g · ${(o.qbar / 1000).toFixed(1)} kPa`);
  row(g, 244, 'CL · CD · L/D', `${o.CL.toFixed(2)} · ${o.CD.toFixed(3)} · ${o.LD.toFixed(1)}`);
  // Energy–manoeuvrability plot: turn rate vs Mach trail.
  hist.push([o.M, o.turnRate]); if (hist.length > 240) hist.shift();
  const X = (m) => 40 + (m / 2.2) * 440, Y = (w) => 480 - (w / 28) * 200;
  g.strokeStyle = 'rgba(125,255,154,.15)'; g.lineWidth = 1;
  for (let m = 0; m <= 2.2; m += 0.4) { g.beginPath(); g.moveTo(X(m), 280); g.lineTo(X(m), 480); g.stroke(); }
  for (let w = 0; w <= 28; w += 7) { g.beginPath(); g.moveTo(40, Y(w)); g.lineTo(480, Y(w)); g.stroke(); }
  // Corner-speed curve for this weight at this altitude: 9 g structural limit vs CLmax.
  g.strokeStyle = 'rgba(255,184,107,.7)'; g.beginPath();
  const rho = o.qbar > 0 ? (2 * o.qbar) / (o.V * o.V) : 1.2, a = o.V / Math.max(0.05, o.M), W = o.mass * G0;
  for (let m = 0.1; m <= 2.2; m += 0.02) { const V = m * a, n = Math.min(9, (0.5 * rho * V * V * JET.S * JET.CLmax) / W), w = n > 1 ? ((G0 * Math.sqrt(n * n - 1)) / V) * 57.3 : 0; m < 0.12 ? g.moveTo(X(m), Y(w)) : g.lineTo(X(m), Y(w)); }
  g.stroke();
  g.strokeStyle = GREEN; g.lineWidth = 2; g.beginPath(); hist.forEach(([m, w], i) => (i ? g.lineTo(X(m), Y(w)) : g.moveTo(X(m), Y(w)))); g.stroke();
  g.fillStyle = GREEN; g.beginPath(); g.arc(X(o.M), Y(o.turnRate), 6, 0, Math.PI * 2); g.fill();
  g.font = '16px "JetBrains Mono", monospace'; g.textAlign = 'left'; g.fillStyle = 'rgba(255,184,107,.8)'; g.fillText(lab.em, 44, 300);
}

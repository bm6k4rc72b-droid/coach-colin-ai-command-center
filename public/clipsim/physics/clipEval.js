import * as THREE from 'three';
import { bus } from '../procedure/bus.js';
import { VESSELS } from '../config/anatomy.js';

// Clip evaluation. Every applied clip's closed blade line is tested against
// the anatomy:
//
//   neck closure  The neck is a disc (radius rn) in the neck plane. The blades
//                 must cross the whole disc (tips beyond the far edge) at neck level.
//   residual neck Blades placed up on the dome leave a remnant of neck between
//                 them and the parent artery; tips short of the far edge leave one too.
//   ICA narrowing Blades that bite into the ICA wall below the neck narrow the parent artery.
//   branches      Any branch the blade line crosses (PCom, AChA, perforators) is occluded.
//                 A blade on the oculomotor nerve is recorded as a nerve injury.
//
// The result changes Flow.patency. ICG, Doppler, MEP and bleeding all follow
// from that, so the outcome shows up physically, not as a message.

const BLADE_HALF = 0.4;   // mm: half the closed blades' thickness, the band that compresses tissue
const SAMPLES = 48;

function curveSamples(curve, n = 160) { return Array.from({ length: n + 1 }, (_, i) => curve.getPointAt(i / n)); }
function nearest(p, pts) {
  let bd = Infinity, bi = 0;
  for (let i = 0; i < pts.length; i++) { const d = p.distanceToSquared(pts[i]); if (d < bd) { bd = d; bi = i; } }
  return { d: Math.sqrt(bd), t: bi / (pts.length - 1) };
}

// World-space points along a clip's closed blade line.
export function bladePoints(rec, n = SAMPLES) {
  const { origin, y, z } = rec.frame;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const ly = rec.curve * Math.sin(t * Math.PI / 2) ** 2;
    pts.push(origin.clone().addScaledVector(y, ly).addScaledVector(z, t * rec.length));
  }
  return pts;
}

export function evaluateClip(rec, ctx, cache) {
  const g = ctx.anatomy.aneurysm.geometry;
  const W = g.wall;
  const pts = bladePoints(rec);

  // ── Neck footprint coverage. For each blade sample: its height above the ICA
  // wall (h) and its position in the footprint ellipse, normalised so the
  // ellipse is a unit circle.
  const inDisc = [];
  for (const p of pts) {
    const h = p.clone().sub(W.point).dot(W.n);
    const d = p.clone().sub(W.center(h));
    const nx = d.dot(W.u1) / W.A, ny = d.dot(W.u2) / W.B;
    if (Math.hypot(nx, ny) <= 1.06 && h > -0.8 && h < 3.4) inDisc.push({ h, nx, ny });
  }
  let closure = 0, residual = 2 * W.A, meanH = null, offset = null;
  if (inDisc.length >= 2) {
    const f = inDisc[0], l = inDisc[inDisc.length - 1];
    const dx = l.nx - f.nx, dy = l.ny - f.ny;
    const covered = Math.hypot(dx, dy);
    const ux = dx / (covered || 1), uy = dy / (covered || 1);
    const mx = (f.nx + l.nx) / 2, my = (f.ny + l.ny) / 2;
    offset = Math.abs(mx * uy - my * ux);                          // chord distance from centre (normalised)
    const chord = 2 * Math.sqrt(Math.max(0, 1 - Math.min(1, offset) ** 2));
    const span = Math.min(1, covered / Math.max(0.05, chord - 0.06));
    const centred = 1 - THREE.MathUtils.smoothstep(offset, 0.45, 0.95);
    meanH = inDisc.reduce((s, q) => s + q.h, 0) / inDisc.length;
    // Up on the sac, the blades meet a wider cross-section than they can close.
    const onSac = 1 - THREE.MathUtils.smoothstep(meanH, 2.1, 3.3);
    closure = THREE.MathUtils.clamp(span * centred * onSac, 0, 1);
    const chordMm = chord * Math.hypot(ux * W.A, uy * W.B);
    residual = Math.max(0, meanH - 1.1) + (1 - span) * chordMm + offset * W.B * 0.4;
  }

  // ── Orientation: blade direction vs the ICA, within the wall plane.
  // Across the long axis, the neck folds the wrong way: "dog ears" are left at
  // the blade ends and the parent wall is pulled into a kink.
  const zp = rec.frame.z.clone().addScaledVector(W.n, -rec.frame.z.dot(W.n));
  const cosT = zp.lengthSq() < 1e-6 ? 0 : Math.abs(zp.normalize().dot(W.u1));
  const misalign = 1 - cosT * cosT;
  if (closure > 0.3) residual += 1.6 * misalign;

  // ── Parent artery narrowing: how deep does the blade line bite into the ICA
  // lumen (allowing ~0.15 mm of wall), plus any kink from a misaligned clip?
  const ica = nearestAll(pts, cache.ICA);
  const icaR = VESSELS.ICA.radius;
  const bite = Math.max(0, icaR - 0.15 - ica.d);
  const icaNarrowing = THREE.MathUtils.clamp(Math.max(bite / icaR, closure > 0.5 ? 0.45 * misalign : 0), 0, 1);
  const angICA = THREE.MathUtils.radToDeg(Math.acos(Math.min(1, cosT)));

  // ── Branch vessels crossed by the blades.
  const occ = {};
  for (const id of ['PCom', 'AChA', 'A1', 'M1']) {
    const n = nearestAll(pts, cache[id]);
    const r = VESSELS[id].radius;
    // Fully inside the compression band means occluded; grazing it means kinked, with weak flow.
    occ[id] = n.d < r * 0.4 + BLADE_HALF ? 0 : n.d < r + BLADE_HALF ? 0.2 : 1;
  }
  let perfOcc = 1;
  for (const c of cache.perf) { const n = nearestAll(pts, c); if (n.d < 0.14 + BLADE_HALF) perfOcc = 0; }
  const cn3 = nearestAll(pts, cache.oculomotor).d < 1.2 + BLADE_HALF;

  return { closure, residual, meanH, offset, icaNarrowing, angICA, occ, perfOcc, cn3 };
}

function nearestAll(pts, samples) {
  let best = { d: Infinity };
  for (const p of pts) { const n = nearest(p, samples); if (n.d < best.d) best = n; }
  return best;
}

// Several clips (tandem clipping) combine: each one's closure adds to the
// others, and any occlusion or narrowing from any clip counts.
export function combine(results) {
  if (!results.length) return null;
  const closure = 1 - results.reduce((acc, r) => acc * (1 - r.closure), 1);
  const closing = results.filter((r) => r.closure > 0.5);
  const residual = closing.length ? Math.min(...closing.map((r) => r.residual)) : Math.max(...results.map((r) => r.residual));
  const icaNarrowing = Math.max(...results.map((r) => r.icaNarrowing));
  const occ = {};
  for (const id of ['PCom', 'AChA', 'A1', 'M1']) occ[id] = Math.min(...results.map((r) => r.occ[id]));
  const perfOcc = Math.min(...results.map((r) => r.perfOcc));
  const cn3 = results.some((r) => r.cn3);
  const ev = {
    neckClosure: closure,
    residualNeck: residual,
    icaNarrowing,
    pcomPatent: occ.PCom > 0.5, achaPatent: occ.AChA > 0.5,
    occ, perfOcc, cn3, count: results.length,
  };
  // Overall grade: the most serious problem wins.
  ev.grade = (!ev.achaPatent || !ev.pcomPatent || occ.M1 < 0.5 || occ.A1 < 0.5 || perfOcc < 0.5) ? 'branchOcclusion'
    : icaNarrowing > 0.35 ? 'stenosis'
    : closure < 0.95 ? 'incomplete'
    : residual > 1.2 ? 'residual'
    : 'ideal';
  return ev;
}

export function installClipEval(ctx) {
  const P = ctx.anatomy.parts;
  const cache = {
    ICA: curveSamples(P.ICA.userData.curve, 220),
    PCom: curveSamples(P.PCom.userData.curve),
    AChA: curveSamples(P.AChA.userData.curve),
    A1: curveSamples(P.A1.userData.curve),
    M1: curveSamples(P.M1.userData.curve),
    oculomotor: curveSamples(P.oculomotor.userData.curve),
    perf: P.perforator.children.filter((m) => m.userData.curve).map((m) => curveSamples(m.userData.curve, 30)),
  };
  const dome = ctx.anatomy.aneurysm.dome, bleb = ctx.anatomy.aneurysm.bleb;
  const domeAmp = dome.material.userData.pulseAmp.value, blebAmp = bleb.material.userData.pulseAmp.value;
  const domeColor = dome.material.color.clone();
  const g = ctx.anatomy.aneurysm.geometry;

  // Neck remnant: a small ring at the base of the neck that fills with dye on
  // ICG when clipping leaves a residual neck ("dog ear").
  const remnant = new THREE.Mesh(
    new THREE.TorusGeometry(g.neckRadius * 0.9, 0.5, 10, 36),
    new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#d9ffe9', emissiveIntensity: 0, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  remnant.position.copy(g.wall.center(0.5));
  remnant.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(g.wall.u1, g.wall.u2, g.wall.n));
  remnant.scale.set(g.wall.A / g.wall.B, 1, 1);
  remnant.visible = false;
  remnant.renderOrder = 5;
  ctx.scene.add(remnant);
  ctx.state.icgExtras = [{ mesh: remnant, phase: 1.3, flow: () => (ctx.state.clipEval ? THREE.MathUtils.clamp((ctx.state.clipEval.residualNeck - 0.8) / 1.5, 0, 1) * ctx.flow.at('ICA') : 0) }];

  function apply() {
    const clips = ctx.state.clips || [];
    const ev = combine(clips.map((rec) => evaluateClip(rec, ctx, cache)));
    const f = ctx.flow;
    f.patency = f.constructor.open();
    if (ev) {
      f.patency.aneurysm = 1 - ev.neckClosure;
      f.patency.ICA = 1 - ev.icaNarrowing * 0.9;
      f.patency.PCom = ev.occ.PCom;
      f.patency.AChA = ev.occ.AChA;
      f.patency.A1 = ev.occ.A1;
      f.patency.M1 = ev.occ.M1;
      f.patency.perforator = ev.perfOcc;
      if (ev.cn3 && !ctx.stats.injuries.some((i) => i.part === 'oculomotor' && i.by === 'clip')) {
        ctx.stats.injuries.push({ part: 'oculomotor', by: 'clip' });
        bus.emit('injury', { part: 'oculomotor', by: 'clip', severity: 'minor' });
      }
    }
    ctx.state.clipEval = ev;

    // The excluded sac stops pulsating, deflates a little and darkens as it thromboses.
    const excluded = ev && ev.neckClosure >= 0.95;
    dome.material.userData.pulseAmp.value = domeAmp * (1 - (ev ? ev.neckClosure : 0));
    bleb.material.userData.pulseAmp.value = blebAmp * (1 - (ev ? ev.neckClosure : 0));
    const targetScale = excluded ? 0.9 : 1;
    const s0 = ctx.anatomy.aneurysm.group.scale.x;
    ctx.animate(0.8, (k) => ctx.anatomy.aneurysm.group.scale.setScalar(s0 + (targetScale - s0) * k));
    dome.material.color.copy(domeColor).lerp(new THREE.Color('#6d1f33'), excluded ? 0.55 : 0);

    bus.emit('clip:evaluated', ev || { neckClosure: 0 });
  }
  bus.on('clip:applied', apply);
  bus.on('clip:removed', apply);
  ctx.clipEval = { apply, cache, evaluateClip: (rec) => evaluateClip(rec, ctx, cache) };
}

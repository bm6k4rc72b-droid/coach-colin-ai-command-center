import * as THREE from 'three';
import { spatulaCursorModel } from './models.js';
import { partRoot } from './index.js';
import { bus } from '../procedure/bus.js';

// Brain spatula (key 5): press on a spatula (or the lobe it holds) and drag
// to change how far that lobe is retracted. More retraction widens the
// corridor. Rule: use as little as you need. Heavy retraction for a long time
// injures the cortex, and in M4 it lowers the MEP.
const TRAVEL = 5;   // mm of lobe movement across the full range

export function spatula(ctx) {
  const model = spatulaCursorModel();
  const { spatulas, parts } = ctx.anatomy;
  const lobes = {
    spatulaFrontal: { lobe: parts.frontal, dir: 1, extras: [] },
    spatulaTemporal: { lobe: parts.temporal, dir: -1, extras: [parts.SSV] },
  };
  for (const s of spatulas) {
    const L = lobes[s.userData.id];
    L.spatula = s;
    L.value = 0.5;
    L.base = [L.lobe, s, ...L.extras].map((o) => [o, o.position.clone()]);
  }
  ctx.state.retraction = { spatulaFrontal: 0.5, spatulaTemporal: 0.5 };
  let grabbed = null, warned = false;

  function apply(L) {
    const off = (L.value - 0.5) * TRAVEL * L.dir;
    for (const [o, p0] of L.base) o.position.set(p0.x, p0.y + off, p0.z);
    ctx.state.retraction[L.spatula.userData.id] = L.value;
  }
  function which(hit) {
    if (!hit) return null;
    if (hit.part === 'spatula') return lobes[hit.object.userData.id];
    if (hit.part === 'frontal') return lobes.spatulaFrontal;
    if (hit.part === 'temporal') return lobes.spatulaTemporal;
    return null;
  }

  return {
    id: 'spatula', model, side: 1,
    get progress() { return grabbed ? grabbed.value : 0; },
    validate(hit) {
      const L = grabbed || which(hit);
      if (!L) return { state: 'idle', action: 'act.pickSpatula' };
      return { state: L.value > 0.85 ? 'warn' : 'ok', action: L.value > 0.85 ? 'act.retractHeavy' : 'act.retract', highlight: L.spatula };
    },
    onDown(hit) { grabbed = which(hit); },
    onHold(hit, dt, speed, pointer) {
      if (!grabbed) return;
      // Dragging away from the fissure retracts more: up for frontal, down for temporal.
      grabbed.value = THREE.MathUtils.clamp(grabbed.value + (-pointer.dy * grabbed.dir) * 0.004, 0, 1);
      apply(grabbed);
      if (grabbed.value > 0.85 && !warned) { warned = true; ctx.feed.push('feed.retractHeavy', 'warn'); }
      if (grabbed.value < 0.8) warned = false;
    },
    onUp() {
      if (grabbed) bus.emit('retraction', { id: grabbed.spatula.userData.id, value: grabbed.value });
      grabbed = null;
    },
  };
}

import { bus } from '../procedure/bus.js';

// Clip evaluation, provisional version: a clip whose blades cross the neck
// region counts as closing it. M5 replaces this with the full geometric check
// (neck closure, residual neck, ICA narrowing, PCom and AChA patency).
export function installClipEval(ctx) {
  bus.on('clip:applied', (rec) => {
    const g = ctx.anatomy.aneurysm.geometry;
    const mid = rec.frame.origin.clone().addScaledVector(rec.frame.z, rec.length * 0.5);
    const d = mid.distanceTo(g.neckPlane);
    const neckClosure = d < g.neckRadius + 1.5 ? 1 : 0;
    ctx.state.clipEval = { neckClosure };
    bus.emit('clip:evaluated', ctx.state.clipEval);
  });
  bus.on('clip:removed', () => { if (!ctx.state.clips.length) ctx.state.clipEval = null; });
}

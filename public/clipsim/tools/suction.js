import { suctionModel } from './models.js';
import { suctionSound } from '../audio/engine.js';

// Suction (key 1): hold the left button to aspirate. It clears pooled blood
// when the tip reaches the blood surface, and pulls in droplets near the tip.
// Rule: keep it off the dome. Suction that close to a thin-walled aneurysm can
// pull the wall and raises rupture risk.
export function suction(ctx) {
  const model = suctionModel();
  let wet = 0;
  return {
    id: 'suction', model, side: -1,          // held in the left hand
    validate(hit) {
      if (!hit) return { state: 'idle', action: 'act.suction' };
      const dDome = ctx.geo.distToDome(hit.point);
      if (hit.part === 'bleb' || ctx.geo.distToBleb(hit.point) < 1.5) return { state: 'bad', action: 'act.suctionBleb' };
      if (hit.part === 'aneurysm' || dDome < 1.2) return { state: 'warn', action: 'act.suctionDome' };
      if (hit.part === 'blood' || hit.part === 'ooze') return { state: 'ok', action: 'act.suction' };
      return { state: 'ok', action: 'act.suction' };
    },
    onHold(hit, dt) {
      const removed = hit ? ctx.bleeding.suction(hit.point, dt) : 0;
      wet += ((removed > 0 ? 1 : 0) - wet) * Math.min(1, dt * 8);
      suctionSound.set(0.18 + 0.12 * wet, { wet });
      ctx.stats.suctionTime += dt;
      if (!hit) return;
      const dDome = ctx.geo.distToDome(hit.point), dBleb = ctx.geo.distToBleb(hit.point);
      if (dBleb < 1.5) ctx.risk.add(0.16 * dt * (1.5 - dBleb) / 1.5 + 0.02 * dt, 'suctionBleb');
      else if (dDome < 1.2) ctx.risk.add(0.05 * dt * (1.2 - Math.max(0, dDome)) / 1.2, 'suctionDome');
    },
    onUp() { suctionSound.set(0); },
    deactivate() { suctionSound.set(0); },
  };
}

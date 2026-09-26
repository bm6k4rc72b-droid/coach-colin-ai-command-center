import { dissectorModel } from './models.js';
import { bus } from '../procedure/bus.js';

// Dissector (key 4): hold and gently stroke around the aneurysm NECK to
// release the arachnoid adhesions, so the clip blades can pass. The neck is
// freed when the progress ring reaches 100 %.
// Rules:
//   - work at the neck, not the dome
//   - slow strokes: fast, rough strokes raise rupture risk and can tear small vessels
//   - never touch the bleb
const SAFE_SPEED = 20;   // mm/s of tip travel

export function dissector(ctx) {
  const model = dissectorModel();
  const adh = ctx.anatomy.adhesions;
  let lastMilestone = 0;
  const tool = {
    id: 'dissector', model, side: 1,
    get progress() { return adh.progress > 0 && adh.progress < 1 ? adh.progress : 0; },
    validate(hit) {
      if (!hit) return { state: 'idle', action: 'act.dissect' };
      const g = ctx.geo;
      if (g.distToBleb(hit.point) < 1.2 || hit.part === 'bleb') return { state: 'bad', action: 'act.blebDanger' };
      const nearNeck = g.distToNeck(hit.point) < g.neckRadius + 3.2 || hit.part === 'adhesion';
      if (nearNeck && adh.progress < 1) return { state: 'ok', action: 'act.dissect', highlight: adh.group };
      if (nearNeck) return { state: 'ok', action: 'act.neckFree' };
      if (hit.part === 'aneurysm') return { state: 'warn', action: 'act.domeGentle' };
      if (hit.part === 'arachnoid') return { state: 'warn', action: 'act.useScissors' };
      return { state: 'idle', action: 'act.dissect' };
    },
    onHold(hit, dt, speed) {
      if (!hit) return;
      const g = ctx.geo;
      if (g.distToBleb(hit.point) < 1.2 || hit.part === 'bleb') { ctx.risk.add(0.35 * dt, 'blebContact'); return; }
      const rough = speed > SAFE_SPEED;
      if (rough) {
        ctx.risk.add((speed - SAFE_SPEED) * 0.0016 * dt, 'fastDissect');
        ctx.stats.roughTime += dt;
        if (speed > 45 && Math.random() < dt * 0.5) {
          ctx.bleeding.addSource(hit.point.clone(), 'ooze', hit.normal);
          ctx.feed.push('feed.oozeStarted', 'warn');
        }
      }
      const nearNeck = g.distToNeck(hit.point) < g.neckRadius + 3.2 || hit.part === 'adhesion';
      if (nearNeck && adh.progress < 1) {
        // Gentle, deliberate strokes make progress; holding still makes none.
        const moving = Math.min(1, speed / 4 + 0.25);
        const gentle = rough ? SAFE_SPEED / speed : 1;
        adh.setProgress(adh.progress + dt * 0.1 * moving * gentle);
        const m = Math.floor(adh.progress * 4);
        if (m > lastMilestone) {
          lastMilestone = m;
          bus.emit('dissect:progress', { value: adh.progress });
          ctx.feed.push(m >= 4 ? 'feed.neckFree' : 'feed.dissectProgress', 'ok', { n: Math.round(adh.progress * 100) });
          if (m >= 4) bus.emit('dissect:complete', {});
        }
      } else if (hit.part === 'aneurysm') {
        ctx.risk.add(0.03 * dt + (rough ? 0.02 * dt : 0), 'domeContact');
      }
    },
  };
  return tool;
}

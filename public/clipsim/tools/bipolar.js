import { bipolarModel } from './models.js';
import { partRoot } from './index.js';
import { bipolarSound, sfx } from '../audio/engine.js';
import { bus } from '../procedure/bus.js';

// Bipolar forceps (key 3): hold on a bleeding point to coagulate it. An ooze
// seals in about a second. Rule: coagulate only the bleeding point, never the
// dome, perforators, the AChA or the PCom. Arterial bleeding from a rupture
// can't be coagulated; it needs proximal control and a clip.
const PROTECTED = ['perforator', 'AChA', 'PCom'];

export function bipolar(ctx) {
  const model = bipolarModel();
  let onVessel = 0, lastPart = null, reported = new Set();
  const tool = {
    id: 'bipolar', model, side: 1, progress: 0,
    validate(hit) {
      if (!hit) return { state: 'idle', action: 'act.coag' };
      const s = ctx.bleeding.nearest(hit.point, 2.5);
      if (s && s.kind === 'ooze') return { state: 'ok', action: 'act.coag', highlight: s.blob };
      if (s && s.kind === 'arterial') return { state: 'bad', action: 'act.coagArterial' };
      const p = hit.part;
      if (p === 'aneurysm' || p === 'bleb') return { state: 'bad', action: 'act.noCoagDome', highlight: partRoot(hit.object) };
      if (PROTECTED.includes(p)) return { state: 'bad', action: 'act.noCoagPerf', highlight: partRoot(hit.object) };
      if (['ICA', 'M1', 'M2s', 'M2i', 'A1', 'SSV'].includes(p)) return { state: 'warn', action: 'act.coagVessel' };
      if (p === 'optic' || p === 'oculomotor') return { state: 'bad', action: 'act.noCoagNerve' };
      return { state: 'idle', action: 'act.coag' };
    },
    onHold(hit, dt) {
      bipolarSound.set(0.07);
      model.userData.setGlow(1);
      ctx.stats.bipolarTime += dt;
      if (!hit) return;
      const r = ctx.bleeding.coagulate(hit.point, dt);
      if (r && !r.refused) {
        tool.progress = r.progress;
        if (!r.source.active) { tool.progress = 0; sfx.confirm(); ctx.feed.push('feed.oozeStopped', 'ok'); }
        return;
      }
      if (r?.refused) { ctx.feed.push('feed.coagArterial', 'bad'); return; }
      const p = hit.part;
      if (p !== lastPart) { onVessel = 0; lastPart = p; }
      onVessel += dt;
      if (p === 'aneurysm' || p === 'bleb') {
        ctx.risk.add((p === 'bleb' ? 0.4 : 0.18) * dt, 'bipolarDome');
      } else if (PROTECTED.includes(p) && onVessel > 0.5 && !reported.has(p)) {
        // Coagulating a perforator, the AChA or the PCom occludes it (an ischaemic injury).
        reported.add(p);
        ctx.flow.injured[p] = true;
        ctx.stats.injuries.push({ part: p, by: 'bipolar' });
        bus.emit('injury', { part: p, by: 'bipolar', severity: 'major' });
        ctx.feed.push('feed.vesselCoagulated', 'bad', { part: ctx.i18n.t('part.' + p) });
      } else if ((p === 'optic' || p === 'oculomotor') && onVessel > 0.4 && !reported.has(p)) {
        reported.add(p);
        ctx.stats.injuries.push({ part: p, by: 'bipolar' });
        bus.emit('injury', { part: p, by: 'bipolar', severity: 'major' });
        ctx.feed.push('feed.nerveInjury', 'bad', { part: ctx.i18n.t('part.' + p) });
      }
    },
    onUp() { bipolarSound.set(0); model.userData.setGlow(0); tool.progress = 0; onVessel = 0; },
    deactivate() { tool.onUp(); },
  };
  return tool;
}

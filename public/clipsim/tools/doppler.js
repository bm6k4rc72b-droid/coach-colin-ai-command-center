import { dopplerModel } from './models.js';
import { partRoot } from './index.js';
import { dopplerSound } from '../audio/engine.js';
import { bus } from '../procedure/bus.js';

// Micro Doppler (key 8): hold the probe on a vessel. A patent artery gives a
// pulsatile whoosh in time with the heart. An occluded one is silent. Use it
// to identify vessels, and after clipping to confirm PCom and AChA flow.
const VESSELS = ['ICA', 'M1', 'M2s', 'M2i', 'A1', 'PCom', 'AChA', 'perforator', 'aneurysm', 'bleb'];

export function doppler(ctx) {
  const model = dopplerModel();
  let contactPart = null, contactT = 0;
  const reported = new Set();
  const tool = {
    id: 'doppler', model, side: 1,
    validate(hit) {
      if (!hit) return { state: 'idle', action: 'act.doppler' };
      if (VESSELS.includes(hit.part)) return { state: 'ok', action: 'act.doppler', highlight: partRoot(hit.object) };
      return { state: 'idle', action: 'act.dopplerNoVessel' };
    },
    onHold(hit, dt) {
      const part = hit && VESSELS.includes(hit.part) ? hit.part : null;
      if (part !== contactPart) { contactPart = part; contactT = 0; }
      if (!part) { dopplerSound.set(0); ctx.state.doppler = null; return; }
      if (part === 'bleb' || part === 'aneurysm') ctx.risk.add(0.01 * dt, 'dopplerDome');
      contactT += dt;
      const f = ctx.flow.at(part);
      dopplerSound.set(f > 0.02 ? 0.35 * Math.sqrt(f) * (0.15 + 0.85 * ctx.heart.pressure) : 0, { pressure: ctx.heart.pressure * f });
      ctx.state.doppler = { part, flow: f };
      // Report each contact once it has been held long enough to hear a couple of beats.
      if (contactT > 0.8 && !reported.has(part + ':' + f.toFixed(2))) {
        reported.add(part + ':' + f.toFixed(2));
        bus.emit('doppler:check', { part, flow: f });
        ctx.feed.push(f > 0.3 ? 'feed.dopplerFlow' : f > 0.02 ? 'feed.dopplerWeak' : 'feed.dopplerNone', f > 0.3 ? 'ok' : 'warn', { part: ctx.i18n.t('part.' + part) });
      }
    },
    onUp() { dopplerSound.set(0); contactPart = null; ctx.state.doppler = null; },
    deactivate() { tool.onUp(); },
  };
  return tool;
}

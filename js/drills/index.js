/* Drill catalogue, resolved against the active position pack.
   A drill module supplies the mechanics and a default identity; the
   pack decides which drills a position runs, what they unlock at, and
   re-words the ones whose mechanics are shared but whose MEANING is
   position-specific. */
import * as loopbreak from './loopbreak.js';
import * as orient    from './orient.js';
import * as periph    from './periph.js';
import * as ironhand  from './ironhand.js';
import * as twitch    from './twitch.js';
import * as pulse     from './pulse.js';
import * as wrread    from './wrread.js';
import * as track     from './track.js';
import { pack, activeId } from '../engine/positions.js';

const MODULES = {};
[loopbreak, orient, periph, ironhand, twitch, pulse, wrread, track]
  .forEach(m => { MODULES[m.meta.id] = m; });

/** The drills this position trains, in deck order. */
export function drillsFor(posId = activeId()){
  const p = pack(posId);
  return p.drills.map(({ id, unlock }) => {
    const m = MODULES[id];
    if(!m) return null;
    return { ...m.meta, ...(p.copy?.[id] || {}), unlock, run:m.run, position:p.id };
  }).filter(Boolean);
}

export function byId(id, posId = activeId()){
  return drillsFor(posId).find(d => d.id === id)
      || (MODULES[id] ? { ...MODULES[id].meta, run:MODULES[id].run } : null);
}

/* Daily loop: one drill plus one modifier, rotated deterministically by
   date (and by position, so switching positions does not hand you the
   same assignment twice). */
export const MODIFIERS = [
  { id:'blind',  name:'BLIND SIDE',   desc:'Stress governor forced to CHAOS. Crowd at full, clock at its shortest.', bonus:0.5,  apply:c => ({ ...c, stress:3 }) },
  { id:'volume', name:'VOLUME DAY',   desc:'Double reps. Consolidation lives in the back half of a set.',            bonus:0.4,  apply:c => ({ ...c, reps:c.reps * 2 }) },
  { id:'clean',  name:'CLEAN POCKET', desc:'CALM governor. Rebuild the read with the noise turned off.',             bonus:0.2,  apply:c => ({ ...c, stress:1 }) },
  { id:'sudden', name:'SUDDEN CHANGE',desc:'Standard load, but every rep counts double toward your Δ-loop record.',  bonus:0.35, apply:c => c },
];

export function dailyFor(dateStr, posId = activeId()){
  const seed = [...(dateStr + posId)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const pool = drillsFor(posId).filter(d => !d.needsCamera);
  const drill = pool[seed % pool.length];
  const mod = MODIFIERS[(seed >> 5) % MODIFIERS.length];
  return { drillId:drill.id, drillName:drill.name, mod, bonus:mod.bonus };
}

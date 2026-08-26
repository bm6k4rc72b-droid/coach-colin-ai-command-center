/* Drill catalogue. Metadata is eager (the deck needs it); the drill
   bodies are dynamically imported so the first paint stays light. */
import * as loopbreak from './loopbreak.js';
import * as orient    from './orient.js';
import * as periph    from './periph.js';
import * as ironhand  from './ironhand.js';
import * as twitch    from './twitch.js';
import * as pulse     from './pulse.js';

export const DRILLS = [loopbreak, orient, ironhand, periph, twitch, pulse]
  .map(m => ({ ...m.meta, run:m.run }));

export const byId = id => DRILLS.find(d => d.id === id);

/* Daily loop: one drill + one modifier, rotated deterministically by
   date so it is the same all day and different tomorrow. */
export const MODIFIERS = [
  { id:'blind',   name:'BLIND SIDE',  desc:'Stress governor forced to CHAOS. Crowd at full, clock at its shortest.', bonus:0.5, apply:c => ({ ...c, stress:3 }) },
  { id:'volume',  name:'VOLUME DAY',  desc:'Double reps. Consolidation lives in the back half of a set.',            bonus:0.4, apply:c => ({ ...c, reps:c.reps * 2 }) },
  { id:'clean',   name:'CLEAN POCKET',desc:'CALM governor. Rebuild the read with the noise turned off.',             bonus:0.2, apply:c => ({ ...c, stress:1 }) },
  { id:'sudden',  name:'SUDDEN CHANGE', desc:'Standard load, but every rep counts double toward your Δ-loop record.',bonus:0.35, apply:c => c },
];

export function dailyFor(dateStr){
  const seed = [...dateStr].reduce((a,c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const pool = DRILLS.filter(d => !d.needsCamera);
  const drill = pool[seed % pool.length];
  const mod = MODIFIERS[(seed >> 5) % MODIFIERS.length];
  return { drillId:drill.id, drillName:drill.name, mod, bonus:mod.bonus };
}

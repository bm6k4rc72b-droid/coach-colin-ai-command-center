/* ============================================================
   DEFENSE GENERATOR
   Builds an 11-man picture for a coverage, plus the DISGUISE layer:
   what the defense shows pre-snap versus what it plays. Post-snap
   rotation is the OBSERVE trigger for every rep — the moment new
   information enters the system and the loop starts.
   ============================================================ */
import { COVERAGES, shellSiblings } from './playbook.js';
import { pick, rand, jitter, clamp } from '../core/rng.js';

const DL = [
  { id:'LE', label:'E', x:-6.5, y:1 },
  { id:'DT', label:'T', x:-2.2, y:1 },
  { id:'NT', label:'N', x: 2.2, y:1 },
  { id:'RE', label:'E', x: 6.5, y:1 },
];

/* Pre-snap alignment per coverage. Depth and leverage are the tells. */
function align(cov, strength){
  const s = strength;                     // +1 strength right, -1 left
  const d = DL.map(o => ({ ...o, role:'DL' }));
  const put = (id, label, x, y, role) => ({ id, label, x, y, role });

  let sam, mike, will, nickel, cbL, cbR, fs, ss;

  switch(cov){
    case 'C0':
      sam  = put('SAM','S', s*7.5, 4.2,'LB');
      mike = put('MIKE','M', 0.5, 4.6,'LB');
      will = put('WILL','W', -s*6.5, 4.0,'LB');
      nickel = put('NCK','$', s*12, 3.0,'DB');
      cbL = put('CBL','C', -17.5, 1.2,'DB');
      cbR = put('CBR','C',  17.5, 1.2,'DB');
      fs  = put('FS','F', -s*4, 7.5,'DB');
      ss  = put('SS','S',  s*10, 5.0,'DB');
      break;
    case 'C1':
      sam  = put('SAM','S', s*7, 4.6,'LB');
      mike = put('MIKE','M', 0, 5.2,'LB');
      will = put('WILL','W', -s*6, 4.8,'LB');
      nickel = put('NCK','$', s*12.5, 4.5,'DB');
      cbL = put('CBL','C', -17.5, 1.4,'DB');
      cbR = put('CBR','C',  17.5, 1.4,'DB');
      fs  = put('FS','F', 0.5, 13.5,'DB');
      ss  = put('SS','S', s*9, 6.5,'DB');
      break;
    case 'C2':
      sam  = put('SAM','S', s*8, 4.8,'LB');
      mike = put('MIKE','M', 0, 5.4,'LB');
      will = put('WILL','W', -s*7, 5.0,'LB');
      nickel = put('NCK','$', s*13, 5.0,'DB');
      cbL = put('CBL','C', -18, 4.0,'DB');
      cbR = put('CBR','C',  18, 4.0,'DB');
      fs  = put('FS','F', -10.5, 12.5,'DB');
      ss  = put('SS','S',  10.5, 12.5,'DB');
      break;
    case 'TAMPA':
      sam  = put('SAM','S', s*8, 4.6,'LB');
      mike = put('MIKE','M', 0, 6.2,'LB');
      will = put('WILL','W', -s*7, 5.0,'LB');
      nickel = put('NCK','$', s*13, 5.0,'DB');
      cbL = put('CBL','C', -18, 4.2,'DB');
      cbR = put('CBR','C',  18, 4.2,'DB');
      fs  = put('FS','F', -10.5, 12.5,'DB');
      ss  = put('SS','S',  10.5, 12.5,'DB');
      break;
    case 'M2':
      sam  = put('SAM','S', s*7.5, 4.4,'LB');
      mike = put('MIKE','M', 0, 5.0,'LB');
      will = put('WILL','W', -s*6.5, 4.6,'LB');
      nickel = put('NCK','$', s*12.5, 3.6,'DB');
      cbL = put('CBL','C', -17.5, 2.4,'DB');
      cbR = put('CBR','C',  17.5, 2.4,'DB');
      fs  = put('FS','F', -10, 12.5,'DB');
      ss  = put('SS','S',  10, 12.5,'DB');
      break;
    case 'C3':
      sam  = put('SAM','S', s*8.5, 4.6,'LB');
      mike = put('MIKE','M', 0, 5.2,'LB');
      will = put('WILL','W', -s*7.5, 4.8,'LB');
      nickel = put('NCK','$', s*13, 4.6,'DB');
      cbL = put('CBL','C', -18, 6.5,'DB');
      cbR = put('CBR','C',  18, 6.5,'DB');
      fs  = put('FS','F', 0, 13.5,'DB');
      ss  = put('SS','S', s*9.5, 7.0,'DB');
      break;
    case 'C4':
      sam  = put('SAM','S', s*8, 5.0,'LB');
      mike = put('MIKE','M', 0, 5.4,'LB');
      will = put('WILL','W', -s*7, 5.2,'LB');
      nickel = put('NCK','$', s*13, 5.2,'DB');
      cbL = put('CBL','C', -18.5, 7.5,'DB');
      cbR = put('CBR','C',  18.5, 7.5,'DB');
      fs  = put('FS','F', -8.5, 11.5,'DB');
      ss  = put('SS','S',  8.5, 11.5,'DB');
      break;
    case 'C6':
    default:
      sam  = put('SAM','S', s*8, 4.9,'LB');
      mike = put('MIKE','M', 0, 5.3,'LB');
      will = put('WILL','W', -s*7, 5.1,'LB');
      nickel = put('NCK','$', s*13, 5.0,'DB');
      cbL = put('CBL','C', -18.5, s > 0 ? 4.0 : 7.5,'DB');
      cbR = put('CBR','C',  18.5, s > 0 ? 7.5 : 4.0,'DB');
      fs  = put('FS','F', -9, 12.0,'DB');
      ss  = put('SS','S',  9, 12.0,'DB');
      break;
  }
  return [...d, sam, mike, will, nickel, cbL, cbR, fs, ss];
}

/* Where each defender ends up ~2.2s after the snap. */
function drops(cov, strength){
  const base = align(cov, strength);
  const s = strength;
  const move = (id, x, y) => { const m = base.find(p => p.id === id); if(m){ m.x = x; m.y = y; } };

  base.forEach(p => { if(p.role === 'DL'){ p.x *= 0.55; p.y = -4.5; } });   // rush the pocket

  switch(cov){
    case 'C0':
      move('SAM', s*3, -3.5); move('MIKE', -1, -3.0); move('WILL', -s*4, 3);
      move('NCK', s*13, 8); move('CBL',-16,11); move('CBR',16,11);
      move('FS', -s*2, -3.0); move('SS', s*9, 9);
      break;
    case 'C1':
      move('SAM', s*9, 6); move('MIKE', 1, 9); move('WILL', -s*7, 7);
      move('NCK', s*12, 9); move('CBL',-16,13); move('CBR',16,13);
      move('FS', 0, 19); move('SS', s*8, 10);
      break;
    case 'C2':
      move('SAM', s*13, 6); move('MIKE', 0, 11); move('WILL', -s*12, 6);
      move('NCK', s*17, 4); move('CBL',-20,4); move('CBR',20,4);
      move('FS', -12, 19); move('SS', 12, 19);
      break;
    case 'TAMPA':
      move('SAM', s*13, 6); move('MIKE', 0, 17); move('WILL', -s*12, 6);
      move('NCK', s*17, 4); move('CBL',-20,4); move('CBR',20,4);
      move('FS', -13, 20); move('SS', 13, 20);
      break;
    case 'M2':
      move('SAM', s*9, 6); move('MIKE', 1, 7); move('WILL', -s*8, 6);
      move('NCK', s*13, 7); move('CBL',-17,7); move('CBR',17,7);
      move('FS', -11, 19); move('SS', 11, 19);
      break;
    case 'C3':
      move('SAM', s*13, 5); move('MIKE', 1, 11); move('WILL', -s*11, 10);
      move('NCK', s*16, 5); move('CBL',-19,17); move('CBR',19,17);
      move('FS', 0, 20); move('SS', s*12, 5);
      break;
    case 'C4':
      move('SAM', s*12, 7); move('MIKE', 0, 10); move('WILL', -s*11, 8);
      move('NCK', s*16, 6); move('CBL',-19,18); move('CBR',19,18);
      move('FS', -9, 17); move('SS', 9, 17);
      break;
    case 'C6':
    default:
      move('SAM', s*12, 6); move('MIKE', 0, 10); move('WILL', -s*11, 7);
      move('NCK', s*16, 5); move('CBL',-20, s>0?4:18); move('CBR',20, s>0?18:4);
      move('FS', -10, 18); move('SS', 10, 18);
      break;
  }
  return base;
}

/**
 * Build one defensive picture.
 * @param {object} opt { coverage, disguise, blitz, strength, level }
 */
export function buildDefense({ coverage, disguise = null, blitz = false, strength = 1 }){
  const shownId = disguise || coverage;
  const shown  = align(shownId, strength);
  const truth  = align(coverage, strength);
  const end    = drops(coverage, strength);

  const rushers = blitz ? pickRushers(strength) : [];

  const men = shown.map((p, i) => {
    const t = truth[i], e = end[i];
    const isRusher = rushers.includes(p.id);
    return {
      id:p.id, label:p.label, role:p.role,
      show:{ x:jitter(p.x, 0.35), y:jitter(p.y, 0.25) },
      rot: { x:t.x, y:t.y },
      end: isRusher ? { x:p.x * 0.4, y:-4.2 } : { x:e.x, y:e.y },
      rusher:isRusher,
      moved: Math.hypot(t.x - p.x, t.y - p.y),
    };
  });

  // The rotation key: whoever betrays the disguise first.
  const key = men.slice().sort((a,b) => b.moved - a.moved)[0];

  return {
    coverage, coverageMeta: COVERAGES[coverage],
    disguise: disguise && disguise !== coverage ? disguise : null,
    disguised: !!(disguise && disguise !== coverage),
    blitz, strength, men,
    key: key && key.moved > 1.2 ? key : men.find(m => m.rusher) || key,
    rushCount: 4 + rushers.length,
  };
}

function pickRushers(s){
  const pool = [['SAM'],['WILL'],['MIKE'],['NCK'],['SAM','MIKE'],['WILL','NCK'],['SS'],['MIKE','SS']];
  return pick(pool);
}

/** Pick a coverage for this rep, weighted so recently-seen looks recur
 *  at a spacing that supports retrieval practice rather than blocking. */
export function chooseCoverage(recent = [], allow = null){
  const ids = allow || Object.keys(COVERAGES);
  const weights = ids.map(id => {
    const lastSeen = recent.indexOf(id);
    if(lastSeen === -1) return 3;
    if(lastSeen === 0) return 0.35;      // avoid immediate repeats (blocked practice)
    if(lastSeen <= 2)  return 1.6;       // spaced retrieval sweet spot
    return 2.4;
  });
  const total = weights.reduce((a,b)=>a+b,0);
  let r = rand(total);
  for(let i = 0; i < ids.length; i++){ r -= weights[i]; if(r <= 0) return ids[i]; }
  return ids[ids.length-1];
}

/** Should this defense disguise? Higher levels disguise more often. */
export function chooseDisguise(coverage, level){
  const p = clamp(0.15 + level * 0.12, 0, 0.72);
  if(Math.random() > p) return null;
  const sibs = shellSiblings(coverage);
  return sibs.length ? pick(sibs) : null;
}

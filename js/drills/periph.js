/* ============================================================
   PERIPHERAL POCKET — useful field of view under pressure.
   Two things happen at once: a foveal discrimination at the fixation
   point, and a peripheral target you never look at directly. That is
   the actual pocket task — eyes downfield on the read while the rush
   is resolved by peripheral vision alone.

   Under stress the useful field of view constricts (perceptual
   narrowing / "tunnel vision"). This drill measures the constriction
   and pushes back on it with an adaptive staircase.
   ============================================================ */
import { Stage } from './stage.js';
import { el, cue, flash, wait } from '../ui/ui.js';
import { stressProfile } from '../engine/ooda.js';
import { buildDefense } from '../engine/defense.js';
import { clamp, pick, rand, shuffle } from '../core/rng.js';
import { audio } from '../core/audio.js';
import { haptics } from '../core/haptics.js';
import { motion } from '../sensors/motion.js';
import { state } from '../core/state.js';

export const meta = {
  id:'periph',
  name:'PERIPHERAL POCKET',
  tag:'UFOV + POISE',
  ico:'◉',
  accent:'#7CFF9E',
  desc:'Eyes locked downfield. Find the rusher without looking at him.',
  line:'A dual task: hold the fixation read while the pressure resolves in your periphery.',
  science:'Useful Field of View is a trainable, dual-task measure — and it collapses under sympathetic arousal, which is exactly why pockets feel like they close faster in real games than on tape. The staircase keeps you at your own threshold eccentricity. With the motion core live, the accelerometer also logs postural micro-tremor, so you get a sensor-based readout of whether pressure is physically tightening you up.',
  regions:{ parietal:1.0, mt:0.9, fef:0.5, amyg:0.8, cereb:0.3 },
  unlock:600,
};

const SYMBOLS = ['▲','▼','◆','■'];

export async function run(root, cfg){
  const stress = stressProfile(cfg.stress);
  const stage = new Stage(root, { reps:cfg.reps, title:'TRIAL', phases:false, dial:false });
  audio.crowd(stress.crowd);

  const defense = buildDefense({ coverage:'C3', strength:1 });
  defense.men.forEach(m => m.pos = m.end);
  stage.field.scene = { defense, receivers:[], ball:null, t:2, target:null, highlight:null, pocket:1 };
  stage.field.tint = 0.45;

  const R = () => Math.min(stage.root.clientWidth, stage.root.clientHeight) / 2;
  let ecc = 0.34;                    // fraction of the screen half-min-dimension
  let aborted = false, heat = 0;
  const trials = [];
  const tremor = [];

  stage.quitBtn.addEventListener('click', () => { aborted = true; stage.alive = false; });

  const fix = el('div', { class:'fix-cross' }, '✛', el('small', { text:'EYES HERE' }));
  stage.overlay(fix);

  for(let i = 1; i <= cfg.reps; i++){
    if(aborted) break;
    stage.setRep(i, cfg.reps);
    motion.resetTremor();

    if(!await sleep(stage, rand(1100, 550))) break;

    // pressure hit — camera kick + crowd surge, at higher stress levels
    if(stress.id >= 2 && Math.random() < 0.45){
      stage.field.kick(0.7); audio.crowdSurge(0.6); haptics.fire('hit');
    }

    // --- simultaneous foveal + peripheral presentation ---
    const sym = pick(SYMBOLS);
    const ang = rand(Math.PI * 2);
    const r = ecc * R();
    const cx = stage.root.clientWidth / 2, cy = stage.root.clientHeight / 2;
    const px = cx + Math.cos(ang) * r, py = cy + Math.sin(ang) * r;

    fix.firstChild.textContent = sym;
    const dot = el('div', { class:'periph-dot' + (Math.random() < 0.5 ? ' is-threat' : ''),
      style:`left:${px}px;top:${py}px` }, '⌁');
    stage.overlay(dot);
    audio.tick();

    const showMs = clamp(190 - stress.id * 22, 110, 200);
    if(!await sleep(stage, showMs)){ dot.remove(); break; }
    dot.remove();
    fix.firstChild.textContent = '✛';
    if(motion.live) tremor.push(motion.tremor);

    // --- 1. where was it? ---
    const hint = el('div', { class:'throw-hint', text:'TAP WHERE IT WAS' });
    stage.overlay(hint);
    const tap = await tapPoint(stage);
    hint.remove();
    if(tap === null){ aborted = true; break; }
    const err = Math.hypot(tap.x - px, tap.y - py);
    const spatialOk = err < Math.max(70, r * 0.42);

    // --- 2. what was at fixation? ---
    const opts = shuffle([sym, ...shuffle(SYMBOLS.filter(s => s !== sym)).slice(0,2)]);
    const chosen = await tray(stage, 'WHAT WAS AT THE FIXATION POINT?', opts);
    if(chosen === null){ aborted = true; break; }
    const fovealOk = chosen.key === sym;
    chosen.node.classList.add(fovealOk ? 'is-right' : 'is-wrong');
    await wait(fovealOk ? 140 : 420);
    chosen.tray.remove();

    const both = spatialOk && fovealOk;
    both ? audio.good() : audio.bad();
    haptics.fire(both ? 'good' : 'bad');
    flash(both ? '#7CFF9E' : '#FF5C5C');

    // staircase eccentricity on the dual-task result
    if(both) ecc = clamp(ecc * 1.09, 0.1, 0.98);
    else ecc = clamp(ecc * 0.88, 0.1, 0.98);

    heat = both ? heat + 1 : 0;
    stage.setHeat(heat);
    const xp = both ? Math.round(22 + ecc * 60 + Math.min(heat,6) * 5) : 3;
    state.addXP(xp, 'periph');

    trials.push({ ecc:+ecc.toFixed(3), err:Math.round(err), spatialOk, fovealOk, both });
  }

  fix.remove();
  stage.destroy();
  if(!trials.length) return { aborted:true };

  const maxEcc = Math.max(...trials.map(t => t.ecc));
  const dual = trials.filter(t => t.both).length / trials.length;
  const spat = trials.filter(t => t.spatialOk).length / trials.length;
  const fov  = trials.filter(t => t.fovealOk).length / trials.length;
  const poise = tremor.length ? clamp(1 - tremor.reduce((a,b)=>a+b,0)/tremor.length, 0, 1) : null;
  const score = Math.round(clamp(maxEcc * 52 + dual * 34 + (poise ?? 0.6) * 14, 0, 100));

  return {
    drillId:meta.id, reps:trials.length, score, aborted, stress:cfg.stress, poise,
    metrics:[
      { k:'FIELD OF VIEW', v:Math.round(maxEcc*100) + '%', d:'of screen radius, dual-task', pr:'ufovEcc', raw:Math.round(maxEcc*100) },
      { k:'DUAL TASK', v:Math.round(dual*100) + '%', d:'both targets, same trial', pr:'ufovDual', raw:dual },
      { k:'PERIPHERAL', v:Math.round(spat*100) + '%', d:'rusher located', raw:spat },
      { k:'FIXATION', v:Math.round(fov*100) + '%', d:'read held downfield', raw:fov },
      { k:'POISE', v:poise == null ? '—' : Math.round(poise*100) + '%', d:'stillness under pressure', pr:'poise', raw:poise },
    ],
    regions:meta.regions,
    extra:{ maxEcc },
    log:trials,
  };
}

function tapPoint(stage){
  return new Promise(resolve => {
    const catcher = el('div', { class:'throw-pad' });
    stage.overlay(catcher);
    catcher.addEventListener('pointerdown', e => {
      const r = stage.root.getBoundingClientRect();
      clearInterval(iv); catcher.remove();
      resolve({ x:e.clientX - r.left, y:e.clientY - r.top });
    }, { once:true });
    const iv = setInterval(() => { if(!stage.alive){ clearInterval(iv); catcher.remove(); resolve(null); } }, 40);
  });
}

function tray(stage, q, keys){
  return new Promise(resolve => {
    const grid = el('div', { class:'answer-grid answer-grid--3' });
    const box = el('div', { class:'answer-tray' }, el('div', { class:'answer-tray__q', text:q }), grid);
    keys.forEach(k => {
      const b = el('button', { class:'ans', 'data-key':k, style:'font-size:26px' }, k);
      b.addEventListener('pointerdown', () => { clearInterval(iv); resolve({ key:k, node:b, tray:box }); }, { once:true });
      grid.append(b);
    });
    stage.overlay(box);
    const iv = setInterval(() => { if(!stage.alive){ clearInterval(iv); box.remove(); resolve(null); } }, 40);
  });
}

function sleep(stage, ms){
  return new Promise(resolve => {
    const t = setTimeout(() => { clearInterval(iv); resolve(true); }, ms);
    const iv = setInterval(() => { if(!stage.alive){ clearTimeout(t); clearInterval(iv); resolve(false); } }, 40);
  });
}

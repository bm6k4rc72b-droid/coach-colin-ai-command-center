/* ============================================================
   ORIENT ENGINE — pure schema retrieval under a shrinking clock.
   Boyd put orientation at the centre of the loop for a reason: it is
   the only phase where prior experience actually lives. This drill
   does nothing but build and test that library, with interleaved
   coverage order so the gains survive the session.
   ============================================================ */
import { Stage } from './stage.js';
import { el, cue, flash, wait } from '../ui/ui.js';
import { COVERAGES, COVERAGE_IDS } from '../engine/playbook.js';
import { buildDefense, chooseCoverage, chooseDisguise } from '../engine/defense.js';
import { stressProfile } from '../engine/ooda.js';
import { shuffle, pick, clamp, rand, lerp } from '../core/rng.js';
import { audio } from '../core/audio.js';
import { haptics } from '../core/haptics.js';
import { state } from '../core/state.js';

export const meta = {
  id:'orient',
  name:'ORIENT ENGINE',
  tag:'PATTERN LIBRARY',
  ico:'❈',
  accent:'#B96BFF',
  desc:'Flash-recognition of coverage. Exposure shrinks every time you are right.',
  line:'A defensive picture, exposed for a fraction of a second, then gone. Name it.',
  science:'Expert quarterbacks are not faster at looking — they are faster at MATCHING. Chunking research (de Groot, Chase & Simon) shows expertise is stored as retrievable patterns, and recognition speed is the measurable output. Exposure time is staircased against your own accuracy so you always sit near threshold, which is where perceptual learning is steepest. Coverages are interleaved rather than blocked: worse today, considerably better next week.',
  regions:{ parietal:1.0, dlpfc:0.7, bg:0.9, fef:0.6, mt:0.4 },
  unlock:0,
};

export async function run(root, cfg){
  const stress = stressProfile(cfg.stress);
  const stage = new Stage(root, { reps:cfg.reps, title:'LOOK', phases:false, dial:false });
  audio.crowd(stress.crowd * 0.7);

  let exposure = 1500;              // ms, staircased
  let aborted = false, streak = 0, heat = 0;
  const trials = [], recent = [];
  const seenAt = {};                // coverage -> trial index, for the retention index

  stage.quitBtn.addEventListener('click', () => { aborted = true; stage.alive = false; });

  for(let i = 1; i <= cfg.reps; i++){
    if(aborted) break;
    stage.setRep(i, cfg.reps);

    const coverage = chooseCoverage(recent);
    const disguise = Math.random() < stress.disguise ? chooseDisguise(coverage, 4) : null;
    const blitz = coverage === 'C0' || Math.random() < 0.14;
    const strength = Math.random() < 0.5 ? 1 : -1;
    const defense = buildDefense({ coverage, disguise, blitz, strength });
    defense.men.forEach(m => m.pos = m.show);
    stage.field.scene = { defense, receivers:[], ball:null, t:0, target:null, highlight:null, pocket:1 };
    stage.field.jitterPx = stress.jitterPx;

    cue(stage.root, 'SET', 'cy', '', 450);
    if(!await sleep(stage, 620)) { aborted = true; break; }

    // the snap and rotation — this is all they get
    audio.snap(); haptics.fire('snap');
    const t0 = performance.now();
    stage.onFrame = () => {
      const t = (performance.now() - t0) / 1000;
      stage.field.scene.t = t;
      defense.men.forEach(m => m.pos = at(m, t));
    };
    if(!await sleep(stage, exposure)) { aborted = true; break; }
    stage.onFrame = null;

    // blank the picture: recognition must come from memory, not from staring
    stage.field.tint = 0.12;
    defense.men.forEach(m => m.pos = { x:m.pos.x, y:m.pos.y });
    stage.field.scene.defense = null;
    flash('#04070f');
    audio.tick();

    const started = performance.now();
    const opts = shuffle([coverage, ...shuffle(COVERAGE_IDS.filter(c => c !== coverage)).slice(0, 5)]);
    const chosen = await tray(stage, 'NAME IT', opts);
    stage.field.tint = 1;
    if(chosen === null){ aborted = true; break; }

    const rt = Math.round(performance.now() - started);
    const right = chosen.key === coverage;
    chosen.node.classList.add(right ? 'is-right' : 'is-wrong');
    if(!right) chosen.tray.querySelector(`[data-key="${coverage}"]`)?.classList.add('is-right');
    right ? audio.good() : audio.bad();
    haptics.fire(right ? 'good' : 'bad');

    // staircase: 3-down / 1-up keeps accuracy near 79%
    if(right){ streak++; if(streak >= 2){ exposure = Math.max(280, exposure * 0.86); streak = 0; } }
    else { streak = 0; exposure = Math.min(2200, exposure * 1.22); }

    heat = right ? heat + 1 : 0;
    stage.setHeat(heat);
    const xp = right ? Math.round((28 + clamp(2200 - rt, 0, 1600) / 24) * (1 + Math.min(heat,6) * 0.12)) : 4;
    state.addXP(xp, 'orient');

    const gap = seenAt[coverage] != null ? i - seenAt[coverage] : null;
    seenAt[coverage] = i;

    const banner = el('div', { class:'verdict' },
      el('div', { class:`verdict__head ${right ? 'v-good' : 'v-bad'}`, text: right ? COVERAGES[coverage].label : 'MISS' }),
      el('div', { class:'verdict__row' },
        el('span', { class:'chip', text:`${rt}ms` }),
        el('span', { class:'chip chip--vi', text:`EXPOSURE ${Math.round(exposure)}ms` }),
        el('span', { class:'chip chip--gold', text:`+${xp} XP` }),
      ),
      el('div', { class:'verdict__note', text:COVERAGES[coverage].tell }),
    );
    stage.overlay(banner);
    await wait(right ? 1100 : 1750);
    banner.remove();
    chosen.tray.remove();

    trials.push({ coverage, right, rt, exposure:Math.round(exposure), gap, disguised:defense.disguised });
    recent.unshift(coverage); recent.length = Math.min(recent.length, 5);
  }

  stage.destroy();
  if(!trials.length) return { aborted:true };

  const hits = trials.filter(t => t.right);
  const acc = hits.length / trials.length;
  const rt = hits.length ? Math.round(hits.reduce((a,b)=>a+b.rt,0)/hits.length) : null;
  const best = Math.round(Math.min(...trials.map(t => t.exposure)));
  const spaced = trials.filter(t => t.gap != null && t.gap >= 2);
  const retention = spaced.length ? spaced.filter(t => t.right).length / spaced.length : null;
  const score = Math.round(clamp(acc * 62 + clamp((2200 - (rt||2200)) / 2200, 0, 1) * 22 + clamp((1600 - best) / 1600, 0, 1) * 16, 0, 100));

  return {
    drillId:meta.id, reps:trials.length, score, aborted, stress:cfg.stress,
    orient:rt,
    metrics:[
      { k:'RECOGNITION', v:Math.round(acc*100) + '%', d:'coverages named correctly', pr:'covAcc', raw:acc },
      { k:'FLOOR', v:best + 'ms', d:'shortest exposure you beat', pr:'exposureFloor', raw:best, lower:true },
      { k:'DECISION RT', v:rt ? rt + 'ms' : '—', d:'on correct calls', pr:'orientMs', raw:rt },
      { k:'RETENTION', v:retention == null ? '—' : Math.round(retention*100) + '%', d:'after ≥2 intervening looks', pr:'retention', raw:retention },
    ],
    regions:meta.regions,
    extra:{ retention },
    log:trials,
  };
}

const lp = (a,b,k) => ({ x:a.x + (b.x-a.x)*k, y:a.y + (b.y-a.y)*k });
function at(m, t){
  if(t < 0.45) return lp(m.show, m.rot, t/0.45);
  return lp(m.rot, m.end, clamp((t-0.45)/2.0, 0, 1));
}

function tray(stage, q, ids){
  return new Promise(resolve => {
    const grid = el('div', { class:'answer-grid answer-grid--3' });
    const box = el('div', { class:'answer-tray' }, el('div', { class:'answer-tray__q', text:q }), grid);
    ids.forEach(id => {
      const b = el('button', { class:'ans', 'data-key':id }, COVERAGES[id].label, el('small', { text:COVERAGES[id].short }));
      b.addEventListener('pointerdown', () => { clearInterval(iv); resolve({ key:id, node:b, tray:box }); }, { once:true });
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

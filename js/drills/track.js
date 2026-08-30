/* ============================================================
   TRACK — coincidence-anticipation with occlusion.
   The ball leaves the quarterback's hand and comes at you. Somewhere
   in the flight it disappears, and you have to put your hands up at
   the exact moment it arrives anyway.

   That is the whole skill of catching: you are not reacting to the
   ball, you are predicting where it will be from the information you
   got early in the flight. Occluding the last portion forces the
   prediction and removes the option of reacting late.

   Three errors are reported, which is the standard set for this
   paradigm and they say different things:
     ABSOLUTE  how far off you were, ignoring direction
     CONSTANT  your bias — consistently early (grabby) or late
     VARIABLE  the spread, which is the one that actually improves
   ============================================================ */
import { Stage } from './stage.js';
import { el, cue, flash, wait } from '../ui/ui.js';
import { stressProfile } from '../engine/ooda.js';
import { SPOTS, SPOT_IDS, wrCamera, buildWrPicture } from '../engine/wrplaybook.js';
import { clamp, rand, pick, shuffle } from '../core/rng.js';
import { audio } from '../core/audio.js';
import { haptics } from '../core/haptics.js';
import { motion } from '../sensors/motion.js';
import { state } from '../core/state.js';

export const meta = {
  id:'track',
  name:'TRACK',
  tag:'BALL SKILLS',
  ico:'◎',
  accent:'#FFC44D',
  desc:'The ball vanishes mid-flight. Hands up at the exact moment it arrives.',
  line:'Coincidence-anticipation with occlusion — prediction, not reaction.',
  science:'Coincidence-anticipation timing is the closest a phone gets to measuring catch timing, and it is a well-established paradigm: a target approaches on a fixed trajectory and you time a response to its arrival. Occluding the final portion of flight is the key manipulation — it removes the option of reacting to the ball and forces extrapolation from early flight information, which is precisely what separates reliable hands from inconsistent ones. The occlusion window staircases against your own accuracy, and the report separates constant error (a systematic early or late bias, which is correctable in an afternoon) from variable error (spread, which is what actually improves with reps).',
  regions:{ mt:1.0, cereb:1.0, parietal:0.7, fef:0.4, bg:0.3 },
  unlock:700,
};

const QUADS = [
  { key:'HL', label:'HIGH LEFT',  dx:-1, dh: 1 },
  { key:'HR', label:'HIGH RIGHT', dx: 1, dh: 1 },
  { key:'LL', label:'LOW LEFT',   dx:-1, dh:-1 },
  { key:'LR', label:'LOW RIGHT',  dx: 1, dh:-1 },
];

export async function run(root, cfg){
  const stress = stressProfile(cfg.stress);
  const spot = SPOTS[pick(SPOT_IDS)];
  const stage = new Stage(root, { reps:cfg.reps, title:'BALL', phases:false, dial:false, cam:wrCamera(spot) });
  audio.crowd(stress.crowd * 0.8);

  // a static picture behind the ball so there is depth to judge against
  const picture = buildWrPicture({ look:'ZONE_OPEN', spot, pressure:false, level:1 });
  picture.men.forEach(m => m.pos = m.end);
  stage.field.scene = { defense:picture, receivers:[], ball:null, ballHidden:false, t:2, target:null, highlight:null, pocket:1 };
  stage.field.tint = 0.6;

  let occlusion = 0.25;          // fraction of flight the ball is invisible
  let aborted = false, heat = 0;
  const trials = [];

  stage.quitBtn.addEventListener('click', () => { aborted = true; stage.alive = false; });

  const readout = el('div', { class:'tremor' },
    el('div', { class:'tremor__label', text:'OCCLUSION' }),
    el('div', { class:'tremor__bar' }, el('i')));
  stage.overlay(readout);
  const occBar = readout.querySelector('i');
  const setOcc = () => { occBar.style.width = `${Math.round(occlusion * 100)}%`; };
  setOcc();

  for(let i = 1; i <= cfg.reps; i++){
    if(aborted) break;
    stage.setRep(i, cfg.reps);

    const quad = pick(QUADS);
    const flight = rand(1.75, 0.95);                 // seconds, randomised so the interval is not learnable
    const hidden = clamp(occlusion, 0, 0.8);

    const hint = el('div', { class:'throw-hint', text:'EYES UP' });
    stage.overlay(hint);
    if(!await sleep(stage, rand(1200, 600))){ hint.remove(); break; }
    hint.remove();

    audio.whoosh();
    const res = await flightTrial(stage, spot, quad, flight, hidden);
    if(res === null){ aborted = true; break; }

    const err = res.responded ? Math.round(res.at - res.arrival) : null;   // + late, − early
    const abs = err == null ? null : Math.abs(err);
    const onTime = abs != null && abs <= 110;

    // where did it come in?
    let handsRight = null;
    if(res.responded){
      const chosen = await tray(stage, 'WHERE DID IT COME IN?', shuffle(QUADS.slice()));
      if(chosen === null){ aborted = true; break; }
      handsRight = chosen.key === quad.key;
      chosen.node.classList.add(handsRight ? 'is-right' : 'is-wrong');
      if(!handsRight) chosen.tray.querySelector(`[data-key="${quad.key}"]`)?.classList.add('is-right');
      await wait(handsRight ? 160 : 460);
      chosen.tray.remove();
    }

    const clean = onTime && handsRight === true;
    if(clean){ occlusion = clamp(occlusion + 0.05, 0.15, 0.8); audio.good(); flash('#7CFF9E'); }
    else { occlusion = clamp(occlusion - 0.07, 0.15, 0.8); audio.bad(); }
    setOcc();
    haptics.fire(clean ? 'good' : 'bad');

    heat = clean ? heat + 1 : 0;
    stage.setHeat(heat);
    const xp = clean ? Math.round((30 + (110 - abs) * 0.35 + occlusion * 45) * (1 + Math.min(heat,6) * 0.12)) : 4;
    state.addXP(xp, 'track');

    const head = err == null ? 'NO HANDS'
      : abs <= 40 ? 'ON IT'
      : err < 0 ? `${abs}ms EARLY` : `${abs}ms LATE`;
    const banner = el('div', { class:'verdict' },
      el('div', { class:`verdict__head ${clean ? 'v-good' : abs != null && abs <= 200 ? 'v-mid' : 'v-bad'}`, text:head }),
      el('div', { class:'verdict__row' },
        el('span', { class:'chip', text:`OCCLUDED ${Math.round(hidden*100)}%` }),
        el('span', { class:`chip ${handsRight ? 'chip--li' : 'chip--mg'}`, text:handsRight === null ? 'NO CATCH' : handsRight ? 'HANDS ✓' : `IT WAS ${quad.label}` }),
        el('span', { class:'chip chip--gold', text:`+${xp} XP` })),
      el('div', { class:'verdict__note', text: err == null
        ? 'You never put your hands up. On an occluded ball you have to commit to where it will be.'
        : err < -60 ? 'Early. You are guessing off the release instead of extrapolating the flight.'
        : err > 60 ? 'Late. You are waiting to see it again — but it never reappears.'
        : 'That is the window. Whatever you did on that rep, repeat it.' }),
    );
    stage.overlay(banner);
    await wait(clean ? 950 : 1500);
    banner.remove();

    trials.push({ err, abs, handsRight, occlusion:hidden, flight, responded:res.responded, source:res.source });
  }

  stage.destroy();
  if(!trials.length) return { aborted:true };

  const timed = trials.filter(t => t.err != null);
  const signed = timed.map(t => t.err);
  const constErr = signed.length ? Math.round(signed.reduce((a,b)=>a+b,0)/signed.length) : null;
  const absErr = timed.length ? Math.round(timed.reduce((a,b)=>a+b.abs,0)/timed.length) : null;
  const varErr = signed.length > 1
    ? Math.round(Math.sqrt(signed.reduce((a,b)=>a+(b-constErr)**2,0)/signed.length)) : null;
  const maxOcc = Math.round(Math.max(...trials.map(t => t.occlusion)) * 100);
  const handsSet = trials.filter(t => t.handsRight != null);
  const hands = handsSet.length ? handsSet.filter(t => t.handsRight).length / handsSet.length : null;
  const score = Math.round(clamp(
    clamp((250 - (absErr ?? 250)) / 220, 0, 1) * 42 +
    clamp(maxOcc / 75, 0, 1) * 30 +
    (hands ?? 0) * 28, 0, 100));

  return {
    drillId:meta.id, reps:trials.length, score, aborted, stress:cfg.stress,
    metrics:[
      { k:'ABSOLUTE ERROR', v:absErr == null ? '—' : absErr + 'ms', d:'how far off the arrival', pr:'trackErr', raw:absErr, lower:true },
      { k:'VARIABLE ERROR', v:varErr == null ? '—' : '±' + varErr + 'ms', d:'spread — the one that improves', pr:'trackSd', raw:varErr, lower:true },
      { k:'BIAS', v:constErr == null ? '—' : (constErr > 0 ? '+' : '') + constErr + 'ms', d:constErr == null ? '' : constErr < 0 ? 'systematically early' : 'systematically late', raw:constErr },
      { k:'OCCLUSION', v:maxOcc + '%', d:'of flight run blind', pr:'trackOcc', raw:maxOcc },
      { k:'HANDS', v:hands == null ? '—' : Math.round(hands*100) + '%', d:'arrival quadrant called', pr:'handsAcc', raw:hands },
    ],
    regions:meta.regions,
    extra:{ absErr, varErr, constErr, maxOcc },
    log:trials,
  };
}

/* One flight. The ball leaves the passer and closes on a point just in
   front of the camera; the last `hidden` fraction is invisible. */
function flightTrial(stage, spot, quad, flightSec, hidden){
  return new Promise(resolve => {
    const field = stage.field;
    const useMotion = motion.live && state.s.settings.motion;
    const from = { x:0, y:-5.5 };
    const to = {
      x: spot.x + quad.dx * 1.6,
      y: field.cam.y + 1.4,
    };
    const start = performance.now();
    const arrival = start + flightSec * 1000;
    const trail = [];
    let done = false, responded = false, at = null, source = null;

    const pad = el('div', { class:'throw-pad' },
      el('div', { class:'throw-hint', text: useMotion ? 'HANDS UP — SNAP THE PHONE' : 'HANDS UP — TAP' }));
    stage.overlay(pad);

    const respond = (t, src) => {
      if(responded || done) return;
      responded = true; at = t; source = src;
      audio.tick(); haptics.fire('hit');
      pad.remove(); motion.disarmThrow();
    };
    if(useMotion) motion.armThrow(t => respond(t.t, 'motion'));
    pad.addEventListener('pointerdown', () => respond(performance.now(), 'tap'));

    const finish = () => {
      if(done) return; done = true;
      pad.remove(); motion.disarmThrow();
      field.scene.ball = null; field.scene.ballHidden = false;
      resolve({ responded, at, arrival, source });
    };

    const step = () => {
      if(!stage.alive){ done = true; pad.remove(); motion.disarmThrow(); return resolve(null); }
      const now = performance.now();
      const k = (now - start) / (flightSec * 1000);
      if(k >= 1 + 0.45){ finish(); return; }        // brief window past arrival to respond late
      const kk = clamp(k, 0, 1);
      const x = from.x + (to.x - from.x) * kk;
      const y = from.y + (to.y - from.y) * kk;
      trail.push({ x, y, k:kk }); if(trail.length > 16) trail.shift();
      field.scene.ball = { x, y, k:kk * 0.55 + quad.dh * 0.12, trail:trail.slice() };
      field.scene.ballHidden = kk > (1 - hidden);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function tray(stage, q, quads){
  return new Promise(resolve => {
    const grid = el('div', { class:'answer-grid answer-grid--2' });
    const box = el('div', { class:'answer-tray' }, el('div', { class:'answer-tray__q', text:q }), grid);
    quads.forEach(o => {
      const b = el('button', { class:'ans', 'data-key':o.key }, o.label);
      b.addEventListener('pointerdown', () => { clearInterval(iv); resolve({ key:o.key, node:b, tray:box }); }, { once:true });
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

/* ============================================================
   LOOP BREAK — the flagship rep.
   One snap, four timed phases, two clocks. Everything the app
   measures elsewhere shows up here under live load.
   ============================================================ */
import { Stage } from './stage.js';
import { el, cue, flash, wait, toast } from '../ui/ui.js';
import { OodaRep, defenseLoopMs, stressProfile, gradeOf } from '../engine/ooda.js';
import { CONCEPTS, COVERAGES, FORMATIONS, correctRead, COVERAGE_IDS } from '../engine/playbook.js';
import { buildDefense, chooseCoverage, chooseDisguise } from '../engine/defense.js';
import { routePath, atTime, ROUTE_LABEL } from '../engine/routes.js';
import { pick, shuffle, clamp, rand, randi, VariableRatio } from '../core/rng.js';
import { audio } from '../core/audio.js';
import { haptics } from '../core/haptics.js';
import { motion } from '../sensors/motion.js';
import { state } from '../core/state.js';

export const meta = {
  id:'loopbreak',
  name:'LOOP BREAK',
  tag:'CORE REP',
  ico:'⟳',
  accent:'#4DF0FF',
  desc:'Full four-phase rep against a disguised defense. The whole engine.',
  line:'Snap to release, timed in four phases, raced against the coverage\'s own decision cycle.',
  science:'Boyd\'s loop is a real cognitive pipeline: visual registration, schema retrieval, response selection, motor execution. Timing them separately is the only way to find out which one is actually costing you. Disguised shells force genuine post-snap orientation rather than pre-snap guessing, and randomised coverage order (contextual interference) depresses in-session accuracy while measurably improving retention and transfer.',
  regions:{ mt:0.6, parietal:0.9, fef:0.8, dlpfc:1.0, bg:0.7, cereb:0.5, amyg:0.6 },
  unlock:0,
};

const OBSERVE_LOCK_MS = 170;     // dwell required for a hands-free eyes-on lock

export async function run(root, cfg){
  const stress = stressProfile(cfg.stress);
  const level  = clamp(1 + Math.floor(state.s.xp / 3400) + stress.levelBump, 1, 10);
  const stage  = new Stage(root, { reps:cfg.reps, title:'REP' });
  const vr = new VariableRatio(6, 13);

  audio.crowd(stress.crowd);

  const reps = [];
  const recentCov = [];
  let heat = 0, aborted = false;

  stage.quitBtn.addEventListener('click', () => { aborted = true; stage.alive = false; });

  for(let i = 1; i <= cfg.reps; i++){
    if(aborted) break;
    stage.setRep(i, cfg.reps);
    stage.clearPhases();
    stage.dial?.set(0, 1, 0);
    const r = await oneRep({ stage, stress, level, recentCov, vr, heat, index:i });
    if(!r){ aborted = true; break; }
    reps.push(r);
    heat = r.good ? heat + 1 : 0;
    stage.setHeat(heat);
    recentCov.unshift(r.coverage);
    recentCov.length = Math.min(recentCov.length, 5);
    await wait(280);
  }

  stage.destroy();
  if(!reps.length) return { aborted:true };
  return summarise(reps, cfg, aborted);
}

/* ------------------------------------------------------------------ */

async function oneRep({ stage, stress, level, recentCov, vr, heat, index }){
  const field = stage.field;

  /* ---------- build the play ---------- */
  const concept = pick(CONCEPTS);
  const form = FORMATIONS[pick(concept.form)];
  const strength = Math.sign(form.slots.Z || 1) || 1;
  const coverage = chooseCoverage(recentCov);
  const disguise = Math.random() < stress.disguise ? chooseDisguise(coverage, level) : null;
  const blitz = coverage === 'C0' ? true : Math.random() < 0.16 + level * 0.02;
  const defense = buildDefense({ coverage, disguise, blitz, strength });
  const answer = correctRead(concept, coverage, blitz);

  const receivers = concept.reads.map(rd => {
    const sx = form.slots[rd.slot] ?? 0;
    const path = routePath(rd.route, sx, rd.depth);
    return {
      slot:rd.slot, read:rd, route:rd.route,
      label:ROUTE_LABEL[rd.route] || rd.route,
      path, at:t => atTime(path, t),
    };
  });

  const rep = new OodaRep({ level, stress:stress.id, defenseLoop:defenseLoopMs(level, stress.id) });

  field.jitterPx = stress.jitterPx;
  field.scene = { defense, receivers, ball:null, t:0, target:null, highlight:null, pocket:1 };
  defense.men.forEach(m => m.pos = m.show);

  /* ---------- 1. PLAY CARD (working-memory load) ---------- */
  const card = el('div', { class:'playcard' },
    el('div', { class:'playcard__k', text:'CALL' }),
    el('div', { class:'playcard__form', text:form.label }),
    el('div', { class:'playcard__concept', text:concept.name }),
    el('div', { class:'playcard__hot', text:`HOT: ${concept.hot}` }),
    el('div', { class:'playcard__timer' }, el('i', { style:`animation-duration:${stress.cardMs}ms` })),
  );
  stage.overlay(card);
  audio.cadence(1);
  if(!await sleep(stage, stress.cardMs)) return null;
  card.classList.add('is-out');
  setTimeout(() => card.remove(), 240);

  /* ---------- 2. PRE-SNAP SCAN ---------- */
  stage.phase('observe');
  if(motion.live) motion.calibrate();
  motion.resetTremor();
  const scanSectors = new Set();
  const tremorSamples = [];
  const scanTimer = setInterval(() => {
    scanSectors.add(Math.round(field.yaw / 12));
    if(motion.live) tremorSamples.push(motion.tremor);
  }, 90);

  const setCue = cue(stage.root, 'SET', 'am', disguise ? 'THEY ARE SHOWING SOMETHING' : 'READ THE PICTURE', 900);
  audio.cadence(2);
  const cadenceMs = rand(2200, 1100);
  if(!await sleep(stage, cadenceMs)){ clearInterval(scanTimer); return null; }
  clearInterval(scanTimer);

  const scanCoverage = clamp(scanSectors.size / 7, 0, 1);
  const poise = motion.live && tremorSamples.length
    ? clamp(1 - tremorSamples.reduce((a,b)=>a+b,0) / tremorSamples.length, 0, 1)
    : null;

  /* ---------- 3. SNAP ---------- */
  audio.snap(); haptics.fire('snap'); flash('#4DF0FF');
  audio.crowdSurge(0.8);
  rep.snap();
  const t0 = performance.now();
  let released = null, killedAt = null, killActive = false, stopFail = false, stopRT = null;
  let sacked = false;

  stage.onFrame = () => {
    const t = (performance.now() - t0) / 1000;
    field.scene.t = t;
    defense.men.forEach(m => { m.pos = defenderAt(m, t); });
    field.scene.pocket = clamp(1 - t / (stress.clockMs / 1000), 0, 1);
    if(blitz && t > 0.9) field.kick(0.12);
    if(rep.marks.act) return;
    stage.dial?.set(performance.now() - t0, rep.defenseLoop, phaseIndex(rep));
  };

  // rotation breaks the disguise ~180ms after the snap
  await wait(160);
  rep.rotate();
  if(defense.disguised){ audio.tick(); field.kick(0.25); }
  field.scene.highlight = null;

  /* kill signal scheduling (go / no-go) */
  const killPlanned = Math.random() < stress.killRate;
  let killTimer = null;
  if(killPlanned){
    killTimer = setTimeout(() => {
      if(released || !stage.alive) return;
      killActive = true; killedAt = performance.now();
      audio.kill(); haptics.fire('kill'); flash('#FF5C5C');
      cue(stage.root, 'KILL', 'kill', 'DO NOT THROW', 900);
    }, rand(2100, 600));
  }

  /* sack clock */
  const sackTimer = setTimeout(() => {
    if(released || !stage.alive) return;
    sacked = true;
  }, stress.clockMs);

  /* ---------- 4. OBSERVE: find the rotation ---------- */
  const observeTarget = defense.key;
  const observeRes = await observePhase(stage, defense, observeTarget, () => killActive || sacked);
  if(observeRes === null){ cleanup(); return null; }
  const observeMs = rep.mark('observe');
  stage.stampPhase('observe', observeMs);
  if(observeRes.hit){ audio.go(); haptics.fire('tap'); }
  field.scene.highlight = observeTarget?.id || null;

  /* ---------- 5. ORIENT: name the coverage ---------- */
  let orientMs = null, coverageRight = false, pickedCoverage = null;
  if(!sacked && !killActive){
    stage.phase('orient');
    const opts = coverageOptions(coverage);
    const chosen = await tray(stage, 'WHAT ARE THEY IN?', opts.map(id => ({
      key:id, label:COVERAGES[id].label, sub:COVERAGES[id].short,
    })), 3, () => killActive || sacked);
    if(chosen === null){ cleanup(); return null; }
    if(chosen !== 'ABORTED'){
      orientMs = rep.mark('orient');
      stage.stampPhase('orient', orientMs);
      pickedCoverage = chosen.key;
      coverageRight = chosen.key === coverage;
      chosen.node.classList.add(coverageRight ? 'is-right' : 'is-wrong');
      if(!coverageRight){
        const right = chosen.tray.querySelector(`[data-key="${coverage}"]`);
        right?.classList.add('is-right');
        audio.bad(); haptics.fire('bad');
      } else { audio.good(); haptics.fire('good'); }
      await wait(coverageRight ? 130 : 460);
      chosen.tray.remove();
    }
  }

  /* ---------- 6. DECIDE: take the read ---------- */
  let decideMs = null, readRight = false, pickedSlot = null;
  if(!sacked && !killActive){
    stage.phase('decide');
    field.scene.highlight = null;
    const chosen = await tray(stage, 'TAKE THE READ', receivers.map(r => ({
      key:r.slot, label:r.label, sub:r.slot,
    })), 3, () => killActive || sacked);
    if(chosen === null){ cleanup(); return null; }
    if(chosen !== 'ABORTED'){
      decideMs = rep.mark('decide');
      stage.stampPhase('decide', decideMs);
      pickedSlot = chosen.key;
      readRight = chosen.key === answer.read.slot;
      chosen.node.classList.add(readRight ? 'is-right' : 'is-wrong');
      field.scene.target = pickedSlot;
      if(readRight){ audio.good(); } else { audio.bad(); haptics.fire('bad'); }
      await wait(readRight ? 110 : 300);
      chosen.tray.remove();
    }
  }

  /* ---------- 7. ACT: release ---------- */
  let power = 0.55;
  if(!sacked && !killActive){
    stage.phase('act');
    const act = await actPhase(stage, () => killActive || sacked);
    if(act === null){ cleanup(); return null; }
    if(act !== 'ABORTED'){
      rep.mark('act');
      stage.stampPhase('act', rep.ms('act'));
      released = performance.now();
      power = act.power ?? 0.55;
      audio.whoosh(); haptics.fire('hit');
    }
  }

  /* ---------- 8. KILL RESOLUTION ---------- */
  if(killActive && !released && !sacked){
    const res = await killTray(stage);
    if(res === null){ cleanup(); return null; }
    stopRT = res.rt;
    stopFail = !res.stopped;
    if(res.stopped){ audio.good(); haptics.fire('good'); }
    else { audio.bad(); haptics.fire('bad'); flash('#FF5C5C'); }
  }

  clearTimeout(killTimer); clearTimeout(sackTimer);

  /* ---------- 9. BALL FLIGHT + OUTCOME ---------- */
  let outcome;
  if(sacked && !released){
    outcome = { type:'SACK', good:false, delta:rep.deltaLoop, p:0 };
    audio.bad(); haptics.fire('bad'); field.kick(1);
  } else if(killActive){
    outcome = stopFail
      ? { type:'PICK-SIX RISK', good:false, delta:rep.deltaLoop, p:0 }
      : { type:'KILLED CLEAN', good:true, delta:rep.deltaLoop, p:1 };
  } else {
    const tgt = receivers.find(r => r.slot === pickedSlot) || receivers[0];
    const contested = await flight(stage, tgt, t0, power);
    if(contested === null){ cleanup(); return null; }
    outcome = rep.outcome({ correctCoverage:coverageRight, correctRead:readRight, power, contested });
  }

  /* ---------- 10. WORKING-MEMORY PROBE ---------- */
  let recall = null;
  if(Math.random() < stress.recallRate && !sacked){
    const opts = shuffle([concept.hot, ...shuffle(['MIKE','SAM','WILL','NICKEL']).filter(h => h !== concept.hot).slice(0,2)]);
    const chosen = await tray(stage, 'WHO WAS HOT ON THE CALL?', opts.map(o => ({ key:o, label:o })), 3);
    if(chosen === null){ cleanup(); return null; }
    if(chosen !== 'ABORTED'){
      recall = chosen.key === concept.hot;
      chosen.node.classList.add(recall ? 'is-right' : 'is-wrong');
      if(!recall) chosen.tray.querySelector(`[data-key="${concept.hot}"]`)?.classList.add('is-right');
      await wait(recall ? 160 : 500);
      chosen.tray.remove();
    }
  }

  /* ---------- 11. VERDICT ---------- */
  const score = rep.score({ correctCoverage:coverageRight, correctRead:readRight, outcome, stopOk:!stopFail });
  const good = outcome.good && !stopFail;
  const xp = Math.round((score * 1.6) * (1 + Math.min(heat, 6) * 0.14) * (good ? 1 : 0.4));

  await verdict(stage, {
    outcome, rep, coverage, coverageRight, pickedCoverage,
    readRight, answer, recall, stopFail, stopRT, xp,
  });

  state.addXP(xp, 'loopbreak');
  if(good && vr.roll()){
    const { reward } = await import('../ui/ui.js');
    await reward({
      kicker:'LOOP BREAK',
      title:pick(['STALE PICTURE','THEY NEVER SAW IT','CYCLE OWNED','OUTSIDE THEIR CLOCK']),
      sub:`You released ${rep.deltaLoop}ms before the coverage finished its own loop.`,
      xp:Math.round(xp * 1.5),
    });
    state.addXP(Math.round(xp * 1.5), 'loopbreak:vr');
  }

  cleanup();
  return {
    coverage, concept:concept.id, disguised:defense.disguised, blitz,
    observeMs, orientMs, decideMs, actMs:rep.ms('act'),
    loopMs:rep.loopMs, defenseLoop:rep.defenseLoop, delta:rep.deltaLoop,
    coverageRight, readRight, recall, stopFail, stopRT,
    observeHit:observeRes.hit, observeMode:observeRes.mode,
    scanCoverage, poise, outcome:outcome.type, good, score, xp,
  };

  function cleanup(){
    clearTimeout(killTimer); clearTimeout(sackTimer);
    stage.onFrame = null;
    field.scene.ball = null;
    field.scene.target = null;
    field.scene.highlight = null;
    field.jitterPx = 0;
  }
}

/* ------------------------------------------------------------------ */
/* phases                                                              */

function defenderAt(m, t){
  if(t <= 0) return m.show;
  if(t < 0.5){ const k = t / 0.5; return lerpPt(m.show, m.rot, k); }
  const k = clamp((t - 0.5) / 2.2, 0, 1);
  const e = 1 - Math.pow(1 - k, 2);
  return lerpPt(m.rot, m.end, e);
}
const lerpPt = (a, b, k) => ({ x:a.x + (b.x - a.x) * k, y:a.y + (b.y - a.y) * k });

/** OBSERVE: register the man who broke the disguise.
 *  Sensors: hold him in the foveal cone for 170ms — hands never move.
 *  No sensors: tap him. Both are timestamped identically. */
function observePhase(stage, defense, target, bail){
  return new Promise(resolve => {
    if(!target) return resolve({ hit:false, mode:'none' });
    const field = stage.field;
    const hint = el('div', { class:'throw-hint', text: motion.live ? 'EYES ON THE ROTATION' : 'TAP WHO MOVED' });
    stage.overlay(hint);
    let dwell = 0, last = performance.now(), done = false;

    const finish = (hit, mode) => {
      if(done) return; done = true;
      hint.remove();
      stage.canvas.removeEventListener('pointerdown', onTap);
      clearInterval(iv);
      resolve({ hit, mode });
    };

    const onTap = e => {
      const r = stage.canvas.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      let best = null, bestD = 56;
      for(const m of defense.men){
        const p = field.project(m.pos.x, m.pos.y);
        if(!p) continue;
        const d = Math.hypot(p.x - px, p.y - py);
        if(d < bestD){ bestD = d; best = m; }
      }
      finish(best?.id === target.id, 'tap');
    };
    stage.canvas.addEventListener('pointerdown', onTap);

    const iv = setInterval(() => {
      if(!stage.alive){
        done = true; hint.remove();
        stage.canvas.removeEventListener('pointerdown', onTap);
        clearInterval(iv); return resolve(null);
      }
      if(bail && bail()){ finish(false, 'bail'); return; }
      const now = performance.now(); const dt = now - last; last = now;
      if(motion.live){
        const ecc = field.eccentricity(target.pos.x, target.pos.y);
        const cone = Math.min(field.W, field.H) * 0.16;
        if(ecc != null && ecc < cone){ dwell += dt; if(dwell >= OBSERVE_LOCK_MS) finish(true, 'gaze'); }
        else dwell = Math.max(0, dwell - dt * 0.6);
      }
    }, 32);
  });
}

/** Generic answer tray. Resolves { key, node, tray } or 'ABORTED' or null. */
function tray(stage, question, options, cols = 3, bail = null){
  return new Promise(resolve => {
    const grid = el('div', { class:`answer-grid answer-grid--${cols}` });
    const box = el('div', { class:'answer-tray' },
      el('div', { class:'answer-tray__q', text:question }), grid);
    options.forEach(o => {
      const b = el('button', { class:'ans', 'data-key':o.key },
        o.label, o.sub ? el('small', { text:o.sub }) : null);
      b.addEventListener('pointerdown', () => {
        clearInterval(iv);
        resolve({ key:o.key, node:b, tray:box });
      }, { once:true });
      grid.append(b);
    });
    stage.overlay(box);
    const iv = setInterval(() => {
      if(!stage.alive){ clearInterval(iv); box.remove(); resolve(null); }
      else if(bail && bail()){ clearInterval(iv); box.remove(); resolve('ABORTED'); }
    }, 40);
  });
}

/** ACT: the release. Motion core reads the actual throwing motion;
 *  without it, a press-and-release on the pad. Both timestamp the
 *  moment the ball leaves, not the moment the finger lands. */
function actPhase(stage, bail){
  return new Promise(resolve => {
    let done = false;
    const useMotion = motion.live && state.s.settings.motion;
    const pad = el('div', { class:'throw-pad' });
    const hint = el('div', { class:'throw-hint', text: useMotion ? 'THROW IT — FLICK THE PHONE' : 'RELEASE — TAP AND LIFT' });
    pad.append(hint);
    stage.overlay(pad);

    const finish = payload => {
      if(done) return; done = true;
      clearInterval(iv); pad.remove(); motion.disarmThrow();
      resolve(payload);
    };

    if(useMotion) motion.armThrow(t => finish({ power:t.power, source:'motion' }));
    pad.addEventListener('pointerup', () => finish({ power:0.55, source:'tap' }));

    const iv = setInterval(() => {
      if(!stage.alive){ finish(null); }
      else if(bail && bail()){ finish('ABORTED'); }
    }, 40);
  });
}

function killTray(stage){
  return new Promise(resolve => {
    const t = performance.now();
    const grid = el('div', { class:'answer-grid answer-grid--2' });
    const box = el('div', { class:'answer-tray' },
      el('div', { class:'answer-tray__q', text:'THE PLAY IS DEAD' }), grid);
    const away = el('button', { class:'ans ans--kill' }, 'THROW AWAY', el('small', { text:'CORRECT' }));
    const gun  = el('button', { class:'ans' }, 'GUN IT ANYWAY', el('small', { text:'HERO BALL' }));
    grid.append(away, gun);
    stage.overlay(box);
    const done = stopped => { box.remove(); clearInterval(iv); resolve({ stopped, rt:Math.round(performance.now() - t) }); };
    away.addEventListener('pointerdown', () => done(true), { once:true });
    gun.addEventListener('pointerdown', () => done(false), { once:true });
    const iv = setInterval(() => { if(!stage.alive){ clearInterval(iv); box.remove(); resolve(null); } }, 40);
    setTimeout(() => { if(document.body.contains(box)) done(false); }, 1400);
  });
}

/** Ball flight. Returns a 0..1 contested factor from the closest
 *  defender at the catch point. */
function flight(stage, target, t0, power){
  return new Promise(resolve => {
    const field = stage.field;
    const tRel = (performance.now() - t0) / 1000;
    const speed = 19 + power * 12;
    const from = { x:0, y:-5.5 };
    let dest = target.at(tRel + 0.9);
    const dist = Math.hypot(dest.x - from.x, dest.y - from.y);
    const dur = clamp(dist / speed, 0.35, 1.6);
    dest = target.at(tRel + dur);
    const start = performance.now();
    const trail = [];
    field.scene.target = target.slot;

    const step = () => {
      if(!stage.alive) return resolve(null);
      const k = clamp((performance.now() - start) / (dur * 1000), 0, 1);
      const x = from.x + (dest.x - from.x) * k;
      const y = from.y + (dest.y - from.y) * k;
      trail.push({ x, y, k }); if(trail.length > 22) trail.shift();
      field.scene.ball = { x, y, k, trail:trail.slice() };
      const t = (performance.now() - t0) / 1000;
      field.scene.t = t;
      if(k < 1) requestAnimationFrame(step);
      else {
        let nearest = 99;
        for(const m of field.scene.defense.men){
          if(m.role === 'DL') continue;
          nearest = Math.min(nearest, Math.hypot(m.pos.x - dest.x, m.pos.y - dest.y));
        }
        setTimeout(() => { field.scene.ball = null; }, 260);
        resolve(clamp((6 - nearest) / 6, 0, 1));
      }
    };
    requestAnimationFrame(step);
  });
}

async function verdict(stage, d){
  const good = d.outcome.good && !d.stopFail;
  const cls = d.outcome.type === 'INT' || d.stopFail ? 'v-bad' : good ? 'v-good' : 'v-mid';
  const chips = [];
  chips.push(el('span', { class:`chip ${d.rep.deltaLoop >= 0 ? 'chip--li' : 'chip--mg'}`,
    text:`Δ-LOOP ${d.rep.deltaLoop > 0 ? '+' : ''}${d.rep.deltaLoop}ms` }));
  chips.push(el('span', { class:`chip ${d.coverageRight ? 'chip--li' : 'chip--mg'}`,
    text:d.coverageRight ? `READ ${COVERAGES[d.coverage].short}` : `IT WAS ${COVERAGES[d.coverage].label}` }));
  if(d.readRight) chips.push(el('span', { class:'chip chip--li', text:`${d.answer.read.route} ✓` }));
  else chips.push(el('span', { class:'chip chip--mg', text:`ANSWER: ${d.answer.read.route}` }));
  if(d.recall === true) chips.push(el('span', { class:'chip chip--vi', text:'RECALL ✓' }));
  if(d.recall === false) chips.push(el('span', { class:'chip chip--mg', text:'RECALL ✗' }));
  if(d.stopRT != null) chips.push(el('span', { class:`chip ${d.stopFail ? 'chip--mg' : 'chip--li'}`, text:`STOP ${d.stopRT}ms` }));
  chips.push(el('span', { class:'chip chip--gold', text:`+${d.xp} XP` }));

  const node = el('div', { class:'verdict' },
    el('div', { class:`verdict__head ${cls}`, text:d.stopFail ? 'YOU THREW IT' : d.outcome.type }),
    el('div', { class:'verdict__row' }, ...chips),
    el('div', { class:'verdict__note', text:d.stopFail
      ? 'The kill signal fired and the ball still came out. That is the interception you will actually throw.'
      : d.answer.reason }),
  );
  stage.overlay(node);
  if(good) flash('#7CFF9E'); else if(cls === 'v-bad') flash('#FF5C5C');
  if(good) audio.great();
  await wait(good ? 1500 : 2100);
  node.remove();
}

/* ------------------------------------------------------------------ */

function coverageOptions(correct){
  const pool = shuffle(COVERAGE_IDS.filter(id => id !== correct)).slice(0, 5);
  return shuffle([correct, ...pool]);
}

function phaseIndex(rep){
  return ['observe','orient','decide','act'].filter(p => rep.marks[p]).length;
}

function sleep(stage, ms){
  return new Promise(resolve => {
    const t = setTimeout(() => { clearInterval(iv); resolve(true); }, ms);
    const iv = setInterval(() => { if(!stage.alive){ clearTimeout(t); clearInterval(iv); resolve(false); } }, 40);
  });
}

/* ------------------------------------------------------------------ */

function summarise(reps, cfg, aborted){
  const n = reps.length;
  const avg = (k, filter = r => r[k] != null) => {
    const a = reps.filter(filter).map(r => r[k]);
    return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  };
  const score = Math.round(avg('score') || 0);
  const delta = Math.round(avg('delta') || 0);
  const orient = avg('orientMs');
  const poise = avg('poise');
  const covAcc = reps.filter(r => r.orientMs != null).length
    ? reps.filter(r => r.coverageRight).length / reps.filter(r => r.orientMs != null).length : null;
  const readAcc = reps.filter(r => r.decideMs != null || r.readRight).length
    ? reps.filter(r => r.readRight).length / reps.filter(r => r.orientMs != null).length : null;
  const stopReps = reps.filter(r => r.stopRT != null);

  return {
    drillId:meta.id, reps:n, aborted,
    score, delta, orient:orient ? Math.round(orient) : null, poise,
    stress:cfg.stress,
    metrics:[
      { k:'Δ-LOOP', v:(delta > 0 ? '+' : '') + delta, d:'ms inside their cycle', pr:'deltaLoop', raw:delta },
      { k:'ORIENT', v:orient ? Math.round(orient) : '—', d:'ms to name the coverage', pr:'orientMs', raw:orient ? Math.round(orient) : null },
      { k:'COVERAGE ID', v:covAcc == null ? '—' : Math.round(covAcc*100) + '%', d:'orientation accuracy', pr:'covAcc', raw:covAcc },
      { k:'READ', v:readAcc == null ? '—' : Math.round(readAcc*100) + '%', d:'right answer taken', pr:'readAcc', raw:readAcc },
      { k:'COMPLETIONS', v:reps.filter(r => r.good).length + '/' + n, d:'clean reps', raw:null },
      { k:'POISE', v:poise == null ? '—' : Math.round(poise*100) + '%', d:'stillness under load', pr:'poise', raw:poise },
    ],
    phases:['observe','orient','decide','act'].map(p => ({
      phase:p, ms:avg(p === 'act' ? 'actMs' : p + 'Ms'),
    })),
    extra:{
      stopAccuracy: stopReps.length ? stopReps.filter(r => !r.stopFail).length / stopReps.length : null,
      scan: avg('scanCoverage'),
      disguisedAcc: (() => {
        const d = reps.filter(r => r.disguised && r.orientMs != null);
        return d.length ? d.filter(r => r.coverageRight).length / d.length : null;
      })(),
    },
    regions:meta.regions,
    log:reps,
  };
}

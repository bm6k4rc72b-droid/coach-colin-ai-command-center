/* ============================================================
   RELEASE — the receiver's core rep.
   Rendered FIRST PERSON from the receiver's own stance, at eye height,
   which means the safety is genuinely off-frame until the athlete
   turns their head to peek him. Finding the top of the coverage is a
   physical act here, not a glance at a diagram.

   Four phases, same engine as the quarterback rep. The opponent clock
   is different: you are racing the covering defender's HIP FLIP. Beat
   it and you have separation; miss it and he is in your pocket before
   the ball is out.

   And at the break, the camera goes WITH you — it travels the
   conversion path, so the defender slides across your view exactly as
   he would over your shoulder.
   ============================================================ */
import { Stage } from './stage.js';
import { el, cue, flash, wait } from '../ui/ui.js';
import { OodaRep, stressProfile } from '../engine/ooda.js';
import {
  LOOKS, LOOK_IDS, SPOTS, SPOT_IDS, WR_ROUTES,
  buildWrPicture, wrCamera, correctConversion, dbWindowMs,
} from '../engine/wrplaybook.js';
import { FORMATIONS } from '../engine/playbook.js';
import { routePath, atTime } from '../engine/routes.js';
import { pick, shuffle, clamp, rand, VariableRatio } from '../core/rng.js';
import { audio } from '../core/audio.js';
import { haptics } from '../core/haptics.js';
import { motion } from '../sensors/motion.js';
import { state } from '../core/state.js';

export const meta = {
  id:'wrread',
  name:'RELEASE',
  tag:'CORE REP',
  ico:'⟿',
  accent:'#7CFF9E',
  desc:'Full four-phase rep from your own stance. Read him, convert the route, break before he can turn.',
  line:'First person off the line. Leverage, technique, the top — then a break he cannot recover from.',
  science:'A receiver\'s decision cycle is the same four phases as a quarterback\'s, compressed into roughly half a second and pointed at one man instead of eleven. Option routes are explicit if-then rules, which makes them measurable: there is one correct conversion per look, so orientation accuracy and conversion accuracy can be timed separately and the leak located. Rendering it first-person matters — the safety is out of frame until you physically turn to find him, so the pre-snap scan being trained is the real one rather than a habit of reading a diagram.',
  regions:{ parietal:1.0, mt:0.8, fef:0.9, dlpfc:0.7, cereb:0.6, bg:0.6, amyg:0.4 },
  unlock:0,
};

const OBSERVE_LOCK_MS = 150;

export async function run(root, cfg){
  const stress = stressProfile(cfg.stress);
  const level  = clamp(1 + Math.floor(state.s.xp / 3400) + stress.levelBump, 1, 10);
  const stage  = new Stage(root, { reps:cfg.reps, title:'REP', cam:wrCamera(SPOTS.Z_FIELD) });
  const vr = new VariableRatio(6, 13);

  audio.crowd(stress.crowd);

  const reps = [];
  const recent = [];
  let heat = 0, aborted = false;

  stage.quitBtn.addEventListener('click', () => { aborted = true; stage.alive = false; });

  for(let i = 1; i <= cfg.reps; i++){
    if(aborted) break;
    stage.setRep(i, cfg.reps);
    stage.clearPhases();
    stage.dial?.set(0, 1, 0);
    const r = await oneRep({ stage, stress, level, recent, vr, heat });
    if(!r){ aborted = true; break; }
    reps.push(r);
    heat = r.good ? heat + 1 : 0;
    stage.setHeat(heat);
    recent.unshift(r.look);
    recent.length = Math.min(recent.length, 4);
    await wait(260);
  }

  stage.destroy();
  if(!reps.length) return { aborted:true };
  return summarise(reps, cfg, aborted);
}

/* ------------------------------------------------------------------ */

async function oneRep({ stage, stress, level, recent, vr, heat }){
  const field = stage.field;

  /* ---------- the call ---------- */
  const spot = SPOTS[pick(SPOT_IDS)];
  const route = pick(WR_ROUTES);
  const look = chooseLook(recent);
  const pressure = Math.random() < 0.15 + level * 0.015;
  const picture = buildWrPicture({ look, spot, pressure, level });
  const answer = correctConversion(route, look, pressure);

  const rep = new OodaRep({ level, stress:stress.id, defenseLoop:dbWindowMs(level, stress.id) });

  field.setCamera(wrCamera(spot));
  field.jitterPx = stress.jitterPx;
  picture.men.forEach(m => m.pos = m.show);
  field.scene = {
    defense:picture, receivers:teammates(spot), ball:null,
    t:0, target:null, highlight:null, pocket:1,
  };

  /* ---------- 1. CALL (working-memory load) ---------- */
  const card = el('div', { class:'playcard' },
    el('div', { class:'playcard__k', text:'CALL' }),
    el('div', { class:'playcard__form', text:spot.label }),
    el('div', { class:'playcard__concept', text:route.name }),
    el('div', { class:'playcard__hot', text:`HOT: ${route.conversions.slice().sort((a,b)=>a.depth-b.depth)[0].label}` }),
    el('div', { class:'playcard__timer' }, el('i', { style:`animation-duration:${stress.cardMs}ms` })),
  );
  stage.overlay(card);
  audio.cadence(1);
  if(!await sleep(stage, stress.cardMs)) return null;
  card.classList.add('is-out');
  setTimeout(() => card.remove(), 240);

  /* ---------- 2. PRE-SNAP: check the man, peek the top ---------- */
  stage.phase('observe');
  if(motion.live) motion.calibrate();
  motion.resetTremor();

  const deep = picture.men
    .filter(m => m.role === 'DB' && m.id !== spot.db)
    .sort((a,b) => b.show.y - a.show.y)[0];
  let sawMan = false, sawTop = false;
  const tremors = [];
  field.scene.highlight = picture.covering?.id || null;   // the man over you
  const scanTimer = setInterval(() => {
    const cone = Math.min(field.W, field.H) * 0.2;
    if(picture.covering){
      const e = field.eccentricity(picture.covering.show.x, picture.covering.show.y);
      if(e != null && e < cone) sawMan = true;
    }
    if(deep){
      const e = field.eccentricity(deep.show.x, deep.show.y);
      if(e != null && e < cone) sawTop = true;
    }
    if(motion.live) tremors.push(motion.tremor);
  }, 90);

  cue(stage.root, 'SET', 'am', 'CHECK HIM — THEN PEEK THE TOP', 950);
  audio.cadence(2);
  if(!await sleep(stage, rand(2100, 1100))){ clearInterval(scanTimer); return null; }
  clearInterval(scanTimer);

  const poise = motion.live && tremors.length
    ? clamp(1 - tremors.reduce((a,b)=>a+b,0)/tremors.length, 0, 1) : null;

  /* ---------- 3. SNAP ---------- */
  field.scene.highlight = null;                           // at the snap you are on your own
  audio.snap(); haptics.fire('snap'); flash('#7CFF9E');
  audio.crowdSurge(0.7);
  rep.snap();
  const t0 = performance.now();
  let broke = null, scrambleActive = false, scrambleFail = false, scrambleRT = null;

  stage.onFrame = () => {
    const t = (performance.now() - t0) / 1000;
    field.scene.t = t;
    picture.men.forEach(m => { m.pos = defenderAt(m, t); });
    if(!rep.marks.act) stage.dial?.set(performance.now() - t0, rep.defenseLoop, phaseIndex(rep));
  };

  await wait(150);
  rep.rotate();
  audio.tick();

  /* scramble drill — the play breaks down and the rule changes */
  const scramblePlanned = Math.random() < stress.killRate;
  let scrambleTimer = null;
  if(scramblePlanned){
    scrambleTimer = setTimeout(() => {
      if(broke || !stage.alive) return;
      scrambleActive = true;
      audio.kill(); haptics.fire('kill'); flash('#FFC44D');
      cue(stage.root, 'SCRAMBLE', 'am', 'HE LEFT THE POCKET', 900);
    }, rand(2000, 550));
  }

  /* ---------- 4. OBSERVE: eyes to the man who declares it ---------- */
  const obs = await observePhase(stage, picture, picture.declare, () => scrambleActive);
  if(obs === null){ cleanup(); return null; }
  const observeMs = rep.mark('observe');
  stage.stampPhase('observe', observeMs);
  if(obs.hit){ audio.go(); haptics.fire('tap'); }
  field.scene.highlight = picture.declare?.id || null;

  /* ---------- 5. ORIENT: what did he give you ---------- */
  let orientMs = null, lookRight = false;
  if(!scrambleActive){
    stage.phase('orient');
    const opts = shuffle([look, ...shuffle(LOOK_IDS.filter(l => l !== look)).slice(0, 3)]);
    const chosen = await tray(stage, 'WHAT DID HE GIVE YOU?', opts.map(id => ({
      key:id, label:LOOKS[id].label, sub:LOOKS[id].short,
    })), 2, () => scrambleActive);
    if(chosen === null){ cleanup(); return null; }
    if(chosen !== 'ABORTED'){
      orientMs = rep.mark('orient');
      stage.stampPhase('orient', orientMs);
      lookRight = chosen.key === look;
      chosen.node.classList.add(lookRight ? 'is-right' : 'is-wrong');
      if(!lookRight){
        chosen.tray.querySelector(`[data-key="${look}"]`)?.classList.add('is-right');
        audio.bad(); haptics.fire('bad');
      } else { audio.good(); haptics.fire('good'); }
      await wait(lookRight ? 130 : 460);
      chosen.tray.remove();
    }
  }

  /* ---------- 6. DECIDE: convert the route ---------- */
  let decideMs = null, convRight = false, picked = null;
  if(!scrambleActive){
    stage.phase('decide');
    field.scene.highlight = null;
    const chosen = await tray(stage, 'CONVERT IT', route.conversions.map(c => ({
      key:c.key, label:c.label, sub:`${c.depth}`,
    })), 3, () => scrambleActive);
    if(chosen === null){ cleanup(); return null; }
    if(chosen !== 'ABORTED'){
      decideMs = rep.mark('decide');
      stage.stampPhase('decide', decideMs);
      picked = route.conversions.find(c => c.key === chosen.key);
      convRight = chosen.key === answer.conv.key;
      chosen.node.classList.add(convRight ? 'is-right' : 'is-wrong');
      if(convRight) audio.good(); else { audio.bad(); haptics.fire('bad'); }
      await wait(convRight ? 110 : 300);
      chosen.tray.remove();
    }
  }

  /* ---------- 7. ACT: the plant ---------- */
  if(!scrambleActive){
    stage.phase('act');
    const act = await actPhase(stage, () => scrambleActive);
    if(act === null){ cleanup(); return null; }
    if(act !== 'ABORTED'){
      rep.mark('act');
      stage.stampPhase('act', rep.ms('act'));
      broke = performance.now();
      audio.whoosh(); haptics.fire('hit');
    }
  }

  /* ---------- 8. SCRAMBLE RESOLUTION ---------- */
  if(scrambleActive && !broke){
    const res = await scrambleTray(stage);
    if(res === null){ cleanup(); return null; }
    scrambleRT = res.rt;
    scrambleFail = !res.correct;
    if(res.correct){ audio.good(); haptics.fire('good'); }
    else { audio.bad(); haptics.fire('bad'); flash('#FF5C5C'); }
  }
  clearTimeout(scrambleTimer);

  /* ---------- 9. THE BREAK — camera travels with you ---------- */
  let sep = 0, outcome;
  if(scrambleActive){
    outcome = scrambleFail
      ? { type:'RAN YOURSELF OUT', good:false }
      : { type:'SCRAMBLE RULE', good:true };
  } else {
    const conv = picked || route.conversions[0];
    sep = separationYards(rep.deltaLoop, lookRight, convRight);
    const ran = await runBreak(stage, spot, route, conv, picture, sep, t0);
    if(ran === null){ cleanup(); return null; }
    outcome = outcomeFor(sep, convRight);
  }

  /* ---------- 10. WORKING-MEMORY PROBE ---------- */
  let recall = null;
  if(Math.random() < stress.recallRate && !scrambleActive){
    const opts = shuffle([route.name, ...shuffle(WR_ROUTES.filter(r => r.id !== route.id)).slice(0,2).map(r => r.name)]);
    const chosen = await tray(stage, 'WHAT WAS THE CALL?', opts.map(o => ({ key:o, label:o })), 3);
    if(chosen === null){ cleanup(); return null; }
    if(chosen !== 'ABORTED'){
      recall = chosen.key === route.name;
      chosen.node.classList.add(recall ? 'is-right' : 'is-wrong');
      if(!recall) chosen.tray.querySelector(`[data-key="${route.name}"]`)?.classList.add('is-right');
      await wait(recall ? 160 : 500);
      chosen.tray.remove();
    }
  }

  /* ---------- 11. VERDICT ---------- */
  let score = rep.score({ correctCoverage:lookRight, correctRead:convRight, outcome, stopOk:!scrambleFail });
  if(outcome.type === 'UNCOVERED') score = clamp(score + 6, 0, 100);
  if(outcome.type === 'ROUTE BUSTED') score = clamp(score - 10, 0, 100);
  const good = outcome.good && !scrambleFail;
  const xp = Math.round((score * 1.6) * (1 + Math.min(heat, 6) * 0.14) * (good ? 1 : 0.4));

  await verdict(stage, { outcome, rep, look, lookRight, convRight, answer, recall, sep, scrambleFail, scrambleRT, xp });

  state.addXP(xp, 'wrread');
  if(good && vr.roll()){
    const { reward } = await import('../ui/ui.js');
    await reward({
      kicker:'UNCOVERED',
      title:pick(['HE NEVER TURNED','BROKE HIS HIPS','GONE AT THE STEM','THREE STEPS OF DAYLIGHT']),
      sub:`You declared the break ${rep.deltaLoop}ms before he could flip and drive.`,
      xp:Math.round(xp * 1.5),
    });
    state.addXP(Math.round(xp * 1.5), 'wrread:vr');
  }

  cleanup();
  return {
    look, route:route.id, spot:spot.id, pressure,
    observeMs, orientMs, decideMs, actMs:rep.ms('act'),
    loopMs:rep.loopMs, delta:rep.deltaLoop,
    lookRight, convRight, recall, scrambleFail, scrambleRT,
    observeHit:obs.hit, sawMan, sawTop, peek:(sawMan && sawTop) ? 1 : 0,
    poise, sep, outcome:outcome.type, good, score, xp,
  };

  function cleanup(){
    clearTimeout(scrambleTimer);
    stage.onFrame = null;
    field.scene.highlight = null;
    field.scene.target = null;
    field.jitterPx = 0;
  }
}

/* ------------------------------------------------------------------ */
/* mechanics                                                           */

const lp = (a, b, k) => ({ x:a.x + (b.x - a.x) * k, y:a.y + (b.y - a.y) * k });
function defenderAt(m, t){
  if(t <= 0) return m.show;
  if(t < 0.45) return lp(m.show, m.rot, t / 0.45);
  const k = clamp((t - 0.45) / 2.1, 0, 1);
  return lp(m.rot, m.end, 1 - Math.pow(1 - k, 2));
}

/** Two teammates so the picture reads as a formation rather than a drill. */
function teammates(spot){
  const form = FORMATIONS[Object.keys(FORMATIONS).find(f => FORMATIONS[f].label === spot.form)] || FORMATIONS.DOUBLES;
  return ['X','Z','Y'].map(k => form.slots[k])
    .filter(x => x != null && Math.abs(x - spot.x) > 4)
    .slice(0, 2)
    .map((x, i) => {
      const path = routePath(i ? 'GO' : 'DIG', x, 14);
      return { slot:`T${i}`, label:'', at:t => atTime(path, t) };
    });
}

/** Separation in yards, derived from the loop differential. Positive
 *  Δ means you declared before he could flip — that is the whole point. */
function separationYards(delta, lookRight, convRight){
  let s = 1.05 + delta / 420;
  if(!lookRight) s -= 0.55;
  if(!convRight) s -= 1.15;
  return clamp(+s.toFixed(2), -0.4, 4.6);
}

function outcomeFor(sep, convRight){
  if(!convRight) return { type:'ROUTE BUSTED', good:false };
  if(sep >= 3.0)  return { type:'UNCOVERED',    good:true  };
  if(sep >= 1.8)  return { type:'SEPARATION',   good:true  };
  if(sep >= 0.9)  return { type:'CONTESTED',    good:true  };
  if(sep >= 0.3)  return { type:'IN HIS POCKET',good:false };
  return { type:'BLANKETED', good:false };
}

/** Waypoints for the chosen conversion, in field yards. */
function conversionPath(spot, route, conv){
  const s = spot.side, x0 = spot.x;
  const stemT = clamp(conv.depth / 9, 0.3, 2.0);
  const brk = { x:x0 + (conv.dir === 'up' ? s * 0.7 : 0), y:conv.depth, t:stemT };
  let end;
  switch(conv.dir){
    case 'in':   end = { x:x0 - s * 10, y:conv.depth + 1.6, t:stemT + 1.0 }; break;
    case 'out':  end = { x:clamp(x0 + s * 7, -24, 24), y:conv.depth + 0.8, t:stemT + 0.9 }; break;
    case 'up':   end = { x:x0 + s * 1.4, y:conv.depth + 8, t:stemT + 1.0 }; break;
    default:     end = { x:x0 - s * 1.2, y:conv.depth - 1.8, t:stemT + 0.7 }; break;
  }
  return [{ x:x0, y:0, t:0 }, brk, end];
}

/** Run the route with the camera riding the receiver. The covering
 *  defender is placed at the computed separation, trailing the break. */
function runBreak(stage, spot, route, conv, picture, sep, t0){
  return new Promise(resolve => {
    const field = stage.field;
    const path = conversionPath(spot, route, conv);
    const dur = path[path.length - 1].t;
    const start = performance.now();
    const cb = picture.covering;
    const baseYaw = field.cam.baseYaw;

    const step = () => {
      if(!stage.alive) return resolve(null);
      const k = clamp((performance.now() - start) / (dur * 1000), 0, 1);
      const t = k * dur;
      const me = atTime(path, t);
      field.cam.x = me.x;
      field.cam.y = me.y - 1.2;
      // head turns toward the break as it develops
      const turn = (conv.dir === 'in' ? 1 : conv.dir === 'out' ? -1 : 0) * spot.side * 22;
      field.cam.baseYaw = baseYaw + turn * Math.min(1, k * 1.7);

      if(cb){
        // trail him behind the break by the separation we computed
        const lag = atTime(path, Math.max(0, t - 0.34));
        const dx = me.x - lag.x, dy = me.y - lag.y;
        const m = Math.hypot(dx, dy) || 1;
        cb.pos = { x:me.x - (dx / m) * sep, y:me.y - (dy / m) * sep };
      }
      field.scene.t = (performance.now() - t0) / 1000;
      picture.men.forEach(m => { if(m !== cb) m.pos = defenderAt(m, field.scene.t); });

      if(k < 1) requestAnimationFrame(step);
      else resolve(true);
    };
    requestAnimationFrame(step);
  });
}

function chooseLook(recent){
  const weights = LOOK_IDS.map(id => {
    const i = recent.indexOf(id);
    if(i === -1) return 3;
    if(i === 0) return 0.3;      // never the same picture twice running
    if(i <= 2) return 1.5;
    return 2.4;
  });
  const total = weights.reduce((a,b) => a + b, 0);
  let r = rand(total);
  for(let i = 0; i < LOOK_IDS.length; i++){ r -= weights[i]; if(r <= 0) return LOOK_IDS[i]; }
  return LOOK_IDS[LOOK_IDS.length - 1];
}

/* ------------------------------------------------------------------ */
/* phases                                                              */

function observePhase(stage, picture, target, bail){
  return new Promise(resolve => {
    if(!target) return resolve({ hit:false, mode:'none' });
    const field = stage.field;
    const hint = el('div', { class:'throw-hint',
      text: motion.live ? 'EYES TO WHOEVER DECLARES IT' : 'TAP WHO DECLARED IT' });
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
      let best = null, bestD = 60;
      for(const m of picture.men){
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
        const cone = Math.min(field.W, field.H) * 0.17;
        if(ecc != null && ecc < cone){ dwell += dt; if(dwell >= OBSERVE_LOCK_MS) finish(true, 'gaze'); }
        else dwell = Math.max(0, dwell - dt * 0.6);
      }
    }, 32);
  });
}

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

function actPhase(stage, bail){
  return new Promise(resolve => {
    let done = false;
    const useMotion = motion.live && state.s.settings.motion;
    const pad = el('div', { class:'throw-pad' },
      el('div', { class:'throw-hint', text: useMotion ? 'PLANT AND BREAK — SNAP THE PHONE' : 'BREAK — TAP AND LIFT' }));
    stage.overlay(pad);
    const finish = payload => {
      if(done) return; done = true;
      clearInterval(iv); pad.remove(); motion.disarmThrow();
      resolve(payload);
    };
    if(useMotion) motion.armThrow(t => finish({ power:t.power, source:'motion' }));
    pad.addEventListener('pointerup', () => finish({ power:0.55, source:'tap' }));
    const iv = setInterval(() => {
      if(!stage.alive) finish(null);
      else if(bail && bail()) finish('ABORTED');
    }, 40);
  });
}

function scrambleTray(stage){
  return new Promise(resolve => {
    const t = performance.now();
    const grid = el('div', { class:'answer-grid answer-grid--2' });
    const box = el('div', { class:'answer-tray' },
      el('div', { class:'answer-tray__q', text:'THE POCKET IS GONE' }), grid);
    const work = el('button', { class:'ans' }, 'WORK BACK', el('small', { text:'SCRAMBLE RULE' }));
    const keep = el('button', { class:'ans ans--kill' }, 'KEEP RUNNING IT', el('small', { text:'ROUTE ON AIR' }));
    grid.append(work, keep);
    stage.overlay(box);
    const done = correct => { box.remove(); clearInterval(iv); resolve({ correct, rt:Math.round(performance.now() - t) }); };
    work.addEventListener('pointerdown', () => done(true), { once:true });
    keep.addEventListener('pointerdown', () => done(false), { once:true });
    const iv = setInterval(() => { if(!stage.alive){ clearInterval(iv); box.remove(); resolve(null); } }, 40);
    setTimeout(() => { if(document.body.contains(box)) done(false); }, 1500);
  });
}

async function verdict(stage, d){
  const good = d.outcome.good && !d.scrambleFail;
  const cls = d.outcome.type === 'ROUTE BUSTED' || d.scrambleFail ? 'v-bad' : good ? 'v-good' : 'v-mid';
  const chips = [
    el('span', { class:`chip ${d.rep.deltaLoop >= 0 ? 'chip--li' : 'chip--mg'}`,
      text:`Δ-LOOP ${d.rep.deltaLoop > 0 ? '+' : ''}${d.rep.deltaLoop}ms` }),
    el('span', { class:`chip ${d.lookRight ? 'chip--li' : 'chip--mg'}`,
      text:d.lookRight ? `READ ${LOOKS[d.look].short}` : `IT WAS ${LOOKS[d.look].label}` }),
    el('span', { class:`chip ${d.convRight ? 'chip--li' : 'chip--mg'}`,
      text:d.convRight ? `${d.answer.conv.label} ✓` : `RULE: ${d.answer.conv.label}` }),
  ];
  if(!d.scrambleFail && d.outcome.type !== 'SCRAMBLE RULE'){
    chips.push(el('span', { class:'chip chip--vi', text:`${d.sep.toFixed(1)} YD SEP` }));
  }
  if(d.recall === true) chips.push(el('span', { class:'chip chip--vi', text:'RECALL ✓' }));
  if(d.recall === false) chips.push(el('span', { class:'chip chip--mg', text:'RECALL ✗' }));
  if(d.scrambleRT != null) chips.push(el('span', { class:`chip ${d.scrambleFail ? 'chip--mg' : 'chip--li'}`, text:`${d.scrambleRT}ms` }));
  chips.push(el('span', { class:'chip chip--gold', text:`+${d.xp} XP` }));

  const node = el('div', { class:'verdict' },
    el('div', { class:`verdict__head ${cls}`, text:d.scrambleFail ? 'HE HAD NOBODY' : d.outcome.type }),
    el('div', { class:'verdict__row' }, ...chips),
    el('div', { class:'verdict__note', text:d.scrambleFail
      ? 'The quarterback broke the pocket and you kept running a timed route into coverage. Scramble rules exist because the play clock restarts when he leaves.'
      : d.answer.reason }),
  );
  stage.overlay(node);
  if(good) flash('#7CFF9E'); else if(cls === 'v-bad') flash('#FF5C5C');
  if(good) audio.great();
  await wait(good ? 1500 : 2100);
  node.remove();
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
  const avg = k => {
    const a = reps.filter(r => r[k] != null).map(r => r[k]);
    return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  };
  const oriented = reps.filter(r => r.orientMs != null);
  const score = Math.round(avg('score') || 0);
  const delta = Math.round(avg('delta') || 0);
  const orient = avg('orientMs');
  const poise = avg('poise');
  const sep = avg('sep');
  const lookAcc = oriented.length ? oriented.filter(r => r.lookRight).length / oriented.length : null;
  const convAcc = oriented.length ? oriented.filter(r => r.convRight).length / oriented.length : null;
  const peek = avg('peek');
  const scrambles = reps.filter(r => r.scrambleRT != null);

  return {
    drillId:meta.id, reps:n, aborted, score, delta,
    orient:orient ? Math.round(orient) : null, poise, stress:cfg.stress,
    metrics:[
      { k:'Δ-LOOP', v:(delta > 0 ? '+' : '') + delta, d:'ms before his hips flip', pr:'deltaLoop', raw:delta },
      { k:'SEPARATION', v:sep == null ? '—' : sep.toFixed(1), d:'yards at the break', pr:'sepYards', raw:sep },
      { k:'LEVERAGE READ', v:lookAcc == null ? '—' : Math.round(lookAcc*100) + '%', d:'look identified', pr:'lookAcc', raw:lookAcc },
      { k:'CONVERSION', v:convAcc == null ? '—' : Math.round(convAcc*100) + '%', d:'route rule applied', pr:'convAcc', raw:convAcc },
      { k:'ORIENT', v:orient ? Math.round(orient) : '—', d:'ms to classify him', pr:'orientMs', raw:orient ? Math.round(orient) : null },
      { k:'PRE-SNAP PEEK', v:peek == null ? '—' : Math.round(peek*100) + '%', d:'checked man AND top', pr:'peek', raw:peek },
    ],
    phases:['observe','orient','decide','act'].map(p => ({
      phase:p, ms:avg(p === 'act' ? 'actMs' : p + 'Ms'),
    })),
    extra:{
      scrambleAcc: scrambles.length ? scrambles.filter(r => !r.scrambleFail).length / scrambles.length : null,
      pressureAcc: (() => {
        const pr = reps.filter(r => r.pressure && r.orientMs != null);
        return pr.length ? pr.filter(r => r.convRight).length / pr.length : null;
      })(),
      sep,
    },
    regions:meta.regions,
    log:reps,
  };
}

/* ============================================================
   TWITCH — release latency and motor consistency, measured by the
   accelerometer instead of a touchscreen.
   The phone is the ball. A throwing motion has a signature: a sharp
   acceleration ramp, a peak, then a decay. We timestamp the PEAK, so
   what gets scored is the release, not the reaction of a thumb.

   Variability matters more than speed here. Motor learning shows up
   first as a shrinking standard deviation.
   ============================================================ */
import { Stage } from './stage.js';
import { el, cue, flash, wait, toast } from '../ui/ui.js';
import { stressProfile } from '../engine/ooda.js';
import { buildDefense } from '../engine/defense.js';
import { clamp, rand } from '../core/rng.js';
import { audio } from '../core/audio.js';
import { haptics } from '../core/haptics.js';
import { motion } from '../sensors/motion.js';
import { state } from '../core/state.js';

export const meta = {
  id:'twitch',
  name:'TWITCH',
  tag:'MOTOR CORE',
  ico:'⚡',
  accent:'#FFC44D',
  desc:'Release latency and throwing-motion consistency, read off the accelerometer.',
  line:'The phone is the ball. Cue fires, you throw, the sensor timestamps the release.',
  science:'Simple reaction time has a floor around 180–200ms — you will not beat physiology. What improves is the variability around it, and the anticipation errors on either side. Randomised foreperiods block the timing strategy that inflates fake reaction times, so the number you get is real. Trial-to-trial standard deviation is the honest index of motor consolidation.',
  regions:{ cereb:1.0, bg:0.8, rifg:0.4, mt:0.3 },
  unlock:400,
  needsMotion:true,
};

export async function run(root, cfg){
  const stress = stressProfile(cfg.stress);
  const stage = new Stage(root, { reps:cfg.reps, title:'THROW', phases:false, dial:false });
  audio.crowd(stress.crowd * 0.6);

  const defense = buildDefense({ coverage:'C2', strength:1 });
  defense.men.forEach(m => m.pos = m.show);
  stage.field.scene = { defense, receivers:[], ball:null, t:0, target:null, highlight:null, pocket:1 };

  const useMotion = motion.live && state.s.settings.motion;
  if(!useMotion) toast('MOTION CORE OFFLINE — TAP MODE', 'gold');

  let aborted = false, heat = 0;
  const trials = [];
  stage.quitBtn.addEventListener('click', () => { aborted = true; stage.alive = false; });

  const meter = el('div', { class:'tremor' },
    el('div', { class:'tremor__label', text:'PRE-THROW STILLNESS' }),
    el('div', { class:'tremor__bar' }, el('i')));
  stage.overlay(meter);
  const bar = meter.querySelector('i');
  stage.onFrame = () => { if(motion.live) bar.style.width = `${Math.round(motion.tremor * 100)}%`; };

  for(let i = 1; i <= cfg.reps; i++){
    if(aborted) break;
    stage.setRep(i, cfg.reps);

    const hint = el('div', { class:'throw-hint', text:'SET — HOLD STILL' });
    stage.overlay(hint);
    motion.resetTremor();

    // random foreperiod defeats anticipatory timing
    const fp = rand(2600, 900);
    const early = await earlyWatch(stage, fp, useMotion);
    hint.remove();
    if(early === null){ aborted = true; break; }

    if(early.jumped){
      audio.bad(); haptics.fire('bad'); flash('#FF5C5C');
      const b = banner(stage, 'FALSE START', 'v-bad', [], 'You went before the cue. That is a five-yard penalty and a bad habit.');
      await wait(1200); b.remove();
      trials.push({ rt:null, false:true, power:null });
      continue;
    }

    const preTremor = motion.live ? motion.tremor : null;
    const t0 = performance.now();
    audio.go(); haptics.fire('snap'); flash('#7CFF9E');
    cue(stage.root, 'THROW', 'go', '', 400);

    const res = await release(stage, useMotion, 1600);
    if(res === null){ aborted = true; break; }

    if(!res.responded){
      audio.bad();
      const b = banner(stage, 'NO RELEASE', 'v-bad', [], 'Nothing registered. Flick the phone like you are releasing the ball.');
      await wait(1200); b.remove();
      trials.push({ rt:null, missed:true, power:null });
      continue;
    }

    const rt = Math.round(res.t - t0);
    const ok = rt < 620;
    heat = ok ? heat + 1 : 0;
    stage.setHeat(heat);
    const xp = ok ? Math.round(clamp(58 - (rt - 190) / 11, 10, 58) * (1 + Math.min(heat,6)*0.1)) : 4;
    state.addXP(xp, 'twitch');
    ok ? audio.good() : audio.bad();
    haptics.fire(ok ? 'good' : 'bad');

    const b = banner(stage, `${rt}ms`, ok ? 'v-good' : 'v-mid', [
      res.power != null ? `POWER ${Math.round(res.power*100)}%` : null,
      preTremor != null ? `STILLNESS ${Math.round((1-preTremor)*100)}%` : null,
      `+${xp} XP`,
    ].filter(Boolean), rt < 220 ? 'That is at the floor of human reaction time.' : rt < 320 ? 'Quick trigger.' : 'Late. The cue is the only thing you are waiting on.');
    await wait(950); b.remove();

    trials.push({ rt, power:res.power, stillness:preTremor == null ? null : 1 - preTremor, source:res.source });
  }

  stage.onFrame = null;
  stage.destroy();
  if(!trials.length) return { aborted:true };

  const hits = trials.filter(t => t.rt != null);
  const mean = hits.length ? hits.reduce((a,b)=>a+b.rt,0)/hits.length : null;
  const sd = hits.length > 1
    ? Math.sqrt(hits.reduce((a,b)=>a+(b.rt-mean)**2,0)/hits.length) : null;
  const best = hits.length ? Math.min(...hits.map(t => t.rt)) : null;
  const falses = trials.filter(t => t.false).length;
  const powers = trials.filter(t => t.power != null).map(t => t.power);
  const powCv = powers.length > 1 ? sdOf(powers) / (avgOf(powers) || 1) : null;
  const score = Math.round(clamp(
    clamp((620 - (mean ?? 620)) / 400, 0, 1) * 46 +
    clamp((140 - (sd ?? 140)) / 120, 0, 1) * 30 +
    clamp(1 - falses / Math.max(1, trials.length), 0, 1) * 24, 0, 100));

  return {
    drillId:meta.id, reps:trials.length, score, aborted, stress:cfg.stress,
    metrics:[
      { k:'RELEASE', v:mean ? Math.round(mean) + 'ms' : '—', d:'mean latency to release', pr:'releaseMs', raw:mean ? Math.round(mean) : null, lower:true },
      { k:'VARIABILITY', v:sd ? '±' + Math.round(sd) + 'ms' : '—', d:'trial-to-trial SD — the real index', pr:'releaseSd', raw:sd ? Math.round(sd) : null, lower:true },
      { k:'FASTEST', v:best ? best + 'ms' : '—', d:'best single release', raw:best },
      { k:'FALSE STARTS', v:String(falses), d:'went before the cue', raw:falses },
      ...(powCv != null ? [{ k:'MOTION CV', v:Math.round(powCv*100) + '%', d:'throwing-motion consistency', raw:powCv }] : []),
    ],
    regions:meta.regions,
    extra:{ mean, sd },
    log:trials,
  };
}

const avgOf = a => a.reduce((x,y)=>x+y,0)/a.length;
const sdOf = a => { const m = avgOf(a); return Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length); };

function banner(stage, head, cls, chips, note){
  const n = el('div', { class:'verdict' },
    el('div', { class:`verdict__head ${cls}`, text:head }),
    el('div', { class:'verdict__row' }, ...chips.map(c => el('span', { class:'chip', text:c }))),
    el('div', { class:'verdict__note', text:note }));
  stage.overlay(n);
  return n;
}

/** Watch the foreperiod for an anticipatory response. */
function earlyWatch(stage, ms, useMotion){
  return new Promise(resolve => {
    let done = false;
    const pad = el('div', { class:'throw-pad' });
    stage.overlay(pad);
    const finish = v => { if(done) return; done = true; clearTimeout(to); clearInterval(iv); pad.remove(); motion.disarmThrow(); resolve(v); };
    if(useMotion) motion.armThrow(() => finish({ jumped:true }));
    pad.addEventListener('pointerdown', () => finish({ jumped:true }));
    const to = setTimeout(() => finish({ jumped:false }), ms);
    const iv = setInterval(() => { if(!stage.alive) finish(null); }, 40);
  });
}

function release(stage, useMotion, windowMs){
  return new Promise(resolve => {
    let done = false;
    const pad = el('div', { class:'throw-pad' });
    stage.overlay(pad);
    const finish = v => { if(done) return; done = true; clearTimeout(to); clearInterval(iv); pad.remove(); motion.disarmThrow(); resolve(v); };
    if(useMotion) motion.armThrow(t => finish({ responded:true, t:t.t, power:t.power, source:'motion' }));
    pad.addEventListener('pointerdown', () => finish({ responded:true, t:performance.now(), power:null, source:'tap' }));
    const to = setTimeout(() => finish({ responded:false }), windowMs);
    const iv = setInterval(() => { if(!stage.alive) finish(null); }, 40);
  });
}

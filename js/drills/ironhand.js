/* ============================================================
   IRON HAND — the stop-signal task, dressed as a kill call.
   Every quarterback interception highlight is a failure to cancel an
   action that was already launched. Response inhibition is a
   measurable, trainable capacity with a real metric: SSRT.

   Go trials: throw as fast as you can.
   Stop trials: the kill signal fires at delay SSD — do nothing.
   SSD staircases ±50ms toward 50% successful inhibition, and
   SSRT = mean go RT − mean SSD.
   ============================================================ */
import { Stage } from './stage.js';
import { el, cue, flash, wait } from '../ui/ui.js';
import { stressProfile } from '../engine/ooda.js';
import { buildDefense } from '../engine/defense.js';
import { routePath, atTime } from '../engine/routes.js';
import { clamp, rand, pick } from '../core/rng.js';
import { audio } from '../core/audio.js';
import { haptics } from '../core/haptics.js';
import { motion } from '../sensors/motion.js';
import { state } from '../core/state.js';

export const meta = {
  id:'ironhand',
  name:'IRON HAND',
  tag:'INHIBITION',
  ico:'✋',
  accent:'#FF3DDA',
  desc:'Throw on the cue. Kill it when the signal fires. Measures true SSRT.',
  line:'A launched motor plan, cancelled mid-flight. The pick you do not throw.',
  science:'The stop-signal paradigm (Logan & Cowan) is the standard measure of response inhibition, and the network behind it — right inferior frontal gyrus and pre-SMA driving the subthalamic nucleus — is trainable with repeated practice. Stop-signal delay staircases toward 50% inhibition so the estimate stays valid, and SSRT is reported honestly as mean go RT minus mean SSD. Lower is better; under 250ms is genuinely quick.',
  regions:{ rifg:1.0, bg:0.8, dlpfc:0.5, cereb:0.4 },
  unlock:1200,
};

export async function run(root, cfg){
  const stress = stressProfile(cfg.stress);
  const stage = new Stage(root, { reps:cfg.reps, title:'TRIAL', phases:false, dial:false });
  audio.crowd(stress.crowd);

  const defense = buildDefense({ coverage:'C1', strength:1 });
  defense.men.forEach(m => m.pos = m.show);
  const path = routePath('SLANT', 14, 7);
  const rec = { slot:'Z', label:'Z', at:t => atTime(path, t) };
  stage.field.scene = { defense, receivers:[rec], ball:null, t:0, target:null, highlight:null, pocket:1 };

  let ssd = 220, aborted = false, heat = 0;
  const trials = [];
  stage.quitBtn.addEventListener('click', () => { aborted = true; stage.alive = false; });

  for(let i = 1; i <= cfg.reps; i++){
    if(aborted) break;
    stage.setRep(i, cfg.reps);
    const isStop = Math.random() < 0.30;

    stage.field.scene.t = 0;
    stage.field.scene.target = null;
    if(!await sleep(stage, rand(1700, 800))) break;

    const t0 = performance.now();
    audio.snap(); haptics.fire('snap'); flash('#4DF0FF');
    cue(stage.root, 'THROW', 'go', '', 420);
    stage.field.scene.target = 'Z';
    let animT0 = performance.now();
    stage.onFrame = () => { stage.field.scene.t = (performance.now() - animT0)/1000; };

    let killAt = null;
    let killTimer = null;
    if(isStop){
      killTimer = setTimeout(() => {
        if(!stage.alive) return;
        killAt = performance.now();
        audio.kill(); haptics.fire('kill'); flash('#FF5C5C');
        cue(stage.root, 'KILL', 'kill', '', 620);
      }, ssd);
    }

    const resp = await respond(stage, 1450);
    clearTimeout(killTimer);
    stage.onFrame = null;
    if(resp === null){ aborted = true; break; }

    const rt = resp.responded ? Math.round(resp.t - t0) : null;
    let ok, note, xp;

    if(isStop){
      ok = !resp.responded;
      if(ok){ ssd = Math.min(900, ssd + 50); note = `INHIBITED at SSD ${ssd - 50}ms`; xp = 34; }
      else  { ssd = Math.max(40, ssd - 50); note = `Ball came out ${rt - ssd}ms after the kill`; xp = 2; }
    } else {
      ok = resp.responded && rt < 1000;
      note = ok ? `RELEASE ${rt}ms` : 'NO THROW — you have to pull the trigger on go trials';
      xp = ok ? Math.round(clamp(50 - (rt - 220) / 14, 8, 50)) : 2;
    }

    ok ? audio.good() : audio.bad();
    haptics.fire(ok ? 'good' : 'bad');
    heat = ok ? heat + 1 : 0;
    stage.setHeat(heat);
    state.addXP(xp, 'ironhand');

    const banner = el('div', { class:'verdict' },
      el('div', { class:`verdict__head ${ok ? 'v-good' : 'v-bad'}`, text: isStop ? (ok ? 'IRON HAND' : 'THREW IT') : (ok ? 'ON TIME' : 'FROZE') }),
      el('div', { class:'verdict__row' },
        el('span', { class:'chip', text:isStop ? `SSD ${ssd}ms` : `RT ${rt ?? '—'}ms` }),
        el('span', { class:'chip chip--gold', text:`+${xp} XP` })),
      el('div', { class:'verdict__note', text:note }),
    );
    stage.overlay(banner);
    await wait(ok ? 800 : 1300);
    banner.remove();

    trials.push({ isStop, rt, ssd, ok, responded:resp.responded, source:resp.source });
  }

  stage.destroy();
  if(!trials.length) return { aborted:true };

  const go = trials.filter(t => !t.isStop && t.responded && t.rt != null);
  const stops = trials.filter(t => t.isStop);
  const goRT = go.length ? go.reduce((a,b)=>a+b.rt,0)/go.length : null;
  const meanSSD = stops.length ? stops.reduce((a,b)=>a+b.ssd,0)/stops.length : null;
  const stopAcc = stops.length ? stops.filter(t => t.ok).length / stops.length : null;
  const ssrt = (goRT != null && meanSSD != null) ? Math.round(goRT - meanSSD) : null;
  const score = Math.round(clamp(
    (stopAcc ?? 0) * 46 + clamp((420 - (ssrt ?? 420)) / 300, 0, 1) * 34 + clamp((700 - (goRT ?? 700)) / 460, 0, 1) * 20,
    0, 100));

  return {
    drillId:meta.id, reps:trials.length, score, aborted, stress:cfg.stress,
    metrics:[
      { k:'SSRT', v:ssrt == null ? '—' : ssrt + 'ms', d:'time to cancel a launched throw', pr:'ssrtMs', raw:ssrt, lower:true },
      { k:'INHIBITION', v:stopAcc == null ? '—' : Math.round(stopAcc*100) + '%', d:'kills honoured', pr:'stopAccuracy', raw:stopAcc },
      { k:'GO RT', v:goRT ? Math.round(goRT) + 'ms' : '—', d:'trigger speed on live plays', pr:'goRt', raw:goRT ? Math.round(goRT) : null, lower:true },
      { k:'FINAL SSD', v:Math.round(ssd) + 'ms', d:'how late you can still stop', raw:ssd },
    ],
    regions:meta.regions,
    extra:{ ssrt, stopAcc },
    log:trials,
  };
}

function respond(stage, windowMs){
  return new Promise(resolve => {
    let done = false;
    const useMotion = motion.live && state.s.settings.motion;
    const pad = el('div', { class:'throw-pad' },
      el('div', { class:'throw-hint', text:useMotion ? 'FLICK TO THROW' : 'TAP TO THROW' }));
    stage.overlay(pad);
    const finish = payload => {
      if(done) return; done = true;
      clearTimeout(to); clearInterval(iv); pad.remove(); motion.disarmThrow();
      resolve(payload);
    };
    if(useMotion) motion.armThrow(t => finish({ responded:true, t:t.t, source:'motion' }));
    pad.addEventListener('pointerdown', () => finish({ responded:true, t:performance.now(), source:'tap' }));
    const to = setTimeout(() => finish({ responded:false, t:null, source:null }), windowMs);
    const iv = setInterval(() => { if(!stage.alive) finish(null); }, 40);
  });
}

function sleep(stage, ms){
  return new Promise(resolve => {
    const t = setTimeout(() => { clearInterval(iv); resolve(true); }, ms);
    const iv = setInterval(() => { if(!stage.alive){ clearTimeout(t); clearInterval(iv); resolve(false); } }, 40);
  });
}

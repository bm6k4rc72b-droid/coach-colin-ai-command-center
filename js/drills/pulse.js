/* ============================================================
   PULSE LAB — arousal control, measured with the camera.
   Finger over the rear lens turns the phone into a photoplethysmograph.
   Three blocks: BASELINE → LOAD → RESET.

   What we are actually after is the RESET slope. Elite performance
   under pressure is not a low heart rate; it is a fast return from a
   high one. That slope is trainable, and the physiological sigh — two
   inhales through the nose, one long exhale — is the fastest known
   voluntary route to it.

   Camera-derived HR/HRV are estimates, not clinical measurements.
   ============================================================ */
import { Stage } from './stage.js';
import { el, wait, toast, flash } from '../ui/ui.js';
import { camera } from '../sensors/camera.js';
import { PPG } from '../sensors/ppg.js';
import { COVERAGES, COVERAGE_IDS } from '../engine/playbook.js';
import { shuffle, clamp, pick } from '../core/rng.js';
import { audio } from '../core/audio.js';
import { haptics } from '../core/haptics.js';
import { state } from '../core/state.js';

export const meta = {
  id:'pulse',
  name:'PULSE LAB',
  tag:'AROUSAL CONTROL',
  ico:'❍',
  accent:'#FF5C5C',
  desc:'Camera heart-rate and HRV. Drive arousal up, then measure how fast you bring it down.',
  line:'Finger on the lens. Baseline, load, reset — and a real number for your recovery.',
  science:'The camera reads a photoplethysmogram from your fingertip, which gives inter-beat intervals, and from those RMSSD — a standard short-term index of parasympathetic (vagal) tone. The block structure is a deliberate stress-recovery challenge: what predicts performance under pressure is not a low resting heart rate but the steepness of the return. The reset block paces a physiological sigh (double inhale, extended exhale), the fastest voluntary lever on autonomic state.',
  regions:{ amyg:1.0, hipp:0.4, dlpfc:0.5, cereb:0.2 },
  unlock:900,
  needsCamera:true,
};

const BLOCKS = {
  8:  { base:25, load:30, reset:35 },
  14: { base:40, load:40, reset:50 },
  24: { base:55, load:55, reset:70 },
};

export async function run(root, cfg){
  const stage = new Stage(root, { field:false, phases:false, dial:false, reps:0, title:'' });
  const dur = BLOCKS[cfg.reps] || BLOCKS[14];
  let aborted = false;
  stage.quitBtn.addEventListener('click', () => { aborted = true; stage.alive = false; });

  /* ---------- DOM ---------- */
  const video = el('video', { class:'pulse-video', playsinline:true, muted:true, autoplay:true });
  const bpmEl = el('div', { class:'pulse-bpm' }, '—', el('small', { text:'BPM' }));
  const heart = el('span', { class:'pulse-heart', text:'❤' });
  const stateEl = el('div', { class:'pulse-state', text:'LINKING OPTIC CORE…' });
  const waveEl = el('canvas', { class:'pulse-wave' });
  const metrics = el('div', { class:'pulse-metrics' });
  const body = el('div', { class:'holo-panel', style:'margin-top:12px' });
  const wrap = el('div', { class:'pulse-wrap' },
    video,
    el('div', { class:'pulse-hero' }, bpmEl, el('div', {}, heart), stateEl),
    waveEl, metrics, body);
  stage.overlay(wrap);

  const cell = (k, v, u) => el('div', { class:'stat-cell holo-panel holo-panel--tight' },
    el('div', { class:'stat-cell__k', text:k }),
    el('div', { class:'stat-cell__v', text:v }),
    el('div', { class:'stat-cell__u', text:u }));
  const renderMetrics = (s, quality) => {
    metrics.innerHTML = '';
    metrics.append(
      cell('RMSSD', s.rmssd ? String(s.rmssd) : '—', 'ms · vagal tone'),
      cell('COHERENCE', s.coherence ? Math.round(s.coherence*100) + '%' : '—', 'rhythm quality'),
      cell('SIGNAL', Math.round(quality*100) + '%', 'lens contact'),
    );
  };

  /* ---------- link the camera ---------- */
  const ppg = new PPG();
  try{
    await camera.start('pulse', video);
  }catch(e){
    stage.destroy();
    toast('CAMERA UNAVAILABLE', 'mg');
    return { aborted:true, error:'camera' };
  }
  ppg.onBeat = () => {
    heart.classList.remove('is-beat'); void heart.offsetWidth; heart.classList.add('is-beat');
    audio.beat();
  };
  ppg.start(video);

  const wctx = waveEl.getContext('2d');
  stage.onFrame = () => {
    drawWave(waveEl, wctx, ppg.wave(200), ppg.quality);
    bpmEl.firstChild.textContent = ppg.bpm ? String(ppg.bpm) : '—';
    renderMetrics(ppg.snapshot(), ppg.quality);
  };

  body.innerHTML = `<div class="holo-panel__label">CONTACT</div>
    <p style="font-size:13.5px;line-height:1.5;color:var(--ink-dim)">
      Cover the <b>rear camera lens</b> completely with the pad of your index finger.
      Firm, not crushing. Hold still. Wait for the signal bar to come up.</p>`;

  const contactHint = el('p', { class:'dim', style:'font-size:12px;margin-top:8px;color:var(--am)' });
  body.append(contactHint);
  const hintIv = setInterval(() => {
    if(ppg.quality > 0.28) contactHint.textContent = 'CONTACT GOOD — HOLD IT';
    else if(ppg.quality > 0.10) contactHint.textContent = 'ALMOST — PRESS A LITTLE FIRMER AND COVER THE WHOLE LENS';
    else contactHint.textContent = 'NO SIGNAL YET — MORE LIGHT, AND COVER THE LENS COMPLETELY';
  }, 500);

  const linked = await until(stage, () => ppg.quality > 0.28 && ppg.bpm > 0 && ppg.ibis.length >= 4, 30000);
  clearInterval(hintIv);
  if(linked === null || !linked){
    ppg.stop(); await camera.stop(); stage.destroy();
    toast(linked === null ? 'ABORTED' : 'NO PULSE SIGNAL — TRY AGAIN IN BRIGHTER LIGHT', 'mg');
    return { aborted:true };
  }
  audio.good(); haptics.fire('good');

  /* ---------- BLOCK 1: BASELINE ---------- */
  stateEl.textContent = 'BLOCK 1 — BASELINE';
  body.innerHTML = `<div class="holo-panel__label">BASELINE</div>
    <p style="font-size:13.5px;line-height:1.5;color:var(--ink-dim)">Sit still. Breathe normally. We are reading where you actually live.</p>`;
  const base = await block(stage, ppg, dur.base, stateEl, body);
  if(base === null) return abortOut();

  /* ---------- BLOCK 2: LOAD ---------- */
  stateEl.textContent = 'BLOCK 2 — LOAD';
  audio.crowd(0.9);
  document.body.classList.add('is-loaded');
  const loadSamples = [];
  const loadEnd = performance.now() + dur.load * 1000;
  let correct = 0, asked = 0;
  body.innerHTML = '';
  const quizHead = el('div', { class:'holo-panel__label', text:'LOAD — ANSWER FAST' });
  const quizQ = el('div', { style:'font-family:var(--f-display);font-size:19px;letter-spacing:.05em;margin-bottom:10px' });
  const quizGrid = el('div', { class:'answer-grid answer-grid--3' });
  const quizClock = el('div', { class:'xp-bar', style:'margin-bottom:10px' }, el('div', { class:'xp-bar__fill', style:'width:100%' }));
  body.append(quizHead, quizQ, quizClock, quizGrid);

  while(performance.now() < loadEnd && stage.alive){
    const target = pick(COVERAGE_IDS);
    const q = pick(['tell','answer']);
    quizQ.textContent = q === 'tell' ? COVERAGES[target].tell : COVERAGES[target].answer;
    const opts = shuffle([target, ...shuffle(COVERAGE_IDS.filter(c => c !== target)).slice(0,2)]);
    quizGrid.innerHTML = '';
    const bar = quizClock.firstChild;
    bar.style.transition = 'none'; bar.style.width = '100%';
    requestAnimationFrame(() => { bar.style.transition = 'width 3s linear'; bar.style.width = '0%'; });
    const answer = await new Promise(res => {
      const to = setTimeout(() => res(null), 3000);
      const iv = setInterval(() => { if(!stage.alive){ clearTimeout(to); clearInterval(iv); res('ABORT'); } }, 60);
      opts.forEach(id => {
        const b = el('button', { class:'ans' }, COVERAGES[id].label);
        b.addEventListener('pointerdown', () => { clearTimeout(to); clearInterval(iv); res(id); }, { once:true });
        quizGrid.append(b);
      });
    });
    if(answer === 'ABORT') return abortOut();
    asked++;
    if(answer === target){ correct++; audio.good(); }
    else { audio.kill(); haptics.fire('bad'); flash('#FF5C5C'); }
    loadSamples.push({ t:performance.now(), bpm:ppg.bpm });
    await wait(220);
  }
  audio.crowd(0.1);
  const loadPeak = Math.max(...loadSamples.map(s => s.bpm).filter(Boolean), base.bpm || 0);

  /* ---------- BLOCK 3: RESET ---------- */
  stateEl.textContent = 'BLOCK 3 — RESET';
  body.innerHTML = `<div class="holo-panel__label">PHYSIOLOGICAL SIGH</div>
    <p style="font-size:13.5px;line-height:1.5;color:var(--ink-dim)">
      Follow the orb. Two inhales through the nose, then a long slow exhale through the mouth.
      Keep the finger on the lens.</p>`;
  const reset = await breathBlock(stage, ppg, dur.reset);
  if(reset === null) return abortOut();

  /* ---------- results ---------- */
  ppg.stop(); await camera.stop();
  stage.destroy();
  document.body.classList.remove('is-loaded');

  const restHR = base.bpm;
  const endHR = reset.endBpm;
  const reactivity = loadPeak && restHR ? loadPeak - restHR : null;
  const recovered = loadPeak && endHR ? loadPeak - endHR : null;
  const slope = recovered != null ? +(recovered / (dur.reset / 60)).toFixed(1) : null;  // bpm per minute
  const acc = asked ? correct / asked : null;
  const score = Math.round(clamp(
    clamp((slope ?? 0) / 22, 0, 1) * 44 +
    clamp((reset.coherence ?? 0), 0, 1) * 26 +
    clamp((reset.rmssd ?? 0) / 70, 0, 1) * 18 +
    (acc ?? 0) * 12, 0, 100));

  state.addXP(Math.round(score * 4.2), 'pulse');

  return {
    drillId:meta.id, reps:1, score, aborted:false, stress:cfg.stress,
    metrics:[
      { k:'RECOVERY SLOPE', v:slope == null ? '—' : slope + '', d:'bpm dropped per minute', pr:'recoverySlope', raw:slope },
      { k:'REST HR', v:restHR ? restHR + '' : '—', d:'baseline block', pr:'restHr', raw:restHR, lower:true },
      { k:'PEAK UNDER LOAD', v:loadPeak ? Math.round(loadPeak) + '' : '—', d:'stress reactivity ' + (reactivity != null ? `(+${Math.round(reactivity)})` : ''), raw:loadPeak },
      { k:'RMSSD (RESET)', v:reset.rmssd ? Math.round(reset.rmssd) + 'ms' : '—', d:'vagal tone after the sigh', pr:'rmssd', raw:reset.rmssd },
      { k:'COHERENCE', v:reset.coherence == null ? '—' : Math.round(reset.coherence*100) + '%', d:'breath-locked rhythm', pr:'coherence', raw:reset.coherence },
      { k:'LOAD ACCURACY', v:acc == null ? '—' : Math.round(acc*100) + '%', d:'cognition while aroused', raw:acc },
    ],
    regions:meta.regions,
    extra:{ slope, reactivity },
    log:[],
  };

  function abortOut(){
    ppg.stop(); camera.stop(); stage.destroy();
    document.body.classList.remove('is-loaded');
    audio.crowd(0);
    return { aborted:true };
  }
}

/* ---------- helpers ---------- */

async function block(stage, ppg, seconds, stateEl, body){
  const end = performance.now() + seconds * 1000;
  const samples = [];
  while(performance.now() < end){
    if(!stage.alive) return null;
    samples.push(ppg.bpm);
    stateEl.textContent = `BLOCK 1 — BASELINE · ${Math.ceil((end - performance.now())/1000)}s`;
    await wait(500);
  }
  const valid = samples.filter(Boolean);
  const sorted = valid.slice().sort((a,b)=>a-b);
  return {
    bpm: sorted.length ? sorted[Math.floor(sorted.length/2)] : null,
    rmssd: ppg.rmssd, coherence: ppg.coherence,
  };
}

async function breathBlock(stage, ppg, seconds){
  const orb = el('div', { class:'breath__orb' }, el('div', { class:'breath__txt', text:'READY' }));
  const sub = el('div', { class:'breath__sub', text:'' });
  const wrap = el('div', { class:'breath' }, orb, sub);
  stage.overlay(wrap);
  const txt = orb.firstChild;

  const end = performance.now() + seconds * 1000;
  const steps = [
    { label:'INHALE',      scale:1.35, ms:1800, dir:'in' },
    { label:'SIP AGAIN',   scale:1.55, ms:900,  dir:'in' },
    { label:'LONG EXHALE', scale:0.72, ms:5200, dir:'out' },
    { label:'HOLD',        scale:0.72, ms:700,  dir:null },
  ];
  const trace = [];
  let i = 0;
  while(performance.now() < end){
    if(!stage.alive){ wrap.remove(); return null; }
    const s = steps[i % steps.length]; i++;
    txt.textContent = s.label;
    orb.style.transitionDuration = `${s.ms}ms`;
    orb.style.transform = `scale(${s.scale})`;
    if(s.dir) audio.breathe(s.dir);
    haptics.fire('tap');
    sub.textContent = `${Math.ceil((end - performance.now())/1000)}s · HR ${ppg.bpm || '—'}`;
    const chunk = Math.min(s.ms, end - performance.now());
    const t = performance.now() + chunk;
    while(performance.now() < t){
      if(!stage.alive){ wrap.remove(); return null; }
      if(ppg.bpm) trace.push({ t:performance.now(), bpm:ppg.bpm });
      await wait(300);
    }
  }
  wrap.remove();
  const tail = trace.slice(-8).map(p => p.bpm);
  return {
    endBpm: tail.length ? Math.round(tail.reduce((a,b)=>a+b,0)/tail.length) : ppg.bpm,
    rmssd: ppg.rmssd, coherence: ppg.coherence, trace,
  };
}

function until(stage, test, timeoutMs){
  return new Promise(resolve => {
    const t0 = performance.now();
    const iv = setInterval(() => {
      if(!stage.alive){ clearInterval(iv); resolve(null); }
      else if(test()){ clearInterval(iv); resolve(true); }
      else if(performance.now() - t0 > timeoutMs){ clearInterval(iv); resolve(false); }
    }, 120);
  });
}

function drawWave(canvas, g, data, quality){
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const r = canvas.getBoundingClientRect();
  if(canvas.width !== Math.round(r.width*dpr)){
    canvas.width = Math.round(r.width*dpr); canvas.height = Math.round(r.height*dpr);
  }
  g.setTransform(dpr,0,0,dpr,0,0);
  const W = r.width, H = r.height;
  g.clearRect(0,0,W,H);
  g.strokeStyle = 'rgba(77,240,255,.10)'; g.lineWidth = 1;
  for(let y = 0; y <= 4; y++){ g.beginPath(); g.moveTo(0, y*H/4); g.lineTo(W, y*H/4); g.stroke(); }
  if(data.length < 2){
    g.fillStyle = 'rgba(127,166,189,.6)';
    g.font = "10px ui-monospace, monospace"; g.textAlign = 'center';
    g.fillText('COVER THE LENS WITH YOUR FINGERTIP', W/2, H/2);
    return;
  }
  g.beginPath();
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H/2 - v * H * 0.38;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  g.strokeStyle = quality > 0.5 ? '#FF3DDA' : 'rgba(255,61,218,.4)';
  g.lineWidth = 2; g.shadowColor = '#FF3DDA'; g.shadowBlur = 12;
  g.stroke(); g.shadowBlur = 0;
}

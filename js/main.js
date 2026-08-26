/* ============================================================
   LOOPBREAK QB — boot, sensor gate, router, session lifecycle.
   ============================================================ */
import { $, $$, el, screens, toast, reward, wait } from './ui/ui.js';
import { state, REGIONS } from './core/state.js';
import { bus } from './core/bus.js';
import { audio } from './core/audio.js';
import { haptics } from './core/haptics.js';
import { motion } from './sensors/motion.js';
import { camera, cameraProbe } from './sensors/camera.js';
import { DRILLS, byId } from './drills/index.js';
import { renderHome, renderBrief, renderResult, renderMap, stopMap, renderDossier, renderSettings, applyMirror } from './ui/views.js';

/* ---------------- boot sequence ---------------- */
const BOOT_LINES = [
  'INITIALISING OODA COMMAND DECK…',
  'LOADING COVERAGE LIBRARY … <b>8 SHELLS</b>',
  'LOADING CONCEPT LIBRARY … <b>8 CONCEPTS</b>',
  'CALIBRATING PHASE CLOCKS … <b>OBSERVE · ORIENT · DECIDE · ACT</b>',
  'MOUNTING NEURAL MAP … <b>9 SYSTEMS</b>',
  'ATHLETE FILE … <b>LOADED</b>',
];

let cfg = { stress:2, reps:14 };
let lastDrill = null, lastCfg = null, running = false;

async function boot(){
  const lines = $('#boot-lines');
  for(let i = 0; i < BOOT_LINES.length; i++){
    const d = el('div', { html:`▸ ${BOOT_LINES[i]}`, style:`animation-delay:${i*0.07}s` });
    lines.append(d);
    await wait(120);
  }
  await wait(260);
  $('#gate-panel').hidden = false;

  const total = state.s.totals.reps;
  if(total > 0) $('#gate-panel').querySelector('.gate-copy').textContent =
    `Welcome back. ${total.toLocaleString()} reps on file. Re-link the sensors you want live for this session.`;
}

/* ---------------- sensor gate ---------------- */
function wireGate(){
  $$('.gate-tile').forEach(tile => {
    tile.addEventListener('click', async () => {
      const kind = tile.dataset.gate;
      const st = tile.querySelector('.gate-state');
      st.textContent = 'LINKING…';
      let ok = false;
      try{
        if(kind === 'motion') ok = await motion.request();
        else if(kind === 'camera') ok = await cameraProbe();
        else if(kind === 'audio') ok = await audio.unlock();
      }catch(_){ ok = false; }
      state.patch(s => { s.sensors[kind] = ok; });
      tile.classList.toggle('is-live', ok);
      tile.classList.toggle('is-dead', !ok);
      st.textContent = ok ? 'LIVE' : 'UNAVAILABLE';
      if(ok){ haptics.fire('good'); audio.good(); }
      if(kind === 'motion' && ok){
        motion.calibrate();
        toast('MOTION CORE LIVE — HOLD THE PHONE LIKE A BALL', 'li');
      }
      if(kind === 'audio' && !ok) toast('AUDIO UNAVAILABLE ON THIS DEVICE', 'mg');
      if(kind === 'motion' && !ok) toast(motion.supported ? 'MOTION DECLINED — THUMB MODE' : 'NO MOTION SENSORS HERE', 'gold');
    });
  });

  $('#gate-enter').addEventListener('click', async () => {
    await audio.unlock();
    enterDeck();
  });
  $('#gate-skip').addEventListener('click', () => enterDeck());
}

function enterDeck(){
  state.touchStreak();
  refreshHome();
  screens.show('home');
  const s = state.s.streak;
  if(s.current > 1) toast(`${s.current}-DAY LOOP — KEEP IT ALIVE`, 'gold');
}

/* ---------------- navigation ---------------- */
function wireNav(){
  $$('[data-nav]').forEach(b => b.addEventListener('click', () => {
    const n = b.dataset.nav;
    if(n === 'lab'){ openDrill(byId('pulse')); return; }
    if(n === 'map') renderMap();
    if(n === 'dossier') renderDossier();
    if(n === 'home') refreshHome();
    if(screens.current === 'map' && n !== 'map') stopMap();
    screens.show(n);
    haptics.fire('tap');
  }));

  $$('[data-back]').forEach(b => b.addEventListener('click', () => {
    screens.show('home'); refreshHome();
  }));

  $('#home-settings').addEventListener('click', () => {
    renderSettings(relinkSensors);
    screens.show('settings');
  });

  screens.onChange(name => { if(name !== 'map') stopMap(); });
}

async function relinkSensors(){
  const m = await motion.request();
  state.patch(s => { s.sensors.motion = m; });
  const c = await cameraProbe();
  state.patch(s => { s.sensors.camera = c; });
  await audio.unlock();
  state.patch(s => { s.sensors.audio = audio.ready; });
  toast(`MOTION ${m ? 'LIVE' : 'OFF'} · OPTIC ${c ? 'LIVE' : 'OFF'}`, m || c ? 'li' : 'mg');
  renderSettings(relinkSensors);
}

/* ---------------- drill lifecycle ---------------- */
function refreshHome(){
  renderHome(openDrill, runDaily);
}

function openDrill(drill){
  if(!drill) return;
  if(drill.needsCamera && !state.s.sensors.camera){
    toast('PULSE LAB NEEDS THE OPTIC CORE — LINK IT IN SETTINGS', 'gold');
  }
  renderBrief(drill, cfg, c => startDrill(drill, { ...c }));
  screens.show('brief');
}

function runDaily(dl){
  const drill = byId(dl.drillId);
  if(!drill) return;
  const applied = dl.mod.apply({ ...cfg });
  renderBrief(drill, applied, c => startDrill(drill, { ...c }, dl));
  screens.show('brief');
  toast(`${dl.mod.name} — +${Math.round(dl.bonus*100)}% XP`, 'gold');
}

async function startDrill(drill, c, daily = null){
  if(running) return;
  running = true;
  lastDrill = drill; lastCfg = c;
  screens.show('stage');
  await wait(220);

  const t0 = performance.now();
  let res;
  try{
    res = await drill.run($('#stage-root'), c);
  }catch(e){
    console.error('[drill]', e);
    toast('DRILL FAULT — RETURNED TO DECK', 'mg');
    res = { aborted:true };
  }
  running = false;
  audio.crowd(0);

  if(!res || res.aborted && !res.reps){
    screens.show('home'); refreshHome();
    return;
  }

  const ms = performance.now() - t0;
  state.loadRegions(res.regions || drill.regions, 1 + (c.stress - 2) * 0.25);
  state.logSession({
    drillId:drill.id, reps:res.reps, score:res.score, ms,
    stress:c.stress, delta:res.delta, orient:res.orient, poise:res.poise,
  });

  if(daily && !state.s.daily.done){
    state.patch(s => { s.daily.done = true; });
    const bonus = Math.round(res.score * 4 * daily.bonus);
    state.addXP(bonus, 'daily');
    await reward({
      kicker:'DAILY LOOP CLEARED',
      title:daily.mod.name,
      sub:'Today\'s modifier is banked. The board resets at midnight.',
      xp:bonus,
    });
  }

  renderResult(drill, res, () => startDrill(drill, c), () => { screens.show('home'); refreshHome(); });
  screens.show('result');
  await flushRewards();

  if(state.s.settings.recoveryGuard) recoveryCheck();
}

/* Consolidation guard: reps stop paying after a while. Say so once. */
let sessionCount = 0;
function recoveryCheck(){
  sessionCount++;
  if(sessionCount === 4){
    toast('FOUR BLOCKS DEEP — CONSOLIDATION FALLS OFF FROM HERE', 'gold');
  } else if(sessionCount === 6){
    toast('CALL IT. SLEEP IS WHERE TODAY\'S REPS ACTUALLY LAND', 'gold');
  }
}

/* ---------------- reactive chrome ---------------- */
/* A promotion mid-rep would freeze the stage behind a modal, so it is
   queued and paid out on the results screen instead. */
const pendingRewards = [];
bus.on('rank:up', ({ rank }) => {
  const payload = { kicker:'PROMOTION', title:rank.name, sub:rank.note, xp:0 };
  if(running){ pendingRewards.push(payload); toast(`PROMOTED — ${rank.name}`, 'gold'); }
  else reward(payload);
});
async function flushRewards(){
  while(pendingRewards.length) await reward(pendingRewards.shift());
}
bus.on('badge:new', b => toast(`COMMENDATION — ${b.name}`, 'gold'));
bus.on('pr:new', ({ key }) => { if(key !== 'covAcc') haptics.fire('good'); });

/* ---------------- ambient grid ---------------- */
function ambientGrid(){
  const c = $('#bg-grid');
  const g = c.getContext('2d');
  let W, H, dpr;
  const fit = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    c.width = W * dpr; c.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit(); addEventListener('resize', fit);

  let t = 0;
  const frame = () => {
    requestAnimationFrame(frame);
    t += 0.0032;
    g.clearRect(0, 0, W, H);
    const hz = H * 0.52;
    g.strokeStyle = 'rgba(77,240,255,.14)'; g.lineWidth = 1;
    // receding horizontal lines
    for(let i = 0; i < 22; i++){
      const k = ((i / 22) + (t % (1/22))) % 1;
      const y = hz + Math.pow(k, 2.6) * (H - hz) * 1.5;
      if(y > H) continue;
      g.globalAlpha = 0.10 + k * 0.5;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    // converging verticals
    for(let i = -12; i <= 12; i++){
      g.globalAlpha = 0.16;
      g.beginPath();
      g.moveTo(W/2 + i * (W/14), H * 1.25);
      g.lineTo(W/2 + i * 5, hz);
      g.stroke();
    }
    g.globalAlpha = 1;
  };
  frame();
}

/* ---------------- go ---------------- */
function init(){
  ambientGrid();
  wireGate();
  wireNav();
  boot();
  applyMirror();

  if('serviceWorker' in navigator && location.protocol === 'https:'){
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // keep the crowd bed from surviving a backgrounded tab
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'hidden') audio.crowd(0);
  });

  // stop iOS rubber-banding behind the stage
  document.addEventListener('touchmove', e => {
    if(screens.current === 'stage') e.preventDefault();
  }, { passive:false });
}

init();

/* ============================================================
   PERSISTENT ATHLETE FILE
   Everything lives in localStorage. No account, no server, no
   telemetry — the athlete's biometrics never leave the device.
   ============================================================ */
import { bus } from './bus.js';
import { clamp } from './rng.js';

const KEY = 'loopbreak.qb.v1';

export const RANKS = [
  { xp:0,      name:'CLIPBOARD',   note:'You are holding the chart. Learn the language.' },
  { xp:900,    name:'QB3',         note:'Scout team. Reps are cheap here — take all of them.' },
  { xp:2400,   name:'QB2',         note:'You get the second-team script. Orient faster.' },
  { xp:5200,   name:'QB1',         note:'The offense is yours. Own the pre-snap.' },
  { xp:9600,   name:'GUNSLINGER',  note:'Fast trigger. Now make it accurate under load.' },
  { xp:16000,  name:'FIELD GENERAL', note:'You see it before it happens.' },
  { xp:26000,  name:'FRANCHISE',   note:'The defense is reacting to you now.' },
  { xp:42000,  name:'BOYD',        note:'You operate inside every loop on the field.' },
];

export const BADGES = [
  { id:'first',      ico:'◈', name:'FIRST SNAP',    test:s => s.totals.reps >= 1 },
  { id:'inside',     ico:'⟳', name:'INSIDE THE LOOP', test:s => (s.pr.deltaLoop||0) >= 400 },
  { id:'sub700',     ico:'⚡', name:'SUB-700 ORIENT', test:s => (s.pr.orientMs||9e9) <= 700 },
  { id:'ironhand',   ico:'✋', name:'IRON HAND',     test:s => (s.pr.stopAccuracy||0) >= 0.9 },
  { id:'wideeyes',   ico:'◉', name:'WIDE EYES',     test:s => (s.pr.ufovEcc||0) >= 40 },
  { id:'coldblood',  ico:'❄', name:'COLD BLOODED',  test:s => (s.pr.recoverySlope||0) >= 12 },
  { id:'streak7',    ico:'✦', name:'7-DAY LOOP',    test:s => (s.streak.best||0) >= 7 },
  { id:'chaos',      ico:'☢', name:'CHAOS PROOF',   test:s => (s.totals.chaosSessions||0) >= 5 },
  { id:'thousand',   ico:'∞', name:'1000 REPS',     test:s => s.totals.reps >= 1000 },
  { id:'retention',  ico:'❋', name:'RETENTION+',    test:s => (s.pr.retention||0) >= 0.8 },
];

/* Brain systems the drills actually load. Each carries a decay so the map
   reflects *recent* training, the way real skill maintenance works. */
export const REGIONS = {
  mt:      { name:'V5 / MT+',            color:'#4DF0FF', blurb:'Motion processing. Reads route break velocity and closing speed.' },
  parietal:{ name:'Posterior Parietal',  color:'#7CFF9E', blurb:'Spatial attention map. Where bodies are, in relation to each other.' },
  fef:     { name:'Frontal Eye Fields',  color:'#B96BFF', blurb:'Saccade programming. How fast your eyes get to the next key.' },
  dlpfc:   { name:'Dorsolateral PFC',    color:'#FFC44D', blurb:'Working memory. Holding the play, the call, and the adjustment at once.' },
  rifg:    { name:'rIFG / preSMA',       color:'#FF3DDA', blurb:'The stopping network. Aborting a throw already in motion.' },
  bg:      { name:'Basal Ganglia',       color:'#FF9E4D', blurb:'Chunking. Turns a read into a reflex through repetition.' },
  cereb:   { name:'Cerebellum',          color:'#6BD3FF', blurb:'Predictive timing. Throwing to grass, not to a jersey.' },
  amyg:    { name:'Amygdala / vmPFC',    color:'#FF5C5C', blurb:'Threat appraisal and its brake. Whether pressure narrows you.' },
  hipp:    { name:'Hippocampus',         color:'#C2FF6B', blurb:'Consolidation. Sleep and spacing are where the gains land.' },
};

const fresh = () => ({
  v: 1,
  callsign: 'QB-01',
  xp: 0,
  created: Date.now(),
  settings: {
    haptics: true, audio: true, mirror: false, motion: true,
    interleave: true,        // contextual interference on by default
    recoveryGuard: true,     // consolidation guard
    reduceFlash: false,
  },
  sensors: { motion:false, camera:false, audio:false },
  streak: { current:0, best:0, lastDay:null },
  totals: { reps:0, sessions:0, ms:0, completions:0, chaosSessions:0 },
  pr: {},                    // personal records
  regions: {},               // id -> { load:0..1, last:ts }
  drills: {},                // id -> { runs, bestScore, lastScore, unlocked }
  badges: [],
  log: [],                   // last 60 sessions
  daily: null,               // { day, drillId, mod, bonus, done }
  history: { delta:[], orient:[], poise:[] },  // rolling 30
});

let S = load();

function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return fresh();
    const parsed = JSON.parse(raw);
    return Object.assign(fresh(), parsed, {
      settings: Object.assign(fresh().settings, parsed.settings || {}),
      totals:   Object.assign(fresh().totals,   parsed.totals   || {}),
      streak:   Object.assign(fresh().streak,   parsed.streak   || {}),
      history:  Object.assign(fresh().history,  parsed.history  || {}),
    });
  }catch(e){ console.warn('[state] reset', e); return fresh(); }
}

let saveTimer = null;
function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try{ localStorage.setItem(KEY, JSON.stringify(S)); }
    catch(e){ console.warn('[state] save failed', e); }
  }, 120);
}

export const state = {
  get(){ return S; },
  get s(){ return S; },

  patch(fn){ fn(S); save(); bus.emit('state:change', S); },

  reset(){ S = fresh(); save(); bus.emit('state:change', S); },

  /* ---------- rank ---------- */
  rank(){
    let r = RANKS[0], next = RANKS[1];
    for(let i = 0; i < RANKS.length; i++){
      if(S.xp >= RANKS[i].xp){ r = RANKS[i]; next = RANKS[i+1] || null; }
    }
    return { rank:r, next, floor:r.xp, ceil: next ? next.xp : r.xp };
  },

  addXP(amount, reason=''){
    const before = state.rank().rank.name;
    S.xp = Math.max(0, Math.round(S.xp + amount));
    const after = state.rank().rank.name;
    save();
    bus.emit('xp:gain', { amount, reason });
    if(before !== after) bus.emit('rank:up', state.rank());
    bus.emit('state:change', S);
    return S.xp;
  },

  /* ---------- personal records ----------
     Returns true on a genuine improvement, 'first' when this is the
     opening baseline, false otherwise. */
  record(key, value){
    const lowerBetter = ['orientMs','observeMs','decideMs','actMs','ssrtMs','loopMs',
      'releaseMs','releaseSd','goRt','restHr','exposureFloor'];
    const cur = S.pr[key];
    const first = cur === undefined;
    const better = first ? true : (lowerBetter.includes(key) ? value < cur : value > cur);
    if(better){
      S.pr[key] = value; save();
      if(!first) bus.emit('pr:new', { key, value, prev:cur });
    }
    // 'first' is a baseline, not an achievement — the UI should not
    // celebrate every number on somebody's opening session.
    return first ? 'first' : better;
  },

  /* ---------- neural map load ---------- */
  loadRegions(weights, intensity = 1){
    const now = Date.now();
    for(const [id, w] of Object.entries(weights)){
      const r = S.regions[id] || (S.regions[id] = { load:0, last:now, reps:0 });
      // decay first (half-life ~ 4 days), then add
      const days = (now - (r.last || now)) / 86400000;
      r.load = r.load * Math.pow(0.5, days / 4);
      r.load = clamp(r.load + w * intensity * 0.055, 0, 1);
      r.reps = (r.reps || 0) + 1;
      r.last = now;
    }
    save();
  },
  regionLoad(id){
    const r = S.regions[id];
    if(!r) return 0;
    const days = (Date.now() - r.last) / 86400000;
    return clamp(r.load * Math.pow(0.5, days / 4), 0, 1);
  },

  /* ---------- streak ---------- */
  touchStreak(){
    const day = new Date().toISOString().slice(0,10);
    if(S.streak.lastDay === day) return S.streak.current;
    const y = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    S.streak.current = (S.streak.lastDay === y) ? S.streak.current + 1 : 1;
    S.streak.best = Math.max(S.streak.best || 0, S.streak.current);
    S.streak.lastDay = day;
    save();
    bus.emit('streak:tick', S.streak);
    return S.streak.current;
  },

  /* ---------- session log ---------- */
  logSession(entry){
    S.log.unshift(Object.assign({ t: Date.now() }, entry));
    S.log = S.log.slice(0, 60);
    S.totals.sessions++;
    S.totals.reps += entry.reps || 0;
    S.totals.ms   += entry.ms   || 0;
    if(entry.stress === 3) S.totals.chaosSessions++;
    const d = S.drills[entry.drillId] || (S.drills[entry.drillId] = { runs:0, bestScore:0 });
    d.runs++; d.lastScore = entry.score;
    d.bestScore = Math.max(d.bestScore || 0, entry.score || 0);
    if(entry.delta  != null) push(S.history.delta,  entry.delta);
    if(entry.orient != null) push(S.history.orient, entry.orient);
    if(entry.poise  != null) push(S.history.poise,  entry.poise);
    save();
    state.checkBadges();
    bus.emit('state:change', S);
  },

  checkBadges(){
    const gained = [];
    for(const b of BADGES){
      if(S.badges.includes(b.id)) continue;
      let ok = false;
      try{ ok = b.test(S); }catch(_){}
      if(ok){ S.badges.push(b.id); gained.push(b); }
    }
    if(gained.length){ save(); gained.forEach(b => bus.emit('badge:new', b)); }
    return gained;
  },

  avg(key, n = 10){
    const a = (S.history[key] || []).slice(0, n);
    if(!a.length) return null;
    return a.reduce((x,y) => x + y, 0) / a.length;
  },
};

function push(arr, v){ arr.unshift(v); arr.length = Math.min(arr.length, 30); }

/* Persist on background — iOS kills tabs aggressively. */
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'hidden'){
    try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(_){}
  }
});

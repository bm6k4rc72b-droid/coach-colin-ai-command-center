/* All the non-live screens: deck, brief, results, neural map,
   dossier and settings. */
import { $, $$, el, screens, toast, fmtMs, pct } from './ui.js';
import { state, RANKS, BADGES, REGIONS } from '../core/state.js';
import { DRILLS, byId, dailyFor } from '../drills/index.js';
import { gradeOf, PHASE_META, BENCH, phaseScore } from '../engine/ooda.js';
import { drawBrain } from '../render/brain.js';
import { clamp } from '../core/rng.js';
import { motion } from '../sensors/motion.js';
import { camera } from '../sensors/camera.js';
import { audio } from '../core/audio.js';

/* ============================ DECK ============================ */
export function renderHome(onOpen, onDaily){
  const s = state.s;
  const { rank, next, floor, ceil } = state.rank();

  $('#home-rank').textContent = rank.name;
  $('#home-callsign').textContent = `${s.callsign} · ${s.totals.reps} REPS LOGGED`;
  $('#home-xp').textContent = s.xp.toLocaleString();
  $('#home-xpnext').textContent = next ? ceil.toLocaleString() : 'MAX';
  const p = next ? clamp((s.xp - floor) / (ceil - floor), 0, 1) : 1;
  $('#home-xpfill').style.width = (p * 100) + '%';
  $('#home-nextrank').textContent = next ? `NEXT: ${next.name}` : 'CEILING REACHED';
  $('#home-streak').textContent = `STREAK ${s.streak.current || 0}d · BEST ${s.streak.best || 0}d`;

  const d = state.avg('delta'), o = state.avg('orient'), po = state.avg('poise');
  $('#home-delta').textContent  = d == null ? '—' : (d > 0 ? '+' : '') + Math.round(d);
  $('#home-orient').textContent = o == null ? '—' : Math.round(o);
  $('#home-poise').textContent  = po == null ? '—' : Math.round(po * 100) + '%';

  $('#block-mode').textContent = s.settings.interleave ? 'RANDOM · interleaved' : 'BLOCKED · repeated';

  /* daily */
  const day = new Date().toISOString().slice(0,10);
  if(!s.daily || s.daily.day !== day){
    const dd = dailyFor(day);
    state.patch(st => { st.daily = { day, ...dd, done:false }; });
  }
  const dl = state.s.daily;
  const dm = byId(dl.drillId);
  $('#daily-name').textContent = `${dm ? dm.name : dl.drillName} · ${dl.mod.name}`;
  $('#daily-desc').textContent = dl.mod.desc;
  const dailyLocked = dm && s.xp < (dm.unlock || 0);
  $('#daily-bonus').textContent = dl.done ? 'CLAIMED TODAY'
    : dailyLocked ? `EARLY ACCESS · +${Math.round(dl.bonus*100)}% XP`
    : `+${Math.round(dl.bonus*100)}% XP`;
  $('#daily-run').textContent = dl.done ? 'RUN AGAIN' : 'RUN IT';
  $('#daily-run').onclick = () => onDaily(dl);

  /* drill grid */
  const grid = $('#drill-grid');
  grid.innerHTML = '';
  DRILLS.forEach(d => {
    const locked = s.xp < (d.unlock || 0);
    const runs = s.drills[d.id]?.runs || 0;
    const best = s.drills[d.id]?.bestScore || 0;
    const card = el('button', { class:`drill-card${locked ? ' is-locked' : ''}`, style:`--accent:${d.accent}` },
      el('div', { class:'drill-card__ico', text:d.ico }),
      el('div', { class:'drill-card__tag', text:d.tag }),
      el('div', { class:'drill-card__name', text:d.name }),
      el('div', { class:'drill-card__desc', text:locked ? `Unlocks at ${d.unlock.toLocaleString()} XP` : d.desc }),
      el('div', { class:'drill-card__bar' }, el('i', { style:`width:${best}%` })),
      locked ? el('div', { class:'drill-card__lock', text:'◍ LOCKED' })
             : (runs ? el('div', { class:'drill-card__lock', text:`${runs}×` }) : null),
    );
    card.addEventListener('click', () => {
      if(locked){ toast(`LOCKED — ${(d.unlock - s.xp).toLocaleString()} XP TO GO`, 'gold'); return; }
      onOpen(d);
    });
    grid.append(card);
  });
}

/* ============================ BRIEF ============================ */
export function renderBrief(drill, cfg, onStart){
  $('#brief-tag').textContent = drill.tag;
  $('#brief-title').textContent = drill.name;
  $('#brief-line').textContent = drill.line;
  $('#brief-sci').textContent = drill.science;

  const tags = $('#brief-regions');
  tags.innerHTML = '';
  Object.entries(drill.regions)
    .sort((a,b) => b[1] - a[1])
    .forEach(([id, w]) => {
      tags.append(el('span', { class:'chip', style:`color:${REGIONS[id].color};border-color:${REGIONS[id].color}55;background:${REGIONS[id].color}14` },
        REGIONS[id].name));
    });

  bindSeg('#cfg-stress', cfg.stress, v => { cfg.stress = +v; });
  bindSeg('#cfg-reps',   cfg.reps,   v => { cfg.reps = +v; });

  const note = $('#cfg-sensor-note');
  const bits = [];
  if(drill.needsMotion && !motion.live) bits.push('MOTION CORE offline — this drill falls back to tap timing, which measures your thumb rather than your release.');
  if(drill.needsCamera) bits.push('OPTIC CORE required. You will be asked to cover the rear lens with a fingertip.');
  if(!drill.needsMotion && motion.live) bits.push('MOTION CORE live — the field pans with the phone and your release is timestamped by the accelerometer.');
  note.textContent = bits.join(' ');

  $('#brief-start').onclick = () => onStart(cfg);
}

function bindSeg(sel, value, onPick){
  const seg = $(sel);
  $$('button', seg).forEach(b => {
    b.classList.toggle('is-on', +b.dataset.v === +value);
    b.onclick = () => {
      $$('button', seg).forEach(x => x.classList.remove('is-on'));
      b.classList.add('is-on');
      onPick(b.dataset.v);
      audio.tick();
    };
  });
}

/* ============================ RESULTS ============================ */
export function renderResult(drill, res, onAgain, onDeck){
  const wrap = $('#result-wrap');
  wrap.innerHTML = '';
  const g = gradeOf(res.score);

  wrap.append(
    el('div', { class:'result-hero' },
      el('div', { class:'result-title', text:`${drill.name} · ${res.reps} REPS` }),
      el('div', { class:'result-grade', text:g.g }),
      el('div', { class:'result-sub', text:g.note }),
    ),
  );

  const metrics = el('div', { class:'result-metrics' });
  res.metrics.forEach(m => {
    const isPR = m.pr && m.raw != null && state.record(m.pr, m.raw) === true;
    metrics.append(el('div', { class:`metric${isPR ? ' metric--pr' : ''}` },
      el('div', { class:'metric__k', text:m.k }),
      el('div', { class:'metric__v', text:String(m.v) }),
      el('div', { class:'metric__d', text:isPR ? 'NEW PERSONAL RECORD' : m.d }),
    ));
  });
  wrap.append(metrics);

  if(res.phases && res.phases.some(p => p.ms)){
    const bars = el('div', { class:'phase-bars holo-panel' }, el('div', { class:'holo-panel__label', text:'WHERE THE TIME WENT' }));
    res.phases.forEach(p => {
      if(p.ms == null) return;
      const meta = PHASE_META[p.phase], b = BENCH[p.phase];
      const q = phaseScore(p.phase, p.ms);
      const w = clamp(p.ms / (b.ok * 1.6), 0.04, 1) * 100;
      bars.append(el('div', { class:'pbar' },
        el('div', { class:'pbar__t' }, el('span', { text:meta.label }), el('span', { text:`${Math.round(p.ms)}ms · elite ${b.elite}ms` })),
        el('div', { class:'pbar__track' },
          el('div', { class:'pbar__fill', style:`width:${w}%;background:${meta.color};color:${meta.color}` }),
          el('div', { class:'pbar__mark', style:`left:${clamp(b.elite/(b.ok*1.6),0,1)*100}%` }),
        ),
      ));
    });
    wrap.append(bars);
  }

  wrap.append(el('div', { class:'result-note holo-panel' },
    el('div', { class:'holo-panel__label', text:'COACHING' }),
    el('p', { text:coachNote(drill, res) })));

  wrap.append(el('div', { class:'result-actions' },
    el('button', { class:'holo-btn holo-btn--ghost', onclick:onDeck }, 'DECK'),
    el('button', { class:'holo-btn holo-btn--primary', onclick:onAgain }, 'RUN IT BACK'),
  ));
}

function coachNote(drill, res){
  if(drill.id === 'loopbreak'){
    const slow = (res.phases || []).filter(p => p.ms != null)
      .map(p => ({ ...p, q:phaseScore(p.phase, p.ms) }))
      .sort((a,b) => a.q - b.q)[0];
    const dis = res.extra?.disguisedAcc;
    let s = slow ? `${PHASE_META[slow.phase].label} is your bottleneck this session at ${Math.round(slow.ms)}ms. ${PHASE_META[slow.phase].note} ` : '';
    if(res.delta < 0) s += `Your loop is finishing after theirs — Δ ${Math.round(res.delta)}ms. Everything you threw was into a picture that had already changed. Drop the stress governor one notch and rebuild the read before you chase speed. `;
    else s += `You finished inside their cycle by ${Math.round(res.delta)}ms on average. That is the number to protect as you raise the load. `;
    if(dis != null && dis < 0.5) s += `Disguised looks are beating you — ${Math.round(dis*100)}% correct. Run ORIENT ENGINE until post-snap rotation reads as fast as pre-snap alignment.`;
    return s;
  }
  if(drill.id === 'orient') return 'Interleaved order makes today feel worse and next week feel better. Trust the retention number over the accuracy number — that is the one that transfers to Sunday.';
  if(drill.id === 'ironhand') return 'SSRT under 250ms is quick cancellation. If inhibition is high but go RT is slow, you are hedging — the fix is to commit harder on go trials, not to hesitate on every rep.';
  if(drill.id === 'periph') return 'If your field of view shrank as the session went on, that is perceptual narrowing under load, not fatigue. PULSE LAB is the direct counter-measure.';
  if(drill.id === 'twitch') return 'Chase the standard deviation, not the mean. A consistent 280ms release beats a release that ranges from 210 to 400.';
  if(drill.id === 'pulse') return 'The recovery slope is the number that matters. Anyone can be calm in the baseline block. Run this after a hard LOOP BREAK session to train the return, not the resting state.';
  return '';
}

/* ============================ NEURAL MAP ============================ */
let mapRaf = null;
export function renderMap(){
  const canvas = $('#brain-canvas');
  cancelAnimationFrame(mapRaf);
  const tick = t => { drawBrain(canvas, t); mapRaf = requestAnimationFrame(tick); };
  tick(0);

  const legend = $('#map-legend');
  legend.innerHTML = '';
  ['Trained today','4-day half-life','Fill = recent load'].forEach((t,i) => {
    legend.append(el('span', {}, el('i', { style:`background:${['#7CFF9E','#FFC44D','#4DF0FF'][i]}` }), t));
  });

  const list = $('#map-list');
  list.innerHTML = '';
  Object.entries(REGIONS)
    .map(([id, r]) => ({ id, ...r, load:state.regionLoad(id) }))
    .sort((a,b) => b.load - a.load)
    .forEach(r => {
      list.append(el('div', { class:'region-row' },
        el('div', { class:'region-row__top' },
          el('div', { class:'region-row__n', style:`color:${r.color}`, text:r.name }),
          el('div', { class:'region-row__p', text:`${Math.round(r.load*100)}%` })),
        el('div', { class:'region-row__d', text:r.blurb }),
        el('div', { class:'region-row__bar' }, el('i', { style:`width:${r.load*100}%;background:${r.color}` })),
      ));
    });
}
export function stopMap(){ cancelAnimationFrame(mapRaf); }

/* ============================ DOSSIER ============================ */
export function renderDossier(){
  const s = state.s;
  const wrap = $('#dossier-wrap');
  wrap.innerHTML = '';
  $('#dossier-sub').textContent = `${s.totals.sessions} SESSIONS · ${s.totals.reps} REPS · ${Math.round(s.totals.ms/60000)} MIN`;

  const { rank, next, ceil } = state.rank();
  wrap.append(el('div', { class:'holo-panel' },
    el('div', { class:'holo-panel__label', text:'STANDING' }),
    row('RANK', rank.name), row('XP', s.xp.toLocaleString()),
    row('TO NEXT', next ? (ceil - s.xp).toLocaleString() : '—'),
    row('CURRENT STREAK', `${s.streak.current || 0} days`),
    row('LONGEST STREAK', `${s.streak.best || 0} days`),
    el('p', { class:'dim', style:'font-size:12.5px;margin-top:8px', text:rank.note }),
  ));

  const prs = [
    ['deltaLoop','Δ-LOOP','ms inside'], ['orientMs','ORIENT','ms'],
    ['ssrtMs','SSRT','ms'], ['stopAccuracy','INHIBITION','%'],
    ['ufovEcc','FIELD OF VIEW','%'], ['releaseMs','RELEASE','ms'],
    ['releaseSd','RELEASE SD','ms'], ['recoverySlope','RECOVERY','bpm/min'],
    ['retention','RETENTION','%'], ['exposureFloor','EXPOSURE FLOOR','ms'],
  ].filter(([k]) => s.pr[k] != null);
  if(prs.length){
    const grid = el('div', { class:'dz-grid' });
    prs.forEach(([k, label, unit]) => {
      let v = s.pr[k];
      if(unit === '%') v = Math.round(v * (v <= 1 ? 100 : 1));
      else v = Math.round(v * 10) / 10;
      grid.append(el('div', { class:'metric metric--pr' },
        el('div', { class:'metric__k', text:label }),
        el('div', { class:'metric__v', text:String(v) }),
        el('div', { class:'metric__d', text:unit })));
    });
    wrap.append(el('div', { class:'holo-panel' },
      el('div', { class:'holo-panel__label', text:'PERSONAL RECORDS' }), grid));
  }

  // Δ-loop trend
  const hist = (s.history.delta || []).slice(0, 20).reverse();
  if(hist.length > 1){
    const c = el('canvas', { class:'spark' });
    const panel = el('div', { class:'holo-panel' },
      el('div', { class:'holo-panel__label', text:'Δ-LOOP TREND · LAST 20 SESSIONS' }), c);
    wrap.append(panel);
    requestAnimationFrame(() => spark(c, hist));
  }

  const badges = el('div', { class:'badge-grid' });
  BADGES.forEach(b => {
    const got = s.badges.includes(b.id);
    badges.append(el('div', { class:`badge${got ? ' is-earned' : ''}` },
      el('div', { class:'badge__ico', text:b.ico }),
      el('div', { class:'badge__n', text:b.name })));
  });
  wrap.append(el('div', { class:'holo-panel' },
    el('div', { class:'holo-panel__label', text:`COMMENDATIONS · ${s.badges.length}/${BADGES.length}` }), badges));

  if(s.log.length){
    const log = el('div');
    s.log.slice(0, 14).forEach(e => {
      const d = byId(e.drillId);
      log.append(el('div', { class:'log-row' },
        el('time', { text:new Date(e.t).toLocaleDateString(undefined,{month:'short',day:'numeric'}) }),
        el('b', { text:d ? d.name : e.drillId }),
        el('i', { text:`${e.score}` })));
    });
    wrap.append(el('div', { class:'holo-panel' },
      el('div', { class:'holo-panel__label', text:'SESSION LOG' }), log));
  }

  function row(k, v){ return el('div', { class:'dz-row' }, el('span', { text:k }), el('b', { text:String(v) })); }
}

function spark(canvas, data){
  const g = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width*dpr); canvas.height = Math.round(r.height*dpr);
  g.setTransform(dpr,0,0,dpr,0,0);
  const W = r.width, H = r.height;
  const min = Math.min(...data, -200), max = Math.max(...data, 200);
  const y = v => H - 6 - ((v - min) / (max - min || 1)) * (H - 12);
  // zero line
  g.strokeStyle = 'rgba(255,196,77,.35)'; g.setLineDash([3,4]);
  g.beginPath(); g.moveTo(0, y(0)); g.lineTo(W, y(0)); g.stroke(); g.setLineDash([]);
  g.beginPath();
  data.forEach((v, i) => { const x = (i/(data.length-1))*W; i ? g.lineTo(x, y(v)) : g.moveTo(x, y(v)); });
  g.strokeStyle = '#4DF0FF'; g.lineWidth = 2; g.shadowColor = '#4DF0FF'; g.shadowBlur = 10; g.stroke();
  g.shadowBlur = 0;
  data.forEach((v, i) => {
    const x = (i/(data.length-1))*W;
    g.beginPath(); g.arc(x, y(v), 2.5, 0, Math.PI*2);
    g.fillStyle = v >= 0 ? '#7CFF9E' : '#FF3DDA'; g.fill();
  });
}

/* ============================ SETTINGS ============================ */
export function renderSettings(onRelink){
  const s = state.s;
  const wrap = $('#settings-wrap');
  wrap.innerHTML = '';

  const panel = (label, ...kids) => el('div', { class:'holo-panel' },
    el('div', { class:'holo-panel__label', text:label }), ...kids);

  const toggle = (key, title, desc) => {
    const t = el('div', { class:`tgl${s.settings[key] ? ' is-on' : ''}` });
    const r = el('div', { class:'set-row' },
      el('div', { class:'set-row__l' },
        el('div', { class:'set-row__t', text:title }),
        el('div', { class:'set-row__d', text:desc })),
      t);
    t.addEventListener('click', () => {
      state.patch(st => { st.settings[key] = !st.settings[key]; });
      t.classList.toggle('is-on', state.s.settings[key]);
      audio.tick();
      if(key === 'mirror') applyMirror();
    });
    return r;
  };

  wrap.append(panel('SENSORS',
    toggle('motion', 'MOTION CORE', motion.live ? 'Live. Field pans with the phone; release timestamped by the accelerometer.' : 'Not linked in this session.'),
    toggle('mirror', 'MIRROR HUD', 'Front camera behind the hologram. Costs battery; looks incredible.'),
    toggle('audio',  'AUDIO CORE', 'Crowd bed, cadence and kill tones.'),
    toggle('haptics','HAPTICS', 'Vibration and speaker thump on every cue.'),
    el('button', { class:'holo-btn holo-btn--ghost holo-btn--wide', style:'margin-top:10px', onclick:onRelink }, 'RE-LINK SENSORS'),
  ));

  wrap.append(panel('TRAINING',
    toggle('interleave', 'INTERLEAVED SCHEDULE', 'Randomises coverage order. Lower scores today, better retention next week. Leave this on.'),
    toggle('recoveryGuard', 'RECOVERY GUARD', 'Warns you when you are grinding past the point where reps still consolidate.'),
    toggle('reduceFlash', 'REDUCE FLASH', 'Suppresses full-screen flashes. Turn on if you are photosensitive.'),
  ));

  const cs = el('input', { type:'text', value:s.callsign, maxlength:12,
    style:'background:rgba(6,14,28,.7);border:1px solid var(--edge);border-radius:9px;padding:9px 11px;color:var(--ink);font-family:var(--f-display);letter-spacing:.1em;width:130px;text-align:center' });
  cs.addEventListener('change', () => {
    state.patch(st => { st.callsign = cs.value.toUpperCase().slice(0,12) || 'QB-01'; });
    toast('CALLSIGN UPDATED');
  });
  wrap.append(panel('IDENTITY',
    el('div', { class:'set-row' },
      el('div', { class:'set-row__l' },
        el('div', { class:'set-row__t', text:'CALLSIGN' }),
        el('div', { class:'set-row__d', text:'Shown on the deck.' })),
      cs),
  ));

  wrap.append(panel('DATA',
    el('p', { class:'dim', style:'font-size:13px;line-height:1.5',
      text:'Everything — reps, heart rate, personal records — is stored only in this browser. There is no account and no server. Clearing site data erases it permanently.' }),
    el('button', { class:'holo-btn holo-btn--danger holo-btn--wide', style:'margin-top:12px',
      onclick:() => {
        if(confirm('Wipe the athlete file? Ranks, records and history are gone for good.')){
          state.reset(); toast('FILE WIPED', 'mg'); screens.show('home');
        }
      } }, 'WIPE ATHLETE FILE'),
  ));

  wrap.append(el('p', { class:'ghost mono', style:'text-align:center;font-size:9px;letter-spacing:.2em;padding:16px 0',
    text:'LOOPBREAK QB · OODA COMMAND DECK · v1.0' }));
}

export async function applyMirror(){
  const on = state.s.settings.mirror;
  const v = $('#mirror-feed');
  if(on && state.s.sensors.camera){
    try{ await camera.start('mirror', v); document.body.classList.add('mirror-on'); }
    catch(_){ document.body.classList.remove('mirror-on'); }
  } else {
    document.body.classList.remove('mirror-on');
    if(camera.mode === 'mirror') await camera.stop();
  }
}

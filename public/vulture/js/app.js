/**
 * VultureSystemV1 by Coach Colin: application shell.
 *
 * One render loop drives everything: grab frames from every live camera, run
 * object detection round-robin (zones/occupancy), run pose on the selected
 * camera (kinetics), raise events and alerts, and paint whichever view is open.
 *
 * @module vulture/app
 */

import { Camera, KIND_LABEL, listDevices } from './sources.js';
import { Tracker } from './tracker.js';
import { LotModel, samplesToCsv } from './lot.js';
import { BONES, EXERCISES, JOINTS, MUSCLES } from './kinetics.js';
import { detect, loadDetector, loadPose, pose, unloadPose, visionStatus, TASKS_VERSION } from './vision.js';
import { barChart, heatColor, heatStrip, lineChart } from './charts.js';
import { deliver, mayFire } from './alerts.js';
import { centroid, subdivideQuad } from './geometry.js';
import { mountRoute } from './route.js';
import {
  clearSaved, DEFAULT_SETTINGS, loadSaved, persist, selected, state,
} from './state.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDur = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};
const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const COLORS = { free: '#3ddc84', occ: '#ff4d4f', zone: '#f5d90a', line: '#39e0c8', person: '#4fc3f7', vehicle: '#f5d90a', pending: '#ff9f43' };

let view = 'dashboard';
let routeUi = null;
const spark = { speed: [], force: [], fat: [], cad: [], imp: [] };
let lastSpark = 0;
let lastPanel = 0;
let lastCheck = 0;
let lastPersist = 0;
let frames = 0; let fpsT = performance.now();
let alertCount = 0; let unseen = 0;
let detectorWanted = false; let poseWanted = false;
const offline = new Set();

/* ----------------------------------------------------------------- pipelines */

function lotSettings() {
  const s = state.settings;
  return { coverMin: s.coverMin, enterMs: s.enterS * 1000, exitMs: s.exitS * 1000 };
}

function pipe(cam) {
  let p = state.pipelines.get(cam.id);
  if (!p) {
    p = { tracker: new Tracker(), lot: new LotModel(cam.zones, lotSettings()), dets: [], tracks: [], lastDet: 0, lastGrab: 0, frame: null };
    state.pipelines.set(cam.id, p);
  }
  return p;
}

function zonesChanged(cam) {
  pipe(cam).lot.setZones(cam.zones);
  persist();
}

function ensureModels() {
  const live = state.cameras.filter((c) => c.status === 'live');
  const needDet = live.some((c) => !c.isSim && c.task !== 'kinetics');
  const sel = selected();
  const needPose = sel && sel.status === 'live' && sel.kind !== 'sim-athlete' && !sel.isSim && sel.task !== 'zones';
  if (needDet && !detectorWanted) {
    detectorWanted = true;
    toast('Loading object detector (EfficientDet-Lite0)…');
    loadDetector({ scoreThreshold: 0.2 }).then(() => toast(`Object detector ready (${visionStatus().delegate.detector})`)).catch((e) => { detectorWanted = false; toast(`Detector failed: ${e.message}`, 'high'); });
  }
  if (needPose && !poseWanted) {
    poseWanted = true;
    toast(`Loading pose model (BlazePose ${state.settings.poseModel})…`);
    loadPose({ full: state.settings.poseModel === 'full' }).then(() => toast(`Pose model ready (${visionStatus().delegate.pose})`)).catch((e) => { poseWanted = false; toast(`Pose failed: ${e.message}`, 'high'); });
  }
}

/* ---------------------------------------------------------------- main loop */

function loop(now) {
  requestAnimationFrame(loop);
  frames++;
  if (now - fpsT >= 1000) { state.perf.fps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now; }
  const sel = selected();
  const live = state.cameras.filter((c) => c.status === 'live');
  for (const cam of live) {
    const p = pipe(cam);
    if (cam !== sel && now - p.lastGrab < 100) continue;
    p.lastGrab = now;
    p.frame = cam.grab(now);
  }
  // Object detection: one camera per frame, oldest first.
  const interval = 1000 / state.settings.detectFps;
  const due = live.filter((c) => c.task !== 'kinetics' && pipe(c).frame && now - pipe(c).lastDet >= interval)
    .sort((a, b) => pipe(a).lastDet - pipe(b).lastDet)[0];
  if (due) runDetection(due, now);
  // Pose on the selected camera.
  if (sel && sel.status === 'live' && sel.task !== 'zones' && !state.posePaused) runPose(sel, now);
  // Periodic rules and persistence.
  if (now - lastCheck > 1000) { lastCheck = now; periodicChecks(); }
  if (now - lastPersist > 30000) { lastPersist = now; persist(); }
  render(now);
}

function runDetection(cam, now) {
  const p = pipe(cam);
  p.lastDet = now;
  let dets = [];
  const t0 = performance.now();
  try {
    if (cam.kind === 'sim-lot') dets = cam.simDetections ?? [];
    else if (visionStatus().detector === 'ready') dets = detect(p.frame, state.settings.minScore);
    else return;
  } catch (e) {
    cam.status = 'error';
    cam.error = /taint|cross-origin|SecurityError/i.test(String(e)) ? 'Cross-origin stream: the server must send CORS headers (or use the relay).' : String(e.message ?? e);
    renderCameras();
    return;
  }
  if (!cam.isSim) state.perf.detMs = performance.now() - t0;
  dets = dets.filter((d) => d.score >= state.settings.minScore);
  p.dets = dets;
  p.tracks = p.tracker.update(dets, Date.now());
  const events = p.lot.update(p.tracks, Date.now());
  for (const ev of events) handleLotEvent(cam, ev);
}

function runPose(cam, now) {
  const p = pipe(cam);
  if (!p.frame || now - (p.lastPose ?? 0) < 30) return; // ~30 Hz is plenty and keeps phones cool
  p.lastPose = now;
  let res = null;
  const t0 = performance.now();
  if (cam.kind === 'sim-athlete') res = cam.simPose ? { landmarks: cam.simPose, world: null } : null;
  else if (visionStatus().pose === 'ready') {
    try { res = pose(p.frame); } catch { res = null; }
    state.perf.poseMs = performance.now() - t0;
  } else return;
  p.pose = res;
  if (!res) { state.kinFrame = null; return; }
  state.kinFrame = state.kin.update(res.landmarks, res.world, now, p.frame.width / p.frame.height);
}

/* ------------------------------------------------------------------- events */

function snapshot(cam) {
  if (!state.settings.snapshots) return null;
  const f = pipe(cam).frame;
  if (!f) return null;
  try {
    const c = document.createElement('canvas');
    c.width = 192; c.height = Math.round((192 * f.height) / f.width);
    const g = c.getContext('2d');
    g.drawImage(f, 0, 0, c.width, c.height);
    drawOverlay(g, c.width, c.height, cam, { zones: true, boxes: true, pose: false });
    return c.toDataURL('image/jpeg', 0.6);
  } catch { return null; }
}

function addEvent(ev) {
  const e = { id: Math.random().toString(36).slice(2), t: Date.now(), level: 'info', ...ev };
  state.events.unshift(e);
  if (state.events.length > 500) state.events.length = 500;
  if (e.rule) {
    alertCount++;
    if (view !== 'alerts') unseen++;
    toast(`${e.title} — ${e.detail}`, e.level);
    deliver(e, state.settings);
  }
  renderFeeds();
}

function raise(ruleId, key, ev) {
  const rule = state.rules.find((r) => r.id === ruleId);
  if (!mayFire(rule, `${ruleId}:${key}`, Date.now())) return false;
  addEvent({ ...ev, rule: ruleId });
  return true;
}

function handleLotEvent(cam, ev) {
  const z = ev.zone;
  if (ev.type === 'space-occupied') addEvent({ title: `${z.name} occupied`, detail: 'vehicle parked', camera: cam.name });
  else if (ev.type === 'space-vacated') addEvent({ title: `${z.name} free`, detail: `stayed ${fmtDur(ev.dwell)}`, camera: cam.name });
  else if (ev.type === 'zone-enter') {
    const raised = raise('restricted', `${cam.id}:${z.id}`, { level: 'high', title: `${ev.label ?? 'Person'} in ${z.name}`, detail: `track #${ev.track} entered a restricted zone`, camera: cam.name, snapshot: snapshot(cam) });
    if (!raised) addEvent({ title: `${ev.label ?? 'Person'} in ${z.name}`, detail: `track #${ev.track}`, camera: cam.name, level: 'warn' });
  } else if (ev.type === 'line-cross') {
    raise('line-cross', `${cam.id}:${z.id}:${ev.track}`, { level: 'info', title: `${z.name}: ${ev.dir}`, detail: `${ev.label} #${ev.track} crossed`, camera: cam.name });
  }
}

function periodicChecks() {
  const now = Date.now();
  for (const cam of state.cameras) {
    if (cam.status === 'error' && !offline.has(cam.id)) {
      offline.add(cam.id);
      raise('camera-offline', cam.id, { level: 'high', title: `${cam.name} offline`, detail: cam.error || 'stream lost', camera: cam.name });
    } else if (cam.status === 'live') offline.delete(cam.id);
    if (cam.status !== 'live' || cam.task === 'kinetics') continue;
    const p = pipe(cam);
    const s = p.lot.summary();
    const full = state.rules.find((r) => r.id === 'lot-full');
    if (s.total && s.pct >= full.params.pct) raise('lot-full', cam.id, { level: 'warn', title: `Lot ${Math.round(s.pct)}% full`, detail: `${s.occupied}/${s.total} spaces occupied`, camera: cam.name, snapshot: snapshot(cam) });
    const dwell = state.rules.find((r) => r.id === 'dwell');
    for (const a of p.lot.analytics(now)) {
      if (a.occupied && a.currentDwell >= dwell.params.minutes * 60000) raise('dwell', `${cam.id}:${a.id}`, { level: 'warn', title: `${a.name} overstay`, detail: `parked ${fmtDur(a.currentDwell)}`, camera: cam.name });
    }
  }
  const f = state.kinFrame;
  const sel = selected();
  if (f && sel) {
    const fat = state.rules.find((r) => r.id === 'fatigue');
    if (f.fatigue >= fat.params.pct) raise('fatigue', 'kin', { level: 'warn', title: `Fatigue ${Math.round(f.fatigue)}%`, detail: state.kin.exercise === 'run' ? 'cadence dropping vs. start' : 'rep velocity loss — consider ending the set', camera: sel.name });
    const imp = state.rules.find((r) => r.id === 'impact');
    if (f.impactG >= imp.params.g) raise('impact', 'kin', { level: 'warn', title: `Impact ${f.impactG.toFixed(1)} G`, detail: 'high landing / ground-contact load', camera: sel.name });
    for (const flag of f.flags) {
      if (!flag.startsWith('High impact')) raise('form', `kin:${flag.split(' ')[0]}`, { level: 'warn', title: 'Form cue', detail: flag, camera: sel.name, snapshot: snapshot(sel) });
    }
  }
}

/* ------------------------------------------------------------------ drawing */

function sizeCanvas(canvas, aspect, maxH) {
  const box = canvas.parentElement;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let w = box.clientWidth;
  let h = w / aspect;
  if (maxH && h > maxH) { h = maxH; w = h * aspect; }
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  const bw = Math.round(w * dpr); const bh = Math.round(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  return [bw, bh, dpr];
}

function drawFrame(canvas, cam, opts, maxH) {
  const p = pipe(cam);
  const f = p.frame;
  const aspect = f ? f.width / f.height : 16 / 9;
  const [W, H, dpr] = sizeCanvas(canvas, aspect, maxH);
  const g = canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (f) g.drawImage(f, 0, 0, W, H); else { g.fillStyle = '#05080f'; g.fillRect(0, 0, W, H); }
  drawOverlay(g, W, H, cam, opts, dpr);
  if (cam.isSim) {
    g.font = `${11 * dpr}px JetBrains Mono, monospace`; g.fillStyle = '#000a'; g.fillRect(8 * dpr, 8 * dpr, 150 * dpr, 20 * dpr);
    g.fillStyle = '#f5d90a'; g.fillText('SIMULATED FEED', 16 * dpr, 22 * dpr);
  }
  if (cam.status !== 'live') {
    g.fillStyle = '#000b'; g.fillRect(0, 0, W, H);
    g.fillStyle = cam.status === 'error' ? '#ff4d4f' : '#9fb0c8';
    g.font = `${14 * dpr}px Space Grotesk, sans-serif`; g.textAlign = 'center';
    g.fillText(cam.status === 'error' ? `⚠ ${cam.error}` : cam.status === 'starting' ? 'Connecting…' : 'Camera stopped — start it in Cameras & Devices', W / 2, H / 2);
    g.textAlign = 'left';
  }
}

function drawOverlay(g, W, H, cam, opts, dpr = 1) {
  const p = pipe(cam);
  const st = new Map(p.lot.state.map((s) => [s.zone.id, s]));
  if (opts.zones) {
    for (const z of cam.zones) {
      const s = st.get(z.id);
      const pts = z.points.map((q) => [q.x * W, q.y * H]);
      g.lineWidth = 2 * dpr;
      if (z.kind === 'line') {
        g.strokeStyle = COLORS.line; g.setLineDash([8 * dpr, 5 * dpr]);
        g.beginPath(); g.moveTo(...pts[0]); g.lineTo(...pts[1]); g.stroke(); g.setLineDash([]);
        const [ax, ay] = pts[0]; const [bx, by] = pts[1];
        const mx = (ax + bx) / 2; const my = (ay + by) / 2;
        const nx = -(by - ay); const ny = bx - ax; const nl = Math.hypot(nx, ny) || 1;
        g.beginPath(); g.moveTo(mx, my); g.lineTo(mx - (nx / nl) * 18 * dpr, my - (ny / nl) * 18 * dpr); g.stroke();
        label(g, `${z.name} ↑${s?.countIn ?? 0} ↓${s?.countOut ?? 0}`, ax + 4 * dpr, ay + 14 * dpr, COLORS.line, dpr);
        continue;
      }
      const occ = s?.occupied;
      const pending = s?.pendingSince !== null && s?.pendingSince !== undefined;
      const c = z.kind === 'restricted' ? (occ ? COLORS.occ : COLORS.zone) : occ ? COLORS.occ : pending ? COLORS.pending : COLORS.free;
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
      g.fillStyle = `${c}${z.kind === 'restricted' ? '22' : occ ? '44' : '26'}`; g.fill();
      g.strokeStyle = c;
      if (z.kind === 'restricted') g.setLineDash([6 * dpr, 4 * dpr]);
      g.stroke(); g.setLineDash([]);
      const ct = centroid(z.points);
      const short = z.kind === 'space' ? z.name.replace(/^Space\s*/i, '') : z.name;
      label(g, short, ct.x * W, ct.y * H, c, dpr, true);
    }
  }
  if (opts.boxes) {
    for (const tr of p.tracks) {
      const b = tr.box;
      const c = tr.label === 'person' ? COLORS.person : COLORS.vehicle;
      g.strokeStyle = c; g.lineWidth = 1.5 * dpr;
      g.strokeRect(b.x * W, b.y * H, b.w * W, b.h * H);
      label(g, `${tr.label} #${tr.id} ${Math.round(tr.score * 100)}%`, b.x * W, b.y * H - 3 * dpr, c, dpr);
    }
  }
  if (opts.pose && p.pose) drawPose(g, W, H, p.pose.landmarks, dpr);
}

function label(g, text, x, y, color, dpr, center = false) {
  g.font = `600 ${11 * dpr}px JetBrains Mono, monospace`;
  const w = g.measureText(text).width + 8 * dpr;
  const lx = center ? x - w / 2 : x;
  const ly = center ? y - 8 * dpr : y - 14 * dpr;
  g.fillStyle = '#070b14cc'; g.fillRect(lx, ly, w, 16 * dpr);
  g.fillStyle = color; g.fillText(text, lx + 4 * dpr, ly + 12 * dpr);
}

function drawPose(g, W, H, lm, dpr) {
  const ok = (i) => lm[i] && (lm[i].visibility ?? 1) > 0.4;
  g.lineCap = 'round';
  for (const [a, b] of BONES) {
    if (!ok(a) || !ok(b)) continue;
    const left = a % 2 === 1;
    g.strokeStyle = left ? '#f5d90a' : '#39e0c8'; g.lineWidth = 3 * dpr;
    g.beginPath(); g.moveTo(lm[a].x * W, lm[a].y * H); g.lineTo(lm[b].x * W, lm[b].y * H); g.stroke();
  }
  for (let i = 11; i < 33; i++) {
    if (!ok(i)) continue;
    g.fillStyle = '#fff'; g.beginPath(); g.arc(lm[i].x * W, lm[i].y * H, 3.2 * dpr, 0, 7); g.fill();
  }
  const f = state.kinFrame;
  if (!f) return;
  const tag = (name, idx, text) => {
    if (!ok(idx) || !Number.isFinite(f.angles[name])) return;
    const x = lm[idx].x * W; const y = lm[idx].y * H;
    g.font = `700 ${12 * dpr}px JetBrains Mono, monospace`;
    const w = g.measureText(text).width + 10 * dpr;
    g.fillStyle = '#070b14dd'; g.strokeStyle = '#f5d90a'; g.lineWidth = 1 * dpr;
    g.fillRect(x + 8 * dpr, y - 10 * dpr, w, 20 * dpr); g.strokeRect(x + 8 * dpr, y - 10 * dpr, w, 20 * dpr);
    g.fillStyle = '#f5d90a'; g.fillText(text, x + 13 * dpr, y + 5 * dpr);
  };
  const side = (lm[25]?.visibility ?? 0) >= (lm[26]?.visibility ?? 0) ? 'l' : 'r';
  const idx = side === 'l' ? { Knee: 25, Hip: 23, Elbow: 13, Ankle: 27 } : { Knee: 26, Hip: 24, Elbow: 14, Ankle: 28 };
  for (const j of ['Knee', 'Hip', 'Elbow', 'Ankle']) tag(`${side}${j}`, idx[j], `${Math.round(f.angles[`${side}${j}`])}° ${j.toUpperCase()}`);
}

/* ------------------------------------------------------------------- render */

function render(now) {
  const sel = selected();
  if (view === 'dashboard') {
    $('stage-empty').hidden = !!sel;
    $('stage-canvas').hidden = !sel;
    if (sel) drawFrame($('stage-canvas'), sel, { zones: $('ov-zones').checked, boxes: $('ov-boxes').checked, pose: $('ov-pose').checked }, window.innerHeight * 0.62);
    renderTiles(now);
  } else if (view === 'kinetics' && sel) {
    drawFrame($('kin-canvas'), sel, { zones: false, boxes: false, pose: true }, window.innerHeight * 0.6);
  } else if (view === 'designer' && sel) {
    drawDesigner(sel);
  }
  if (now - lastPanel > 200) { lastPanel = now; renderPanels(now); }
  if (now - lastSpark > 100 && state.kinFrame) {
    lastSpark = now;
    const f = state.kinFrame;
    const push = (k, v) => { spark[k].push(v); if (spark[k].length > 150) spark[k].shift(); };
    push('speed', f.speed); push('force', f.force); push('fat', f.fatigue); push('cad', f.cadence || NaN); push('imp', f.impactG);
  }
}

let lastTiles = 0;
function renderTiles(now) {
  const box = $('tiles');
  const cams = state.cameras;
  if (box.childElementCount !== cams.length || box.dataset.sig !== cams.map((c) => c.id + c.status).join()) {
    box.dataset.sig = cams.map((c) => c.id + c.status).join();
    box.innerHTML = cams.map((c) => `<button class="tile ${c.id === state.selectedId ? 'on' : ''}" data-id="${c.id}"><canvas></canvas><span><i class="dot ${c.status}"></i>${esc(c.name)}</span></button>`).join('');
    box.querySelectorAll('.tile').forEach((t) => t.onclick = () => selectCam(t.dataset.id));
  }
  if (now - lastTiles < 250) return;
  lastTiles = now;
  box.querySelectorAll('.tile').forEach((t) => {
    const cam = state.cameras.find((c) => c.id === t.dataset.id);
    t.classList.toggle('on', cam?.id === state.selectedId);
    const cv = t.querySelector('canvas');
    const f = cam && pipe(cam).frame;
    if (!f) return;
    cv.width = 160; cv.height = 90;
    const g = cv.getContext('2d');
    g.drawImage(f, 0, 0, 160, 90);
    drawOverlay(g, 160, 90, cam, { zones: true, boxes: false, pose: false }, 0.5);
  });
}

function renderPanels(now) {
  const live = state.cameras.filter((c) => c.status === 'live');
  const sel = selected();
  $('clock').textContent = new Date().toLocaleTimeString();
  const up = Date.now() - state.bootedAt;
  $('nav-uptime').textContent = `uptime ${fmtDur(up)}`;
  $('alert-badge').hidden = unseen === 0;
  $('alert-badge').textContent = unseen;
  if (view === 'dashboard') {
    let veh = 0; let ppl = 0; let occ = 0; let tot = 0;
    for (const c of live) {
      const p = pipe(c);
      veh += p.tracks.filter((t) => t.label !== 'person').length;
      ppl += p.tracks.filter((t) => t.label === 'person').length;
      const s = p.lot.summary(); occ += s.occupied; tot += s.total;
    }
    $('k-cams').textContent = live.length;
    $('k-cams-sub').textContent = `of ${state.cameras.length} camera${state.cameras.length === 1 ? '' : 's'} active`;
    $('k-dets').textContent = veh + ppl;
    $('k-dets-sub').textContent = `${veh} vehicles · ${ppl} people`;
    $('k-occ').textContent = tot ? `${Math.round((occ / tot) * 100)}%` : '--';
    $('k-occ-sub').textContent = tot ? `${occ}/${tot} spaces · ${tot - occ} free` : 'draw spaces in Space Designer';
    $('k-alerts').textContent = alertCount;
    const vs = visionStatus();
    const inf = sel?.task === 'zones' || !state.perf.poseMs ? state.perf.detMs : state.perf.poseMs;
    $('k-inf').textContent = inf ? inf.toFixed(0) : '--';
    $('k-inf-sub').textContent = `ms / frame · ${vs.delegate.detector ?? vs.delegate.pose ?? (live.some((c) => c.isSim) ? 'sim' : '—')}`;
    $('k-up').textContent = fmtDur(up);
    $('k-fps').textContent = `${state.perf.fps.toFixed(0)} fps render`;
    if (sel) {
      $('stage-name').textContent = sel.name;
      $('stage-kind').textContent = `${KIND_LABEL[sel.kind]} · ${sel.status.toUpperCase()}`;
      renderOccMap($('occ-map'), sel, null);
      const s = pipe(sel).lot.summary();
      $('occ-sum').textContent = s.total ? `${s.free} free / ${s.total}` : '';
      const lines = pipe(sel).lot.state.filter((x) => x.zone.kind === 'line');
      $('counts').innerHTML = lines.map((l) => `<div><span>${esc(l.zone.name)}</span><b>↑ ${l.countIn}</b><b>↓ ${l.countOut}</b></div>`).join('')
        + (s.restrictedBusy ? `<div class="warn">⚠ ${s.restrictedBusy} restricted zone(s) occupied</div>` : '');
    }
    renderMiniKin();
  }
  if (view === 'kinetics') renderKinetics();
  if (view === 'history') renderHistory(false);
  if (view === 'system') renderSystem();
}

function renderOccMap(el, cam, bits) {
  const spaces = cam.zones.filter((z) => z.kind === 'space');
  if (!spaces.length) { el.innerHTML = '<p class="muted">No spaces yet. Draw them in <a href="#" data-goto="designer">Space Designer</a>.</p>'; el.querySelector('a').onclick = (e) => { e.preventDefault(); go('designer'); }; return; }
  const st = new Map(pipe(cam).lot.state.map((s) => [s.zone.id, s]));
  const now = Date.now();
  const sig = spaces.map((z, i) => (bits ? bits[i] : st.get(z.id)?.occupied ? '1' : '0')).join('');
  if (el.dataset.sig === sig && el.dataset.cam === cam.id && bits) return;
  el.dataset.sig = sig; el.dataset.cam = cam.id;
  el.innerHTML = spaces.map((z, i) => {
    const s = st.get(z.id);
    const occ = bits ? bits[i] === '1' : s?.occupied;
    const dwell = !bits && occ && s?.since ? fmtDur(now - s.since) : '';
    return `<div class="space ${occ ? 'occ' : 'free'}" title="${esc(z.name)}"><b>${esc(z.name.replace(/^Space\s*/i, ''))}</b><small>${occ ? dwell || 'occupied' : 'free'}</small></div>`;
  }).join('');
}

function renderMiniKin() {
  const f = state.kinFrame;
  const sel = selected();
  $('mini-kin').hidden = !sel || sel.task === 'zones';
  if (!f) return;
  const v = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '--');
  $('mini-kv').innerHTML = `
    <div><span>Knee</span><b>${v(f.knee)}°</b></div><div><span>Hip</span><b>${v(f.hip)}°</b></div>
    <div><span>Reps</span><b>${f.reps}</b></div><div><span>Fatigue</span><b>${v(f.fatigue)}%</b></div>
    <div><span>Speed</span><b>${v(f.speed, 2)} m/s</b></div><div><span>Force</span><b>${v(f.force)} N</b></div>
    ${f.flags.length ? `<div class="warn full">⚠ ${esc(f.flags.join(' · '))}</div>` : ''}`;
}

function renderFeeds() {
  const item = (e) => `<li class="${e.level}">${e.snapshot ? `<img src="${e.snapshot}" alt="">` : ''}<div><b>${esc(e.title)}</b><span>${esc(e.detail)}</span><small>${fmtTime(e.t)}${e.camera ? ` · ${esc(e.camera)}` : ''}</small></div></li>`;
  $('feed').innerHTML = state.events.slice(0, 40).map(item).join('') || '<li class="muted">No events yet.</li>';
  $('alert-log').innerHTML = state.events.filter((e) => e.rule).slice(0, 200).map(item).join('') || '<li class="muted">No alerts yet.</li>';
}

/* ---------------------------------------------------------------- kinetics */

function renderKinetics() {
  const k = state.kin;
  const f = state.kinFrame;
  $('kin-rec').textContent = `${state.posePaused ? 'PAUSED' : 'REC'} · ${state.perf.fps.toFixed(0)} fps`;
  const sel = selected();
  const vs = visionStatus();
  $('kin-state').textContent = !sel ? 'No camera selected'
    : sel.task === 'zones' ? 'This camera is set to zones only. Change it in Cameras & Devices.'
      : sel.kind !== 'sim-athlete' && vs.pose !== 'ready' ? `Pose model: ${vs.pose}…`
        : f ? `● Tracking: pose detection active${f.calibrated ? ' · scale calibrated' : ' · stand tall to calibrate scale'}` : 'Tracking: waiting for a person…';
  $('kin-muscles').innerHTML = MUSCLES.map((m) => {
    const v = f?.activation[m] ?? 0;
    return `<div class="muscle"><div class="mh"><span>${m}</span><b style="color:${heatColor(v)}">${v}%</b></div><div class="mbar"><i style="width:${v}%;background:linear-gradient(90deg,#2a5ac8,${heatColor(v)})"></i></div><canvas class="heat" data-m="${m}"></canvas></div>`;
  }).join('');
  $('kin-muscles').querySelectorAll('canvas.heat').forEach((c) => heatStrip(c, k.heat(c.dataset.m)));
  const names = { Shoulder: 'Shoulder', Elbow: 'Elbow', Hip: 'Hip', Knee: 'Knee', Ankle: 'Ankle' };
  $('kin-angles').innerHTML = `<tr><th></th><th>Left</th><th>Right</th><th>ROM L</th><th>ROM R</th></tr>${Object.keys(names).map((j) => {
    const L = k.angles[`l${j}`]; const R = k.angles[`r${j}`];
    const rl = k.rom[`l${j}`]; const rr = k.rom[`r${j}`];
    const v = (x) => (Number.isFinite(x) ? `${Math.round(x)}°` : '–');
    const r = (o) => (o ? `${Math.round(o.min)}–${Math.round(o.max)}°` : '–');
    return `<tr><td>${j}</td><td>${v(L)}</td><td>${v(R)}</td><td class="muted">${r(rl)}</td><td class="muted">${r(rr)}</td></tr>`;
  }).join('')}<tr><td>Trunk lean</td><td colspan="4">${Number.isFinite(f?.trunk) ? `${Math.round(f.trunk)}°` : '–'}</td></tr>`;
  $('kin-reps').textContent = k.reps.length;
  const last = k.reps[k.reps.length - 1];
  $('kin-repinfo').innerHTML = last ? `last: depth ${Math.round(last.depth)}° · down ${last.eccentricS.toFixed(2)}s · up ${last.concentricS.toFixed(2)}s · ${Math.round(last.velocity)}°/s` : k.exercise === 'run' ? 'running mode: cadence, stride, impact' : `${EXERCISES[k.exercise].label}: below ${EXERCISES[k.exercise].active}° then back above ${EXERCISES[k.exercise].rest}°`;
  $('kin-flags').innerHTML = f?.flags.length ? f.flags.map((x) => `<span class="flag">⚠ ${esc(x)}</span>`).join('') : '<span class="ok">✓ No form-risk cues</span>';
  const v = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '--');
  $('s-speed').textContent = `${v(f?.speed, 2)} m/s`;
  $('s-speed-sub').textContent = Number.isFinite(f?.speed) ? `${(f.speed * 3.6).toFixed(1)} km/h${state.settings.treadmillKmh ? ' · treadmill' : ''}` : '';
  $('s-force').textContent = `${v(f?.force, 0)} N`;
  $('s-force-sub').textContent = f ? `${(f.force / (k.massKg * 9.80665)).toFixed(2)}× BW · peak/rep ${last ? Math.round(last.peakForce) : '–'} N` : '';
  $('s-fat').textContent = `${v(f?.fatigue, 0)}%`;
  $('s-fat-sub').textContent = k.exercise === 'run' ? 'cadence loss vs. first 10 steps' : 'rep velocity loss vs. best of first 3';
  $('s-cad').textContent = f?.cadence ? `${Math.round(f.cadence)} spm` : '--';
  $('s-cad-sub').textContent = Number.isFinite(f?.stepLength) ? `step ${f.stepLength.toFixed(2)} m` : '';
  $('s-imp').textContent = `${v(f?.impactG, 2)} G`;
  $('s-imp-sub').textContent = k.imu && performance.now() / 1000 - k.imu.t < 1 ? 'phone IMU' : 'vision (CoM accel.)';
  lineChart($('c-speed'), [{ data: spark.speed, color: '#f5d90a', fill: true }], { axes: false, min: 0 });
  lineChart($('c-force'), [{ data: spark.force, color: '#f5d90a', fill: true }], { axes: false });
  lineChart($('c-fat'), [{ data: spark.fat, color: '#ff9f43', fill: true }], { axes: false, min: 0, max: 100 });
  lineChart($('c-cad'), [{ data: spark.cad, color: '#39e0c8', fill: true }], { axes: false });
  lineChart($('c-imp'), [{ data: spark.imp, color: '#ff4d4f', fill: true }], { axes: false, min: 0 });
}

/* ---------------------------------------------------------------- history */

let scrubLive = true;
function renderHistory(force) {
  const sel = selected();
  if (!sel) return;
  const p = pipe(sel);
  const smp = p.lot.samples;
  const scrub = $('h-scrub');
  scrub.max = Math.max(0, smp.length - 1);
  if (scrubLive) scrub.value = scrub.max;
  const i = +scrub.value;
  const pct = smp.map((s) => (s.total ? (s.occ / s.total) * 100 : NaN));
  const labels = smp.length ? [fmtTime(smp[0].t), fmtTime(smp[Math.floor(smp.length / 2)].t), fmtTime(smp[smp.length - 1].t)] : [];
  lineChart($('h-chart'), [
    { data: pct, color: '#f5d90a', fill: true },
    { data: smp.map((s) => s.persons), color: '#4fc3f7', width: 1 },
  ], { min: 0, max: 100, xLabels: labels, fmt: (v) => `${Math.round(v)}%`, cursor: smp.length > 1 ? i / (smp.length - 1) : NaN });
  const cur = smp[i];
  $('h-time').textContent = cur ? `${new Date(cur.t).toLocaleString()} · ${cur.occ}/${cur.total} occupied · ${cur.vehicles} vehicles · ${cur.persons} people${scrubLive ? ' · LIVE' : ''}` : 'No history yet: samples are recorded every 5 s while a camera with spaces is live.';
  renderOccMap($('h-map'), sel, cur && !scrubLive ? cur.bits : null);
  if (!force && performance.now() % 1000 > 250) return; // heavier charts ~1 Hz
  const hourly = p.lot.hourly();
  barChart($('h-hour'), hourly, { max: 100, labels: hourly.map((_, h) => String(h)), colorFn: (v) => heatColor(v) });
  const rows = p.lot.analytics(Date.now());
  barChart($('h-util'), rows.map((r) => r.utilisation), { max: 100, labels: rows.map((r) => r.name.replace(/^Space\s*/i, '')), colorFn: (v) => heatColor(v) });
  $('h-table').innerHTML = `<tr><th>Space</th><th>Status</th><th>Utilisation</th><th>Turnovers</th><th>Avg stay</th><th>Current stay</th></tr>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td><span class="pill ${r.occupied ? 'occ' : 'free'}">${r.occupied ? 'occupied' : 'free'}</span></td><td>${r.utilisation.toFixed(1)}%</td><td>${r.turnovers}</td><td>${r.meanDwell ? fmtDur(r.meanDwell) : '–'}</td><td>${r.currentDwell ? fmtDur(r.currentDwell) : '–'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No spaces on this camera.</td></tr>'}`;
  const reps = state.kin.reps;
  $('h-reps').innerHTML = `<tr><th>#</th><th>Depth</th><th>Down (s)</th><th>Up (s)</th><th>Velocity</th><th>Peak force</th></tr>${reps.map((r) => `<tr><td>${r.n}</td><td>${Math.round(r.depth)}°</td><td>${r.eccentricS.toFixed(2)}</td><td>${r.concentricS.toFixed(2)}</td><td>${Math.round(r.velocity)}°/s</td><td>${Math.round(r.peakForce)} N</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No reps recorded yet.</td></tr>'}`;
}

/* ---------------------------------------------------------------- designer */

const des = { tool: 'select', pts: [], drag: null, selId: null, rowN: 8, hover: null };

function desToNorm(e) {
  const c = $('des-canvas');
  const r = c.getBoundingClientRect();
  return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
}

function nextName(cam, kind) {
  const base = { space: 'Space', restricted: 'Zone', line: 'Line' }[kind];
  const nums = cam.zones.filter((z) => z.kind === kind).map((z) => parseInt(z.name.replace(/\D+/g, ''), 10)).filter(Number.isFinite);
  return `${base} ${(nums.length ? Math.max(...nums) : 0) + 1}`;
}

function finishShape() {
  const cam = selected();
  if (!cam) return;
  const t = des.tool;
  const P = des.pts.map((p) => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4) }));
  if ((t === 'space' || t === 'restricted') && P.length >= 3) {
    cam.zones.push({ id: `z${Date.now().toString(36)}`, name: nextName(cam, t), kind: t, points: P });
  } else if (t === 'line' && P.length === 2) {
    cam.zones.push({ id: `z${Date.now().toString(36)}`, name: nextName(cam, 'line'), kind: 'line', points: P });
  } else if (t === 'row' && P.length === 4) {
    subdivideQuad(P, des.rowN).forEach((poly, i) => {
      cam.zones.push({ id: `z${Date.now().toString(36)}${i}`, name: nextName(cam, 'space'), kind: 'space', points: poly.map((p) => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4) })) });
    });
  } else return;
  des.pts = [];
  zonesChanged(cam);
  renderZoneList();
}

function drawDesigner(cam) {
  const canvas = $('des-canvas');
  drawFrame(canvas, cam, { zones: true, boxes: $('des-test').checked, pose: false }, window.innerHeight * 0.66);
  const g = canvas.getContext('2d');
  const W = canvas.width; const H = canvas.height; const dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const z of cam.zones) {
    const sel = z.id === des.selId;
    for (const p of z.points) {
      g.fillStyle = sel ? '#fff' : '#ffffff99';
      g.beginPath(); g.arc(p.x * W, p.y * H, (sel ? 5 : 3) * dpr, 0, 7); g.fill();
    }
    if (sel) {
      g.strokeStyle = '#fff'; g.lineWidth = 2.5 * dpr; g.beginPath();
      z.points.forEach((p, i) => (i ? g.lineTo(p.x * W, p.y * H) : g.moveTo(p.x * W, p.y * H)));
      if (z.kind !== 'line') g.closePath();
      g.stroke();
    }
  }
  if (des.pts.length) {
    const pts = des.hover ? [...des.pts, des.hover] : des.pts;
    g.strokeStyle = '#f5d90a'; g.lineWidth = 2 * dpr; g.setLineDash([6 * dpr, 4 * dpr]);
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x * W, p.y * H) : g.moveTo(p.x * W, p.y * H)));
    if (des.tool === 'row' && pts.length === 4) g.closePath();
    g.stroke(); g.setLineDash([]);
    des.pts.forEach((p, i) => { g.fillStyle = i === 0 ? '#3ddc84' : '#f5d90a'; g.beginPath(); g.arc(p.x * W, p.y * H, 5 * dpr, 0, 7); g.fill(); });
    if (des.tool === 'row' && des.pts.length >= 3) {
      const quad = des.pts.length === 4 ? des.pts : des.hover ? [...des.pts, des.hover] : null;
      if (quad?.length === 4) {
        g.strokeStyle = '#f5d90a88'; g.lineWidth = 1 * dpr;
        for (const poly of subdivideQuad(quad, des.rowN)) { g.beginPath(); poly.forEach((p, i) => (i ? g.lineTo(p.x * W, p.y * H) : g.moveTo(p.x * W, p.y * H))); g.closePath(); g.stroke(); }
      }
    }
  }
}

function hitVertex(cam, n) {
  const c = $('des-canvas'); const r = c.getBoundingClientRect();
  for (const z of cam.zones) {
    for (let i = 0; i < z.points.length; i++) {
      const p = z.points[i];
      if (Math.hypot((p.x - n.x) * r.width, (p.y - n.y) * r.height) < 12) return { z, i };
    }
  }
  return null;
}

function setupDesigner() {
  const c = $('des-canvas');
  const rowWrap = document.createElement('label');
  rowWrap.className = 'rown'; rowWrap.hidden = true;
  rowWrap.innerHTML = 'Spaces in row <input type="number" min="1" max="60" value="8">';
  const finish = document.createElement('button');
  finish.textContent = '✓ Finish shape'; finish.className = 'finish'; finish.hidden = true;
  finish.onclick = finishShape;
  $('des-tools').insertBefore(rowWrap, $('des-tools').querySelector('.spacer'));
  $('des-tools').insertBefore(finish, $('des-tools').querySelector('.spacer'));
  rowWrap.querySelector('input').oninput = (e) => { des.rowN = Math.max(1, Math.min(60, +e.target.value || 1)); };
  const hints = {
    select: 'Drag a vertex to adjust a zone. Click a zone to select it, then press Delete to remove it.',
    space: 'Click the corners of a parking space (3 or more). Click the first point, double-click, or press Enter to finish.',
    row: 'Click the 4 corners of a whole row: front-left, front-right, back-right, back-left. It splits into equal bays.',
    restricted: 'Outline an area where a person entering raises an alert (loading bay, pool edge, track).',
    line: 'Click two points to draw a count line. The arrow shows the "in" direction (from its left to its right).',
  };
  $('des-tools').querySelectorAll('[data-tool]').forEach((b) => b.onclick = () => {
    des.tool = b.dataset.tool; des.pts = [];
    $('des-tools').querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x === b));
    rowWrap.hidden = des.tool !== 'row';
    $('des-hint').textContent = hints[des.tool];
  });
  const update = () => { finish.hidden = !des.pts.length || des.tool === 'select'; };
  c.addEventListener('pointerdown', (e) => {
    const cam = selected(); if (!cam) return;
    const n = desToNorm(e);
    if (des.tool === 'select') {
      const hit = hitVertex(cam, n);
      if (hit) { des.drag = hit; des.selId = hit.z.id; c.setPointerCapture(e.pointerId); renderZoneList(); return; }
      const inside = [...cam.zones].reverse().find((z) => z.kind !== 'line' && pipe(cam).lot.state.find((s) => s.zone === z) && pointIn(n, z.points));
      des.selId = inside?.id ?? null; renderZoneList();
      return;
    }
    if (des.pts.length >= 3 && (des.tool === 'space' || des.tool === 'restricted')) {
      const r = c.getBoundingClientRect(); const f = des.pts[0];
      if (Math.hypot((f.x - n.x) * r.width, (f.y - n.y) * r.height) < 14) { finishShape(); update(); return; }
    }
    des.pts.push(n);
    if ((des.tool === 'line' && des.pts.length === 2) || (des.tool === 'row' && des.pts.length === 4)) finishShape();
    update();
  });
  c.addEventListener('pointermove', (e) => {
    const n = desToNorm(e);
    des.hover = des.pts.length ? n : null;
    if (des.drag) {
      des.drag.z.points[des.drag.i] = { x: +n.x.toFixed(4), y: +n.y.toFixed(4) };
    }
  });
  c.addEventListener('pointerup', () => { if (des.drag) { des.drag = null; const cam = selected(); if (cam) zonesChanged(cam); } });
  c.addEventListener('dblclick', () => { if (des.pts.length >= 3) { des.pts.pop(); finishShape(); update(); } });
  window.addEventListener('keydown', (e) => {
    if (view !== 'designer' || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    if (e.key === 'Enter') { finishShape(); update(); }
    if (e.key === 'Escape') { des.pts = []; update(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && des.selId) {
      const cam = selected(); cam.zones = cam.zones.filter((z) => z.id !== des.selId); des.selId = null; zonesChanged(cam); renderZoneList();
    }
  });
  $('des-undo').onclick = () => { des.pts.pop(); update(); };
  $('des-clear').onclick = () => { des.pts = []; update(); };
  // Tuning.
  const s = state.settings;
  const bind = (id, key, fmt, apply) => {
    const el = $(id); el.value = s[key];
    const out = $(`${id}-v`); if (out) out.textContent = fmt(s[key]);
    el.oninput = () => { s[key] = +el.value; if (out) out.textContent = fmt(s[key]); apply?.(); persist(); };
  };
  const applyLot = () => { for (const p of state.pipelines.values()) Object.assign(p.lot.settings, lotSettings()); };
  bind('t-cover', 'coverMin', (v) => `${Math.round(v * 100)}%`, applyLot);
  bind('t-enter', 'enterS', String, applyLot);
  bind('t-exit', 'exitS', String, applyLot);
  bind('t-score', 'minScore', (v) => `${Math.round(v * 100)}%`);
  bind('t-fps', 'detectFps', String);
}

function pointIn(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]; const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function renderZoneList() {
  const cam = selected();
  const ul = $('des-zones');
  if (!cam) { ul.innerHTML = '<li class="muted">Add a camera first.</li>'; return; }
  $('des-count').textContent = `${cam.zones.filter((z) => z.kind === 'space').length} spaces · ${cam.zones.length} total`;
  ul.innerHTML = cam.zones.map((z) => `
    <li class="${z.id === des.selId ? 'on' : ''}" data-id="${z.id}">
      <i class="kind ${z.kind}"></i>
      <input value="${esc(z.name)}" aria-label="Zone name">
      <select class="k" aria-label="Kind"><option value="space" ${z.kind === 'space' ? 'selected' : ''}>space</option><option value="restricted" ${z.kind === 'restricted' ? 'selected' : ''}>restricted</option>${z.kind === 'line' ? '<option value="line" selected>line</option>' : ''}</select>
      <select class="a" aria-label="Counts"><option value="">default</option><option value="vehicle" ${z.accepts === 'vehicle' ? 'selected' : ''}>vehicles</option><option value="person" ${z.accepts === 'person' ? 'selected' : ''}>people</option><option value="any" ${z.accepts === 'any' ? 'selected' : ''}>any</option></select>
      <button class="x" aria-label="Delete">✕</button>
    </li>`).join('') || '<li class="muted">No zones yet. Pick a tool and draw on the image.</li>';
  ul.querySelectorAll('li[data-id]').forEach((li) => {
    const z = cam.zones.find((x) => x.id === li.dataset.id);
    li.onclick = (e) => { if (e.target.tagName === 'LI' || e.target.tagName === 'I') { des.selId = z.id; renderZoneList(); } };
    li.querySelector('input').onchange = (e) => { z.name = e.target.value.trim() || z.name; zonesChanged(cam); };
    li.querySelector('select.k').onchange = (e) => { if (z.kind !== 'line') { z.kind = e.target.value; zonesChanged(cam); renderZoneList(); } };
    li.querySelector('select.a').onchange = (e) => { if (e.target.value) z.accepts = e.target.value; else delete z.accepts; zonesChanged(cam); };
    li.querySelector('.x').onclick = () => { cam.zones = cam.zones.filter((x) => x !== z); zonesChanged(cam); renderZoneList(); };
  });
}

/* ----------------------------------------------------------------- cameras */

let formKind = null;
async function openForm(kind) {
  go('cameras');
  formKind = kind;
  const f = $('cam-form');
  f.hidden = false;
  $('cf-title').textContent = `New ${KIND_LABEL[kind].toLowerCase()}`;
  $('cf-name').value = { webcam: 'Device camera', screen: 'Mirrored app', file: 'Recorded video', url: 'Stream', rtsp: 'IP camera' }[kind] ?? 'Camera';
  $('cf-dev-l').hidden = kind !== 'webcam';
  $('cf-url-l').hidden = !(kind === 'url' || kind === 'rtsp');
  $('cf-relay-l').hidden = kind !== 'rtsp';
  $('cf-file-l').hidden = kind !== 'file';
  $('cf-url').placeholder = kind === 'rtsp' ? 'rtsp://user:pass@192.168.1.20:554/stream1' : 'https://…/live.m3u8 · http://cam/video.mjpg · https://…/clip.mp4';
  $('cf-msg').textContent = '';
  if (kind === 'webcam') {
    const devs = await listDevices();
    $('cf-dev').innerHTML = `<option value="facing:environment">Back camera (phones)</option><option value="facing:user">Front camera / default webcam</option>${devs.filter((d) => d.deviceId).map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || `Camera ${i + 1}`)}</option>`).join('')}`;
  }
  $('cf-name').focus();
}

async function submitForm(e) {
  e.preventDefault();
  const kind = formKind;
  const cfg = { kind, name: $('cf-name').value.trim() || 'Camera', task: $('cf-task').value };
  if (kind === 'webcam') {
    const v = $('cf-dev').value;
    if (v.startsWith('facing:')) cfg.facing = v.slice(7); else cfg.deviceId = v;
  }
  if (kind === 'url' || kind === 'rtsp') cfg.url = $('cf-url').value.trim();
  if (kind === 'rtsp') cfg.relay = $('cf-relay').value.trim();
  const cam = new Camera(cfg);
  if (kind === 'file') cam.file = $('cf-file').files[0] ?? null;
  $('cf-msg').textContent = 'Connecting…';
  $('cf-msg').classList.remove('err');
  try {
    await cam.start();
    state.cameras.push(cam);
    state.selectedId = cam.id;
    $('cam-form').hidden = true;
    persist();
    afterCamerasChanged();
    toast(`${cam.name} connected`);
    go(cam.task === 'kinetics' ? 'kinetics' : 'dashboard');
  } catch (err) {
    $('cf-msg').textContent = err.message;
    $('cf-msg').classList.add('err');
  }
}

async function addQuick(kind) {
  if (kind === 'webcam' || kind === 'screen') {
    const cam = new Camera({ kind, name: kind === 'webcam' ? 'Device camera' : 'Mirrored app', facing: 'user' });
    try { await cam.start(); } catch (e) { toast(e.message, 'high'); return; }
    state.cameras.push(cam); state.selectedId = cam.id;
  } else if (kind === 'sim-lot' || kind === 'sim-athlete') {
    let cam = state.cameras.find((c) => c.kind === kind);
    if (!cam) { cam = new Camera({ kind, name: kind === 'sim-lot' ? 'Lot A · simulated' : 'Athlete · simulated' }); state.cameras.push(cam); }
    if (cam.status !== 'live') await cam.start();
    if (kind === 'sim-lot') zonesChanged(cam);
    state.selectedId = cam.id;
  } else { openForm(kind); return; }
  persist();
  afterCamerasChanged();
}

function afterCamerasChanged() {
  renderCamSelect();
  renderCameras();
  renderZoneList();
  ensureModels();
}

function selectCam(id) {
  state.selectedId = id;
  state.kin.resetSet();
  state.kinFrame = null;
  Object.values(spark).forEach((a) => { a.length = 0; });
  persist();
  afterCamerasChanged();
}

function renderCamSelect() {
  const s = $('cam-select');
  s.innerHTML = state.cameras.map((c) => `<option value="${c.id}" ${c.id === state.selectedId ? 'selected' : ''}>${esc(c.name)}${c.status !== 'live' ? ` (${c.status})` : ''}</option>`).join('') || '<option>No cameras</option>';
}

function renderCameras() {
  const ul = $('cam-list');
  ul.innerHTML = state.cameras.map((c) => `
    <li data-id="${c.id}" class="${c.id === state.selectedId ? 'on' : ''}">
      <i class="dot ${c.status}"></i>
      <div class="cm"><input value="${esc(c.name)}" aria-label="Camera name"><small>${KIND_LABEL[c.kind]} · ${c.status}${c.url ? ` · ${esc(c.url.replace(/\/\/[^@/]*@/, '//***@'))}` : ''} · ${c.zones.length} zones</small>${c.error ? `<small class="err">${esc(c.error)}</small>` : ''}</div>
      <select class="task" aria-label="Analysis"><option value="both" ${c.task === 'both' ? 'selected' : ''}>zones + kinetics</option><option value="zones" ${c.task === 'zones' ? 'selected' : ''}>zones</option><option value="kinetics" ${c.task === 'kinetics' ? 'selected' : ''}>kinetics</option></select>
      ${c.kind === 'sim-athlete' ? `<select class="simm"><option value="squat" ${c.simMode === 'squat' ? 'selected' : ''}>squats</option><option value="run" ${c.simMode === 'run' ? 'selected' : ''}>running</option></select>` : ''}
      ${c.kind === 'file' && !c.file ? '<label class="btn sm">Choose file<input type="file" accept="video/*" hidden class="refile"></label>' : ''}
      <button class="btn sm view">View</button>
      <button class="btn sm toggle">${c.status === 'live' ? 'Stop' : 'Start'}</button>
      <button class="btn sm danger rm">✕</button>
    </li>`).join('') || '<li class="muted">No cameras yet. Add one on the left, or press “Demo feeds”.</li>';
  ul.querySelectorAll('li[data-id]').forEach((li) => {
    const cam = state.cameras.find((c) => c.id === li.dataset.id);
    li.querySelector('input').onchange = (e) => { cam.name = e.target.value.trim() || cam.name; persist(); renderCamSelect(); };
    li.querySelector('.task').onchange = (e) => { cam.task = e.target.value; persist(); ensureModels(); };
    const sm = li.querySelector('.simm');
    if (sm) sm.onchange = (e) => { cam.simMode = e.target.value; state.kin.exercise = e.target.value === 'run' ? 'run' : 'squat'; state.settings.exercise = state.kin.exercise; $('kin-ex').value = state.kin.exercise; state.kin.resetSet(); cam.startedAt = performance.now(); persist(); };
    const rf = li.querySelector('.refile');
    if (rf) rf.onchange = async () => { cam.file = rf.files[0]; try { await cam.start(); } catch (e) { toast(e.message, 'high'); } afterCamerasChanged(); };
    li.querySelector('.view').onclick = () => { selectCam(cam.id); go('dashboard'); };
    li.querySelector('.toggle').onclick = async () => {
      if (cam.status === 'live') cam.stop();
      else { try { await cam.start(); } catch (e) { toast(e.message, 'high'); } }
      afterCamerasChanged();
    };
    li.querySelector('.rm').onclick = () => {
      cam.stop();
      state.cameras = state.cameras.filter((c) => c !== cam);
      state.pipelines.delete(cam.id);
      if (state.selectedId === cam.id) state.selectedId = state.cameras[0]?.id ?? null;
      persist(); afterCamerasChanged();
    };
  });
}

/* ------------------------------------------------------------------ alerts */

function renderRules() {
  $('rules').innerHTML = state.rules.map((r) => `
    <div class="rule" data-id="${r.id}">
      <label class="toggle"><input type="checkbox" ${r.enabled ? 'checked' : ''}> ${esc(r.label)}</label>
      ${Object.entries(r.params).map(([k, v]) => `<input type="number" data-k="${k}" value="${v}" step="any"> <span class="muted">${r.unit ?? ''}</span>`).join('')}
      <span class="muted cd">cooldown <input type="number" class="cdv" value="${r.cooldownS}" min="0">s</span>
    </div>`).join('');
  $('rules').querySelectorAll('.rule').forEach((el) => {
    const r = state.rules.find((x) => x.id === el.dataset.id);
    el.querySelector('input[type=checkbox]').onchange = (e) => { r.enabled = e.target.checked; persist(); };
    el.querySelectorAll('input[data-k]').forEach((i) => { i.onchange = () => { r.params[i.dataset.k] = +i.value; persist(); }; });
    el.querySelector('.cdv').onchange = (e) => { r.cooldownS = Math.max(0, +e.target.value); persist(); };
  });
  const s = state.settings;
  for (const [id, key] of [['a-sound', 'sound'], ['a-notify', 'notify'], ['a-snap', 'snapshots']]) {
    $(id).checked = s[key];
    $(id).onchange = async (e) => {
      s[key] = e.target.checked;
      if (key === 'notify' && s.notify && 'Notification' in window && Notification.permission !== 'granted') {
        const p = await Notification.requestPermission();
        if (p !== 'granted') { s.notify = false; e.target.checked = false; toast('Notifications were blocked by the browser.', 'warn'); }
      }
      persist();
    };
  }
  $('a-hook').value = s.webhookUrl;
  $('a-hook').onchange = (e) => { s.webhookUrl = e.target.value.trim(); persist(); };
  $('a-format').value = s.webhookFormat;
  $('a-format').onchange = (e) => { s.webhookFormat = e.target.value; persist(); };
  $('a-test').onclick = () => addEvent({ rule: 'test', level: 'warn', title: 'Test alert', detail: 'VultureSystemV1 alert delivery is working', camera: selected()?.name });
  $('a-clear').onclick = () => { state.events = state.events.filter((e) => !e.rule); renderFeeds(); persist(); };
}

/* ------------------------------------------------------------------ system */

function renderSystem() {
  const vs = visionStatus();
  const sel = selected();
  $('diag').innerHTML = `
    <div><span>MediaPipe Tasks Vision</span><b>v${TASKS_VERSION}</b></div>
    <div><span>Object detector</span><b>${vs.detector}${vs.delegate.detector ? ` · ${vs.delegate.detector}` : ''}</b></div>
    <div><span>Pose landmarker</span><b>${vs.pose}${vs.delegate.pose ? ` · ${vs.delegate.pose}` : ''}</b></div>
    <div><span>Detection latency</span><b>${state.perf.detMs ? `${state.perf.detMs.toFixed(1)} ms` : '–'}</b></div>
    <div><span>Pose latency</span><b>${state.perf.poseMs ? `${state.perf.poseMs.toFixed(1)} ms` : '–'}</b></div>
    <div><span>Render loop</span><b>${state.perf.fps.toFixed(0)} fps</b></div>
    <div><span>Cameras live</span><b>${state.cameras.filter((c) => c.status === 'live').length} / ${state.cameras.length}</b></div>
    <div><span>Selected source</span><b>${sel ? `${esc(sel.name)} · ${sel.frame?.width ?? 0}×${sel.frame?.height ?? 0}` : '–'}</b></div>
    <div><span>Secure context</span><b>${window.isSecureContext ? 'yes (camera allowed)' : 'NO: cameras need HTTPS'}</b></div>
    <div><span>WebGL2</span><b>${!!document.createElement('canvas').getContext('webgl2') ? 'available' : 'unavailable (CPU fallback)'}</b></div>
    ${vs.error && vs.detector !== 'ready' && vs.pose !== 'ready' ? `<div class="full err">${esc(vs.error)}</div>` : ''}`;
}

const TECH = [
  ['Camera ingest', 'getUserMedia (phone/laptop/USB/HDMI capture), getDisplayMedia (mirror DJI Fly, Meta AI, VMS), HLS via hls.js, MJPEG, MP4/WebM, RTSP via the bundled ffmpeg relay', 'live'],
  ['Object detection', 'MediaPipe Tasks ObjectDetector · EfficientDet-Lite0 (COCO) · car, truck, bus, motorcycle, bicycle, person · WebGL GPU delegate, WASM-SIMD CPU fallback', 'live'],
  ['Tracking', 'SORT-style IoU + centroid association, class families (car↔truck), miss tolerance, stable IDs', 'live'],
  ['Occupancy engine', 'Polygon coverage sampling + ground-contact test, time-debounced enter/exit, dwell, turnover, utilisation, hourly profile, 5 s history samples, CSV export', 'live'],
  ['Space designer', 'Polygons, 4-corner row subdivision (bilinear), restricted zones, directed count lines, vertex editing, normalised coords (resolution-independent)', 'live'],
  ['Pose / kinetics', 'MediaPipe PoseLandmarker (BlazePose lite/full), 33 landmarks + metric 3-D world landmarks, One-Euro filtering, joint angles, ROM, rep detection, velocity-loss fatigue, F = m(g + a)', 'live'],
  ['Muscle activation', 'Kinematic demand model, mapped across the range of motion. An estimate, not EMG: real activation needs surface EMG sensors', 'estimate'],
  ['Phone IMU', 'DeviceMotion accelerometer → impact G (iOS asks for permission)', 'live'],
  ['Route safety', 'OSRM foot/bike routing (FOSSGIS), Overpass (lamps, lit, surface, highway, POIs), Open-Meteo elevation (Copernicus DEM) + weather, NOAA solar altitude, segment risk model, live GPS risk-ahead', 'live'],
  ['Map', 'Leaflet 1.9 + OpenStreetMap tiles. Google Maps opens as a deep link (embedding Google’s tiles needs a paid API key)', 'live'],
  ['Alerts', 'Rules with cooldowns, frame snapshots, sound, system notifications, webhook (JSON / ntfy.sh plain text)', 'live'],
  ['Privacy', 'All inference on-device; no backend; config and 4 h history in localStorage', 'live'],
  ['Not in a browser build', 'Thermal IR and LiDAR fusion, Ray-Ban Meta direct SDK access (Meta only allows livestreaming/mirroring), DJI MSDK native telemetry, TensorRT/Jetson. These need native apps or edge hardware.', 'roadmap'],
];

function renderTech() {
  $('tech').innerHTML = `<table class="data"><tr><th>Layer</th><th>Implementation</th><th>Status</th></tr>${TECH.map(([a, b, c]) => `<tr><td><b>${a}</b></td><td>${b}</td><td><span class="pill ${c}">${c}</span></td></tr>`).join('')}</table>`;
}

/* ----------------------------------------------------------------- toasts */

function toast(text, level = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${level}`;
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 4800);
}

/* ------------------------------------------------------------- navigation */

const TITLES = { dashboard: 'Live Monitor', kinetics: 'Kinetics · Live Monitor', route: 'Route Safety Prediction', history: 'History & Analytics', cameras: 'Cameras & Devices', designer: 'Space Designer', alerts: 'Alerts', system: 'System & Tech' };

function go(v) {
  view = v;
  document.querySelectorAll('#nav [data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  document.querySelectorAll('.view').forEach((s) => s.classList.toggle('on', s.id === `view-${v}`));
  $('view-title').textContent = TITLES[v];
  document.body.classList.remove('nav-open');
  if (v === 'alerts') unseen = 0;
  if (v === 'route') routeUi.show();
  if (v === 'designer') renderZoneList();
  if (v === 'history') renderHistory(true);
  if (v === 'system') { renderSystem(); renderTech(); }
  if (v === 'cameras') renderCameras();
  history.replaceState(null, '', `#${v}`);
}

function download(name, text, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function exportConfig() {
  download('vulture-config.json', JSON.stringify({ version: 1, cameras: state.cameras.map((c) => c.toJSON()), settings: state.settings, rules: state.rules }, null, 2), 'application/json');
}

/* ------------------------------------------------------------------ setup */

function setupKineticsControls() {
  const s = state.settings;
  const k = state.kin;
  $('kin-ex').innerHTML = Object.entries(EXERCISES).map(([id, e]) => `<option value="${id}">${e.label}</option>`).join('');
  Object.assign(k, { massKg: s.massKg, heightM: s.heightM, exercise: s.exercise, treadmillMs: s.treadmillKmh / 3.6 });
  $('kin-ex').value = s.exercise;
  $('kin-mass').value = s.massKg;
  $('kin-height').value = s.heightM;
  $('kin-tread').value = s.treadmillKmh;
  $('kin-model').value = s.poseModel;
  $('kin-ex').onchange = (e) => { s.exercise = k.exercise = e.target.value; k.resetSet(); persist(); };
  $('kin-mass').onchange = (e) => { s.massKg = k.massKg = Math.max(20, +e.target.value || 75); persist(); };
  $('kin-height').onchange = (e) => { s.heightM = k.heightM = Math.max(1, +e.target.value || 1.75); k.mpu = null; k.standUnits = []; persist(); };
  $('kin-tread').onchange = (e) => { s.treadmillKmh = Math.max(0, +e.target.value || 0); k.treadmillMs = s.treadmillKmh / 3.6; persist(); };
  $('kin-model').onchange = (e) => { s.poseModel = e.target.value; unloadPose(); poseWanted = false; persist(); ensureModels(); };
  $('kin-pause').onclick = () => { state.posePaused = !state.posePaused; $('kin-pause').textContent = state.posePaused ? '▶ Resume' : '❚❚ Pause'; };
  $('kin-cal').onclick = () => { k.mpu = null; k.standUnits = []; k.rom = {}; toast('Calibrating: stand tall, side-on, head to feet in frame for 2 seconds.'); };
  $('kin-reset').onclick = () => { k.resetSet(); Object.values(spark).forEach((a) => { a.length = 0; }); toast('New set started.'); };
  $('kin-export').onclick = () => download(`vulture-kinetics-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.csv`, k.toCsv());
  $('kin-imu').onclick = async () => {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const p = await DeviceMotionEvent.requestPermission();
        if (p !== 'granted') throw new Error('Motion permission denied');
      }
      if (typeof DeviceMotionEvent === 'undefined') throw new Error('No motion sensors on this device');
      let got = false;
      window.addEventListener('devicemotion', (e) => {
        const a = e.accelerationIncludingGravity;
        if (!a || a.x === null) return;
        got = true;
        k.pushImu(Math.hypot(a.x, a.y, a.z) / 9.80665, performance.now() / 1000);
      });
      setTimeout(() => toast(got ? 'Phone motion sensors streaming: impact G now comes from the accelerometer.' : 'No motion data received (desktop browsers usually have no accelerometer).', got ? 'info' : 'warn'), 1500);
    } catch (e) { toast(e.message, 'warn'); }
  };
}

async function restore() {
  const saved = loadSaved();
  if (!saved) return;
  Object.assign(state.settings, DEFAULT_SETTINGS, saved.settings ?? {});
  if (Array.isArray(saved.rules)) {
    for (const r of state.rules) {
      const s = saved.rules.find((x) => x.id === r.id);
      if (s) Object.assign(r, { enabled: s.enabled, cooldownS: s.cooldownS, params: { ...r.params, ...s.params } });
    }
  }
  state.events = Array.isArray(saved.events) ? saved.events : [];
  state.cameras = (saved.cameras ?? []).map((c) => new Camera(c));
  state.selectedId = saved.selectedId;
  for (const cam of state.cameras) {
    const p = pipe(cam);
    const hist = saved.history?.[cam.id];
    if (Array.isArray(hist)) p.lot.samples = hist;
  }
  let camGranted = false;
  try { camGranted = (await navigator.permissions?.query({ name: 'camera' }))?.state === 'granted'; } catch { /* Safari */ }
  for (const cam of state.cameras) {
    if (cam.isSim || cam.kind === 'url' || cam.kind === 'rtsp' || (cam.kind === 'webcam' && camGranted)) {
      cam.start().then(() => { if (cam.kind === 'sim-lot') zonesChanged(cam); afterCamerasChanged(); }, () => afterCamerasChanged());
    }
  }
}

async function init() {
  await restore();
  routeUi = mountRoute($('route-root'), {
    onRisk: (score, text, live) => {
      const r = state.rules.find((x) => x.id === 'route-risk');
      if (score >= r.params.score) raise('route-risk', live ? 'gps' : 'plan', { level: 'high', title: text, detail: `risk ${score}/100`, camera: 'GPS' });
    },
    onGps: (g) => { state.gps = g; },
  });
  document.querySelectorAll('#nav [data-view]').forEach((b) => b.onclick = () => go(b.dataset.view));
  $('nav-toggle').onclick = () => document.body.classList.toggle('nav-open');
  document.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => addQuick(b.dataset.add));
  $('cam-form').onsubmit = submitForm;
  $('cf-cancel').onclick = () => { $('cam-form').hidden = true; };
  $('cam-select').onchange = (e) => selectCam(e.target.value);
  $('quick-demo').onclick = async () => { await addQuick('sim-athlete'); await addQuick('sim-lot'); go('dashboard'); };
  $('h-scrub').oninput = () => { scrubLive = false; renderHistory(false); };
  $('h-live').onclick = () => { scrubLive = true; renderHistory(true); };
  $('h-csv').onclick = () => { const cam = selected(); if (cam) download(`vulture-occupancy-${cam.name.replace(/\W+/g, '-')}.csv`, samplesToCsv(pipe(cam).lot.samples, cam.zones)); };
  $('h-json').onclick = exportConfig;
  $('sys-export').onclick = exportConfig;
  $('sys-import').onchange = async (e) => {
    try {
      const cfg = JSON.parse(await e.target.files[0].text());
      for (const c of state.cameras) c.stop();
      state.cameras = (cfg.cameras ?? []).map((c) => new Camera(c));
      state.pipelines.clear();
      Object.assign(state.settings, cfg.settings ?? {});
      if (cfg.rules) state.rules = cfg.rules;
      state.selectedId = state.cameras[0]?.id ?? null;
      persist();
      for (const cam of state.cameras) if (cam.isSim) await cam.start().catch(() => {});
      afterCamerasChanged(); renderRules();
      toast('Configuration imported. Start non-simulated cameras in Cameras & Devices.');
    } catch (err) { toast(`Import failed: ${err.message}`, 'high'); }
  };
  $('sys-reset').onclick = () => { if (confirm('Remove all cameras, zones, history and settings from this browser?')) { clearSaved(); location.hash = ''; location.reload(); } };
  $('relay-url').textContent = new URL('./relay/rtsp-relay.mjs', location.href).href;
  setupDesigner();
  setupKineticsControls();
  renderRules();
  renderFeeds();
  afterCamerasChanged();
  window.addEventListener('beforeunload', persist);
  const start = (location.hash || '').slice(1);
  go(TITLES[start] ? start : 'dashboard');
  requestAnimationFrame(loop);
  window.vulture = { state, go, addQuick }; // handy for debugging in the console
}

init();

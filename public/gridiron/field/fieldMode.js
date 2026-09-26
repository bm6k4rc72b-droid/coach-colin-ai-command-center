import * as THREE from 'three';
import { PlaySim } from './sim.js';
import { buildStadium, makePlayer, makeBall, W } from './stadium.js';
import { OFFENSE, RECEIVERS, CONCEPTS, COVERAGES, DEFENDER_POS, DRIVE, TIMING, FIELD } from './config.js';
import { sfx, crowdLevel } from '../core/audio.js';
import { bus } from '../core/bus.js';
import { i18n } from '../core/i18n.js';

// FIELD mode: quarterback reads. One drive of five plays. For each play:
//   read the coverage → set protection → call the play → snap → deliver → watch the film.
// The rules are in sim.js; this file handles input, camera, rendering, stages, panels and the debrief.

const ICON = {
  cover: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/>',
  protect: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
  play: '<path d="M4 18l5-6 4 3 7-9"/><path d="M16 6h4v4"/>',
  motion: '<path d="M3 12h13"/><path d="M13 8l4 4-4 4"/><circle cx="20" cy="12" r="1.5"/>',
  snap: '<ellipse cx="12" cy="12" rx="8" ry="5" transform="rotate(-30 12 12)"/><path d="M9 11l6 2M10 13l1-3M13 14l1-3"/>',
  away: '<path d="M4 20L20 4"/><path d="M14 4h6v6"/>',
  cam: '<rect x="3" y="7" width="14" height="10" rx="2"/><path d="M17 10l4-2v8l-4-2"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>',
  next: '<path d="M5 5l8 7-8 7"/><path d="M13 5l8 7-8 7"/>',
  book: '<path d="M4 5h7a2 2 0 012 2v12a2 2 0 00-2-2H4z"/><path d="M20 5h-7a2 2 0 00-2 2v12a2 2 0 012-2h7z"/>',
};
const COVER_IDS = ['c0', 'c1', 'c2', 'c3', 'c4'];
const CONCEPT_IDS = Object.keys(CONCEPTS);
const THROW_KEYS = { q: 'X', w: 'TE', e: 'S', r: 'Z', t: 'RB' };

export class FieldMode {
  constructor(app) {
    this.app = app;
    this.id = 'field';
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 400);
    this.stadium = buildStadium(this.scene);
    this.meshes = {};
    for (const o of OFFENSE) { const m = makePlayer(o.id, 'off', o.id === 'S' ? 'SL' : o.id, RECEIVERS.includes(o.id)); this.meshes[o.id] = m; this.scene.add(m); }
    for (const id of Object.keys(DEFENDER_POS)) { const m = makePlayer(id, 'def', id.replace('_', ''), false); this.meshes[id] = m; this.scene.add(m); }
    // Linemen and the QB stay unlabelled so the labels that matter (receivers, coverage) read clearly.
    for (const [id, m] of Object.entries(this.meshes)) if (['LT', 'LG', 'C', 'RG', 'RT', 'QB'].includes(id) || DEFENDER_POS[id] === 'DL') m.userData.label.visible = false;
    const { ball, trail } = makeBall();
    this.ballMesh = ball; this.trail = trail; this.trailPts = [];
    this.scene.add(ball, trail);
    // The quarterback's eyes: a translucent fan on the turf toward where he looks.
    this.eyesFan = new THREE.Mesh(new THREE.CircleGeometry(14, 24, -0.18, 0.36), new THREE.MeshBasicMaterial({ color: '#3ff3ff', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    this.eyesFan.rotation.x = -Math.PI / 2; this.eyesFan.position.y = 0.05;
    this.scene.add(this.eyesFan);
    this.filmLines = new THREE.Group(); this.scene.add(this.filmLines);
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2(0, -0.2);
    this.pickables = Object.values(this.meshes).flatMap((m) => [m.userData.body, ...m.children.filter((c) => c.isMesh && c.geometry.type === 'SphereGeometry')]);
    this.cam = { mode: 'qb', yaw: 0, zoom: 1, drag: null };
    this.hover = { id: null, t: 0 };
    this.plays = [];
  }

  // ── Mode lifecycle ─────────────────────────────────
  enter() {
    const a = this.app;
    a.stage.use(this.scene, this.camera);
    a.stage.bloom.strength = 0.55; a.stage.bloom.threshold = 0.72;
    a.checklist.setTitle('fld.title');
    a.toolbar.set([
      { id: 'cover', key: '1', icon: ICON.cover, labelKey: 'fld.tool.cover', onSelect: () => this.openChooser('cover'), active: () => !!this.call.coverage, disabled: () => this.sim.snapped },
      { id: 'protect', key: '2', icon: ICON.protect, labelKey: 'fld.tool.protect', onSelect: () => this.openChooser('protect'), active: () => this.call.protectionSet, disabled: () => this.sim.snapped },
      { id: 'play', key: '3', icon: ICON.play, labelKey: 'fld.tool.play', onSelect: () => this.openChooser('play'), active: () => this.call.conceptSet, disabled: () => this.sim.snapped },
      { id: 'motion', key: '4', icon: ICON.motion, labelKey: 'fld.tool.motion', onSelect: () => this.startMotion(), active: () => this.motion === 'done', disabled: () => this.sim.snapped },
      { id: 'snap', key: '5', icon: ICON.snap, labelKey: 'fld.tool.snap', onSelect: () => this.snap(), disabled: () => this.sim.snapped },
      { id: 'away', key: '6', icon: ICON.away, labelKey: 'fld.tool.away', onSelect: () => this.throwAway(), disabled: () => !this.sim.snapped || !!this.sim.ball },
      { id: 'cam', key: '7', icon: ICON.cam, labelKey: 'fld.tool.cam', onSelect: () => { this.cam.mode = this.cam.mode === 'qb' ? 'all22' : 'qb'; }, active: () => this.cam.mode === 'all22' },
      { id: 'film', key: '8', icon: ICON.film, labelKey: 'fld.tool.film', onSelect: () => this.startFilm(), disabled: () => !this.sim.over },
      { id: 'next', key: '9', icon: ICON.next, labelKey: 'fld.tool.next', onSelect: () => this.nextPlay(), disabled: () => !this.sim.over },
      { id: 'book', key: '0', icon: ICON.book, labelKey: 'fld.tool.book', onSelect: () => this.openChooser('book') },
    ], (id) => `fld.rule.${id}`);
    a.live.innerHTML = LIVE_HTML;
    i18n.apply(a.live);
    this.drive = { ballOn: DRIVE.startYard, down: 1, toGo: 10, n: 0 };
    this.plays = [];
    this.coverageBag = null;
    this.newPlay();
    crowdLevel(0.035);
  }
  exit() { crowdLevel(0); this.closeChooser(); this.demo?.stop(); }

  // ── A play ─────────────────────────────────────────
  newPlay() {
    const a = this.app;
    this.drive.n++;
    // Coverage: every coverage appears once in the drive, shuffled.
    if (!this.coverageBag || !this.coverageBag.length) this.coverageBag = [...COVER_IDS].sort(() => Math.random() - 0.5);
    const coverage = this.coverageBag.pop();
    this.call = { coverage: null, protection: { slide: 0, rbStay: false }, protectionSet: false, concept: 'smash', conceptSet: false };
    this.facts = { scanned: false, film: false };
    this.motion = null;
    this.sim = new PlaySim({ coverage, concept: 'smash', protection: this.call.protection });
    this.stare = { id: null, t: 0 };
    this.stareWarned = false;
    this.playClock = TIMING.playClock;
    this.snapTime = null;
    this.resultShown = false;
    this.filmState = null;
    this.autoFilmAt = null;
    this.clearFilm();
    this.trailPts = [];
    this.ballMesh.visible = false; this.trail.visible = false;
    this.cam.mode = 'qb';
    const losZ = 0, firstZ = this.drive.ballOn + this.drive.toGo >= 100 ? 999 : this.drive.toGo;
    this.stadium.setLines(losZ, firstZ);
    // The field is drawn relative to the line of scrimmage; move the stadium, not the players.
    this.stadium.root.position.z = -(this.drive.ballOn - FIELD.losYardLine);
    a.stages.load('fld', STAGES(this), { urgentHint: (c) => this.urgentHint() });
    a.feed.push('fld.feed.newPlay', 'ok', { n: this.drive.n, down: ordinal(this.drive.down), togo: this.drive.toGo, spot: yardText(this.drive.ballOn) });
    this.syncMeshes(0);
    a.toolbar.refresh();
  }

  openChooser(kind) {
    if (this.sim.snapped && kind !== 'book') { sfx.deny(); return; }
    const el = this.app.chooser;
    const q = (c) => el.querySelector(c);
    q('.ch-title').textContent = i18n.t('fld.ch.' + kind);
    const body = q('.ch-body'); body.innerHTML = '';
    const add = (label, sub, on, active = false, cls = '') => {
      const b = document.createElement('button');
      b.className = 'ch-opt ' + cls + (active ? ' active' : '');
      b.innerHTML = `<b></b><small></small>`;
      b.children[0].textContent = label; b.children[1].textContent = sub;
      b.onclick = on; body.appendChild(b); return b;
    };
    if (kind === 'cover') {
      COVER_IDS.forEach((c) => add(i18n.t(`fld.cov.${c}`), i18n.t(`fld.covTell.${c}`), () => { this.call.coverage = c; sfx.select(); this.closeChooser(); this.app.toolbar.refresh(); }, this.call.coverage === c));
    } else if (kind === 'protect') {
      const p = this.call.protection;
      [[-1, 'fld.prot.left'], [0, 'fld.prot.none'], [1, 'fld.prot.right']].forEach(([v, k]) => add(i18n.t(k), '', () => { p.slide = v; this.openChooser('protect'); }, p.slide === v, 'third'));
      add(i18n.t('fld.prot.rbRoute'), i18n.t('fld.prot.rbRouteSub'), () => { p.rbStay = false; this.openChooser('protect'); }, !p.rbStay, 'half');
      add(i18n.t('fld.prot.rbStay'), i18n.t('fld.prot.rbStaySub'), () => { p.rbStay = true; this.openChooser('protect'); }, p.rbStay, 'half');
      add(i18n.t('fld.ch.confirm'), '', () => { this.call.protectionSet = true; this.sim.protection = { ...p }; sfx.select(); this.closeChooser(); this.app.toolbar.refresh(); }, false, 'confirm');
    } else if (kind === 'play') {
      CONCEPT_IDS.forEach((c) => add(i18n.t(`fld.con.${c}`), i18n.t(`fld.conSub.${c}`), () => { this.call.concept = c; this.call.conceptSet = true; this.sim.concept = c; sfx.select(); this.closeChooser(); this.app.toolbar.refresh(); this.app.feed.push('fld.feed.call', 'ok', { play: i18n.t(`fld.con.${c}`) }); }, this.call.concept === c && this.call.conceptSet));
    } else if (kind === 'book') {
      COVER_IDS.forEach((c) => add(`${i18n.t(`fld.cov.${c}`)} → ${i18n.t(`fld.con.${best(c)}`)}`, i18n.t(`fld.book.${c}`), () => this.closeChooser(), false, 'wide'));
    }
    el.classList.remove('hidden');
  }
  closeChooser() { this.app.chooser.classList.add('hidden'); }

  startMotion() {
    if (this.sim.snapped || this.motion) return;
    this.motion = 'running';
    sfx.select();
    this.app.feed.push('fld.feed.motion', 'ok');
  }

  snap() {
    if (this.sim.snapped) return;
    if (!this.call.coverage || !this.call.protectionSet || !this.call.conceptSet) { this.app.feed.push('fld.feed.callFirst', 'warn'); sfx.deny(); return; }
    this.closeChooser();
    this.sim.protection = { ...this.call.protection };
    this.sim.concept = this.call.concept;
    this.sim.snap();
    this.snapTime = this.app.state.time;
    // Snapping commits the pre-snap steps: close them off so the checklist follows the play.
    while (!this.app.stages.complete && this.app.stages.index < 3) this.app.stages.advance();
    sfx.hike();
    crowdLevel(0.08);
    this.app.toolbar.refresh();
  }

  throwTo(id, touch = false) {
    if (!this.sim.snapped || this.sim.ball || this.sim.over) return;
    if (!this.sim.receivers.some((r) => r.id === id)) return;
    this.sim.throw(id, touch);
    sfx.throw();
    this.ballMesh.visible = true; this.trail.visible = true; this.trailPts = [];
    this.app.toolbar.refresh();
  }
  throwAway() {
    if (!this.sim.snapped || this.sim.ball) return;
    this.sim.throwAway(); sfx.throw();
    this.ballMesh.visible = true; this.trail.visible = true; this.trailPts = [];
  }

  // ── Input ──────────────────────────────────────────
  pointer(e) { this.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); this.mouse = { x: e.clientX, y: e.clientY }; }
  pointerDown(e) {
    if (e.button === 2) { this.cam.drag = { x: e.clientX, y: e.clientY }; return; }
    if (e.button !== 0) return;
    this.pointer(e);
    const id = this.pick();
    if (id && this.sim.snapped && RECEIVERS.includes(id)) this.throwTo(id, e.shiftKey);
  }
  pointerMove(e) {
    this.pointer(e);
    if (this.cam.drag) { this.cam.yaw = THREE.MathUtils.clamp(this.cam.yaw - (e.clientX - this.cam.drag.x) * 0.004, -0.8, 0.8); this.cam.drag.x = e.clientX; }
  }
  pointerUp() { this.cam.drag = null; }
  wheel(e) { this.cam.zoom = THREE.MathUtils.clamp(this.cam.zoom * Math.exp(e.deltaY * 0.001), 0.6, 1.6); }
  key(e) {
    const k = e.key.toLowerCase();
    if (k === ' ') { this.snap(); return true; }
    if (THROW_KEYS[k] && this.sim.snapped) { this.throwTo(THROW_KEYS[k], e.shiftKey); return true; }
    if (k === 'escape') { this.closeChooser(); return true; }
    return false;
  }
  pick() {
    this.ray.setFromCamera(this.ndc, this.camera);
    const h = this.ray.intersectObjects(this.pickables, false)[0];
    return h?.object.userData.playerId ?? null;
  }
  eyesPoint() {
    this.ray.setFromCamera(this.ndc, this.camera);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null;
  }

  // ── Frame ──────────────────────────────────────────
  update(dt, t) {
    const a = this.app, sim = this.sim;
    this.demo?.update(dt);
    // Hover: scanning the safeties counts toward the read.
    const hid = this.pick();
    if (hid === this.hover.id) this.hover.t += dt; else this.hover = { id: hid, t: 0 };
    if ((hid === 'FS' || hid === 'SS') && this.hover.t > 0.8) this.facts.scanned = true;
    a.hoverTip(hid ? i18n.t('fld.who.' + (DEFENDER_POS[hid] ? hid.replace(/_.*/, '') : hid)) : null, this.mouse);

    if (!sim.snapped) {
      if (this.motion === 'running' && sim.motion(dt)) { this.motion = 'done'; this.facts.scanned = true; a.toolbar.refresh(); }
      this.playClock -= dt;
      if (this.playClock <= 0 && !this.app.state.paused) {
        this.playClock = TIMING.playClock;
        this.drive.ballOn = Math.max(1, this.drive.ballOn - 5); this.drive.toGo += 5;
        a.feed.push('fld.feed.delay', 'bad'); sfx.whistle();
        this.stadium.root.position.z = -(this.drive.ballOn - FIELD.losYardLine);
      }
    } else if (!sim.over) {
      // Eyes: where the cursor points on the field. Staring at one receiver lets the deep defenders jump it.
      const p = this.eyesPoint();
      if (p) {
        sim.eyes.x = -p.x;
        const near = sim.receivers.find((r) => Math.abs(r.x - sim.eyes.x) < 3.5 && r.z > 1);
        if (near && near.id === this.stare.id) this.stare.t += dt; else this.stare = { id: near?.id ?? null, t: 0 };
        sim.eyes.stare = this.stare.t;
        if (this.stare.t > 1.4 && !this.stareWarned) { this.stareWarned = true; a.feed.push('fld.feed.stare', 'warn'); }
      }
      sim.step(dt);
      if (sim.over && !this.resultShown) this.onResult();
    } else if (this.filmState) this.stepFilm(dt);
    else if (this.autoFilmAt && a.state.time >= this.autoFilmAt) { this.autoFilmAt = null; this.startFilm(); }

    this.syncMeshes(dt);
    this.updateCamera(dt);
    a.stages.update();
    if (a.frame % 4 === 0) this.updateLive();
  }

  syncMeshes(dt) {
    const f = this.filmState ? this.filmState.frame : null;
    for (const [id, m] of Object.entries(this.meshes)) {
      const act = this.sim.actors[id];
      if (!act) { m.visible = false; continue; }
      m.visible = true;
      const [x, z] = f ? f.a[id] : [act.x, act.z];
      m.position.copy(W(x, z));
      const face = act.team === 'off' ? 0 : Math.PI;
      const v = Math.hypot(act.vx, act.vz);
      m.rotation.y = v > 0.5 && !f ? Math.atan2(-act.vx, act.vz) : face;
      if (m.userData.ring) {
        const r = m.userData.ring;
        const running = this.sim.snapped && this.sim.receivers.some((q) => q.id === id);
        r.visible = running || !this.sim.snapped;
        if (running) {
          const sep = this.sim.separation(act);
          r.material.color.set(sep > 3 ? '#5dffa8' : sep > 1.5 ? '#ffb86b' : '#ff4466');
          r.material.opacity = 0.85;
          r.scale.setScalar(0.8 + Math.min(1.4, sep / 4));
        } else { r.material.color.set('#3ff3ff'); r.material.opacity = 0.25; r.scale.setScalar(1); }
      }
      m.userData.bodyMat.emissiveIntensity = id === this.hover.id ? 0.9 : 0.35;
    }
    const bp = f ? (f.ball ? { x: f.ball[0], z: f.ball[1], y: f.ball[2] } : null) : this.sim.ballPos();
    if (bp && (!this.sim.over || f)) {
      this.ballMesh.visible = true;
      this.ballMesh.position.copy(W(bp.x, bp.z, bp.y));
      this.trailPts.push(this.ballMesh.position.clone()); if (this.trailPts.length > 60) this.trailPts.shift();
      const arr = this.trail.geometry.attributes.position.array;
      for (let i = 0; i < 60; i++) { const q = this.trailPts[Math.min(i, this.trailPts.length - 1)] || this.ballMesh.position; arr[i * 3] = q.x; arr[i * 3 + 1] = q.y; arr[i * 3 + 2] = q.z; }
      this.trail.geometry.attributes.position.needsUpdate = true;
    } else if (!bp) { this.ballMesh.visible = false; this.trail.visible = false; }
    // Eyes fan.
    const qb = this.sim.actors.QB;
    this.eyesFan.visible = this.sim.snapped && !this.sim.ball && !this.sim.over;
    if (this.eyesFan.visible) {
      this.eyesFan.position.copy(W(qb.x, qb.z, 0.05));
      this.eyesFan.rotation.z = Math.atan2(-(this.sim.eyes.x - qb.x), 14) + Math.PI / 2;
      this.eyesFan.material.opacity = 0.1 + Math.min(0.25, this.stare.t * 0.12);
      this.eyesFan.material.color.set(this.stare.t > 1.4 ? '#ffb86b' : '#3ff3ff');
    }
  }

  updateCamera(dt) {
    const qb = this.sim.actors.QB;
    let pos, look;
    if (this.cam.mode === 'all22' || this.filmState) { pos = new THREE.Vector3(0, 40 * this.cam.zoom, -20 * this.cam.zoom); look = new THREE.Vector3(0, 0, 10); }
    else {
      const back = new THREE.Vector3(Math.sin(this.cam.yaw) * 7.5, 6.2, -7.5 * Math.cos(this.cam.yaw)).multiplyScalar(this.cam.zoom);
      pos = W(qb.x, qb.z).add(back); look = W(qb.x * 0.3, 13);
    }
    const k = 1 - Math.exp(-dt * 5);
    this.camPos = (this.camPos || pos.clone()).lerp(pos, k);
    this.camLook = (this.camLook || look.clone()).lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  // ── Outcome, film, drive ───────────────────────────
  onResult() {
    this.resultShown = true;
    const a = this.app, r = this.sim.result;
    const play = { n: this.drive.n, coverage: this.sim.coverage, call: { ...this.call, protection: { ...this.call.protection } }, result: r, down: this.drive.down, toGo: this.drive.toGo, ballOn: this.drive.ballOn };
    play.readOk = this.call.coverage === this.sim.coverage;
    play.protOk = COVERAGES[this.sim.coverage].blitz ? this.call.protection.rbStay || (r.release && r.release.t < 1.7) : !this.call.protection.rbStay;
    play.fit = CONCEPTS[this.call.concept].fit[this.sim.coverage];
    play.decision = r.release && r.release.best && r.release.target ? Math.min(1, (r.release.sepAtThrow + 0.3) / Math.max(0.5, r.release.best.sep)) : r.type === 'throwaway' ? 0.6 : 0;
    play.score = Math.round((play.readOk ? 25 : 0) + (play.protOk ? 15 : 0) + play.fit * 20 + play.decision * 20 + ({ catch: 20, throwaway: 6, pbu: 6, drop: 10, miss: 4 }[r.type] ?? 0));
    this.plays.push(play);
    // Drive bookkeeping.
    const gain = r.type === 'sack' ? r.yards : r.type === 'catch' ? r.yards : 0;
    this.drive.ballOn = THREE.MathUtils.clamp(this.drive.ballOn + gain, 1, 100);
    if (r.type === 'int') { a.feed.push('fld.feed.int', 'bad'); a.stage.flash('#ff4466'); sfx.hit(); this.drive.down = 1; this.drive.toGo = 10; }
    else if (this.drive.ballOn >= 100) { a.feed.push('fld.feed.td', 'ok'); a.stage.flash('#5dffa8'); sfx.confirm(); this.drive.ballOn = DRIVE.startYard; this.drive.down = 1; this.drive.toGo = 10; }
    else if (gain >= this.drive.toGo) { this.drive.down = 1; this.drive.toGo = 10; a.feed.push('fld.feed.first', 'ok'); }
    else { this.drive.down = Math.min(4, this.drive.down + 1); this.drive.toGo -= gain; if (this.drive.down === 4 && this.drive.toGo > 0) { /* keep playing: a teaching drive */ } }
    const key = { catch: 'fld.feed.catch', sack: 'fld.feed.sack', int: null, pbu: 'fld.feed.pbu', drop: 'fld.feed.drop', miss: 'fld.feed.miss', throwaway: 'fld.feed.away' }[r.type];
    if (key) a.feed.push(key, r.type === 'catch' ? 'ok' : r.type === 'sack' ? 'bad' : 'warn', { yards: gain, target: r.target === 'S' ? 'SLOT' : r.target ?? '', yac: r.yac ?? 0 });
    if (r.type === 'catch') { sfx.catch(); crowdLevel(0.16); setTimeout(() => crowdLevel(0.035), 1800); }
    else if (r.type === 'sack') { sfx.hit(); a.stage.flash('#ffb86b'); }
    sfx.whistle();
    a.banner(i18n.t('fld.res.' + r.type), `${i18n.t('fld.cov.' + this.sim.coverage)} · ${i18n.t('fld.con.' + this.call.concept)}`);
    bus.emit('fld:result', play);
    a.toolbar.refresh();
    this.autoFilmAt = a.state.time + 1.6;   // roll the film automatically (simulation time)
  }

  startFilm() {
    if (!this.sim.over || !this.sim.frames.length) return;
    this.clearFilm();
    const frames = this.sim.frames.filter((f) => f.t > 0);
    this.filmState = { frames, i: 0, t: 0, frame: frames[0] };
    // Trails: offense cyan, defense magenta.
    for (const [id, m] of Object.entries(this.meshes)) {
      if (!this.sim.actors[id] || ['LT', 'LG', 'C', 'RG', 'RT'].includes(id) || DEFENDER_POS[id] === 'DL') continue;
      const g = new THREE.BufferGeometry().setFromPoints(frames.map((f) => W(f.a[id][0], f.a[id][1], 0.08)));
      g.setDrawRange(0, 0);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: m.userData.team === 'off' ? '#3ff3ff' : '#ff4fd8', transparent: true, opacity: 0.8 }));
      line.userData.n = frames.length;
      this.filmLines.add(line);
    }
    // Mark the most open receiver at the moment of release.
    const rel = this.sim.result.release;
    if (rel?.best) {
      const bestM = this.meshes[rel.best.id];
      const halo = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.9, 40), new THREE.MeshBasicMaterial({ color: '#5dffa8', transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      halo.rotation.x = -Math.PI / 2;
      const fr = frames.find((f) => f.t >= rel.t) || frames[frames.length - 1];
      halo.position.copy(W(fr.a[rel.best.id][0], fr.a[rel.best.id][1], 0.06));
      halo.userData.bestAt = rel.t;
      halo.visible = false;
      this.filmLines.add(halo);
      this.filmState.halo = halo;
      void bestM;
    }
    this.app.feed.push('fld.feed.film', 'ok');
  }
  stepFilm(dt) {
    const F = this.filmState;
    F.t += dt;
    while (F.i < F.frames.length - 1 && F.frames[F.i + 1].t <= F.t) F.i++;
    F.frame = F.frames[F.i];
    this.filmLines.children.forEach((l) => { if (l.isLine) l.geometry.setDrawRange(0, F.i + 1); });
    if (F.halo) F.halo.visible = F.t >= F.halo.userData.bestAt;
    if (F.i >= F.frames.length - 1) { F.doneT = (F.doneT || 0) + dt; if (F.doneT > 1) { this.facts.film = true; } }
  }
  clearFilm() { this.filmLines.clear(); this.filmState = null; }

  nextPlay() {
    if (!this.sim.over) return;
    if (this.drive.n >= DRIVE.plays) { this.showDebrief(); return; }
    this.newPlay();
  }

  // ── Panels ─────────────────────────────────────────
  updateLive() {
    const q = (id) => this.app.live.querySelector('#' + id);
    const s = this.sim, d = this.drive;
    q('fl-down').textContent = `${ordinal(d.down)} & ${d.toGo >= 100 - d.ballOn ? i18n.t('fld.goal') : d.toGo}`;
    q('fl-spot').textContent = yardText(d.ballOn);
    q('fl-play').textContent = `${d.n}/${DRIVE.plays}`;
    q('fl-clock').textContent = s.snapped ? (s.t).toFixed(1) + ' s' : Math.ceil(this.playClock);
    q('fl-clock-l').textContent = i18n.t(s.snapped ? 'fld.live.pocket' : 'fld.live.playclock');
    q('fl-clock').classList.toggle('alert', !s.snapped && this.playClock < 6);
    const p = s.snapped && !s.ball ? (s.pressure || 0) : 0;
    q('fl-pressure').style.width = `${Math.round(p * 100)}%`;
    q('fl-pressure').classList.toggle('hot', p > 0.6);
    q('fl-call').textContent = `${this.call.coverage ? i18n.t('fld.cov.' + this.call.coverage) : '—'} · ${i18n.t('fld.con.' + this.call.concept)}${this.call.conceptSet ? '' : ' ?'}`;
    q('fl-prot').textContent = `${i18n.t(this.call.protection.slide < 0 ? 'fld.prot.left' : this.call.protection.slide > 0 ? 'fld.prot.right' : 'fld.prot.none')} · RB ${i18n.t(this.call.protection.rbStay ? 'fld.prot.stayShort' : 'fld.prot.routeShort')}`;
    const rows = q('fl-recv');
    rows.innerHTML = '';
    for (const id of RECEIVERS) {
      const r = s.actors[id];
      const running = s.snapped && s.receivers.some((x) => x.id === id);
      const sep = running ? s.separation(r) : null;
      const route = running ? i18n.t('fld.route.' + s.routes[id].name) : this.call.protection.rbStay && id === 'RB' ? i18n.t('fld.prot.stayShort') : i18n.t('fld.route.' + CONCEPTS[this.call.concept].routes[id]);
      const div = document.createElement('div');
      div.className = 'fl-r ' + (sep === null ? '' : sep > 3 ? 'open' : sep > 1.5 ? 'tight' : 'covered');
      div.innerHTML = `<kbd></kbd><span class="n"></span><span class="rt"></span><b class="mono"></b>`;
      div.children[0].textContent = Object.keys(THROW_KEYS).find((k) => THROW_KEYS[k] === id).toUpperCase();
      div.children[1].textContent = id === 'S' ? 'SLOT' : id;
      div.children[2].textContent = route;
      div.children[3].textContent = sep === null ? '—' : `${sep.toFixed(1)} yd`;
      rows.appendChild(div);
    }
    const last = this.plays[this.plays.length - 1];
    const comp = this.plays.filter((x) => x.result.type === 'catch').length, att = this.plays.filter((x) => x.result.type !== 'sack').length;
    q('fl-stats').textContent = `${comp}/${att} · ${this.plays.reduce((s2, x) => s2 + (x.result.type === 'catch' ? x.result.yards : 0), 0)} yd · INT ${this.plays.filter((x) => x.result.type === 'int').length} · ${i18n.t('fld.live.sacks')} ${this.plays.filter((x) => x.result.type === 'sack').length}`;
    q('fl-last').textContent = last ? `#${last.n} ${i18n.t('fld.res.' + last.result.type)} · ${i18n.t(last.readOk ? 'fld.live.readOk' : 'fld.live.readBad')} (${i18n.t('fld.cov.' + last.coverage)})` : '—';
  }

  urgentHint() {
    const s = this.sim;
    if (s.snapped && !s.ball && !s.over && (s.pressure || 0) > 0.65) return 'fld.hint.urgentPressure';
    if (s.snapped && !s.ball && !s.over && this.stare.t > 1.4) return 'fld.hint.urgentStare';
    if (s.over && this.facts.film && this.drive.n >= DRIVE.plays) return 'fld.hint.driveOver';
    if (s.over && this.facts.film) return 'fld.hint.next';
    return null;
  }

  // ── Debrief ────────────────────────────────────────
  showDebrief() {
    const P = this.plays;
    if (!P.length) { this.app.feed.push('fld.feed.noPlay', 'warn'); return; }
    const comp = P.filter((p) => p.result.type === 'catch');
    const att = P.filter((p) => p.result.type !== 'sack');
    const yards = comp.reduce((s, p) => s + p.result.yards, 0) + P.filter((p) => p.result.type === 'sack').reduce((s, p) => s + p.result.yards, 0);
    const ints = P.filter((p) => p.result.type === 'int').length, sacks = P.filter((p) => p.result.type === 'sack').length;
    const reads = P.filter((p) => p.readOk).length;
    const times = P.filter((p) => p.result.release).map((p) => p.result.release.t);
    const avgT = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const score = Math.round(P.reduce((s, p) => s + p.score, 0) / Math.max(1, P.length));
    const tips = [];
    const add = (k, v = {}) => tips.push(i18n.t(k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''));
    const misreads = P.filter((p) => !p.readOk);
    if (misreads.length) add('fld.tip.read', { list: misreads.map((p) => `#${p.n} ${i18n.t('fld.cov.' + p.coverage)} (${i18n.t('fld.live.you')}: ${p.call.coverage ? i18n.t('fld.cov.' + p.call.coverage) : '—'})`).join(', ') });
    if (P.some((p) => p.coverage === 'c0' && p.result.type === 'sack')) add('fld.tip.blitz');
    if (P.some((p) => p.result.type === 'int' && p.result.release?.eyesStare > 1)) add('fld.tip.stare');
    else if (ints) add('fld.tip.int');
    const badFit = P.filter((p) => p.fit < 0.6);
    if (badFit.length) add('fld.tip.fit', { list: badFit.map((p) => `#${p.n} ${i18n.t('fld.con.' + p.call.concept)} ${i18n.t('fld.tip.vs')} ${i18n.t('fld.cov.' + p.coverage)} → ${i18n.t('fld.con.' + best(p.coverage))}`).join(', ') });
    const late = P.filter((p) => p.result.release && p.result.release.t > 3);
    if (late.length) add('fld.tip.late', { t: avgT.toFixed(1) });
    const missedOpen = P.filter((p) => p.result.release?.best && p.result.release.target && p.result.release.best.sep - p.result.release.sepAtThrow > 2);
    if (missedOpen.length) add('fld.tip.progression', { list: missedOpen.map((p) => `#${p.n} ${p.result.release.best.id === 'S' ? 'SLOT' : p.result.release.best.id}`).join(', ') });
    if (!tips.length) add('fld.tip.great');
    if (tips.length < 3) add('fld.tip.generic');
    this.app.debrief.show({
      title: i18n.t('fld.db.title'), sub: `${i18n.t('app.title')} · ${i18n.t('app.by')}`, score,
      stats: [
        { label: i18n.t('fld.db.comp'), value: `${comp.length}/${att.length}`, cls: comp.length >= att.length * 0.6 ? 'ok' : 'warn' },
        { label: i18n.t('fld.db.yards'), value: `${yards}`, cls: yards > 30 ? 'ok' : 'warn' },
        { label: 'INT', value: String(ints), cls: ints ? 'bad' : 'ok' },
        { label: i18n.t('fld.db.sacks'), value: String(sacks), cls: sacks ? 'warn' : 'ok' },
        { label: i18n.t('fld.db.reads'), value: `${reads}/${P.length}`, cls: reads === P.length ? 'ok' : reads >= 3 ? 'warn' : 'bad' },
        { label: i18n.t('fld.db.time'), value: `${avgT.toFixed(1)} s`, cls: avgT && avgT < 2.8 ? 'ok' : 'warn' },
        { label: i18n.t('fld.db.fit'), value: `${Math.round(P.reduce((s, p) => s + p.fit, 0) / P.length * 100)} %`, cls: 'ok' },
        { label: i18n.t('fld.db.plays'), value: String(P.length), cls: '' },
      ],
      checks: P.map((p) => ({ label: `#${p.n} ${i18n.t('fld.cov.' + p.coverage)} · ${i18n.t('fld.con.' + p.call.concept)}`, value: `${i18n.t('fld.res.' + p.result.type)}${p.result.type === 'catch' ? ' +' + p.result.yards : p.result.type === 'sack' ? ' ' + p.result.yards : ''}`, ok: ['catch', 'throwaway'].includes(p.result.type) && p.readOk })),
      tips: tips.slice(0, 5),
      onAgain: () => { this.drive = { ballOn: DRIVE.startYard, down: 1, toGo: 10, n: 0 }; this.plays = []; this.coverageBag = null; this.newPlay(); },
    });
  }
}

// Stage definitions for a single play.
const STAGES = (m) => [
  { id: 'read', tasks: [
    { id: 'scan', check: () => m.facts.scanned },
    { id: 'call', check: () => !!m.call.coverage },
  ] },
  { id: 'protect', tasks: [{ id: 'protect', check: () => m.call.protectionSet }] },
  { id: 'playcall', tasks: [{ id: 'playcall', check: () => m.call.conceptSet }] },
  { id: 'snap', tasks: [{ id: 'snap', check: () => m.sim.snapped }] },
  { id: 'deliver', tasks: [{ id: 'deliver', check: () => !!m.sim.ball || m.sim.over, progress: () => m.sim.snapped ? Math.min(0.95, m.sim.t / 3) : 0 }] },
  { id: 'film', tasks: [{ id: 'film', check: () => m.facts.film, progress: () => m.filmState ? m.filmState.i / Math.max(1, m.filmState.frames.length - 1) : 0 }] },
];

export function best(c) { return Object.entries(CONCEPTS).sort((a, b) => b[1].fit[c] - a[1].fit[c])[0][0]; }
function ordinal(n) { return ['1st', '2nd', '3rd', '4th'][n - 1] || `${n}th`; }
function yardText(ballOn) { return ballOn === 50 ? '50' : ballOn < 50 ? `OWN ${ballOn}` : `OPP ${100 - ballOn}`; }

const LIVE_HTML = `
  <header class="lv-head mono"><span data-i18n="fld.live.title"></span></header>
  <div class="lv-grid mono">
    <div><label data-i18n="fld.live.down"></label><b id="fl-down">1st & 10</b></div>
    <div><label data-i18n="fld.live.spot"></label><b id="fl-spot">OWN 25</b></div>
    <div><label id="fl-clock-l" data-i18n="fld.live.playclock"></label><b id="fl-clock">25</b></div>
    <div><label data-i18n="fld.live.play"></label><b id="fl-play">1/5</b></div>
  </div>
  <div class="lv-row"><label class="mono" data-i18n="fld.live.pressure"></label><div class="lv-bar"><i id="fl-pressure"></i></div></div>
  <div class="lv-kv mono"><label data-i18n="fld.live.call"></label><b id="fl-call">—</b></div>
  <div class="lv-kv mono"><label data-i18n="fld.live.prot"></label><b id="fl-prot">—</b></div>
  <div class="lv-sub mono" data-i18n="fld.live.receivers"></div>
  <div id="fl-recv" class="fl-recv"></div>
  <div class="lv-kv mono"><label data-i18n="fld.live.drive"></label><b id="fl-stats">—</b></div>
  <div class="lv-kv mono"><label data-i18n="fld.live.last"></label><b id="fl-last">—</b></div>`;

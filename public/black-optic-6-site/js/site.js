/**
 * Wiring: the document, the stage, and the one clock they share.
 *
 * The page is ordinary flow — eleven sections, real headings, real links — and
 * everything cinematic is a fixed layer behind it reading the same scroll
 * position. That order matters. Built the other way round, with the film as the
 * document and the text laid into it, the page stops working the moment
 * JavaScript fails, a screen reader walks it, or someone prints it. Built this
 * way, the film is a decoration that can be switched off — by `prefers-reduced-
 * motion`, by a refused WebGL context, by a slow device — and nothing that
 * matters is lost with it.
 *
 * One rendering loop drives everything, and it only runs when the page is
 * visible and something has actually changed.
 *
 * @module black-optic-6-site/site
 */

import { clamp01, easeInOut, envelope, letterbox, stateAt } from './timeline.js';
import { operatorAt, postureFor } from './operator.js';
import { drawOperator } from './figure.js';
import { OperatorPlates } from './plate.js';
import { Backdrop } from './anamorphic.js';
import {
  SCENES, scene, resolve, CAMERA_VARIANTS, THERMAL_VARIANTS, THERMAL_SOURCES,
  SATELLITE_VARIANTS, RESOLUTION_LADDER, DEVICE_HIGHLIGHTS, RANGE_FRAMING,
} from './catalog.js';
import { PERSONAS, personaFor, Narrator } from './voices.js';
import { tally } from '../../black-optic-6/js/capability.js';
import { STATES } from '../../black-optic-6/js/provenance.js';
import { rampTable } from '../../black-optic-6/js/thermal.js';
import { ThermalDemo, RangeDemo, LOADS, TARGETS } from './demo.js';
import { dopeCard, load as loadFor } from './range.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const el = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/* ======================================================= content assembly */

/** A capability, as a card. The badge is the ledger's, never ours. */
function capabilityCard(id) {
  const row = resolve(id);
  const card = make('article', 'card');
  card.dataset.capability = row.id;
  card.dataset.state = row.state;

  const head = make('div', 'card__head');
  head.append(make('h3', 'card__name', row.name));
  const badge = make('span', 'badge', row.label);
  badge.dataset.tone = row.tone;
  head.append(badge);
  card.append(head, make('p', 'card__note', row.verdict));
  if (row.path) card.append(make('p', 'card__meta', `Path · ${row.path}`));
  return card;
}

/** A device or route, as a card. */
function variantCard({ name, note, route, state }) {
  const card = make('article', 'card');
  const head = make('div', 'card__head');
  head.append(make('h3', 'card__name', name));
  if (state) {
    // The badge comes from the provenance table, so a route the console calls
    // BLOCKED cannot be quietly promoted to LINKED on the way onto the page.
    const provenance = STATES[state] || STATES.UNSOUND;
    const badge = make('span', 'badge', provenance.label);
    badge.dataset.tone = provenance.tone;
    head.append(badge);
  }
  card.append(head, make('p', 'card__note', note));
  if (route) card.append(make('p', 'card__meta', route));
  return card;
}

/** Paint a palette into a strip so the ramp is shown rather than described. */
function paletteStrip(palette, width = 256, height = 26) {
  const canvas = make('canvas', 'palette-strip');
  canvas.width = width;
  canvas.height = height;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${palette.name} colour ramp, cold at the left to hot at the right`);
  const ctx = canvas.getContext('2d');
  const ramp = rampTable(palette);
  const image = ctx.createImageData(width, height);
  for (let x = 0; x < width; x += 1) {
    const step = Math.min(255, Math.floor((x / (width - 1)) * 255));
    const r = ramp[step * 3];
    const g = ramp[step * 3 + 1];
    const b = ramp[step * 3 + 2];
    for (let y = 0; y < height; y += 1) {
      const p = (y * width + x) * 4;
      image.data[p] = r; image.data[p + 1] = g; image.data[p + 2] = b; image.data[p + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function buildTally() {
  const host = el('tally');
  if (!host) return;
  const counts = tally();
  const order = [
    ['LIVE', 'measuring now'],
    ['LINK', 'with a device'],
    ['MODEL', 'computed'],
    ['UNSOUND', 'will not work'],
  ];
  for (const [state, label] of order) {
    const cell = make('div', 'tally__cell');
    cell.dataset.state = state;
    cell.append(make('span', 'tally__n', String(counts[state] ?? 0)));
    cell.append(make('span', 'tally__k', label));
    host.append(cell);
  }
}

function buildActLines() {
  for (const act of SCENES) {
    const section = el(`act-${act.id}`);
    if (!section) continue;
    const line = section.querySelector('[data-line]');
    if (line && !line.textContent.trim()) line.textContent = act.line;
  }
}

function buildCameras() {
  const host = el('camera-grid');
  if (!host) return;
  for (const variant of CAMERA_VARIANTS) host.append(variantCard(variant));
  // The two rows that decide whether any of it is legal to believe.
  for (const id of ['night-vision', 'glasses-feed']) host.append(capabilityCard(id));
}

function buildPalettes() {
  const host = el('palette-grid');
  if (!host) return;
  for (const palette of THERMAL_VARIANTS) {
    const card = make('article', 'card palette-card');
    card.append(make('h3', 'card__name', palette.name));
    card.append(paletteStrip(palette));
    card.append(make('p', 'card__note', palette.use));
    host.append(card);
  }

  const sources = el('thermal-source-grid');
  if (!sources) return;
  for (const source of THERMAL_SOURCES) {
    const card = make('article', 'card');
    const head = make('div', 'card__head');
    head.append(make('h3', 'card__name', source.label));
    const badge = make('span', 'badge', source.temperature ? '°C · REAL' : 'NO DEGREES');
    badge.dataset.tone = source.temperature ? 'confirm' : 'caution';
    head.append(badge);
    card.append(head, make('p', 'card__note', source.meaning));
    sources.append(card);
  }
  sources.append(capabilityCard('thermal-from-visible'));
}

function buildSatellites() {
  const table = el('satellite-table');
  if (table) {
    const head = make('thead');
    const headRow = make('tr');
    for (const label of ['Spacecraft', 'Instrument', 'Nadir px', 'Edge px', 'Swath']) {
      headRow.append(make('th', null, label));
    }
    head.append(headRow);
    const body = make('tbody');
    for (const sat of SATELLITE_VARIANTS) {
      const row = make('tr');
      const name = make('td');
      name.append(make('strong', null, sat.name));
      name.append(make('div', 'card__note', sat.note));
      row.append(name);
      row.append(make('td', null, sat.instrument));
      row.append(make('td', 'num', `${sat.nadirPixelM} m`));
      row.append(make('td', 'num', `${sat.edgePixelM} m`));
      row.append(make('td', 'num', `${sat.swathKm} km`));
      body.append(row);
    }
    table.prepend(body);
    table.prepend(head);
  }

  const ladder = el('ladder-table');
  if (ladder) {
    const head = make('thead');
    const headRow = make('tr');
    for (const label of ['Tier', 'Resolution', 'Revisit', 'Cost']) headRow.append(make('th', null, label));
    head.append(headRow);
    const body = make('tbody');
    for (const rung of RESOLUTION_LADDER) {
      const row = make('tr');
      const tier = make('td');
      tier.append(make('strong', null, rung.tier));
      tier.append(make('div', 'card__note', rung.note));
      row.append(tier);
      row.append(make('td', 'num', rung.resolution));
      row.append(make('td', null, rung.revisit));
      row.append(make('td', null, rung.cost));
      body.append(row);
    }
    ladder.prepend(body);
    ladder.prepend(head);
  }
}

/** Drones, watches, glasses — each highlight card carries its ledger badge. */
function buildHighlights() {
  const hosts = { Drones: el('drone-grid'), 'Smart watches': el('wearable-grid'), 'Smart glasses': el('glasses-grid') };
  for (const group of DEVICE_HIGHLIGHTS) {
    const host = hosts[group.group];
    if (!host) continue;
    for (const item of group.items) {
      const row = resolve(item.capability);
      const card = make('article', 'card');
      card.dataset.capability = row.id;
      const head = make('div', 'card__head');
      head.append(make('h3', 'card__name', item.name));
      const badge = make('span', 'badge', row.label);
      badge.dataset.tone = row.tone;
      head.append(badge);
      card.append(head, make('p', 'card__note', item.detail));
      card.append(make('p', 'card__meta', `Ledger · ${row.name}`));
      host.append(card);
    }
  }
}

function buildField() {
  const host = el('field-grid');
  if (!host) return;
  for (const id of scene('field').shows) host.append(capabilityCard(id));
}

function buildLedger() {
  const host = el('ledger-rows');
  if (!host) return;
  for (const id of scene('ledger').shows) {
    const row = resolve(id);
    const line = make('div', 'ledger-row');
    const badge = make('span', 'badge', row.label);
    badge.dataset.tone = row.tone;
    line.append(badge);
    const text = make('div');
    text.append(make('h3', null, row.name));
    text.append(make('p', null, row.verdict));
    if (row.path) text.append(make('p', 'path', `What would change the answer · ${row.path}`));
    line.append(text);
    host.append(line);
  }
}

function buildRangeFraming() {
  const host = el('range-framing');
  if (!host) return;
  host.append(make('strong', null, `${RANGE_FRAMING.is} `));
  host.append(document.createTextNode(RANGE_FRAMING.isNot));
}

/* ============================================================== the stage */

class Stage {
  constructor() {
    this.backdropCanvas = el('backdrop');
    this.operatorCanvas = el('operator');
    this.matteTop = el('matte-top');
    this.matteBottom = el('matte-bottom');
    this.flare = el('flare');
    this.hudAct = el('hud-act');
    this.hudName = el('hud-name');
    this.hudPct = el('hud-pct');
    this.hudFill = el('hud-fill');

    this.backdrop = new Backdrop(this.backdropCanvas);
    this.ctx = this.operatorCanvas.getContext('2d');

    // The photographic plates. Until they decode — and if they never do, on a
    // connection that drops them or a browser that refuses the format — the
    // vector rig in figure.js carries the film instead. The page is never
    // without a subject.
    this.plates = new OperatorPlates();
    this.plates.load().then((ok) => { this.plateReady = ok; if (this.onready) this.onready(); });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = 0;
    this.height = 0;
    this.lastAct = null;
    this.flareAt = -1;
    this.resize();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.width = width;
    this.height = height;
    this.backdrop.resize(width, height, this.dpr);
    this.operatorCanvas.width = Math.round(width * this.dpr);
    this.operatorCanvas.height = Math.round(height * this.dpr);
  }

  /**
   * Measure where each act actually sits in the document.
   *
   * Derived from layout rather than from weights, so an act that grew because
   * somebody added four capability rows keeps its share of the film without
   * anyone editing a number.
   */
  measure() {
    const range = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    this.scenes = SCENES.map((act) => {
      const node = el(`act-${act.id}`);
      if (!node) return { id: act.id, start: 0, end: 0, span: 0, bleed: 0.15 };
      const top = node.offsetTop;
      const start = clamp01(top / range);
      const end = clamp01((top + node.offsetHeight) / range);
      return { id: act.id, start, end, span: Math.max(end - start, 0.0001), bleed: 0.18 };
    });
  }

  /** One frame. `time` is seconds since load. */
  render(position, time) {
    const state = stateAt(position, this.scenes);
    const act = scene(state.active) || SCENES[0];
    const actIndex = SCENES.findIndex((s) => s.id === act.id);

    // ---- HUD -------------------------------------------------------------
    const pct = Math.round(position * 100);
    if (this.hudPct.textContent !== `${String(pct).padStart(2, '0')}%`) {
      this.hudPct.textContent = `${String(pct).padStart(2, '0')}%`;
      this.hudFill.style.width = `${pct}%`;
    }
    if (this.lastAct !== act.id) {
      this.hudAct.textContent = act.act;
      this.hudName.textContent = act.kicker;
      this.fireFlare(time);
      this.lastAct = act.id;
      if (this.onact) this.onact(act.id);
    }

    // ---- matte -----------------------------------------------------------
    // The frame opens through the film: a hard 2.39 letterbox at the title,
    // wide open for the demo where you actually need screen, closing again for
    // the ledger. The aspect is animated, not the bar height, so it stays
    // correct on any viewport.
    const openness = envelope(position, 0.22, 0.30);
    const ratio = 2.39 - easeInOut(openness) * 0.78;
    const frame = letterbox(this.width, this.height, ratio);
    this.matteTop.style.height = `${frame.top}px`;
    this.matteBottom.style.height = `${frame.bottom}px`;

    // ---- backdrop --------------------------------------------------------
    if (this.backdrop.ok) {
      this.backdrop.render({
        time: reduceMotion.matches ? 0 : time,
        progress: position,
        scene: actIndex,
        energy: act.energy ?? 0.4,
        tint: act.tint,
      });
    }

    // ---- operator --------------------------------------------------------
    this.drawFigure(position, act, frame, state);
    return state;
  }

  /**
   * Where the plate sits, as a fraction of viewport width.
   *
   * Averaged across the acts by their presence, so he slides from one side to
   * the other through a transition rather than jumping the instant the active
   * act changes. Below the breakpoint the text column is full width and there
   * is no free side, so he centres and the caller drops his opacity instead.
   */
  plateSide(state) {
    if (this.width <= 720) return 0.5;
    let weight = 0;
    let sum = 0;
    for (const entry of state.scenes) {
      if (entry.presence <= 0) continue;
      const act = scene(entry.id);
      if (!act) continue;
      sum += (act.side ?? 0.5) * entry.presence;
      weight += entry.presence;
    }
    return weight > 0 ? sum / weight : 0.5;
  }

  drawFigure(position, act, frame, state) {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.operatorCanvas.width, this.operatorCanvas.height);
    ctx.scale(dpr, dpr);

    // He walks inside the open frame, not the viewport, so he never stands in
    // the matte.
    const frameTop = frame.top;
    const frameHeight = Math.max(frame.height, 1);

    // Reduced motion freezes him mid-approach rather than removing him: the
    // page still has a subject, it just does not move.
    const walk = reduceMotion.matches ? 0.45 : position;
    const posture = postureFor(act.id);
    const figure = operatorAt(walk, { frameHeight, posture });

    const centreX = this.width * this.plateSide(state);

    // On a phone the plate sits behind the text, so it has to give way. At a
    // quarter strength it is still atmosphere; at anything like full strength
    // it is an accessibility problem, because there is no free side of the
    // viewport to move him to.
    const alpha = this.width <= 720 ? 0.26 : 1;

    ctx.save();
    ctx.translate(0, frameTop);
    ctx.beginPath();
    ctx.rect(0, 0, this.width, frameHeight);
    ctx.clip();
    if (!this.plates.draw(ctx, figure, { centreX, frameHeight, alpha })) {
      drawOperator(ctx, figure, { centreX, scale: 1 });
    }
    ctx.restore();
    this.figure = figure;
  }

  /** A single streak rake on an act change. Cheap, and it sells the cut. */
  fireFlare(time) {
    if (reduceMotion.matches || !this.flare) return;
    this.flareAt = time;
  }

  updateFlare(time) {
    if (this.flareAt < 0 || !this.flare) return;
    const age = time - this.flareAt;
    if (age > 0.9) {
      this.flare.style.opacity = '0';
      // Park it back on centre: a left-over translate on a full-width element
      // keeps widening the document long after the streak has faded out.
      this.flare.style.transform = 'none';
      this.flareAt = -1;
      return;
    }
    const t = age / 0.9;
    const y = this.figure ? this.figure.headY + (this.matteTop.offsetHeight || 0) : this.height * 0.4;
    this.flare.style.top = `${y}px`;
    this.flare.style.opacity = String(Math.sin(t * Math.PI) * 0.75);
    this.flare.style.transform = `translateX(${((t - 0.5) * 48).toFixed(1)}px) scaleY(${1 + Math.sin(t * Math.PI) * 2.2})`;
  }
}

/* ============================================================== parallax */

/**
 * Parallax and the 3D card reveal.
 *
 * Both are computed from an element's distance to the centre of the viewport
 * rather than from the page's scroll total, which means they behave correctly
 * when the layout reflows, when the address bar collapses, and when somebody
 * jumps to an anchor.
 */
function updateDepth(cards, depths, viewportHeight) {
  if (reduceMotion.matches) return;
  const centre = viewportHeight / 2;

  for (const node of depths) {
    const rect = node.getBoundingClientRect();
    const offset = (rect.top + rect.height / 2 - centre) / viewportHeight;
    const depth = parseFloat(node.dataset.depth) || 0;
    node.style.transform = `translate3d(0, ${(-offset * depth * viewportHeight).toFixed(1)}px, 0)`;
  }

  for (const node of cards) {
    const rect = node.getBoundingClientRect();
    if (rect.bottom < -200 || rect.top > viewportHeight + 200) continue;
    // Reveal across the lower third of the screen as the card rises into it.
    // Written as an explicit descending ratio rather than a reversed
    // `progressThrough`: that helper takes an ascending span and returns a hard
    // 0 or 1 if handed one backwards, which silently turns the whole reveal
    // into a binary switch and leaves every card above the fold at 6% opacity.
    // Once revealed a card stays revealed — this only ever fades in from below.
    const t = clamp01((viewportHeight * 0.96 - rect.top) / (viewportHeight * 0.54));
    const eased = easeInOut(t);
    const lift = (1 - eased) * 44;
    const tip = (1 - eased) * 13;
    const push = (1 - eased) * -180;
    node.style.opacity = String(0.06 + eased * 0.94);
    node.style.transform = `translate3d(0, ${lift.toFixed(1)}px, ${push.toFixed(0)}px) rotateX(${tip.toFixed(2)}deg)`;
  }
}

/* ================================================================== demos */

function wireThermalDemo() {
  const canvas = el('demo-canvas');
  if (!canvas) return null;
  const demo = new ThermalDemo(canvas);
  const readoutNode = el('demo-readout');
  const sourceNode = el('demo-source');
  const noteNode = el('demo-palette-note');
  const picker = el('demo-palette');

  for (const palette of THERMAL_VARIANTS) {
    const option = make('option', null, palette.name);
    option.value = palette.id;
    if (palette.id === demo.palette.id) option.selected = true;
    picker.append(option);
  }
  const showNote = () => {
    const palette = THERMAL_VARIANTS.find((p) => p.id === demo.palette.id);
    noteNode.textContent = palette ? palette.use : '';
  };
  showNote();
  picker.addEventListener('change', () => { demo.setPalette(picker.value); showNote(); });

  // Pointer: a tap reads a point, a drag locks the tracker onto the region.
  let dragFrom = null;
  const toField = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };
  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    dragFrom = toField(event);
    demo.cursor = dragFrom;
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragFrom) return;
    demo.cursor = toField(event);
  });
  canvas.addEventListener('pointerup', (event) => {
    const to = toField(event);
    if (dragFrom && Math.hypot(to.x - dragFrom.x, to.y - dragFrom.y) > 10) {
      demo.lockOn({
        x: Math.min(dragFrom.x, to.x), y: Math.min(dragFrom.y, to.y),
        w: Math.abs(to.x - dragFrom.x), h: Math.abs(to.y - dragFrom.y),
      });
    }
    dragFrom = null;
  });

  el('demo-clear').addEventListener('click', () => demo.clearLock());

  const cameraButton = el('demo-camera');
  cameraButton.addEventListener('click', async () => {
    if (demo.video) {
      demo.detach();
      cameraButton.textContent = 'Use my camera';
      cameraButton.setAttribute('aria-pressed', 'false');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false,
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      demo.attach(video);
      cameraButton.textContent = 'Back to the sample scene';
      cameraButton.setAttribute('aria-pressed', 'true');
    } catch (error) {
      cameraButton.textContent = 'Camera refused';
      readoutNode.textContent = `The browser did not hand over a camera: ${error.name}. The sample scene keeps running — nothing else changes.`;
    }
  });

  demo.render = (now) => {
    const result = demo.step(now);
    const bits = [];
    bits.push(result.live ? 'Source · your camera' : 'Source · sample scene');
    if (result.reading) bits.push(`Spot · ${result.reading.text}`);
    if (result.track) {
      bits.push(result.track.lost
        ? 'Lock · lost'
        : `Lock · holding, ${Math.round(result.track.confidence * 100)}% density`);
    } else if (demo.lockNote) {
      bits.push(`Lock · ${demo.lockNote}`);
    } else {
      bits.push('Lock · drag a box over something saturated');
    }
    readoutNode.textContent = bits.join('   ·   ');
    sourceNode.textContent = result.source.meaning;
  };

  return demo;
}

function wireRangeDemo() {
  const canvas = el('range-canvas');
  if (!canvas) return null;
  const demo = new RangeDemo(canvas);
  const result = el('range-result');
  const loadPicker = el('range-load');
  const targetPicker = el('range-target');
  const zeroPicker = el('range-zero');
  const wind = el('range-wind');
  const windLabel = el('range-wind-label');
  const dope = el('dope-table');
  const dopeCaption = el('dope-caption');

  for (const item of LOADS) {
    const option = make('option', null, item.name);
    option.value = item.id;
    if (item.id === demo.load.id) option.selected = true;
    loadPicker.append(option);
  }
  for (const target of TARGETS) {
    const option = make('option', null, `${target.name} · ${target.yards} yd`);
    option.value = target.id;
    if (target.id === demo.target.id) option.selected = true;
    targetPicker.append(option);
  }

  const drawDope = () => {
    dope.textContent = '';
    const head = make('thead');
    const headRow = make('tr');
    for (const label of ['Range', 'Velocity', 'Drop', 'Elev', 'Wind']) headRow.append(make('th', null, label));
    head.append(headRow);
    const body = make('tbody');
    const rows = dopeCard(demo.load, demo.options());
    for (const row of rows) {
      const tr = make('tr');
      tr.append(make('td', 'num', `${row.yards}`));
      tr.append(make('td', 'num', `${Math.round(row.velocity)} fps`));
      tr.append(make('td', 'num', `${row.pathIn.toFixed(1)}"`));
      tr.append(make('td', 'num', `${row.holdMil.toFixed(2)} mil`));
      tr.append(make('td', 'num', `${row.windMil.toFixed(2)} mil`));
      if (!row.confident) tr.style.color = 'var(--caution)';
      body.append(tr);
    }
    dope.append(head, body);
    const transonic = rows.find((row) => !row.confident);
    dopeCaption.textContent = transonic
      ? `Flat-fire approximation, ${demo.windMph} mph full-value wind. Amber rows are below Mach 1.2, where a single drag constant stops following the real curve — treat them as a shape, not a number.`
      : `Flat-fire approximation, ${demo.windMph} mph full-value wind, ${demo.altitudeFt} ft, ${demo.tempF} °F. Within a couple of inches of published tables to 300 and about six by 500. Chronograph and confirm on paper before you trust it downrange.`;
  };

  const refresh = () => { demo.draw(); drawDope(); };

  loadPicker.addEventListener('change', () => { demo.load = loadFor(loadPicker.value); demo.reset(); refresh(); });
  targetPicker.addEventListener('change', () => {
    demo.target = TARGETS.find((t) => t.id === targetPicker.value) || TARGETS[0];
    demo.reset(); refresh();
  });
  zeroPicker.addEventListener('change', () => { demo.zeroYd = Number(zeroPicker.value); demo.reset(); refresh(); });
  wind.addEventListener('input', () => {
    demo.windMph = Number(wind.value);
    windLabel.textContent = `${demo.windMph} mph`;
    demo.reset();
    refresh();
  });

  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const py = ((event.clientY - rect.top) / rect.height) * canvas.height;
    demo.aim = demo.toInches(px, py);
    demo.shot = null;
    demo.revealed = false;
    refresh();
    result.textContent = `Hold set ${demo.aim.x >= 0 ? 'right' : 'left'} ${Math.abs(demo.aim.x).toFixed(1)}", ${demo.aim.y >= 0 ? 'high' : 'low'} ${Math.abs(demo.aim.y).toFixed(1)}". Fire when ready.`;
  });

  el('range-fire').addEventListener('click', () => {
    const shot = demo.fire();
    refresh();
    result.textContent = shot.hit
      ? `Hit — ${shot.cause}, ${shot.missIn.toFixed(1)}" from centre (${shot.missMoa.toFixed(1)} MOA). Time of flight ${shot.firing.timeOfFlight.toFixed(2)} s.`
      : `Miss — ${shot.cause}. ${shot.missIn.toFixed(1)}" out, ${shot.missMoa.toFixed(1)} MOA. The bullet dropped ${Math.abs(shot.firing.pathIn).toFixed(1)}" and the wind moved it ${shot.firing.driftIn.toFixed(1)}".`;
  });

  el('range-reveal').addEventListener('click', () => {
    const perfect = demo.reveal();
    refresh();
    result.textContent = `Correct hold: ${perfect.y >= 0 ? 'up' : 'down'} ${Math.abs(perfect.y).toFixed(1)}" (${Math.abs(perfect.firing.holdMil).toFixed(2)} mil) and ${perfect.x >= 0 ? 'right' : 'left'} ${Math.abs(perfect.x).toFixed(1)}" (${Math.abs(perfect.firing.windMil).toFixed(2)} mil into the wind).`;
  });

  el('range-reset').addEventListener('click', () => {
    demo.reset(); refresh();
    result.textContent = 'Tap the view to place your hold, then fire.';
  });

  refresh();
  return demo;
}

/* ================================================================= voices */

function wireVoices(stage) {
  const narrator = new Narrator();
  const chip = el('guide');
  const nameNode = el('guide-name');
  const roleNode = el('guide-role');
  const button = el('guide-speak');
  let current = PERSONAS[0];
  let speaking = false;

  const show = (sceneId) => {
    const persona = personaFor(sceneId);
    if (persona.id === current.id && persona.scene === current.scene) { current = persona; return; }
    current = persona;
    nameNode.textContent = persona.name;
    roleNode.textContent = `· ${persona.role}`;
    if (speaking) { narrator.stop(); speaking = false; chip.classList.remove('is-speaking'); button.textContent = 'Brief me'; }
  };

  narrator.onstate = (state) => {
    speaking = state.speaking;
    chip.classList.toggle('is-speaking', state.speaking);
    button.textContent = state.speaking ? 'Stop' : 'Brief me';
  };

  button.addEventListener('click', () => {
    if (speaking) { narrator.stop(); return; }
    if (!narrator.available) {
      roleNode.textContent = '· no speech engine on this device';
      return;
    }
    narrator.speak(current.scene);
    // Some engines never fire `onstart`; reflect the intent immediately.
    speaking = true;
    chip.classList.add('is-speaking');
    button.textContent = 'Stop';
  });

  button.title = `Reads this section aloud — ${narrator.describe(current)}`;
  stage.onact = show;
  window.addEventListener('pagehide', () => narrator.stop());
  return narrator;
}

/* ================================================================== boot */

function boot() {
  buildTally();
  buildActLines();
  buildCameras();
  buildPalettes();
  buildSatellites();
  buildHighlights();
  buildField();
  buildLedger();
  buildRangeFraming();

  const stage = new Stage();
  stage.onready = () => request();
  wireVoices(stage);
  const thermalDemo = wireThermalDemo();
  wireRangeDemo();

  const cards = [...document.querySelectorAll('.reveal .card')];
  const depths = [...document.querySelectorAll('[data-depth]')];

  const remeasure = () => { stage.resize(); stage.measure(); };
  remeasure();

  let ticking = false;
  let start = 0;
  let visible = true;

  const frame = (now) => {
    ticking = false;
    if (!start) start = now;
    const time = (now - start) / 1000;
    const range = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    const position = clamp01(window.scrollY / range);

    stage.render(position, time);
    stage.updateFlare(time);
    updateDepth(cards, depths, window.innerHeight);
    if (thermalDemo) thermalDemo.render(now);

    // The demo canvases animate continuously; the rest only needs a frame when
    // something moved. Keeping the loop alive only while the demo is on screen
    // is the difference between a page that idles at 0% CPU and one that cooks
    // a phone in a pocket.
    if (visible && (demoOnScreen() || stage.flareAt >= 0 || !reduceMotion.matches)) request();
  };

  const demoOnScreen = () => {
    const node = el('act-demo');
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  };

  const request = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  };

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', () => { remeasure(); request(); });
  window.addEventListener('orientationchange', () => { setTimeout(remeasure, 120); request(); });
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) request();
  });
  reduceMotion.addEventListener('change', request);

  // Layout settles after fonts and the palette canvases paint.
  window.addEventListener('load', () => { remeasure(); request(); });
  setTimeout(remeasure, 400);
  request();

  document.documentElement.dataset.site = 'ready';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

/**
 * Wiring: sensors in, hypotheses and a projection out, nothing invented between.
 *
 * The app opens on the built-in scenario rather than an empty screen, because
 * an empty fire map teaches nothing and the scenario has known answers — the
 * numbers on screen at first paint can be checked against
 * {@link module:emberline/demo.DEMO_TRUTH} by anyone, including the end-to-end
 * harness.
 *
 * Two rules govern everything below.
 *
 * **Every figure is rendered with the thing that qualifies it.** Not near it,
 * not under it in grey — attached to it, at the same size. A spread rate is
 * rendered with its slow and fast cases. An arrival time is rendered as a
 * window. A fused position is rendered with its ellipse and with the count of
 * *independent* sources behind it.
 *
 * **A source that is absent says so where its data would have been.** No layer
 * silently renders nothing. There is no live satellite feed without a key, and
 * the satellite panel says that in the space the detections would occupy rather
 * than showing an empty list that reads as "no fires".
 *
 * @module emberline/app
 */

import { boundsOf, distanceM, bearingDeg } from './geo.js';
import { FUEL_MODELS } from './rothermel.js';
import { arrivalWindow, evaluate, projectSpread, projectedArea, windShiftExposure } from './spread.js';
import { areaRequestUrl, clusterDetections, confidenceScore, detectionAge, emptyResultMeaning, parseDetections, pixelAreaHa, pixelFootprint, radiativePower, withinHours } from './firms.js';
import { nextLookSummary, nextLooks, overpassCaveat } from './overpass.js';
import { bearingGeometry, correctForPlume, fix, sighting, suggestThirdObserver } from './triangulate.js';
import { capability, classifyNodes, frontFromNodeLoss, nodesInPath } from './rf.js';
import { fuseAll, observation } from './fuse.js';
import { knownConfusers } from './smoke.js';
import { createView, drawDetections, drawGround, drawHypothesis, drawNodes, drawPlace, drawSightings, drawSpread, hitTest } from './globe.js';
import { DEMO_TRUTH, demoScenario } from './demo.js';

const el = (id) => document.getElementById(id);
const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Everything the app knows right now. */
const state = {
  scenario: null,
  detections: [],
  sightings: [],
  nodes: [],
  front: null,
  cameraFix: null,
  hypotheses: [],
  selected: null,
  conditions: null,
  horizonMin: 60,
  projection: null,
  places: [],
  view: null,
  live: false,
};

/* ------------------------------------------------------------------ model */

/**
 * Turn every sensor's output into observations and fuse them.
 *
 * The independence keys are the load-bearing part. Both satellite detections
 * carry the same `pass:` key because they came off the same overpass, so they
 * corroborate each other not at all — which is true, and is the thing most
 * fire displays get wrong.
 */
function rebuildHypotheses() {
  const nowMs = state.scenario.atMs;
  const observations = [];

  const clusters = clusterDetections(state.detections);
  for (const cluster of clusters) {
    const pass = `${cluster.detections[0]?.satellite ?? 'sat'}-${cluster.newestMs ?? 0}`;
    for (const detection of cluster.detections) {
      // Half the pixel's larger dimension is the one-sigma position error: the
      // fire is somewhere in the pixel and the centre is not a measurement of
      // where.
      const sigmaM = (Math.max(detection.scanKm, detection.trackKm) * 1000) / 2;
      observations.push(
        observation({
          kind: 'satellite',
          position: { lat: detection.lat, lon: detection.lon },
          sigmaM,
          atMs: detection.acquiredMs ?? nowMs,
          independence: `pass:${pass}`,
          label: `${detection.satellite || detection.instrument} pixel`,
          strength: confidenceScore(detection).score,
          meta: { detection },
        }),
      );
    }
  }

  state.cameraFix = null;
  if (state.sightings.length >= 2) {
    const solved = fix(state.sightings);
    if (solved?.usable) {
      // The cameras see a column, which leans downwind of the ground burning.
      state.cameraFix = correctForPlume(solved, {
        windFromDeg: state.conditions.windFromDeg,
        windMs: state.conditions.windMs,
        observedHeightM: 700,
      });
      for (const s of state.sightings) {
        observations.push(
          observation({
            kind: 'camera',
            position: state.cameraFix.position,
            covariance: state.cameraFix.covariance,
            atMs: s.atMs ?? nowMs,
            independence: `camera:${s.id}`,
            label: `${s.id} bearing`,
            strength: 0.8,
            meta: { sighting: s },
          }),
        );
      }
    } else {
      state.cameraFix = solved;
    }
  }

  state.front = frontFromNodeLoss(state.nodes);
  if (state.front?.isFront && state.front.leadingEdge) {
    observations.push(
      observation({
        kind: 'rf',
        position: state.front.leadingEdge,
        sigmaM: 80,
        atMs: state.front.nodes.at(-1)?.lostAtMs ?? nowMs,
        independence: 'network:mesh',
        label: 'Leading node loss',
        strength: state.front.confidence,
        meta: { front: state.front },
      }),
    );
  }

  const model = evaluate(state.conditions);
  state.hypotheses = fuseAll(observations, {
    nowMs,
    spreadRateMs: model.expected.rateOfSpreadMs || 0.5,
  });
  if (!state.hypotheses.some((h) => h === state.selected)) state.selected = state.hypotheses[0] ?? null;
}

/** Recompute the spread projection and the arrival window for each place. */
function rebuildProjection() {
  const origin = state.selected?.position ?? state.scenario.centre;
  state.projection = projectSpread(origin, state.conditions, state.horizonMin);
  state.places = state.scenario.places.map((place) => ({
    ...place,
    arrival: arrivalWindow(origin, place, state.conditions),
  }));
}

/* ----------------------------------------------------------------- render */

/** Paint the map, back to front. */
function renderMap() {
  const view = state.view;
  if (!view) return;
  view.resize();
  drawGround(view);

  if (state.projection) drawSpread(view, state.projection);
  drawDetections(view, state.detections, pixelFootprint);
  drawNodes(view, state.nodes);
  drawSightings(view, state.sightings, 46000);
  for (const place of state.places) drawPlace(view, place);
  for (const hypothesis of state.hypotheses) drawHypothesis(view, hypothesis, hypothesis === state.selected);

  // Short on purpose: the scale bar sits at the other end of the same band, and
  // on a phone there is room for one line between them. The "no basemap" caveat
  // lives in the legend, where it is a standing fact rather than a status.
  const mpp = view.metresPerPixel();
  el('readout').textContent =
    `${view.centre.lat.toFixed(4)}, ${view.centre.lon.toFixed(4)} · ${mpp < 10 ? mpp.toFixed(1) : Math.round(mpp)} m/px`;
}

/** The Fires tab: one card per hypothesis, with what backs it. */
function renderFires() {
  if (!state.hypotheses.length) {
    el('fires-list').innerHTML = card(
      'Nothing detected',
      `<p class="why">${escapeHtml(emptyResultMeaning(24))}</p>`,
    );
    return;
  }

  el('fires-list').innerHTML = state.hypotheses
    .map((h, index) => {
      const kinds = h.kinds
        .map((kind) => `<span class="tag on">${escapeHtml(kind)}</span>`)
        .join('');
      const missing = h.missing
        .map((m) => `<span class="tag off">no ${escapeHtml(m.kind)}</span>`)
        .join('');
      const size =
        h.ellipse.semiMajorM < 1000
          ? `${Math.round(h.ellipse.semiMajorM)} m`
          : `${(h.ellipse.semiMajorM / 1000).toFixed(1)} km`;
      return card(
        `Fire ${index + 1}<em>${h.position.lat.toFixed(4)}, ${h.position.lon.toFixed(4)}</em>`,
        `
        <div class="conf"><i style="width:${(h.confidence * 100).toFixed(0)}%"></i></div>
        <div class="figures">
          ${fig(`${(h.confidence * 100).toFixed(0)}%`, 'confidence', 'warm')}
          ${fig(String(h.independentKeys), 'independent looks')}
          ${fig(String(h.diversity), 'sensor kinds')}
          ${fig(size, 'located to')}
          ${fig(h.ageMin < 90 ? `${Math.round(h.ageMin)} min` : `${(h.ageMin / 60).toFixed(1)} h`, 'newest data')}
        </div>
        <p class="why">${escapeHtml(h.note)}</p>
        <div class="tags">${kinds}${missing}</div>
        ${h.missing.length ? `<p class="why"><strong>Missing:</strong> ${escapeHtml(h.missing[0].wouldAdd)}</p>` : ''}
        `,
        h === state.selected ? 'selected' : '',
        index,
      );
    })
    .join('');

  for (const node of document.querySelectorAll('[data-fire]')) {
    node.addEventListener('click', () => {
      state.selected = state.hypotheses[Number(node.dataset.fire)] ?? state.selected;
      rebuildProjection();
      renderFires();
      renderSpread();
      renderMap();
    });
  }
}

/** The Spread tab: the projection, its band, and what it means for places. */
function renderSpread() {
  const p = state.projection;
  const m = p.model;
  const area = projectedArea(p);
  const exposure = windShiftExposure(
    state.selected?.position ?? state.scenario.centre,
    state.scenario.places,
    state.conditions,
  );

  const placeRows = state.places
    .map((place) => {
      const a = place.arrival;
      if (!a.reachable) {
        return row(place.name, '<b class="late">not reached</b>');
      }
      if (a.beyondHorizon) {
        return row(place.name, '<b class="late">&gt; 8 h</b>');
      }
      const soon = a.earliestMin < 60;
      return row(
        place.name,
        `<b class="${soon ? 'soon' : ''}">${Math.round(a.earliestMin)}–${Math.round(a.latestMin)} min</b>`,
      );
    })
    .join('');

  const shiftRows = exposure
    .filter((e) => e.shiftedMin != null && e.nowMin != null && e.shiftedMin < e.nowMin * 0.8)
    .map((e) =>
      row(
        `${e.name} — if the wind turns ${e.shiftDeg > 0 ? '+' : ''}${e.shiftDeg}°`,
        `<b class="soon">${Math.round(e.nowMin)} → ${Math.round(e.shiftedMin)} min</b>`,
      ),
    )
    .join('');

  el('spread-readout').innerHTML = [
    card(
      `Head of the fire<em>${Math.round(p.heading)}° · ${state.horizonMin} min</em>`,
      `
      <div class="figures">
        ${fig(`${m.expected.rateOfSpreadMMin.toFixed(1)}`, 'm/min expected', 'warm')}
        ${fig(`${m.slow.rateOfSpreadMMin.toFixed(1)}–${m.fast.rateOfSpreadMMin.toFixed(1)}`, 'm/min band')}
        ${fig(`${(p.expected.headM / 1000).toFixed(1)} km`, `head in ${state.horizonMin} min`, 'warm')}
        ${fig(`${(p.slow.headM / 1000).toFixed(1)}–${(p.fast.headM / 1000).toFixed(1)}`, 'km band')}
        ${fig(`${Math.round(area.expectedHa)} ha`, 'area expected')}
        ${fig(`${Math.round(area.slowHa)}–${Math.round(area.fastHa)}`, 'ha band')}
        ${fig(`${m.expected.flameLengthM.toFixed(1)} m`, 'flame length', m.expected.flameLengthM > 2.4 ? 'hot' : '')}
        ${fig(`${m.midflame.midflameMs.toFixed(1)} m/s`, 'midflame wind', 'cool')}
      </div>
      <p class="why"><strong>The band is the answer.</strong> Those three numbers come from running the whole model
      at the ends of a plausible range for wind and fuel moisture, because neither was measured. The spread between
      them is how well this can be known today, drawn at the size it actually is.</p>
      <p class="why">${escapeHtml(m.midflame.note)} Rothermel wants the wind at the flames, not the forecast wind —
      skipping that step is what makes casual estimates several times too fast.</p>
      ${m.expected.limit ? `<p class="note stop">${escapeHtml(m.expected.limit)}</p>` : ''}
      `,
    ),
    card(
      `Fighting it<em>${escapeHtml(m.suppression.class)}</em>`,
      `
      <p class="why"><strong>${escapeHtml(m.suppression.headline)}.</strong> ${escapeHtml(m.suppression.detail)}</p>
      <p class="note ${m.crown.likely ? 'stop' : ''}">${escapeHtml(m.crown.note)}</p>
      ${
        m.crown.likely
          ? '<p class="why">Everything drawn on the map is a <strong>surface</strong> prediction. Under crowning conditions it is not a conservative estimate, it is the wrong model — and no surface model contains spotting, which is what actually crosses a containment line.</p>'
          : ''
      }
      `,
      m.crown.likely ? 'alarm' : '',
    ),
    card('When it reaches places', `<div class="rows">${placeRows}</div>
      <p class="why">Windows, not times. The early edge is the fast run and the late edge the slow one — plan against
      the early edge.</p>`),
    shiftRows
      ? card('If the wind turns', `<div class="rows">${shiftRows}</div>
        <p class="why">A flank that has been creeping for hours is a long front. When the wind comes round, all of it
        becomes a head at once — which is why these are worth knowing before it happens.</p>`, 'alarm')
      : '',
  ]
    .filter(Boolean)
    .join('');
}

/** The Sensors tab: what each source is contributing, and what it cannot see. */
function renderSensors() {
  const origin = state.selected?.position ?? state.scenario.centre;
  const look = nextLookSummary(origin, state.scenario.atMs);
  const upcoming = nextLooks(origin, state.scenario.atMs, 4)
    .map((l) =>
      row(
        `${l.satellite} · ${l.pass}`,
        `<b>${l.inMinutes < 90 ? `${l.inMinutes} min` : `${(l.inMinutes / 60).toFixed(1)} h`}</b>`,
      ),
    )
    .join('');

  const detectionRows = state.detections
    .map((d) => {
      const age = detectionAge(d, state.scenario.atMs);
      return row(
        `${d.satellite || d.instrument} · ${Math.round(pixelAreaHa(d))} ha pixel`,
        `<b>${escapeHtml(age.ageText)}</b>`,
      );
    })
    .join('');

  const cluster = clusterDetections(state.detections)[0];
  const third = state.cameraFix ? suggestThirdObserver(state.cameraFix) : null;
  const rf = capability();

  const nodeStates = state.nodes.reduce(
    (acc, n) => ({ ...acc, [n.state]: (acc[n.state] ?? 0) + 1 }),
    {},
  );
  const path = state.front?.isFront ? nodesInPath(state.nodes, state.front) : [];

  el('sensors-readout').innerHTML = [
    card(
      `Satellite<em>${state.live ? 'live' : 'built-in scenario'}</em>`,
      `
      <div class="figures">
        ${fig(String(state.detections.length), 'detections')}
        ${fig(cluster ? `${Math.round(cluster.totalFrpMw)} MW` : '—', 'radiative power', 'warm')}
        ${fig(cluster ? `${Math.round(cluster.spanM)} m` : '—', 'cluster span')}
      </div>
      <div class="rows">${detectionRows}</div>
      ${cluster ? `<p class="why">${escapeHtml(radiativePower(cluster).note)}</p>` : ''}
      <p class="why"><strong>These are pixels, not points.</strong> Each box on the map is the ground the sensor
      actually integrated over, taken from the scan and track fields of the detection itself. Drawn as dots they
      would all look equally precise; drawn true, the difference between a 15 ha pixel and a 250 ha one is visible.</p>
      <p class="note">${escapeHtml(look.headline)}. ${escapeHtml(look.detail)}</p>
      <div class="rows">${upcoming}</div>
      <p class="why">${escapeHtml(overpassCaveat())}</p>
      `,
    ),
    card(
      `Cameras<em>${state.sightings.length} bearings</em>`,
      state.cameraFix
        ? `
        <div class="figures">
          ${fig(`${Math.round(state.cameraFix.bestCrossingDeg)}°`, 'best crossing', 'cool')}
          ${fig(
            state.cameraFix.ellipse.semiMajorM < 1000
              ? `${Math.round(state.cameraFix.ellipse.semiMajorM)} m`
              : `${(state.cameraFix.ellipse.semiMajorM / 1000).toFixed(1)} km`,
            'long axis',
          )}
          ${fig(`${Math.round(state.cameraFix.plumeCorrectionM ?? 0)} m`, 'plume correction')}
        </div>
        <p class="why">${escapeHtml(state.cameraFix.note)}</p>
        ${state.cameraFix.plumeNote ? `<p class="why">${escapeHtml(state.cameraFix.plumeNote)}</p>` : ''}
        ${third ? `<p class="note">${escapeHtml(third.note)}</p>` : ''}
        `
        : '<p class="why">Fewer than two bearings — a single bearing is a direction, not a location.</p>',
    ),
    card(
      `Network nodes<em>${nodeStates.lost ?? 0} of ${state.nodes.length} destroyed</em>`,
      `
      <div class="figures">
        ${fig(String(nodeStates.up ?? 0), 'answering', 'cool')}
        ${fig(String(nodeStates.lost ?? 0), 'destroyed', 'hot')}
        ${fig(state.front?.speedMs ? `${state.front.speedMs.toFixed(1)} m/s` : '—', 'front speed', 'warm')}
        ${fig(state.front?.headingDeg != null ? `${Math.round(state.front.headingDeg)}°` : '—', 'heading')}
      </div>
      <p class="why">${escapeHtml(state.front?.note ?? '')}</p>
      ${
        path.length
          ? `<div class="rows">${path
              .map((n) => row(`${n.label} — about to burn`, `<b class="soon">${Math.round(n.etaMin)} min</b>`))
              .join('')}</div>`
          : ''
      }
      `,
      state.front?.isFront ? 'alarm' : '',
    ),
    card(
      `Through-wall occupancy<em>${rf.state}</em>`,
      `
      <p class="why"><strong>${escapeHtml(rf.headline)}.</strong> ${escapeHtml(rf.detail)}</p>
      <div class="rows">${rf.options.map((o) => row(o.name, '')).join('')}</div>
      <p class="why">Attach one of those and stream it to this app over a WebSocket, and its contacts fuse with
      everything else. With nothing attached this panel stays empty on purpose.</p>
      `,
    ),
  ].join('');
}

/** The Limits tab: what this refuses to do, in the app rather than a document. */
function renderAbout() {
  el('about-readout').innerHTML = [
    card(
      'What this is',
      `
      <p class="why">A fire tracker that fuses <strong>satellite detections</strong>, <strong>camera
      cross-bearings</strong> and <strong>network node loss</strong> into ranked hypotheses, then projects each one
      forward with Rothermel's surface spread model. Everything runs on this device. Nothing is uploaded.</p>
      <p class="why">It is opinionated about one thing: a number without its uncertainty is not a measurement, and a
      fire map that draws every layer as a crisp identical icon is telling you a 4 km satellite pixel and a surveyed
      coordinate are the same kind of fact. They are not, and here they are not drawn as though they were.</p>
      `,
    ),
    card(
      'What it will not do',
      `
      <div class="rows">
        ${row('Model crown fire', '<b class="late">refused</b>')}
        ${row('Model spotting', '<b class="late">refused</b>')}
        ${row('Infer a fire nobody detected', '<b class="late">refused</b>')}
        ${row('Sense through walls unaided', '<b class="late">refused</b>')}
        ${row('Report a single arrival time', '<b class="late">refused</b>')}
      </div>
      <p class="why"><strong>Crown fire and spotting.</strong> Rothermel is a surface model. Once fire is in the
      canopy it can run several times faster than anything here predicts, and embers landing kilometres downwind are
      what actually destroys towns. The app flags both conditions and models neither — a spread envelope that quietly
      included them would be a guess wearing the clothes of a calculation.</p>
      <p class="why"><strong>No detection is not no fire.</strong> Cloud hides the ground completely, small fires
      fall below the threshold, and there are hours between looks. An empty map here says "nothing was seen", never
      "nothing is there".</p>
      <p class="why"><strong>Through-wall sensing needs hardware.</strong> No browser has a radio API. Rather than
      simulate occupancy, the panel stays empty and names the four devices that would fill it — because a fabricated
      contact is what sends a crew into a building for nobody.</p>
      `,
    ),
    card(
      'What fools the camera detector',
      `<div class="rows">${knownConfusers()
        .map((c) => `<div class="row"><span>${escapeHtml(c.name)}</span></div><p class="why">${escapeHtml(c.tell)}</p>`)
        .join('')}</div>`,
    ),
    card(
      'Sources',
      `
      <p class="why">Spread: Rothermel 1972 (INT-115) as corrected in Andrews 2018 (RMRS-GTR-371); fuel models
      Anderson 1982 (INT-122); fire shape Anderson 1983; flame length Byram 1959; crowning Van Wagner 1977.
      Detections: NASA FIRMS VIIRS and MODIS. Overpass timing from published sun-synchronous crossing times, not an
      ephemeris — good to about ±50 minutes.</p>
      <p class="why">The scenario this opens on has known answers: the fire is at
      ${DEMO_TRUTH.fire.lat.toFixed(4)}, ${DEMO_TRUTH.fire.lon.toFixed(4)}, the camera bearings were spoiled by
      1–2° on purpose, and the node losses are spaced to imply exactly
      ${DEMO_TRUTH.frontSpeedMs.toFixed(2)} m/s. The app is never told any of it.</p>
      `,
    ),
  ].join('');
}

/* ------------------------------------------------------------- fragments */

/** One card. @returns {string} HTML */
function card(title, body, className = '', fireIndex = null) {
  const attr = fireIndex == null ? '' : ` data-fire="${fireIndex}"`;
  return `<article class="card ${className}"${attr}><h3>${title}</h3>${body}</article>`;
}

/** One figure tile. @returns {string} HTML */
function fig(value, label, tone = '') {
  return `<div class="fig ${tone}"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`;
}

/** One label/value row. @returns {string} HTML */
function row(label, value) {
  return `<div class="row"><span>${escapeHtml(label)}</span>${value}</div>`;
}

/* ------------------------------------------------------------------- wire */

/** Redraw everything that depends on the model. */
function renderAll() {
  renderFires();
  renderSpread();
  renderSensors();
  renderMap();
  const best = state.hypotheses[0];
  el('status-chip').textContent = best
    ? `${state.hypotheses.length} fire${state.hypotheses.length === 1 ? '' : 's'} · best ${(best.confidence * 100).toFixed(0)}%`
    : 'nothing detected';
}

/** Recompute the model then redraw. */
function refresh() {
  rebuildHypotheses();
  rebuildProjection();
  renderAll();
}

/** Hook up the spread controls to the conditions. */
function wireControls() {
  const fuel = el('fuel');
  fuel.innerHTML = Object.values(FUEL_MODELS)
    .map((m) => `<option value="${m.code}">${m.code} — ${escapeHtml(m.name)}</option>`)
    .join('');
  fuel.value = state.conditions.fuel;

  const bind = (id, outId, get, set, format) => {
    const input = el(id);
    input.value = get();
    if (outId) el(outId).textContent = format(get());
    input.addEventListener('input', () => {
      set(Number(input.value));
      if (outId) el(outId).textContent = format(Number(input.value));
      rebuildProjection();
      renderSpread();
      renderMap();
    });
  };

  bind('wind', 'wind-out', () => state.conditions.windMs, (v) => { state.conditions.windMs = v; }, (v) => `${v.toFixed(1)} m/s`);
  bind('dir', 'dir-out', () => state.conditions.windFromDeg, (v) => { state.conditions.windFromDeg = v; }, (v) => `${Math.round(v)}°`);
  bind('moist', 'moist-out', () => state.conditions.moisture1h * 100, (v) => { state.conditions.moisture1h = v / 100; }, (v) => `${v.toFixed(1)}%`);
  bind('slope', 'slope-out', () => state.conditions.slopeDeg, (v) => { state.conditions.slopeDeg = v; }, (v) => `${Math.round(v)}°`);

  fuel.addEventListener('change', () => {
    state.conditions.fuel = fuel.value;
    rebuildProjection();
    renderSpread();
    renderMap();
  });
  el('shelter').value = state.conditions.shelter;
  el('shelter').addEventListener('change', () => {
    state.conditions.shelter = el('shelter').value;
    rebuildProjection();
    renderSpread();
    renderMap();
  });

  const horizon = el('horizon');
  horizon.value = String(state.horizonMin);
  horizon.addEventListener('input', () => {
    state.horizonMin = Number(horizon.value);
    el('horizon-out').textContent = `${state.horizonMin} min`;
    rebuildProjection();
    renderSpread();
    renderMap();
  });

  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => {
      for (const other of document.querySelectorAll('.tab')) other.classList.toggle('tab-on', other === tab);
      for (const name of ['fires', 'spread', 'sensors', 'about']) {
        el(`tab-${name}`).hidden = name !== tab.dataset.tab;
      }
    });
  }
}

/** Pan, zoom and tap on the map. */
function wireMap() {
  const canvas = el('map');
  const pointers = new Map();
  let lastPinch = 0;
  let moved = 0;

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved = 0;
  });

  canvas.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const spread = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinch > 0 && spread > 0) {
        const rect = canvas.getBoundingClientRect();
        state.view.zoomBy(Math.log2(spread / lastPinch), (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
        renderMap();
      }
      lastPinch = spread;
      return;
    }

    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    moved += Math.hypot(dx, dy);
    state.view.panBy(dx, dy);
    renderMap();
  });

  const release = (event) => {
    const rect = canvas.getBoundingClientRect();
    // A tap is a pointer that went down and up without travelling — anything
    // that moved was a pan, and selecting a fire because a drag ended near one
    // is the kind of thing that makes a map feel broken.
    if (moved < 8 && pointers.size === 1) {
      const target = hitTest(state.view, event.clientX - rect.left, event.clientY - rect.top, state.hypotheses);
      if (target && target !== state.selected) {
        state.selected = target;
        rebuildProjection();
        renderFires();
        renderSpread();
        renderSensors();
      }
    }
    pointers.delete(event.pointerId);
    if (pointers.size < 2) lastPinch = 0;
    renderMap();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', (event) => {
    pointers.delete(event.pointerId);
    lastPinch = 0;
    void event;
  });

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      state.view.zoomBy(-event.deltaY / 400, event.clientX - rect.left, event.clientY - rect.top);
      renderMap();
    },
    { passive: false },
  );

  el('zoom-in').addEventListener('click', () => { state.view.zoomBy(1); renderMap(); });
  el('zoom-out').addEventListener('click', () => { state.view.zoomBy(-1); renderMap(); });
  el('recentre').addEventListener('click', () => { fitAll(); renderMap(); });
  globalThis.addEventListener('resize', renderMap);
}

/** Frame everything the app knows about. */
function fitAll() {
  const points = [
    ...state.detections.map((d) => ({ lat: d.lat, lon: d.lon })),
    ...state.sightings.map((s) => s.position),
    ...state.nodes.map((n) => ({ lat: n.lat, lon: n.lon })),
    ...state.places.map((p) => ({ lat: p.lat, lon: p.lon })),
  ];
  if (state.projection?.expected?.ring) points.push(...state.projection.expected.ring);
  const bounds = boundsOf(points, 1200);
  if (bounds) {
    state.view.fit([
      { lat: bounds.south, lon: bounds.west },
      { lat: bounds.north, lon: bounds.east },
    ]);
  }
}

/** Boot. */
function start() {
  const scenario = demoScenario();
  state.scenario = scenario;
  state.detections = scenario.detections;
  state.sightings = scenario.sightings.map((s) => sighting(s));
  state.nodes = classifyNodes(scenario.nodes, scenario.atMs);
  state.conditions = scenario.conditions;
  state.view = createView(el('map'), scenario.centre, 11);

  wireControls();
  wireMap();
  refresh();
  fitAll();
  renderMap();
  el('legend').hidden = false;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // A failed registration costs offline support and nothing else, so it is
      // not worth interrupting anybody over.
    });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

export { state, refresh, areaRequestUrl, parseDetections, withinHours, distanceM, bearingDeg, bearingGeometry };

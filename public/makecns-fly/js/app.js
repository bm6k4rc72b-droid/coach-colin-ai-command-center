/**
 * Wiring: the loop, the panes, and the parts of the interface that exist to stop
 * the app flattering itself.
 *
 * Three rules govern what goes on screen.
 *
 * **The provenance line never scrolls away.** Whatever else is being shown, the
 * top of the window says what the network is and what fraction of the referenced
 * dataset it represents. The single most likely way for an app like this to
 * mislead is for someone to screenshot an impressive raster and lose the sentence
 * that said it was generated.
 *
 * **Supervised flight is shaded out.** The altitude trace draws the training
 * phase in a different colour and the scores ignore it entirely, because a number
 * that includes the teacher's own flying is not a measurement of anything else.
 *
 * **Whatever is not running says so where its output would be.** No pane renders
 * a plausible blank. The proprioceptive band of the raster is visibly empty in
 * `hand-only` mode rather than simply quiet, and the camera panel shows the mask
 * it is actually using rather than a confidence number nobody can check.
 *
 * @module makecns-fly/app
 */

import { PROFILES, buildSynthetic } from './connectome.js';
import { ABLATIONS } from './net.js';
import { SENSOR_SETS } from './encode.js';
import { READOUT_MODES } from './decode.js';
import { FlightLoop } from './loop.js';
import { createLedgerRun } from './ledger.js';
import { PalmTracker, handMetrics, skinMask } from './vision.js';
import { BENCH_STATES, HardwareLink } from './link.js';
import { createRasterBuffer, drawFlight, drawMask, drawRaster, drawThrottles, drawTrace } from './render.js';

const el = (id) => document.getElementById(id);
const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The quoted claim, reproduced so the app can be checked against it. */
const CLAIM = `Reconstructed Fruit Fly Brain Flies Real Drone With Zero Flight Logic. Live Connectome Simulation: the control panel runs a live simulation of 166,700 neurons and 25 million synaptic connections reconstructed from an insect brain. Single Sensory Feed: a lone camera tracks hand gestures, mapping palm openness directly to the neural network's sensory inputs. Emergent Flight Control: without any PID loops, stability code, or pre-programmed flight parameters, the simulated wiring routed throttle outputs to coin-sized propellers. Self-Stabilizing: within just 11 seconds of operation, the simulated brain began holding altitude and hovering autonomously.`;

/** Everything the app is currently doing. */
const state = {
  loop: null,
  raster: null,
  running: false,
  lastFrameMs: 0,
  speed: 4,
  simMsDone: 0,
  wallMsSpent: 0,
  achievedSpeed: 0,
  settings: {
    neurons: 2048,
    profile: 'flywire',
    seed: 5,
    sensorSet: 'hand+proprioception',
    readoutMode: 'trained',
    ablation: 'intact',
    recurrentScale: 0.2,
    bias: 0.1,
  },
  ledger: null,
  ledgerResult: null,
  camera: { stream: null, tracker: new PalmTracker(), raf: 0, lastMs: 0, work: null },
  link: new HardwareLink(),
};

/* ------------------------------------------------------------------ build */

/** Build a fresh loop from the current settings, discarding any previous one. */
function rebuild() {
  const s = state.settings;
  const connectome = buildSynthetic({
    count: s.neurons,
    profile: s.profile,
    seed: s.seed,
    recurrentScale: s.recurrentScale,
  });
  state.loop = new FlightLoop({
    connectome,
    seed: s.seed,
    sensorSet: s.sensorSet,
    readoutMode: s.readoutMode,
    ablation: s.ablation,
  });
  state.loop.net.params.biasMvPerMs = s.bias;
  state.raster = createRasterBuffer(connectome, 120, 260);
  state.simMsDone = 0;
  state.wallMsSpent = 0;
  renderProvenance();
  renderNetStats();
  renderAll();
}

/* ------------------------------------------------------------------- loop */

function frame(now) {
  if (!state.running) return;
  const wall = state.lastFrameMs ? Math.min(60, now - state.lastFrameMs) : 16;
  state.lastFrameMs = now;

  const loop = state.loop;
  const dt = loop.config.dtMs;
  // A compute budget rather than a step count: when the machine cannot keep up,
  // the app slows down and reports the real multiplier instead of silently
  // dropping simulated time, which would make every timing on screen a lie.
  const budgetMs = 11;
  const target = state.speed === Infinity ? Number.POSITIVE_INFINITY : (wall * state.speed) / dt;
  const started = performance.now();
  let steps = 0;
  while (steps < target && performance.now() - started < budgetMs) {
    loop.step();
    if (steps % 4 === 0) state.raster.push(loop.net.currentSpikes());
    steps += 1;
    if (loop.plant.crashed) break;
  }
  const spent = performance.now() - started;
  state.simMsDone += steps * dt;
  state.wallMsSpent += Math.max(spent, wall * 0.0001);
  state.achievedSpeed = wall > 0 ? (steps * dt) / wall : 0;

  if (state.ledger) advanceLedger();

  renderAll();
  pushToHardware();
  requestAnimationFrame(frame);
}

function setRunning(on) {
  state.running = on;
  el('run-toggle').textContent = on ? 'Pause' : 'Start';
  if (on) {
    state.lastFrameMs = 0;
    requestAnimationFrame(frame);
  }
}

/* ----------------------------------------------------------------- render */

function renderAll() {
  const loop = state.loop;
  if (!loop) return;
  const snapshot = loop.snapshot();

  drawFlight(el('flight-canvas'), snapshot, loop.plant.airframe.ceilingM);
  drawRaster(el('raster-canvas'), state.raster);
  drawTrace(el('trace-canvas'), loop.history, loop.plant.airframe.ceilingM);
  drawThrottles(el('throttle-canvas'), snapshot);

  el('flight-note').textContent = snapshot.state.crashed
    ? snapshot.state.crashReason
    : `${snapshot.state.pos.z.toFixed(2)} m · tilt ${(snapshot.state.tiltRad * 57.2958).toFixed(0)}°`;
  el('raster-note').textContent = `${(state.raster.sampledFraction * 100).toFixed(1)}% of neurons drawn · ${snapshot.meanRateHz.toFixed(1)} Hz mean`;
  el('trace-note').textContent = phaseLabel(snapshot);
  el('throttle-note').textContent = loop.decoder.mode === 'direct' ? 'PD controller driving' : 'readout (bar) vs teacher (tick)';

  el('speed-chip').textContent = `${state.achievedSpeed.toFixed(1)}× real time`;
  const loopChip = el('loop-chip');
  loopChip.textContent = snapshot.closedLoop ? 'loop closed' : 'LOOP OPEN';
  loopChip.className = `chip chip-loop ${snapshot.closedLoop ? 'closed' : 'open'}`;
  el('phase-readout').textContent = phaseLabel(snapshot);

  renderFlightStats(snapshot);
  renderScores();
}

function phaseLabel(snapshot) {
  const t = snapshot.phaseSeconds.toFixed(1);
  switch (snapshot.phase) {
    case 'settle': return `settling ${t}s`;
    case 'training': return snapshot.handover > 0
      ? `teacher connected · handing over ${(snapshot.handover * 100).toFixed(0)}% · ${t}s`
      : `teacher connected ${t}s`;
    case 'flying': return `unsupervised ${t}s`;
    default: return 'ended';
  }
}

function cell(label, value, note = '', tone = '') {
  return `<div class="cell"><div class="cell-label">${escapeHtml(label)}</div>`
    + `<div class="cell-value ${tone}">${escapeHtml(value)}</div>`
    + (note ? `<div class="cell-note">${escapeHtml(note)}</div>` : '')
    + '</div>';
}

function renderFlightStats(snapshot) {
  const loop = state.loop;
  const imperfections = loop.plant.imperfections();
  el('flight-stats').innerHTML = [
    cell('Altitude', `${snapshot.state.pos.z.toFixed(2)} m`, `commanded ${snapshot.target.toFixed(2)} m`),
    cell('Tilt', `${(snapshot.state.tiltRad * 57.2958).toFixed(1)}°`,
      `tumbles past ${(loop.plant.airframe.crashTiltRad * 57.2958).toFixed(0)}°`,
      snapshot.state.tiltRad > 0.6 ? 'bad' : ''),
    cell('Network', `${snapshot.meanRateHz.toFixed(1)} Hz`, `motor pool ${snapshot.motorRateHz.toFixed(1)} Hz`),
    cell('Airframe falls in', `${imperfections.timeToFallMs.toFixed(0)} ms`,
      `rotors at hover, nothing correcting — mostly the ${imperfections.dominant}`),
  ].join('');

  el('sensor-hint').textContent = SENSOR_SETS[state.settings.sensorSet].note;
}

function renderScores() {
  const score = state.loop.score();
  const flying = state.loop.phase === 'flying' || state.loop.phase === 'ended';
  el('score-grid').innerHTML = [
    cell('Holding', flying ? `${(score.holdFraction * 100).toFixed(0)}%` : '—',
      flying ? `of ${score.samples} unsupervised samples` : 'not yet unsupervised',
      score.holdFraction > 0.8 ? 'good' : score.holdFraction < 0.2 ? 'bad' : 'warm'),
    cell('Altitude error', flying ? `${score.rmsAltitudeErrorM.toFixed(3)} m` : '—', 'RMS, unsupervised only'),
    cell('Unsupervised', `${score.unsupervisedSeconds.toFixed(1)} s`,
      score.survived ? 'still flying' : `crashed: ${score.crashReason ?? 'unknown'}`,
      score.survived ? '' : 'bad'),
    cell('Supervised first', `${score.supervisedSeconds.toFixed(0)} s`, 'teacher connected before this'),
    // The claim was "within just 11 seconds of operation". This is the honest
    // version of that number: seconds after the teacher was cut, and revoked if
    // the hold does not last.
    cell('Sustained hold at',
      score.firstSustainedHoldSeconds === null ? 'not yet' : `${score.firstSustainedHoldSeconds.toFixed(1)} s`,
      'after hand-off, and still holding',
      score.firstSustainedHoldSeconds === null ? '' : 'good'),
  ].join('');
}

function renderProvenance() {
  const connectome = state.loop.connectome;
  const p = connectome.provenance;
  const scale = connectome.scale;
  el('provenance-chip').textContent = `${p.kind} · ${connectome.count.toLocaleString()} neurons`;
  el('provenance-block').innerHTML = `
    <div class="prov">
      <div class="prov-kind">${escapeHtml(p.kind)}</div>
      <div class="prov-label">${escapeHtml(p.label)}</div>
      <div class="prov-warn">${escapeHtml(p.warning ?? '')}</div>
      <div class="prov-scale">${connectome.count.toLocaleString()} of ${scale.referenced.toLocaleString()} neurons
        — ${(scale.fraction * 100).toFixed(2)}% · ${connectome.edgeCount.toLocaleString()} connections</div>
    </div>`;
}

function renderNetStats() {
  const stats = state.loop.connectome.statistics();
  const readout = state.loop.decoder.provenance();
  el('net-stats').innerHTML = [
    cell('Mean out-degree', stats.meanOutDegree.toFixed(1), `CV ${stats.outDegreeCv.toFixed(2)}, heavy-tailed`),
    cell('Excitatory', `${(stats.excitatoryFraction * 100).toFixed(0)}%`, 'signed by neuron (Dale)'),
    cell('Readout', `${readout.parameters}`, `weights, ${readout.timescales} timescales, ${readout.outputBasis}`),
    cell('Given free', readout.feedForwardHover ? 'hover + mixer' : 'mixer only',
      'airframe knowledge the readout did not learn'),
  ].join('');
}

/* ----------------------------------------------------------------- ledger */

function advanceLedger() {
  const done = state.ledger.advance(6);
  const progress = state.ledger.progress();
  el('ledger-progress').textContent = done
    ? 'complete'
    : `${progress.done} of ${progress.total} — running ${progress.condition}`;
  if (!done) return;
  state.ledgerResult = state.ledger.result();
  state.ledger = null;
  el('run-ledger').disabled = false;
  renderLedger();
}

function renderLedger() {
  const result = state.ledgerResult;
  if (!result) return;
  const rows = result.rows.map((row) => {
    const s = row.score;
    const reference = row.attributes === 'reference' || row.attributes === 'plant';
    return `<tr class="${reference ? 'is-reference' : ''}">
      <td>${escapeHtml(row.label)}<span class="ledger-q">${escapeHtml(row.question)}</span></td>
      <td class="num">${(s.holdFraction * 100).toFixed(0)}%</td>
      <td class="num">${s.survived ? `${s.unsupervisedSeconds.toFixed(0)} s` : `${(s.crashedAtSeconds ?? 0).toFixed(1)} s †`}</td>
      <td class="num">${s.rmsAltitudeErrorM.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const palette = { recurrence: '#7c89a3', 'spike-structure': '#c77dff', 'network-activity': '#58c6ff', readout: '#ffb457', sensing: '#4ade80' };
  const bars = result.shares
    .filter((s) => s.share > 0.001)
    .map((s) => `<span class="share-seg" style="width:${(s.share * 100).toFixed(1)}%;background:${palette[s.component] ?? '#555'}" title="${escapeHtml(s.label)}: ${(s.share * 100).toFixed(0)}%"></span>`)
    .join('');

  el('ledger-result').innerHTML = `
    <div class="verdict">${escapeHtml(result.verdict)}</div>
    <h3>Where the control authority is</h3>
    <div class="share-bar">${bars || '<span class="share-seg" style="width:100%;background:#2a3446"></span>'}</div>
    <div class="readout-grid">
      ${cell('Network', `${(result.totals.network * 100).toFixed(0)}%`, 'recurrence, spike structure, activity')}
      ${cell('Readout', `${(result.totals.readout * 100).toFixed(0)}%`, 'the fitted weights')}
      ${cell('Sensing', `${(result.totals.sensing * 100).toFixed(0)}%`, 'having proprioception at all')}
    </div>
    <h3>Conditions</h3>
    <table class="ledger-table">
      <thead><tr><th>Condition</th><th>Holding</th><th>Unsupervised</th><th>RMS err</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="hint">† crashed at this time. Rows on a tinted background are references, not ablations.</p>
    <h3>Findings</h3>
    <ul class="findings">${result.findings.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
    <h3>What this cannot settle</h3>
    <ul class="findings">${(result.caveats ?? []).map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>`;
}

/* ----------------------------------------------------------------- camera */

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
      audio: false,
    });
    state.camera.stream = stream;
    const video = el('camera-video');
    video.srcObject = stream;
    await video.play();
    el('camera-start').disabled = true;
    el('camera-stop').disabled = false;
    el('calibrate-closed').disabled = false;
    el('calibrate-open').disabled = false;
    state.camera.work = document.createElement('canvas');
    state.camera.work.width = 160;
    state.camera.work.height = 120;
    pollCamera();
  } catch (error) {
    el('camera-stats').innerHTML = cell('Camera', 'unavailable', String(error.message ?? error), 'bad');
  }
}

function stopCamera() {
  const { stream, raf } = state.camera;
  if (raf) cancelAnimationFrame(raf);
  if (stream) for (const track of stream.getTracks()) track.stop();
  state.camera.stream = null;
  state.camera.raf = 0;
  el('camera-start').disabled = false;
  el('camera-stop').disabled = true;
  el('calibrate-closed').disabled = true;
  el('calibrate-open').disabled = true;
  el('camera-stats').innerHTML = cell('Camera', 'stopped', 'the slider drives palm openness');
}

function pollCamera() {
  const { work, tracker } = state.camera;
  const video = el('camera-video');
  if (!state.camera.stream) return;
  if (video.readyState >= 2) {
    const ctx = work.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, work.width, work.height);
    const frameData = ctx.getImageData(0, 0, work.width, work.height);
    const masked = skinMask(frameData);
    const metrics = handMetrics(masked);
    const now = performance.now();
    const dtMs = state.camera.lastMs ? now - state.camera.lastMs : 33;
    state.camera.lastMs = now;
    const reading = tracker.update(metrics, dtMs);

    drawMask(el('camera-canvas'), masked, metrics);
    if (!reading.stale) {
      state.loop.setPalm(reading.value);
      el('palm').value = String(Math.round(reading.value * 100));
      el('palm-out').textContent = reading.value.toFixed(2);
    }
    el('camera-stats').innerHTML = [
      cell('Palm openness', reading.stale ? `${reading.value.toFixed(2)} held` : reading.value.toFixed(2),
        reading.stale ? `stale for ${(tracker.staleMs / 1000).toFixed(1)} s` : 'live', reading.stale ? 'warm' : ''),
      cell('Confidence', reading.confidence.toFixed(2), metrics.found ? 'hand-shaped region found' : (metrics.reason ?? 'nothing found'),
        reading.confidence < 0.35 ? 'bad' : ''),
      cell('Calibrated', tracker.calibration.calibrated ? 'yes' : 'no',
        `range ${tracker.calibration.closed.toFixed(2)}–${tracker.calibration.open.toFixed(2)}`,
        tracker.calibration.calibrated ? 'good' : 'warm'),
      cell('Fingers seen', metrics.found ? metrics.meanRuns.toFixed(1) : '—', 'mean skin runs per scanline'),
    ].join('');
  }
  state.camera.raf = requestAnimationFrame(pollCamera);
}

/* --------------------------------------------------------------- hardware */

function pushToHardware() {
  const link = state.link;
  if (!link.armed) return;
  // Only the unsupervised phase is ever sent to a real machine. Streaming the
  // teacher's commands to hardware would make the hardware demonstration prove
  // something the software already said it does not.
  if (state.loop.phase !== 'flying') {
    link.disarm('not in the unsupervised phase — nothing to demonstrate');
    renderLinkStats();
    return;
  }
  link.send(state.loop.command, performance.now());
  renderLinkStats();
}

function renderLinkStats() {
  const status = state.link.status();
  el('link-stats').innerHTML = [
    cell('Link', status.connected ? 'connected' : 'no device', status.benchLabel, status.connected ? '' : 'warm'),
    cell('Armed', status.armed ? 'ARMED' : 'safe', status.armed ? 'frames going out' : (status.blocker ?? status.lastRefusal ?? 'idle'),
      status.armed ? 'bad' : 'good'),
    cell('Ceiling', `${(status.throttleCeiling * 100).toFixed(0)}%`, 'enforced on every frame'),
    cell('Frames', String(status.framesSent), 'MSP_SET_RAW_RC'),
  ].join('');
}

async function connectSerial() {
  if (!('serial' in navigator)) {
    el('link-support').textContent = 'This browser has no Web Serial API, so no device can be opened from here. Chrome and Edge on desktop have it; Safari and Firefox do not.';
    return;
  }
  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    const writer = port.writable.getWriter();
    state.link.attach({ write: (bytes) => writer.write(bytes) });
    el('link-support').textContent = 'Device open at 115200 baud. Declare the bench state before arming.';
  } catch (error) {
    el('link-support').textContent = `Could not open a device: ${error.message ?? error}`;
  }
  renderLinkStats();
}

/* ------------------------------------------------------------------- init */

function fillSelect(id, values, selected, labelOf = (v) => v) {
  el(id).innerHTML = values
    .map((v) => `<option value="${escapeHtml(v)}" ${v === selected ? 'selected' : ''}>${escapeHtml(labelOf(v))}</option>`)
    .join('');
}

function renderSources() {
  el('claim-quote').textContent = CLAIM;
  el('sources').innerHTML = Object.values(PROFILES).map((p) => `
    <div class="source">
      <b>${escapeHtml(p.label)}</b> — ${p.neurons.toLocaleString()} neurons, ${(p.synapses / 1e6).toFixed(1)}M synapses.<br />
      <code>${escapeHtml(p.source)}</code><br />
      ${escapeHtml(p.note)}
    </div>`).join('');
}

function bind() {
  el('run-toggle').addEventListener('click', () => setRunning(!state.running));
  el('restart').addEventListener('click', () => {
    state.loop.reset();
    state.raster.clear();
    renderAll();
  });

  el('palm').addEventListener('input', (e) => {
    const value = Number(e.target.value) / 100;
    state.loop.setPalm(value);
    el('palm-out').textContent = value.toFixed(2);
  });

  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => {
      for (const other of document.querySelectorAll('.tab')) other.classList.toggle('tab-on', other === tab);
      for (const body of document.querySelectorAll('.tab-body')) {
        body.hidden = body.id !== `tab-${tab.dataset.tab}`;
      }
    });
  }

  el('sensor-set').addEventListener('change', (e) => {
    state.settings.sensorSet = e.target.value;
    state.loop.encoder.setSensorSet(e.target.value);
    state.loop.reset();
    state.raster.clear();
    renderAll();
  });

  el('readout-mode').addEventListener('change', (e) => {
    state.settings.readoutMode = e.target.value;
    rebuild();
  });

  el('ablation').addEventListener('change', (e) => {
    state.settings.ablation = e.target.value;
    state.loop.net.setAblation(e.target.value);
  });

  el('neuron-count').addEventListener('change', (e) => { state.settings.neurons = Number(e.target.value); });
  el('seed').addEventListener('change', (e) => {
    state.settings.seed = Math.max(1, Math.round(Number(e.target.value) || 1));
  });
  el('speed').addEventListener('change', (e) => {
    state.speed = e.target.value === 'max' ? Number.POSITIVE_INFINITY : Number(e.target.value);
  });
  el('profile').addEventListener('change', (e) => { state.settings.profile = e.target.value; });
  el('recurrent').addEventListener('input', (e) => {
    state.settings.recurrentScale = Number(e.target.value) / 100;
    el('recurrent-out').textContent = state.settings.recurrentScale.toFixed(2);
  });
  el('bias').addEventListener('input', (e) => {
    state.settings.bias = Number(e.target.value) / 100;
    el('bias-out').textContent = state.settings.bias.toFixed(2);
    state.loop.net.params.biasMvPerMs = state.settings.bias;
  });
  el('rebuild').addEventListener('click', rebuild);

  el('run-ledger').addEventListener('click', () => {
    el('run-ledger').disabled = true;
    state.ledgerResult = null;
    el('ledger-result').innerHTML = '';
    state.ledger = createLedgerRun(
      { neurons: state.settings.neurons, seed: state.settings.seed, profile: state.settings.profile },
      { evaluateSeconds: 15 },
    );
    if (!state.running) setRunning(true);
  });

  el('camera-start').addEventListener('click', startCamera);
  el('camera-stop').addEventListener('click', stopCamera);
  el('calibrate-closed').addEventListener('click', () => state.camera.tracker.calibrate('closed'));
  el('calibrate-open').addEventListener('click', () => state.camera.tracker.calibrate('open'));

  el('bench-state').addEventListener('change', (e) => {
    if (e.target.value) state.link.declareBenchState(e.target.value);
    renderLinkStats();
  });
  el('ceiling').addEventListener('input', (e) => {
    const value = Number(e.target.value) / 100;
    state.link.setThrottleCeiling(value);
    el('ceiling-out').textContent = `${Math.round(value * 100)}%`;
    renderLinkStats();
  });
  el('link-connect').addEventListener('click', connectSerial);
  el('link-arm').addEventListener('click', () => {
    state.link.arm(performance.now());
    renderLinkStats();
  });
  el('link-disarm').addEventListener('click', () => {
    state.link.disarm();
    renderLinkStats();
  });

  globalThis.addEventListener('resize', () => renderAll());
}

function init() {
  fillSelect('sensor-set', Object.keys(SENSOR_SETS), state.settings.sensorSet, (k) => SENSOR_SETS[k].label);
  fillSelect('readout-mode', READOUT_MODES, state.settings.readoutMode);
  fillSelect('ablation', ABLATIONS, state.settings.ablation);
  fillSelect('neuron-count', ['1024', '2048', '3072', '6144'], String(state.settings.neurons), (v) => `${Number(v).toLocaleString()} neurons`);
  fillSelect('profile', Object.keys(PROFILES), state.settings.profile, (k) => PROFILES[k].label);
  // Training is sixty seconds of simulated time, so a speed control is not a
  // luxury. The chip in the bar reports what was actually achieved, which is
  // often less than what was asked for.
  fillSelect('speed', ['1', '4', 'max'], String(state.speed), (v) => (v === 'max' ? 'as fast as it can' : `${v}\u00d7 real time`));

  // The bench-state options come from the module that enforces them, so a state
  // cannot appear in the menu without the interlock knowing about it.
  el('bench-state').innerHTML = '<option value="">— not declared —</option>'
    + Object.values(BENCH_STATES)
      .map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.label)}</option>`)
      .join('');

  bind();
  rebuild();
  renderSources();
  renderLinkStats();
  el('link-support').textContent = 'serial' in navigator
    ? 'Web Serial is available in this browser.'
    : 'This browser has no Web Serial API. The framing and interlocks still run; nothing can be opened.';

  setRunning(true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

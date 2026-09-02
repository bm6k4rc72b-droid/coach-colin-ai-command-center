/**
 * HarvestEye application shell.
 *
 * Owns the camera loop, the overlay renderer and every panel. The interesting
 * logic lives in the modules this file imports — vision, tracker, forecast,
 * ledger, rowwalk — which are all pure and unit-tested; this file is the wiring
 * that makes them a phone app.
 *
 * @module harvest-eye/app
 */

import { CameraFeed } from './camera.js';
import { NEUTRAL_GAINS, whiteBalanceGains } from './color.js';
import { STAGES, learnAnchor, resolveProfiles, stageFor } from './crops.js';
import { forecastHarvest, formatDays, ripeningVelocity, spoilageRisk } from './forecast.js';
import { Ledger, toCsv, toGeoJson } from './ledger.js';
import { RowWalk } from './rowwalk.js';
import { ClusterTracker } from './tracker.js';
import { analyzeFrame, sampleHue, samplePatch } from './vision.js';

/**
 * Shorthand for `document.getElementById`.
 *
 * @param {string} id Element id.
 * @returns {HTMLElement} The element.
 */
const $ = (id) => document.getElementById(id);

const ledger = new Ledger();
const camera = new CameraFeed($('preview'));
const walk = new RowWalk();

/** Mutable application state. */
const state = {
  profiles: resolveProfiles(ledger.profileOverrides()),
  cropIndex: 0,
  running: false,
  mode: 'scan',
  gains: NEUTRAL_GAINS,
  analysis: null,
  tracks: [],
  fps: 0,
  lastAnalysis: 0,
  frame: null,
  position: null,
  watchId: null,
  torch: false,
  devices: [],
  deviceIndex: 0,
  teachSample: null,
  walking: false,
  forecast: null,
  measured: null,
  rateCache: { key: null, value: null },
  lastWalkRender: 0,
  settings: {
    plot: 'Block A',
    tempC: 22,
    minConfidence: 0.42,
    resolution: 224,
    gps: false,
    sound: false,
    haptics: true,
    boxes: true,
    heat: false,
    gains: null,
  },
};

let tracker = new ClusterTracker();
let audioContext = null;
let toastTimer = 0;

/** @returns {import('./crops.js').CropProfile} The active crop profile. */
function crop() {
  return state.profiles[state.cropIndex];
}

/**
 * Flash a short message above the readout.
 *
 * @param {string} message Text to show.
 * @param {number} [ms=2200] Visible duration.
 */
function toast(message, ms = 2200) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/**
 * Short confirmation buzz, when the operator has haptics enabled.
 *
 * @param {number|number[]} pattern Vibration pattern in milliseconds.
 */
function buzz(pattern) {
  if (state.settings.haptics && navigator.vibrate) navigator.vibrate(pattern);
}

/** Two-tone chirp announcing fruit that just crossed the harvest threshold. */
function chirp() {
  if (!state.settings.sound) return;
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1320, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(gain).connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  } catch {
    /* Audio is a nicety; never let it break the scan loop. */
  }
}

/* ------------------------------------------------------------------ setup */

/** Restore persisted settings into `state` and the settings controls. */
function loadSettings() {
  Object.assign(state.settings, ledger.settings());
  if (state.settings.gains) state.gains = state.settings.gains;
  const savedCrop = state.settings.cropId;
  const index = state.profiles.findIndex((profile) => profile.id === savedCrop);
  if (index >= 0) state.cropIndex = index;

  $('plotInput').value = state.settings.plot;
  $('tempInput').value = state.settings.tempC;
  $('confInput').value = state.settings.minConfidence;
  $('resInput').value = state.settings.resolution;
  $('gpsToggle').checked = state.settings.gps;
  $('soundToggle').checked = state.settings.sound;
  $('hapticToggle').checked = state.settings.haptics;
  $('boxToggle').checked = state.settings.boxes;
  $('maskToggle').checked = state.settings.heat;
  syncSettingLabels();
}

/** Mirror slider values into their live output labels. */
function syncSettingLabels() {
  $('tempOut').textContent = `${state.settings.tempC} °C`;
  $('confOut').textContent = Number(state.settings.minConfidence).toFixed(2);
  $('resOut').textContent = `${state.settings.resolution} px`;
  $('plotName').textContent = state.settings.plot;
  $('wbNote').textContent = state.settings.gains
    ? `White balance: calibrated (R ${state.gains.r.toFixed(2)} · G ${state.gains.g.toFixed(2)} · B ${state.gains.b.toFixed(2)}).`
    : 'White balance: not calibrated.';
}

/**
 * Persist a settings patch and refresh dependent UI.
 *
 * @param {Record<string, *>} patch Fields to change.
 */
function updateSettings(patch) {
  Object.assign(state.settings, patch);
  ledger.saveSettings(patch);
  syncSettingLabels();
}

/** Render the crop picker grid. */
function renderCrops() {
  const list = $('cropList');
  list.textContent = '';
  state.profiles.forEach((profile, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'crop-card';
    button.setAttribute('aria-pressed', String(index === state.cropIndex));
    button.innerHTML = `<span>${profile.emoji}</span>${profile.name}<em>${profile.cycleDays} d cycle</em>`;
    button.addEventListener('click', () => selectCrop(index));
    list.appendChild(button);
  });
  $('cropNote').textContent = crop().note;
}

/**
 * Switch the active crop and reset anything tuned to the previous one.
 *
 * @param {number} index Index into `state.profiles`.
 */
function selectCrop(index) {
  state.cropIndex = index;
  const profile = crop();
  tracker = new ClusterTracker({ prefix: profile.id.slice(0, 2).toUpperCase() });
  invalidateRate();
  updateSettings({ cropId: profile.id });
  $('cropEmoji').textContent = profile.emoji;
  $('cropName').textContent = profile.name;
  $('cropNote').textContent = profile.note;
  renderCrops();
  closeSheets();
  toast(`Scanning for ${profile.name.toLowerCase()}`);
}

/* ------------------------------------------------------------- scan loop */

/** Start the camera and the analysis loop. */
async function start() {
  try {
    $('startBtn').disabled = true;
    await camera.start({ facingMode: 'environment' });
    state.devices = await camera.devices();
    $('startGate').hidden = true;
    $('torchBtn').hidden = !camera.hasTorch();
    $('lensBtn').hidden = state.devices.length < 2;
    state.running = true;
    if (state.settings.gps) startLocation();
    requestAnimationFrame(loop);
  } catch (error) {
    $('startBtn').disabled = false;
    $('gateNote').textContent = describeCameraError(error);
  }
}

/**
 * Turn a `getUserMedia` rejection into something a grower can act on.
 *
 * @param {Error} error Rejection from the camera API.
 * @returns {string} Human-readable guidance.
 */
function describeCameraError(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError') {
    return 'Camera permission was denied. On iPhone: Settings → Safari → Camera → Allow. On Android: tap the lock icon in the address bar → Permissions.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No usable rear camera was found on this device.';
  }
  if (name === 'NotReadableError') {
    return 'Another app is holding the camera. Close it and try again.';
  }
  if (!window.isSecureContext) {
    return 'Camera access needs HTTPS (or localhost). Open this page over a secure connection.';
  }
  return error?.message || 'The camera could not be opened.';
}

/** Main animation loop: analyse on a budget, draw every frame. */
function loop() {
  if (!state.running) return;
  const now = performance.now();
  // Analysis is the expensive half; cap it near 15 Hz so mid-range phones keep
  // a smooth preview and do not cook themselves during a long row walk.
  if (now - state.lastAnalysis >= 66) {
    const elapsed = now - state.lastAnalysis;
    state.lastAnalysis = now;
    analyse();
    if (elapsed < 2000) state.fps = state.fps * 0.8 + (1000 / elapsed) * 0.2;
  }
  draw();
  requestAnimationFrame(loop);
}

/** Analyse one frame and refresh every derived readout. */
function analyse() {
  const frame = camera.grab(state.settings.resolution);
  if (!frame) return;
  state.frame = frame;
  const profile = crop();
  const analysis = analyzeFrame(frame, profile, {
    gains: state.gains,
    minConfidence: state.settings.minConfidence,
  });
  state.analysis = analysis;

  const { tracks, ripened } = tracker.update(analysis.clusters, profile.harvestAt);
  state.tracks = tracks;
  if (ripened.length) {
    chirp();
    buzz(30);
  }

  if (state.walking) {
    walk.add({
      maturity: analysis.meanMaturity,
      readyShare: analysis.readyShare,
      fruit: fruitEstimate(analysis),
      lat: state.position?.lat,
      lon: state.position?.lon,
      accuracy: state.position?.accuracy,
    });
    // The strip is a whole-row redraw; twice a second is plenty for someone
    // walking, and it keeps the analysis loop free for detection.
    const now = performance.now();
    if (now - state.lastWalkRender > 500) {
      state.lastWalkRender = now;
      renderWalk();
    }
  }

  updateReadout(analysis);
}

/**
 * Estimated fruit in view, summed over clusters.
 *
 * @param {object} analysis Frame analysis.
 * @returns {number} Fruit count estimate.
 */
function fruitEstimate(analysis) {
  return analysis.clusters.reduce((sum, cluster) => sum + cluster.count, 0);
}

/**
 * Measured ripening rate for a block, memoized.
 *
 * `updateReadout` runs on every analysed frame, and the regression reads the
 * whole ledger — so the result is cached until something that could change it
 * does (a new scan, a different block or crop).
 *
 * @param {string} plot Plot name.
 * @param {string} cropId Crop id.
 * @returns {{velocity:number,r2:number,samples:number}|null} Cached regression.
 */
function measuredRate(plot, cropId) {
  const key = JSON.stringify([plot, cropId]);
  if (state.rateCache.key !== key) {
    state.rateCache = { key, value: ripeningVelocity(ledger.history(plot, cropId)) };
  }
  return state.rateCache.value;
}

/** Drop the memoized regression after anything that could change it. */
function invalidateRate() {
  state.rateCache = { key: null, value: null };
}

/**
 * Refresh the verdict, maturity bar, stat tiles and stage mix.
 *
 * @param {object} analysis Frame analysis.
 */
function updateReadout(analysis) {
  const profile = crop();
  const measured = measuredRate(state.settings.plot, profile.id);
  const forecast = forecastHarvest(profile, analysis.meanMaturity, {
    tempC: state.settings.tempC,
    measured,
  });
  state.forecast = forecast;
  state.measured = measured;

  const fruit = fruitEstimate(analysis);
  const detected = analysis.clusters.length > 0;
  const meanConfidence = detected
    ? analysis.clusters.reduce((sum, c) => sum + c.confidence, 0) / analysis.clusters.length
    : 0;

  $('fpsText').textContent = `${state.fps.toFixed(0)} fps`;
  $('engineText').textContent = forecast.basis === 'measured' ? 'measured rate' : 'on-device';
  $('statReady').textContent = detected ? `${Math.round(analysis.readyShare * 100)}%` : '—';
  $('statFruit').textContent = detected ? String(fruit) : '—';
  $('statMaturity').textContent = detected ? analysis.meanMaturity.toFixed(2) : '—';
  $('statConfidence').textContent = detected ? meanConfidence.toFixed(2) : '—';
  $('statDecay').textContent = `${Math.round(analysis.decayShare * 100)}%`;

  const marker = $('maturityMarker');
  marker.style.left = `${Math.min(100, Math.max(0, analysis.meanMaturity * 100))}%`;
  const window_ = $('maturityWindow');
  window_.style.left = `${profile.harvestAt * 100}%`;
  window_.style.width = `${Math.max(2, (profile.overripeAt - profile.harvestAt) * 100)}%`;

  if (!detected) {
    $('verdictLabel').textContent = 'Scanning…';
    $('verdictSub').textContent = `No ${profile.name.toLowerCase()} found in frame — fill more of the view with the fruiting wall.`;
    $('daysValue').textContent = '—';
    $('daysCaption').textContent = 'to harvest';
    $('stageMix').textContent = '';
    return;
  }

  const risk = spoilageRisk(profile, analysis.meanMaturity, forecast.ratePerDay, fruit);
  const labels = {
    peak: 'At full colour — pick now',
    closing: 'Pick now — window closing',
    ready: 'Harvest-ready',
    approaching: 'Approaching harvest',
    immature: 'Still developing',
  };
  // Visible spoilage outranks the colour verdict: fruit that is browning is a
  // loss happening now, whatever the ripening curve says about it.
  const spoiling = analysis.decayShare > 0.06;
  $('verdictLabel').textContent = spoiling
    ? 'Spoilage visible — pick and cull'
    : labels[forecast.status];
  const inWindow = forecast.status === 'ready' || forecast.status === 'closing';
  $('daysValue').textContent = inWindow
    ? formatDays(forecast.daysToOverripe)
    : formatDays(forecast.daysToHarvest);
  $('daysCaption').textContent = inWindow ? 'window left' : 'to harvest';

  const basis = forecast.basis === 'measured'
    ? `measured at ${(forecast.ratePerDay * 100).toFixed(1)} %/day over ${measured.samples} scans`
    : `nominal rate at ${state.settings.tempC} °C`;
  const lossNote = risk.lossPerDay >= 1
    ? ` · ~${Math.round(risk.lossPerDay)} fruit/day lost if you wait`
    : '';
  const decayNote = spoiling
    ? ` · ${Math.round(analysis.decayShare * 100)}% of the view reads as spoiled`
    : '';
  $('verdictSub').textContent = `${fruit} fruit · ${stageFor(analysis.meanMaturity).label.toLowerCase()} · ${basis}${lossNote}${decayNote}`;

  const mix = $('stageMix');
  mix.textContent = '';
  const total = Object.values(analysis.stageMix).reduce((a, b) => a + b, 0) || 1;
  for (const stage of STAGES) {
    const count = analysis.stageMix[stage.label] || 0;
    if (!count) continue;
    const bar = document.createElement('i');
    bar.style.flex = String(count / total);
    bar.style.background = stage.color;
    bar.title = `${stage.label}: ${count}`;
    mix.appendChild(bar);
  }
}

/* -------------------------------------------------------------- overlay */

/** Draw tracked clusters over the live preview. */
function draw() {
  const canvas = $('overlay');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (!state.analysis || !state.settings.boxes) return;

  // The preview is `object-fit: cover`, so the analysis frame is scaled up by
  // the larger ratio and centre-cropped. Overlay geometry has to do the same or
  // every box drifts toward the edges.
  const { width: aw, height: ah } = state.analysis;
  const scale = Math.max(width / aw, height / ah);
  const offsetX = (width - aw * scale) / 2;
  const offsetY = (height - ah * scale) / 2;
  const profile = crop();

  ctx.lineWidth = 2;
  ctx.font = '600 11px ui-monospace, Menlo, monospace';
  ctx.textBaseline = 'top';

  for (const track of state.tracks) {
    const x = offsetX + track.x * scale;
    const y = offsetY + track.y * scale;
    const w = track.w * scale;
    const h = track.h * scale;
    const ready = track.maturity >= profile.harvestAt;

    if (state.settings.heat) {
      ctx.fillStyle = `${track.color}33`;
      ctx.fillRect(x, y, w, h);
    }

    ctx.strokeStyle = track.color;
    ctx.setLineDash(ready ? [] : [5, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    if (w < 42 || h < 30) continue;
    const label = `${track.id} ${Math.round(track.maturity * 100)}%`;
    const meta = ready
      ? 'READY'
      : formatDays(Math.max(0, (profile.harvestAt - track.maturity) / (state.forecast?.ratePerDay || 0.05)));
    const textWidth = Math.max(ctx.measureText(label).width, ctx.measureText(meta).width) + 10;

    ctx.fillStyle = 'rgba(3, 8, 5, 0.78)';
    ctx.fillRect(x, Math.max(0, y - 30), textWidth, 28);
    ctx.fillStyle = track.color;
    ctx.fillText(label, x + 5, Math.max(0, y - 30) + 3);
    ctx.fillStyle = ready ? '#ffffff' : '#9fb3a6';
    ctx.fillText(meta, x + 5, Math.max(0, y - 30) + 15);
  }
}

/* ------------------------------------------------------------- location */

/** Begin watching position for geotagging and row-walk distance. */
function startLocation() {
  if (!navigator.geolocation || state.watchId !== null) return;
  state.watchId = navigator.geolocation.watchPosition(
    (fix) => {
      state.position = {
        lat: fix.coords.latitude,
        lon: fix.coords.longitude,
        accuracy: fix.coords.accuracy,
      };
    },
    () => toast('Location unavailable — scans will be logged without a fix'),
    { enableHighAccuracy: true, maximumAge: 4000, timeout: 12000 },
  );
}

/** Stop watching position. */
function stopLocation() {
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null;
  state.position = null;
}

/* ----------------------------------------------------------------- scans */

/** Write the current frame's reading into the ledger. */
function logScan() {
  if (!state.analysis || !state.analysis.clusters.length) {
    toast('Nothing detected to log');
    return;
  }
  const analysis = state.analysis;
  const profile = crop();
  const record = ledger.add({
    cropId: profile.id,
    plot: state.settings.plot,
    lat: state.position?.lat ?? null,
    lon: state.position?.lon ?? null,
    accuracy: state.position?.accuracy ?? null,
    meanMaturity: analysis.meanMaturity,
    readyShare: analysis.readyShare,
    decayShare: analysis.decayShare,
    clusters: analysis.clusters.length,
    fruitEstimate: fruitEstimate(analysis),
    confidence: analysis.clusters.reduce((s, c) => s + c.confidence, 0) / analysis.clusters.length,
    tempC: state.settings.tempC,
    note: '',
  });
  buzz([18, 40, 18]);
  invalidateRate();

  const history = ledger.history(record.plot, record.cropId);
  const measured = ripeningVelocity(history);
  toast(measured
    ? `Logged. ${record.plot} is ripening at ${(measured.velocity * 100).toFixed(1)} %/day over ${history.length} scans.`
    : `Logged to ${record.plot}. Scan again in a day or two to measure this block's own ripening rate.`,
  3600);
}

/* ---------------------------------------------------------------- ledger */

/** Render the ledger sheet: one card per plot/crop, most urgent first. */
function renderLedger() {
  const body = $('ledgerBody');
  body.textContent = '';
  const scans = ledger.scans();
  if (!scans.length) {
    body.innerHTML = '<p class="empty">No scans yet. Log a scan and the trend for each block builds itself.</p>';
    return;
  }

  const groups = new Map();
  for (const scan of scans) {
    // Plot names contain spaces, so the group key is a JSON tuple rather than
    // a delimiter-joined string that could split back apart wrongly.
    const key = JSON.stringify([scan.plot, scan.cropId]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(scan);
  }

  const cards = [];
  for (const [key, rows] of groups) {
    const [plot, cropId] = JSON.parse(key);
    const profile = state.profiles.find((p) => p.id === cropId) || crop();
    const history = [...rows].sort((a, b) => a.ts - b.ts);
    const latest = history[history.length - 1];
    const measured = ripeningVelocity(history);
    const forecast = forecastHarvest(profile, latest.meanMaturity, {
      tempC: latest.tempC ?? state.settings.tempC,
      measured,
      now: Date.now(),
    });
    // A stale reading is not evidence of today's ripeness; carry the block
    // forward at its own rate so the queue orders by what is true now.
    const ageDays = (Date.now() - latest.ts) / 86_400_000;
    const projected = Math.min(1.2, latest.meanMaturity + forecast.ratePerDay * ageDays);
    const urgency = Math.max(0, (profile.harvestAt - projected) / forecast.ratePerDay);
    cards.push({ plot, profile, history, latest, measured, forecast, projected, urgency, ageDays });
  }
  cards.sort((a, b) => a.urgency - b.urgency);

  cards.forEach((card, index) => {
    const el = document.createElement('article');
    el.className = 'plot-block';

    const ready = card.projected >= card.profile.harvestAt;
    const head = document.createElement('header');
    head.innerHTML = `
      <h3>${card.profile.emoji} ${escapeHtml(card.plot)}${index === 0 && ready ? ' · pick first' : ''}</h3>
      <span class="verdict-line">${ready ? 'READY' : formatDays(card.urgency)}</span>`;
    el.appendChild(head);

    const basis = document.createElement('p');
    basis.className = 'basis';
    basis.textContent = card.measured
      ? `measured ${(card.measured.velocity * 100).toFixed(1)} %/day · r² ${card.measured.r2.toFixed(2)} · ${card.history.length} scans`
      : `nominal rate · ${card.history.length} scan${card.history.length === 1 ? '' : 's'} · scan again to measure`;
    el.appendChild(basis);

    const spark = document.createElement('div');
    spark.className = 'spark';
    for (const scan of card.history.slice(-24)) {
      const bar = document.createElement('i');
      bar.style.height = `${Math.max(4, scan.meanMaturity * 100)}%`;
      bar.style.background = stageFor(scan.meanMaturity).color;
      bar.title = `${new Date(scan.ts).toLocaleDateString()} — maturity ${scan.meanMaturity.toFixed(2)}`;
      spark.appendChild(bar);
    }
    el.appendChild(spark);

    for (const scan of [...card.history].reverse().slice(0, 5)) {
      const row = document.createElement('div');
      row.className = 'scan-row';
      const when = new Date(scan.ts).toLocaleString([], {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      const where = Number.isFinite(scan.lat) ? ' ⌖' : '';
      row.innerHTML = `<span>${when}${where}</span><span>m ${scan.meanMaturity.toFixed(2)} · ${Math.round(scan.readyShare * 100)}% ripe · ${scan.fruitEstimate} fruit</span>`;
      el.appendChild(row);
    }
    body.appendChild(el);
  });
}

/**
 * Escape text for the few places that build markup with template strings.
 *
 * @param {string} text Untrusted text, e.g. an operator-supplied plot name.
 * @returns {string} HTML-safe text.
 */
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

/**
 * Hand a generated file to the operator — share sheet where available, plain
 * download everywhere else.
 *
 * @param {string} filename Suggested file name.
 * @param {string} mime MIME type.
 * @param {string} text File contents.
 */
async function exportFile(filename, mime, text) {
  const blob = new Blob([text], { type: mime });
  const file = new File([blob], filename, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch {
      /* Operator dismissed the share sheet — fall through to a download. */
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(`${filename} saved`);
}

/* -------------------------------------------------------------- row walk */

/** Refresh the row-walk strip, tiles and hotspot list. */
function renderWalk() {
  const strip = walk.strip();
  const el = $('walkStrip');
  el.textContent = '';
  for (const bin of strip) {
    const bar = document.createElement('i');
    if (!bin.maturity && !bin.fruit) {
      bar.className = 'empty-bin';
    } else {
      bar.style.height = `${Math.max(8, Math.min(100, bin.readyShare * 100))}%`;
      bar.style.background = stageFor(bin.maturity).color;
      bar.title = `${bin.startMetre} m — ${Math.round(bin.readyShare * 100)}% ripe`;
    }
    el.appendChild(bar);
  }
  el.scrollLeft = el.scrollWidth;

  const summary = walk.summary();
  $('walkDistance').textContent = `${summary.distance.toFixed(0)} m`;
  $('walkSamples').textContent = String(summary.samples);
  $('walkReady').textContent = `${Math.round(summary.readyShare * 100)}%`;
  $('walkDensity').textContent = summary.fruitPerMetre ? summary.fruitPerMetre.toFixed(1) : '—';

  const hot = $('walkHotspots');
  hot.textContent = '';
  for (const bin of summary.hotspots) {
    if (!bin.fruit) continue;
    const row = document.createElement('div');
    row.className = 'hotspot';
    row.innerHTML = `<span>${bin.startMetre}–${bin.startMetre + walk.binMetres} m</span><span>${Math.round(bin.readyShare * 100)}% ripe · ${bin.fruit.toFixed(0)} fruit/frame</span>`;
    hot.appendChild(row);
  }
}

/** Start or stop the transect. */
function toggleWalk() {
  state.walking = !state.walking;
  $('walkToggleBtn').textContent = state.walking ? 'Stop walking' : 'Start walking';
  if (state.walking) {
    if (!state.settings.gps) {
      updateSettings({ gps: true });
      $('gpsToggle').checked = true;
    }
    startLocation();
    toast('Walking — hold the phone at the fruiting wall');
    buzz(25);
  } else {
    toast(`Transect: ${walk.summary().distance.toFixed(0)} m`);
  }
}

/** Store the finished transect as a single ledger entry. */
function logWalk() {
  const summary = walk.summary();
  if (!summary.samples) {
    toast('Walk a row first');
    return;
  }
  const profile = crop();
  ledger.add({
    cropId: profile.id,
    plot: state.settings.plot,
    lat: state.position?.lat ?? null,
    lon: state.position?.lon ?? null,
    accuracy: state.position?.accuracy ?? null,
    meanMaturity: summary.meanMaturity,
    readyShare: summary.readyShare,
    decayShare: state.analysis?.decayShare ?? 0,
    clusters: 0,
    fruitEstimate: Math.round(summary.fruitPerMetre * summary.distance),
    confidence: 0.6,
    tempC: state.settings.tempC,
    note: `row walk ${summary.distance.toFixed(0)} m, ${summary.samples} samples`,
  });
  invalidateRate();
  toast('Transect logged to the ledger');
  buzz([18, 40, 18]);
}

/* ------------------------------------------------- calibration and teach */

/** Run the white-balance capture against the centred reticle. */
function calibrate() {
  $('reticle').hidden = false;
  $('reticleHint').textContent = 'Fill the square with something neutral — a grey card, white bucket lid, sheet of paper — then hold still.';
  setTimeout(() => {
    const frame = camera.grab(state.settings.resolution);
    if (!frame) {
      $('reticle').hidden = true;
      return;
    }
    const patch = samplePatch(frame, 0.3);
    state.gains = whiteBalanceGains(patch);
    updateSettings({ gains: state.gains });
    $('reticle').hidden = true;
    buzz(40);
    toast(`White balance set (R ${state.gains.r.toFixed(2)} · G ${state.gains.g.toFixed(2)} · B ${state.gains.b.toFixed(2)})`, 3200);
  }, 2600);
}

/** Build the teach-mode stage buttons. */
function renderTeachStages() {
  const host = $('teachStages');
  host.textContent = '';
  const midpoints = [0.12, 0.38, 0.6, 0.8, 0.93, 1];
  STAGES.forEach((stage, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = stage.label;
    button.style.borderColor = stage.color;
    button.addEventListener('click', () => applyTeach(midpoints[index], stage.label));
    host.appendChild(button);
  });
}

/**
 * Bend the active crop's colour path toward the sampled fruit.
 *
 * @param {number} maturity Maturity the operator asserts.
 * @param {string} label Stage name, for the confirmation message.
 */
function applyTeach(maturity, label) {
  if (!state.teachSample) {
    toast('Tap a fruit in the viewfinder first');
    return;
  }
  const profile = learnAnchor(crop(), maturity, state.teachSample.hue);
  state.profiles[state.cropIndex] = profile;
  ledger.saveProfileOverride(profile.id, { huePath: profile.huePath });
  tracker.reset();
  state.teachSample = null;
  $('teachHue').textContent = '—';
  $('teachStatus').textContent = `Learned: ${label} for ${profile.name} now sits near ${profile.huePath.map((a) => Math.round(a.h)).join('°, ')}°.`;
  buzz(35);
  toast(`${profile.name} profile updated`);
}

/**
 * Sample the tapped point when teach mode is open.
 *
 * @param {PointerEvent} event Tap on the preview.
 */
function onPreviewTap(event) {
  if ($('teachSheet').hidden || !state.frame) return;
  const rect = $('preview').getBoundingClientRect();
  const { width: aw, height: ah } = state.frame;
  const scale = Math.max(rect.width / aw, rect.height / ah);
  const x = Math.round((event.clientX - rect.left - (rect.width - aw * scale) / 2) / scale);
  const y = Math.round((event.clientY - rect.top - (rect.height - ah * scale) / 2) / scale);
  if (x < 0 || y < 0 || x >= aw || y >= ah) return;
  const sample = sampleHue(state.frame, x, y, Math.round(aw * 0.03));
  state.teachSample = sample;
  $('teachHue').textContent = `${sample.hue.toFixed(0)}° · sat ${sample.saturation.toFixed(2)} · val ${sample.value.toFixed(2)}`;
  $('teachStatus').textContent = 'Now tell the app what stage that fruit is.';
  buzz(12);
}

/* ---------------------------------------------------------------- sheets */

/** Close every open sheet. */
function closeSheets() {
  for (const sheet of document.querySelectorAll('.sheet')) sheet.hidden = true;
}

/**
 * Open one sheet, closing any other.
 *
 * @param {string} id Sheet element id.
 */
function openSheet(id) {
  closeSheets();
  $(id).hidden = false;
}

/* ------------------------------------------------------------------ wire */

/** Attach every event handler. */
function wire() {
  $('startBtn').addEventListener('click', start);
  $('helpLink').addEventListener('click', () => openSheet('helpSheet'));
  $('helpLink2').addEventListener('click', () => openSheet('helpSheet'));
  $('cropChip').addEventListener('click', () => openSheet('cropSheet'));
  $('plotChip').addEventListener('click', () => {
    openSheet('menuSheet');
    $('plotInput').focus();
  });
  $('menuBtn').addEventListener('click', () => openSheet('menuSheet'));
  $('saveBtn').addEventListener('click', logScan);
  $('calibrateBtn').addEventListener('click', calibrate);
  $('teachBtn').addEventListener('click', () => {
    renderTeachStages();
    openSheet('teachSheet');
  });
  $('walkBtn').addEventListener('click', () => {
    renderWalk();
    openSheet('walkSheet');
  });
  $('ledgerBtn').addEventListener('click', () => {
    renderLedger();
    openSheet('ledgerSheet');
  });
  $('walkToggleBtn').addEventListener('click', toggleWalk);
  $('walkSaveBtn').addEventListener('click', logWalk);
  $('walkResetBtn').addEventListener('click', () => {
    walk.reset();
    renderWalk();
    toast('Transect cleared');
  });

  $('exportCsvBtn').addEventListener('click', () => {
    const scans = ledger.scans();
    if (!scans.length) return toast('Nothing to export yet');
    return exportFile(`harvesteye-${Date.now()}.csv`, 'text/csv', toCsv(scans));
  });
  $('exportGeoBtn').addEventListener('click', () => {
    const scans = ledger.scans();
    const geo = toGeoJson(scans);
    if (!geo.features.length) return toast('No geotagged scans yet — enable "Geotag scans"');
    return exportFile(`harvesteye-${Date.now()}.geojson`, 'application/geo+json', JSON.stringify(geo, null, 2));
  });
  $('resetWbBtn').addEventListener('click', () => {
    state.gains = NEUTRAL_GAINS;
    updateSettings({ gains: null });
    toast('White balance cleared');
  });
  $('resetProfilesBtn').addEventListener('click', () => {
    ledger.resetProfiles();
    state.profiles = resolveProfiles({});
    tracker.reset();
    renderCrops();
    toast('Taught colours forgotten');
  });

  $('torchBtn').addEventListener('click', async () => {
    state.torch = !state.torch;
    const applied = await camera.setTorch(state.torch);
    $('torchBtn').setAttribute('aria-pressed', String(applied && state.torch));
    if (!applied) toast('This device does not expose torch control to the browser');
  });
  $('lensBtn').addEventListener('click', async () => {
    if (state.devices.length < 2) return;
    state.deviceIndex = (state.deviceIndex + 1) % state.devices.length;
    try {
      await camera.start({ deviceId: state.devices[state.deviceIndex].deviceId });
      tracker.reset();
      toast(state.devices[state.deviceIndex].label || `Lens ${state.deviceIndex + 1}`);
    } catch {
      toast('That lens could not be opened');
    }
  });

  $('plotInput').addEventListener('change', (event) => {
    const value = event.target.value.trim() || 'Block A';
    event.target.value = value;
    updateSettings({ plot: value });
    invalidateRate();
    tracker.reset();
  });
  $('tempInput').addEventListener('input', (e) => updateSettings({ tempC: Number(e.target.value) }));
  $('confInput').addEventListener('input', (e) => updateSettings({ minConfidence: Number(e.target.value) }));
  $('resInput').addEventListener('input', (e) => updateSettings({ resolution: Number(e.target.value) }));
  $('gpsToggle').addEventListener('change', (e) => {
    updateSettings({ gps: e.target.checked });
    if (e.target.checked) startLocation();
    else stopLocation();
  });
  $('soundToggle').addEventListener('change', (e) => updateSettings({ sound: e.target.checked }));
  $('hapticToggle').addEventListener('change', (e) => updateSettings({ haptics: e.target.checked }));
  $('boxToggle').addEventListener('change', (e) => updateSettings({ boxes: e.target.checked }));
  $('maskToggle').addEventListener('change', (e) => updateSettings({ heat: e.target.checked }));

  for (const button of document.querySelectorAll('[data-close]')) {
    button.addEventListener('click', closeSheets);
  }
  for (const sheet of document.querySelectorAll('.sheet')) {
    sheet.addEventListener('click', (event) => {
      if (event.target === sheet) closeSheets();
    });
  }
  $('preview').addEventListener('pointerdown', onPreviewTap);

  document.addEventListener('visibilitychange', () => {
    // Releasing the loop while backgrounded keeps the phone cool and the
    // battery alive through a morning of scouting.
    if (document.hidden) {
      state.running = false;
    } else if (camera.stream) {
      state.running = true;
      requestAnimationFrame(loop);
    }
  });
}

/** Register the offline service worker, where the platform allows it. */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
    /* Offline caching is a bonus; the app works without it. */
  });
}

/** Boot the app. */
function init() {
  loadSettings();
  const profile = crop();
  tracker = new ClusterTracker({ prefix: profile.id.slice(0, 2).toUpperCase() });
  $('cropEmoji').textContent = profile.emoji;
  $('cropName').textContent = profile.name;
  renderCrops();
  renderTeachStages();
  wire();
  registerServiceWorker();
  if (!CameraFeed.supported()) {
    $('gateNote').textContent = 'This browser has no camera API. Open the page in Safari (iOS) or Chrome (Android) over HTTPS.';
    $('startBtn').disabled = true;
  }
}

init();

/**
 * Wiring: footage in, measurements out, caveats attached to both.
 *
 * The loop is deliberately boring. Grab a frame, check the camera has not
 * moved, segment it, track what is in it, work out who has the ball, draw what
 * was measured, and repeat. Everything interesting happens in the modules this
 * file calls; what lives here is the sequencing, the interface, and the two
 * decisions that keep the app honest under load:
 *
 * **Analysis runs at a fixed rate, drawing runs at the display's.** Segmenting
 * a frame costs real time on a phone. Tying it to the display's refresh means
 * the app quietly analyses fewer frames on a slow device and reports the same
 * numbers with worse precision. Instead the analysis rate is fixed, the actual
 * achieved rate is measured, and the overlay says so when it drops.
 *
 * **A stale calibration stops the metres, not the app.** When the camera is
 * nudged the homography is slid to follow it; when it is panned or zoomed the
 * fit is dead, and everything downstream is marked stale rather than left
 * running on numbers that no longer mean anything.
 *
 * @module touchline/app
 */

import {
  FULL_PITCH,
  apply,
  fitHomography,
  frameShift,
  landmarks,
  shiftHomography,
} from './pitch.js';
import { detect, fitTurf } from './segment.js';
import { Tracker } from './track.js';
import { TeamVote, assignTeam, clusterKits, palette } from './teams.js';
import { BallTracker, ballCandidates, ballPixelsAt } from './ball.js';
import { PossessionLedger, controlOf } from './possession.js';
import { passOptions, pressureOn } from './passing.js';
import { controlGrid, spaceAround, teamShape } from './space.js';
import { playerTable, teamTotals } from './metrics.js';
import {
  drawBall,
  drawPassLanes,
  drawPitchModel,
  drawPlan,
  drawPlayers,
  drawStrip,
} from './overlay.js';
import { matchReport } from './report.js';
import { PROVIDERS, ask, loadCredentials, saveCredentials } from './llm.js';

/** Frames a second the analysis aims for. */
const ANALYSIS_HZ = 12;

/** Longest edge frames are scaled to before analysis, pixels. */
const WORK_WIDTH = 640;

/** Image shift, in pixels, above which the fit is declared dead. */
const PAN_LIMIT_PX = 5;

/** Frames between refits of the turf model. */
const TURF_REFRESH_FRAMES = 60;

const $ = (id) => document.getElementById(id);

const dom = {
  app: $('app'),
  video: $('video'),
  view: $('view'),
  overlay: $('overlay'),
  plan: $('plan'),
  empty: $('viewport-empty'),
  statusChip: $('status-chip'),
  supportNote: $('support-note'),
  file: $('file'),
  readout: $('readout'),
  readoutTracks: $('readout-tracks'),
  readoutFit: $('readout-fit'),
  calibrationBar: $('calibration-bar'),
  calibrationTarget: $('calibration-target'),
  calibrationStatus: $('calibration-status'),
  marks: $('marks'),
  liveEmpty: $('live-empty'),
  live: $('live'),
  possession: $('possession'),
  carrier: $('carrier'),
  lanes: $('lanes'),
  players: $('players'),
  playersBody: $('players-body'),
  playersEmpty: $('players-empty'),
  playersNote: $('players-note'),
  planNote: $('plan-note'),
  report: $('report'),
  analyst: $('analyst'),
  analystAnswer: $('analyst-answer'),
  turfStatus: $('turf-status'),
  teamsStatus: $('teams-status'),
  llmStatus: $('llm-status'),
  llmProvider: $('llm-provider'),
  llmKey: $('llm-key'),
  settings: $('settings'),
};

const state = {
  source: null,
  running: false,
  tab: 'live',
  dimensions: { ...FULL_PITCH },
  marks: [],
  calibrating: false,
  calibrationIndex: 0,
  fit: null,
  fitSize: { width: 0, height: 0 },
  liveHomography: null,
  stale: false,
  staleFrames: 0,
  turf: null,
  tracker: new Tracker(),
  ball: new BallTracker(),
  vote: new TeamVote(),
  ledger: new PossessionLedger(),
  kitSamples: [],
  kitModel: null,
  names: { home: 'Team A', away: 'Team B' },
  colours: { home: '#4da3ff', away: '#ff6b57' },
  startedWallMs: 0,
  wallElapsedMs: 0,
  lastMediaMs: null,
  mediaZeroMs: null,
  mediaOffsetMs: 0,
  frames: 0,
  analysed: 0,
  achievedHz: 0,
  lastAnalysisMs: 0,
  previousFrame: null,
  latest: null,
  demo: null,
  showModel: true,
  showTerritory: true,
  showTrails: false,
  tolerance: 3.5,
  noise: 0,
  scratch: document.createElement('canvas'),
};

const scratchCtx = state.scratch.getContext('2d', { willReadFrequently: true });
const viewCtx = dom.view.getContext('2d');
const overlayCtx = dom.overlay.getContext('2d');
const planCtx = dom.plan.getContext('2d');

/** The landmarks calibration asks for, in the order it asks for them. */
function calibrationTargets() {
  const all = landmarks(state.dimensions);
  const wanted = [
    'box-left-near',
    'box-left-far',
    'box-left-goal-near',
    'box-left-goal-far',
    'six-left-near',
    'six-left-far',
    'halfway-near',
    'halfway-far',
    'corner-near-left',
    'corner-far-left',
    'box-right-near',
    'box-right-far',
  ];
  return wanted.map((id) => all.find((mark) => mark.id === id)).filter(Boolean);
}

/* ------------------------------------------------------------------ sources */

/** Open the device camera. */
async function useCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    dom.video.srcObject = stream;
    dom.video.muted = true;
    await dom.video.play();
    begin('camera');
  } catch (error) {
    dom.supportNote.textContent = `The camera could not be opened: ${error?.message ?? error}`;
  }
}

/** Open a video file the user picked. */
async function useFile(file) {
  if (!file) return;
  dom.video.srcObject = null;
  dom.video.src = URL.createObjectURL(file);
  dom.video.muted = true;
  try {
    await dom.video.play();
    begin('file');
  } catch (error) {
    dom.supportNote.textContent = `That file would not play: ${error?.message ?? error}`;
  }
}

/**
 * Start the loop against whatever source is now playing.
 *
 * @param {'camera'|'file'|'demo'} kind Where the frames come from.
 */
function begin(kind) {
  state.source = kind;
  state.running = true;
  state.frames = 0;
  state.analysed = 0;
  state.previousFrame = null;
  state.startedWallMs = performance.now();
  state.wallElapsedMs = 0;
  state.lastMediaMs = null;
  state.mediaZeroMs = null;
  state.mediaOffsetMs = 0;
  dom.empty.hidden = true;
  dom.readout.hidden = false;
  setChip(kind === 'camera' ? 'Camera live' : 'Playing', 'chip-live');
  startLoops();
}

/** Set the status chip. */
function setChip(text, variant = 'chip-quiet') {
  dom.statusChip.textContent = text;
  dom.statusChip.className = `chip ${variant}`;
}

/* -------------------------------------------------------------------- loop */

/**
 * Turn a frame's media time into a session clock.
 *
 * Every speed in the app is a distance divided by one of these, so where the
 * time comes from matters as much as where the distance does. It is the time
 * stamped on the *frame*, not the time the analysis got round to it — a browser
 * hands frames over when it feels like it, and using wall time makes a player
 * appear to cover the ground between two frames in however long the CPU took,
 * which reads several km/h fast on a busy device and slow on an idle one.
 *
 * The wrap check exists for looping clips: a video that starts again reports a
 * media time of zero, and without this the session clock would run backwards
 * and every speed with it.
 *
 * @param {number} mediaMs The frame's own timestamp, milliseconds.
 * @returns {number} Milliseconds since analysis started.
 */
function sessionTime(mediaMs) {
  if (state.lastMediaMs !== null && mediaMs < state.lastMediaMs - 200) {
    state.mediaOffsetMs += state.lastMediaMs;
  }
  state.lastMediaMs = mediaMs;
  if (state.mediaZeroMs === null) state.mediaZeroMs = mediaMs;
  return state.mediaOffsetMs + mediaMs - state.mediaZeroMs;
}

/**
 * Analyse frames as the video delivers them, and draw at the display's rate.
 *
 * `requestVideoFrameCallback` fires once per delivered frame and carries that
 * frame's media time, which is exactly what the analysis needs and what a
 * display-driven loop cannot give it: without it the same frame can be measured
 * twice, once as movement and once as a player standing still.
 */
function startLoops() {
  const analyseFrame = (mediaMs) => {
    const wall = performance.now();
    if (wall - state.lastAnalysisMs < 1000 / ANALYSIS_HZ) return;
    state.lastAnalysisMs = wall;
    state.wallElapsedMs = wall - state.startedWallMs;
    analyse(sessionTime(mediaMs));
  };

  if (typeof dom.video.requestVideoFrameCallback === 'function') {
    const onFrame = (_now, metadata) => {
      if (!state.running) return;
      analyseFrame(metadata.mediaTime * 1000);
      dom.video.requestVideoFrameCallback(onFrame);
    };
    dom.video.requestVideoFrameCallback(onFrame);
  }

  const onDisplay = () => {
    if (!state.running) return;
    // Browsers without per-frame callbacks fall back to the video's own clock,
    // which is still the frame's time rather than the analysis's.
    if (typeof dom.video.requestVideoFrameCallback !== 'function' && dom.video.readyState >= 2) {
      analyseFrame(dom.video.currentTime * 1000);
    }
    draw();
    requestAnimationFrame(onDisplay);
  };
  requestAnimationFrame(onDisplay);
}

/**
 * Wait until the video element actually has a frame to give.
 *
 * @param {number} [timeoutMs=8000] How long to wait before giving up.
 * @returns {Promise<boolean>} Whether a frame arrived.
 */
function frameReady(timeoutMs = 8000) {
  if (dom.video.readyState >= 2 && dom.video.videoWidth > 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const started = performance.now();
    const poll = () => {
      if (dom.video.readyState >= 2 && dom.video.videoWidth > 0) resolve(true);
      else if (performance.now() - started > timeoutMs) resolve(false);
      else requestAnimationFrame(poll);
    };
    poll();
  });
}

/** Pull the current video frame into the working canvas. */
function grab() {
  const vw = dom.video.videoWidth;
  const vh = dom.video.videoHeight;
  if (!vw || !vh) return null;
  const scale = Math.min(1, WORK_WIDTH / vw);
  const width = Math.round(vw * scale);
  const height = Math.round(vh * scale);
  if (state.scratch.width !== width || state.scratch.height !== height) {
    const grew = Boolean(state.fitSize.width);
    state.scratch.width = width;
    state.scratch.height = height;
    dom.view.width = width;
    dom.view.height = height;
    dom.overlay.width = width;
    dom.overlay.height = height;
    // The homography was fitted in the coordinates of whatever size the frame
    // was then, so a change of working size invalidates it rather than silently
    // scaling every measurement. The comparison is against the size the fit was
    // actually made at — not merely "the canvas changed" — because the canvas
    // also changes the first time a source delivers a frame, and treating that
    // as a pan killed the calibration of every clip before it had analysed one
    // frame of it.
    if (grew && (state.fitSize.width !== width || state.fitSize.height !== height)) {
      markStale('the frame size changed');
    }
  }
  scratchCtx.drawImage(dom.video, 0, 0, width, height);
  return scratchCtx.getImageData(0, 0, width, height);
}

/**
 * Declare the calibration no longer valid, with a reason.
 *
 * The count is kept because the written report has to say how much of the
 * session was measured against a camera that had moved. A session that spent
 * half its frames stale is a different document from one that spent none.
 *
 * @param {string} reason What invalidated it, in the words the app will use.
 */
function markStale(reason) {
  if (!state.stale) setChip('Calibration stale', 'chip-warn');
  state.stale = true;
  state.staleReason = reason;
  state.staleFrames += 1;
}

/**
 * One analysis pass.
 *
 * @param {number} timeMs Session time of this frame, from {@link sessionTime}.
 */
function analyse(timeMs) {
  const frame = grab();
  if (!frame) return;
  state.frames += 1;
  state.analysed += 1;
  // Measured against the wall rather than the clip, so the figure on screen is
  // how fast this device is actually keeping up.
  state.achievedHz =
    state.wallElapsedMs > 0 ? (state.analysed / state.wallElapsedMs) * 1000 : 0;

  // Has the camera moved? A nudge is compensated, a pan is fatal, and the
  // difference between them is one threshold rather than a judgement call.
  if (state.previousFrame && state.liveHomography) {
    const shift = frameShift(state.previousFrame, frame, PAN_LIMIT_PX + 2);
    const magnitude = Math.hypot(shift.dx, shift.dy);
    if (magnitude > 0 && shift.confidence > 0.08) {
      if (magnitude <= PAN_LIMIT_PX) {
        state.liveHomography = shiftHomography(state.liveHomography, shift.dx, shift.dy);
        state.tracker.setHomography(state.liveHomography);
        state.ball.setHomography(state.liveHomography);
      } else {
        markStale('the camera panned or zoomed');
      }
    }
  }
  state.previousFrame = frame;

  if (!state.liveHomography || state.stale) {
    state.latest = null;
    updateReadout();
    return;
  }


  if (!state.turf || state.frames % TURF_REFRESH_FRAMES === 0) {
    state.turf = fitTurf(frame, {
      imageToPitch: state.liveHomography,
      dimensions: state.dimensions,
      tolerance: state.tolerance,
    });
    dom.turfStatus.textContent = state.turf.samples
      ? `Grass model from ${state.turf.samples} samples; ${Math.round(
          state.turf.coverage * 100,
        )}% of the marked area reads as turf.`
      : 'The marked area has no pixels in frame.';
  }

  const detection = detect(frame, {
    turf: state.turf,
    imageToPitch: state.liveHomography,
    dimensions: state.dimensions,
    openRadius: state.noise,
  });

  const { live } = state.tracker.update(detection.candidates, timeMs);

  for (const candidate of detection.candidates) {
    if (candidate.kit && candidate.kit.samples > 12 && !candidate.merged) {
      state.kitSamples.push(candidate.kit);
      if (state.kitSamples.length > 600) state.kitSamples.shift();
    }
  }
  if (state.kitSamples.length >= 12 && state.frames % 15 === 0) {
    state.kitModel = clusterKits(state.kitSamples);
    if (state.kitModel) {
      const kit = palette(state.kitModel);
      state.colours = { home: kit.home.css, away: kit.away.css };
      dom.teamsStatus.textContent = state.kitModel.reliable
        ? `Two kits separated by ${state.kitModel.separation.toFixed(2)} in colour — comfortably apart.`
        : `The two kits are only ${state.kitModel.separation.toFixed(
            2,
          )} apart in colour. Team labels are not reliable; treat the possession split as unknown.`;
    }
  }
  for (const track of live) {
    const team = state.kitModel
      ? assignTeam(track.kit, state.kitModel)
      : 'other';
    track.team = state.vote.cast(track.id, team, track.contested ? 0.3 : 1);
  }

  const ballState = state.ball.update(
    ballCandidates(frame, detection.blobs, {
      imageToPitch: state.liveHomography,
      dimensions: state.dimensions,
    }),
    timeMs,
  );

  const control = controlOf(live, ballState);
  const held = state.ledger.update(control, timeMs);

  const carrier = held.holderId !== null ? live.find((t) => t.id === held.holderId) ?? null : null;
  let options = [];
  let pressure = null;
  let localSpace = null;
  if (carrier && (carrier.team === 'home' || carrier.team === 'away')) {
    const mates = live.filter((t) => t.team === carrier.team && t.id !== carrier.id);
    const opponents = live.filter(
      (t) => (t.team === 'home' || t.team === 'away') && t.team !== carrier.team,
    );
    options = passOptions(carrier, mates, opponents, { dimensions: state.dimensions });
    pressure = pressureOn(carrier, opponents);
    localSpace = spaceAround(carrier, live, { dimensions: state.dimensions });
  }

  state.latest = {
    timeMs,
    live,
    ball: ballState,
    control,
    held,
    carrier,
    options,
    pressure,
    localSpace,
    grid: state.showTerritory ? controlGrid(live, { dimensions: state.dimensions }) : null,
  };
  updateReadout();
  refreshPanels();
}

/* ------------------------------------------------------------------ drawing */

/** Draw the frame and everything measured on top of it. */
function draw() {
  const width = dom.view.width;
  const height = dom.view.height;
  if (!width || !height) return;
  if (dom.video.readyState >= 2) viewCtx.drawImage(dom.video, 0, 0, width, height);
  overlayCtx.clearRect(0, 0, width, height);

  const scale = Math.max(0.75, width / 640);
  if (state.showModel && state.liveHomography && state.fit) {
    drawPitchModel(overlayCtx, state.fit.pitchToImage, state.dimensions);
  }
  drawMarks();

  const latest = state.latest;
  if (!latest || !state.fit) return;
  const pitchToImage = state.fit.pitchToImage;

  // One list of what has been labelled, shared by the lanes and the players, so
  // a pass-lane figure and a player's speed cannot land on top of each other.
  const placed = [];
  if (latest.carrier && latest.options.length) {
    drawPassLanes(overlayCtx, latest.carrier, latest.options, pitchToImage, scale, placed);
  }
  drawPlayers(overlayCtx, latest.live, pitchToImage, {
    scale,
    carrierId: latest.held.holderId,
    stale: state.stale,
    placed,
  });
  drawBall(overlayCtx, latest.ball, pitchToImage, scale);
  drawStrip(overlayCtx, stripCells(), width, height, scale);
}

/** Show the marks placed so far, so a misplaced one can be seen and cleared. */
function drawMarks() {
  if (!state.marks.length) return;
  overlayCtx.save();
  overlayCtx.strokeStyle = '#6ef2b0';
  overlayCtx.fillStyle = 'rgba(110, 242, 176, 0.25)';
  overlayCtx.lineWidth = 1.4;
  for (const mark of state.marks) {
    overlayCtx.beginPath();
    overlayCtx.arc(mark.image.x, mark.image.y, 5, 0, Math.PI * 2);
    overlayCtx.fill();
    overlayCtx.stroke();
  }
  overlayCtx.restore();
}

/** The bottom strip: the figures, each with its own denominator. */
function stripCells() {
  const latest = state.latest;
  if (!latest) return [];
  const possession = state.ledger.summary();
  const cells = [];

  if (possession.assignedMs > 0) {
    cells.push({
      label: 'On the ball',
      value: `${Math.round(possession.homeShare * 100)} / ${Math.round(possession.awayShare * 100)}`,
      note: `of ${(possession.assignedMs / 1000).toFixed(0)} s attributed`,
      accent: possession.homeShare >= possession.awayShare ? state.colours.home : state.colours.away,
    });
  } else {
    cells.push({ label: 'On the ball', value: '—', note: 'nothing attributable yet' });
  }

  cells.push({
    label: 'Ball seen',
    value: `${Math.round(latest.ball.seenShare * 100)}%`,
    note: 'of analysed frames',
  });

  if (latest.pressure && latest.pressure.nearestM !== null) {
    cells.push({
      label: 'Nearest defender',
      value: `${latest.pressure.nearestM.toFixed(1)} m`,
      note: latest.pressure.closingMps > 0.5 ? `closing ${latest.pressure.closingMps.toFixed(1)} m/s` : 'holding',
    });
  }

  if (latest.localSpace) {
    const carrierTeam = latest.carrier?.team;
    const share = carrierTeam === 'away' ? latest.localSpace.away : latest.localSpace.home;
    cells.push({
      label: 'Space, 20 m',
      value: `${Math.round(share * 100)}%`,
      note: 'first to reach, own team',
    });
  }

  cells.push({
    label: 'Tracked',
    value: String(latest.live.length),
    note: `${state.achievedHz.toFixed(1)} fps analysed`,
  });
  return cells;
}

/** Keep the small overlay readout current. */
function updateReadout() {
  const latest = state.latest;
  dom.readoutTracks.textContent = latest
    ? `${latest.live.length} tracked · ${state.achievedHz.toFixed(1)} fps`
    : `${state.marks.length}/4 landmarks marked`;
  dom.readoutFit.className = 'readout-row muted';
  if (state.stale) {
    dom.readoutFit.className = 'readout-row warn';
    dom.readoutFit.textContent = `metres are stale — ${state.staleReason}. Re-mark the pitch.`;
  } else if (state.fit) {
    dom.readoutFit.textContent = `pitch model fits to ${state.fit.residualM.toFixed(
      2,
    )} m (worst ${state.fit.worstM.toFixed(2)} m)`;
  } else {
    dom.readoutFit.textContent = 'no pitch model — nothing is in metres';
  }
}

/* ------------------------------------------------------------------- panels */

/** Refresh whichever panel is on screen. */
function refreshPanels() {
  if (state.tab === 'live') refreshLive();
  else if (state.tab === 'plan') refreshPlan();
  else if (state.tab === 'players') refreshPlayers();
  else refreshReport();
}

/** The on-the-ball panel. */
function refreshLive() {
  const latest = state.latest;
  if (!latest) return;
  dom.liveEmpty.hidden = true;
  dom.live.hidden = false;

  const possession = state.ledger.summary();
  const home = Math.round(possession.homeShare * 100);
  const away = Math.round(possession.awayShare * 100);
  const attributed = Math.round(possession.assignedShare * 100);
  const unseen = (possession.unassignedMs.unseen / 1000).toFixed(0);
  dom.possession.innerHTML = `
    <div class="poss-bar">
      <div class="poss-home" style="width:${home * (attributed / 100)}%"></div>
      <div class="poss-away" style="width:${away * (attributed / 100)}%"></div>
      <div class="poss-unassigned" style="width:${100 - attributed}%"></div>
    </div>
    <div class="poss-legend">
      <span class="home">${escapeHtml(state.names.home)} ${home}%</span>
      <span class="away">${away}% ${escapeHtml(state.names.away)}</span>
    </div>
    <p class="poss-note">
      Shares of the ${attributed}% of time that could be attributed to a side. The other
      ${100 - attributed}% is the ball out of sight (${unseen} s), loose, in flight or contested —
      it is not split between the teams.
    </p>`;

  if (!latest.carrier) {
    dom.carrier.innerHTML = `<strong>Nobody on the ball</strong><span class="sub">${describeControl(
      latest.control,
    )}</span>`;
    dom.lanes.innerHTML = '';
    return;
  }

  const pressure = latest.pressure;
  dom.carrier.innerHTML = `
    <strong>${escapeHtml(latest.carrier.label)} · ${(latest.carrier.speedMps * 3.6).toFixed(1)} km/h</strong>
    <span class="sub">
      ${pressure && pressure.nearestM !== null
        ? `nearest opponent ${pressure.nearestM.toFixed(1)} m${
            pressure.closingMps > 0.5 ? `, closing at ${pressure.closingMps.toFixed(1)} m/s` : ''
          }, ${pressure.within} within 5 m`
        : 'no opponent tracked nearby'}
    </span>`;

  dom.lanes.innerHTML = latest.options
    .map(
      (option) => `
      <li class="lane ${option.screened ? 'lane-screened' : 'lane-open'}">
        <span class="who">to ${escapeHtml(option.label)}${option.forward ? ' ↑' : ''}</span>
        <span class="openness">${option.screened ? 'screened' : 'clear'}</span>
        <span class="metrics">
          ${option.lengthM.toFixed(0)} m ·
          ${option.screened
            ? `screened, nearest defender ${option.clearanceM.toFixed(1)} m off the line`
            : `clear by ${option.clearanceM.toFixed(1)} m`}
          ${option.closing ? `· closing to ${option.clearanceAtArrivalM.toFixed(1)} m in flight` : ''}
          · receiver has ${option.receiverSpaceM === null ? '—' : `${option.receiverSpaceM.toFixed(1)} m`}
        </span>
      </li>`,
    )
    .join('');
}

/** Say why nobody has the ball, in the app's own words. */
function describeControl(control) {
  switch (control.state) {
    case 'unseen':
      return 'The ball is not visible in this frame, so no possession is being counted.';
    case 'in-flight':
      return 'The ball is travelling too fast to be under anyone’s control.';
    case 'contested':
      return 'Two opponents are equally close to it; this time is counted as contested.';
    default:
      return 'The ball is loose — nobody is within controlling distance of it.';
  }
}

/** The plan view. */
function refreshPlan() {
  const latest = state.latest;
  if (!latest) return;
  dom.planNote.textContent = state.stale
    ? 'The camera moved. Positions below are from the last good fit and are not being updated.'
    : `Everyone the app can currently see, on a ${state.dimensions.lengthM} × ${state.dimensions.widthM} m pitch.`;
  drawPlan(planCtx, {
    players: latest.live,
    ball: latest.ball,
    grid: latest.grid,
    dimensions: state.dimensions,
    width: dom.plan.width,
    height: dom.plan.height,
    trails: state.showTrails ? latest.live : [],
  });
}

/** The player table. */
function refreshPlayers() {
  const latest = state.latest;
  if (!latest) return;
  const rows = playerTable(state.tracker.tracks.filter((t) => t.confirmed), latest.timeMs);
  dom.playersEmpty.hidden = rows.length > 0;
  dom.players.hidden = rows.length === 0;
  dom.playersBody.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td><span class="who"><span class="dot dot-${row.team}"></span>${escapeHtml(row.label)}</span></td>
        <td>${row.distanceM < 1000 ? `${Math.round(row.distanceM)} m` : `${(row.distanceM / 1000).toFixed(2)} km`}</td>
        <td>${row.topSpeedKph.toFixed(1)}</td>
        <td>${row.sprints}</td>
        <td><span class="coverage"><span style="width:${Math.round(row.coverage * 100)}%"></span></span></td>
      </tr>`,
    )
    .join('');
  dom.playersNote.textContent =
    'Top speed is km/h. The bar is how much of the session that player was tracked for — a total from 20% coverage is a fifth of a session, not a fifth of a player.';
}

/** The written report. */
function refreshReport() {
  const latest = state.latest;
  if (!latest) return;
  const rows = playerTable(state.tracker.tracks.filter((t) => t.confirmed), latest.timeMs);
  const report = matchReport({
    sessionMs: latest.timeMs,
    possession: state.ledger.summary(),
    ball: latest.ball,
    rows,
    totals: {
      home: teamTotals(rows.filter((r) => r.team === 'home')),
      away: teamTotals(rows.filter((r) => r.team === 'away')),
    },
    teams: { names: state.names },
    calibration: state.fit,
    staleFrames: state.staleFrames,
    shape: {
      home: teamShape(latest.live.filter((p) => p.team === 'home')),
      away: teamShape(latest.live.filter((p) => p.team === 'away')),
    },
  });
  state.digest = report.digest;
  dom.report.innerHTML = `
    <h3>${escapeHtml(report.headline)}</h3>
    <ul class="caveats">${report.caveats.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
    <ul class="lines">${report.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`;
  dom.analyst.hidden = !loadCredentials()?.key;
}

/** Escape text before it goes anywhere near innerHTML. */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
}

/* -------------------------------------------------------------- calibration */

/** Begin marking landmarks. */
function startCalibration() {
  state.calibrating = true;
  state.calibrationIndex = 0;
  state.marks = [];
  state.fit = null;
  state.liveHomography = null;
  state.stale = false;
  dom.calibrationBar.hidden = false;
  dom.settings.hidden = true;
  showCalibrationTarget();
  updateReadout();
}

/** Show which landmark is being asked for. */
function showCalibrationTarget() {
  const targets = calibrationTargets();
  const target = targets[state.calibrationIndex];
  if (!target) {
    finishCalibration();
    return;
  }
  dom.calibrationTarget.textContent = target.label;
}

/** Record a click as the current landmark. */
function placeMark(event) {
  if (!state.calibrating) return;
  const rect = dom.overlay.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * dom.overlay.width;
  const y = ((event.clientY - rect.top) / rect.height) * dom.overlay.height;
  const targets = calibrationTargets();
  const target = targets[state.calibrationIndex];
  if (!target) return;
  state.marks.push({ id: target.id, label: target.label, image: { x, y }, pitch: { x: target.x, y: target.y } });
  state.calibrationIndex += 1;
  renderMarks();
  if (state.marks.length >= 4) tryFit();
  if (state.calibrationIndex >= targets.length) finishCalibration();
  else showCalibrationTarget();
  updateReadout();
}

/** Fit the homography to the marks placed so far. */
function tryFit() {
  const fit = fitHomography(state.marks);
  if (!fit) {
    dom.calibrationStatus.textContent =
      'Those marks do not describe a plane — three of them are probably in a line. Clear and try corners further apart.';
    return;
  }
  state.fit = fit;
  state.fitSize = { width: dom.view.width, height: dom.view.height };
  state.liveHomography = fit.imageToPitch;
  state.stale = false;
  state.staleFrames = 0;
  state.turf = null;
  state.tracker = new Tracker({ imageToPitch: fit.imageToPitch });
  state.ball = new BallTracker({ imageToPitch: fit.imageToPitch });
  state.vote = new TeamVote();
  state.ledger = new PossessionLedger();
  state.kitSamples = [];
  state.kitModel = null;
  // A new pitch model is a new session: the tracks, the ledger and the clock
  // all start again rather than carrying figures measured against the old one.
  state.analysed = 0;
  state.startedWallMs = performance.now();
  state.wallElapsedMs = 0;
  state.lastMediaMs = null;
  state.mediaZeroMs = null;
  state.mediaOffsetMs = 0;
  const ballPx = ballPixelsAt(fit.imageToPitch, dom.view.width / 2, dom.view.height * 0.35);
  dom.calibrationStatus.textContent = `Fitted to ${state.marks.length} marks: ${fit.residualM.toFixed(
    2,
  )} m average error, ${fit.worstM.toFixed(2)} m at worst. A ball at mid-frame is about ${ballPx.toFixed(
    1,
  )} px across${ballPx < 2 ? ' — too small to detect reliably, so possession will mostly be unattributed.' : '.'}`;
  setChip('Measuring', 'chip-live');
  updateReadout();
}

/** Leave calibration mode. */
function finishCalibration() {
  state.calibrating = false;
  dom.calibrationBar.hidden = true;
}

/** List the marks placed, so a bad one can be spotted. */
function renderMarks() {
  dom.marks.innerHTML = state.marks
    .map(
      (mark) =>
        `<li><span>${escapeHtml(mark.label)}</span><span>${Math.round(mark.image.x)}, ${Math.round(
          mark.image.y,
        )} px${mark.errorM !== undefined ? ` · ${mark.errorM.toFixed(2)} m off` : ''}</span></li>`,
    )
    .join('');
}

/* --------------------------------------------------------------------- demo */

/**
 * The built-in demo: a training-ground move, drawn rather than filmed.
 *
 * It exists so the app can be judged without anyone finding footage first, and
 * it is honest about being synthetic — the status chip says so. The players
 * move at speeds written in the code, which makes it the one clip where the
 * right answer is known, so a reader can check what the app reports against
 * what was asked for.
 */
async function runDemo() {
  const { startDemo, DEMO_CAMERA } = await import('./demo.js');
  state.demo?.stop();
  const demo = startDemo();
  state.demo = demo;
  dom.video.src = '';
  dom.video.srcObject = demo.stream;
  dom.video.muted = true;
  await dom.video.play();
  state.dimensions = { ...FULL_PITCH };
  // Wait for a frame before fitting anything. The marks are in the coordinates
  // of the analysis canvas, and until a source has delivered a frame that
  // canvas has no size to speak of — fitting first and sizing second produces a
  // pitch model in one coordinate system used in another.
  await frameReady();
  grab();
  const scale = dom.view.width / DEMO_CAMERA.width;
  state.marks = demo.marks.map((mark) => ({
    ...mark,
    image: { x: mark.image.x * scale, y: mark.image.y * scale },
  }));
  renderMarks();
  begin('demo');
  // The demo's camera is known exactly, so the clip calibrates itself and the
  // app starts measuring without anybody tapping four landmarks first.
  tryFit();
  setChip('Demo — synthetic footage', 'chip-warn');
}

/* ------------------------------------------------------------------ binding */

dom.overlay.addEventListener('pointerdown', placeMark);
$('start-camera').addEventListener('click', useCamera);
$('start-file').addEventListener('click', () => dom.file.click());
$('start-demo').addEventListener('click', runDemo);
dom.file.addEventListener('change', (event) => useFile(event.target.files?.[0]));
$('calibrate').addEventListener('click', startCalibration);
$('calibration-cancel').addEventListener('click', finishCalibration);
$('calibration-skip').addEventListener('click', () => {
  state.calibrationIndex += 1;
  showCalibrationTarget();
});
$('calibrate-clear').addEventListener('click', () => {
  state.marks = [];
  state.fit = null;
  state.liveHomography = null;
  renderMarks();
  dom.calibrationStatus.textContent = 'No pitch model.';
  updateReadout();
});
$('settings-toggle').addEventListener('click', () => {
  dom.settings.hidden = !dom.settings.hidden;
  $('settings-toggle').setAttribute('aria-expanded', String(!dom.settings.hidden));
});
$('settings-close').addEventListener('click', () => {
  dom.settings.hidden = true;
});
$('pitch-length').addEventListener('change', (event) => {
  state.dimensions.lengthM = Number(event.target.value) || FULL_PITCH.lengthM;
});
$('pitch-width').addEventListener('change', (event) => {
  state.dimensions.widthM = Number(event.target.value) || FULL_PITCH.widthM;
});
$('tolerance').addEventListener('input', (event) => {
  state.tolerance = Number(event.target.value);
  $('tolerance-value').textContent = state.tolerance.toFixed(1);
  state.turf = null;
});
$('noise').addEventListener('input', (event) => {
  state.noise = Number(event.target.value);
  $('noise-value').textContent = state.noise ? `${state.noise} px` : 'off';
});
$('relearn').addEventListener('click', () => {
  state.turf = null;
});
$('show-model').addEventListener('change', (event) => {
  state.showModel = event.target.checked;
});
$('show-territory').addEventListener('change', (event) => {
  state.showTerritory = event.target.checked;
});
$('show-trails').addEventListener('change', (event) => {
  state.showTrails = event.target.checked;
});
$('name-home').addEventListener('input', (event) => {
  state.names.home = event.target.value.trim() || 'Team A';
});
$('name-away').addEventListener('input', (event) => {
  state.names.away = event.target.value.trim() || 'Team B';
});
$('tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('.tab');
  if (!tab) return;
  state.tab = tab.dataset.tab;
  for (const button of dom.app.querySelectorAll('.tab')) {
    button.classList.toggle('tab-on', button === tab);
  }
  for (const name of ['live', 'plan', 'players', 'report']) {
    $(`tab-${name}`).hidden = name !== state.tab;
  }
  refreshPanels();
});
$('export').addEventListener('click', () => {
  const latest = state.latest;
  if (!latest) return;
  const rows = playerTable(state.tracker.tracks.filter((t) => t.confirmed), latest.timeMs);
  const payload = {
    exportedAt: new Date().toISOString(),
    dimensions: state.dimensions,
    calibration: state.fit
      ? { residualM: state.fit.residualM, worstM: state.fit.worstM, marks: state.marks.length }
      : null,
    analysisHz: Number(state.achievedHz.toFixed(2)),
    possession: state.ledger.summary(),
    ballSeenShare: latest.ball.seenShare,
    players: rows,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `touchline-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

for (const provider of PROVIDERS) {
  const option = document.createElement('option');
  option.value = provider.id;
  option.textContent = `${provider.label} — ${provider.hint}`;
  dom.llmProvider.append(option);
}
$('llm-save').addEventListener('click', () => {
  const provider = PROVIDERS.find((p) => p.id === dom.llmProvider.value) ?? PROVIDERS[0];
  const key = dom.llmKey.value.trim();
  if (!key) return;
  saveCredentials({ provider: provider.id, key, url: provider.url, model: provider.model });
  dom.llmKey.value = '';
  dom.llmStatus.textContent = `Analyst on, via ${provider.label}. Only the numbers are sent.`;
  dom.analyst.hidden = false;
});
$('llm-forget').addEventListener('click', () => {
  saveCredentials(null);
  dom.llmStatus.textContent = 'Analyst off.';
  dom.analyst.hidden = true;
});
$('analyst-ask').addEventListener('click', async () => {
  if (!state.digest) return;
  dom.analystAnswer.textContent = 'Asking…';
  const { text, error } = await ask(state.digest, $('analyst-question').value.trim());
  dom.analystAnswer.textContent = error ? `No answer: ${error}` : text;
});

if (loadCredentials()?.key) {
  dom.llmStatus.textContent = 'Analyst on. Only the numbers are sent.';
}

dom.supportNote.textContent = navigator.mediaDevices?.getUserMedia
  ? 'The camera needs a secure page (https, or localhost). A video file works either way.'
  : 'This browser exposes no camera. Open a video file instead.';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {
    /* offline support is a bonus, not a requirement */
  });
}

// Exposed for the end-to-end harness, which drives the real app rather than a
// copy of its internals. Nothing in the interface reads these.
window.touchline = { state, tryFit, analyse, runDemo };

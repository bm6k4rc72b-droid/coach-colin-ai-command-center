/**
 * ASTRA — application shell.
 *
 * Wires the laboratory renderer, the score, the sensors, the concierge, the
 * reader's record and the nine decks into one platform, and owns the things
 * that cross all of them: the entrance, deck routing, the camera flight between
 * sections, the reward feedback, and the service worker.
 *
 * @module astra/app
 */

import { Lab } from './lab.js';
import { Score } from './audio.js';
import { Lens, Tilt, interpretScan, prefersReducedMotion } from './sensors.js';
import { Intro } from './intro.js';
import { Radar, Telemetry, arrivalProfile } from './command.js';
import { ask, composeLocalAnswer, goalsIn, readSettings, writeSettings } from './astra.js';
import { knowledgeGraph, neighbourhood } from './graph.js';
import { resolveNamed } from './engine.js';
import { findAny } from './data/peptides.js';
import { load as loadProgress, record as recordProgress, reset as resetProgress, save as saveProgress, summary as progressSummary } from './progress.js';
import {
  renderCommand, renderCompare, renderDecoder, renderEngine,
  renderGraph, renderProfile, renderSettings, renderStudio, renderVerify,
} from './decks.js';
import { el, fill } from './dom.js';

const $ = (id) => document.getElementById(id);

/** Deck titles as shown in the panel header. */
const DECK_TITLES = {
  engine: 'Intelligence Engine',
  graph: 'Knowledge Graph',
  decoder: 'Paper Decoder',
  compare: 'The Lab',
  verify: 'Verification',
  studio: 'Content Studio',
  command: 'Command Centre',
  profile: 'Your Record',
  settings: 'Settings',
};

/** Which renderer draws each deck. */
const RENDERERS = {
  engine: renderEngine,
  graph: renderGraph,
  decoder: renderDecoder,
  compare: renderCompare,
  verify: renderVerify,
  studio: renderStudio,
  command: renderCommand,
  profile: renderProfile,
  settings: renderSettings,
};

/** Which lab waypoint each deck flies to. */
const DECK_WAYPOINTS = {
  engine: 'engine', graph: 'graph', decoder: 'decoder', compare: 'compare',
  verify: 'verify', studio: 'studio', command: 'command', profile: 'command', settings: 'engine',
};

const lab = new Lab($('lab'));
const score = new Score();
const tilt = new Tilt();
const lens = new Lens($('lens-video'));
const telemetry = new Telemetry();
const radar = new Radar();

const state = {
  deck: 'engine',
  entered: false,
  muted: false,
  lensOn: false,
  graph: null,
};

const progress = loadProgress();

/**
 * Show a transient message.
 *
 * @param {string} message Text.
 */
function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.add('shown');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('shown'), 3600);
}

/**
 * Show a reward card — a rank-up, an unlock, or a research drop.
 *
 * @param {object} result The result of a progression record.
 */
function celebrate(result) {
  if (result.levelled) {
    lab.flash(1.6);
    score.cue('unlock');
    banner(`${result.levelled.clearance} · ${result.levelled.name}`, result.levelled.blurb,
      result.unlocked.map((unlock) => `${unlock.label} unlocked — ${unlock.blurb}`));
    return;
  }
  if (result.drop) {
    lab.flash(0.9);
    score.cue('reward');
    banner(result.drop.title, result.drop.body, []);
    return;
  }
  if (result.streakBonus) {
    score.cue('reward');
    toast(`${result.streak}-day streak · +${result.streakBonus} XP`);
  }
}

/**
 * Render a reward banner.
 *
 * @param {string} title Headline.
 * @param {string} body Copy.
 * @param {string[]} extras Additional lines.
 */
function banner(title, body, extras) {
  const host = $('reward');
  fill(host, [
    el('div.reward-card', {}, [
      el('h3', { text: title }),
      el('p', { text: body }),
      ...extras.map((line) => el('p.reward-extra', { text: line })),
      el('button.btn.ghost.sm', { type: 'button', onclick: () => host.classList.remove('shown') }, ['Continue']),
    ]),
  ]);
  host.classList.add('shown');
  clearTimeout(banner.timer);
  banner.timer = setTimeout(() => host.classList.remove('shown'), 9000);
}

/**
 * Award progression for an action, and react to whatever it produced.
 *
 * @param {string} action An action key.
 * @param {object} [detail] Context.
 */
function award(action, detail) {
  const result = recordProgress(progress, action, detail);
  if (!result.xp) return;
  updateStatus();
  celebrate(result);
}

/**
 * Refresh the status strip.
 */
function updateStatus() {
  const summary = progressSummary(progress);
  fill($('statusbar'), [
    el('span.status-pill', {}, [el('b', { text: summary.rank.clearance }), summary.rank.name]),
    el('span.status-pill', {}, [el('b', { text: String(summary.xp) }), 'XP']),
    summary.streak > 1 ? el('span.status-pill.hot', {}, [el('b', { text: String(summary.streak) }), 'day streak']) : null,
    el('span.status-pill.quiet', {}, [el('b', { text: `${summary.drops}/${summary.dropTotal}` }), 'findings']),
  ].filter(Boolean));
}

/**
 * The context every deck receives.
 */
const ctx = {
  deckState: {},
  telemetry,
  radar,
  progress,
  lab,
  score,
  reducedMotion: prefersReducedMotion(),
  get muted() { return state.muted; },
  toast,
  award,
  goalsIn,
  readSettings,
  writeSettings,
  /**
   * Answer a question from the corpus, upgrading to the model in the
   * background when one is configured.
   *
   * @param {string} question The question.
   * @returns {object} The local answer, immediately.
   */
  answer(question) {
    const local = composeLocalAnswer(question);
    if (readSettings().key) {
      ask(question).then((upgraded) => {
        if (upgraded.via !== 'model') return;
        const host = document.querySelector('.answer .answer-badge');
        if (host) host.textContent = 'ASTRA · model';
      }).catch(() => {});
    }
    return { ...local, via: 'corpus' };
  },
  /**
   * The compound a piece of text names, if any.
   *
   * @param {string} text Any text.
   * @returns {object|null} The compound.
   */
  subjectFor(text) {
    return resolveNamed(text);
  },
  /**
   * The knowledge graph, laid out once and reused.
   *
   * @returns {object} The positioned graph.
   */
  graph() {
    if (!state.graph) state.graph = knowledgeGraph();
    return state.graph;
  },
  neighbourhood,
  go,
  render,
  saveProgress: () => saveProgress(progress),
  resetProgress: () => {
    const fresh = resetProgress();
    Object.assign(progress, fresh);
    updateStatus();
  },
  setMuted,
  enableMotion: async () => {
    const result = await tilt.enableMotion();
    toast(result.granted ? 'Tilt parallax on — move the device.' : 'Motion access was not granted; pointer parallax stays on.');
  },
  toggleLens,
};

/**
 * Navigate to a deck.
 *
 * @param {string} deck Deck id.
 * @param {object} [payload] State to merge into the deck before rendering.
 */
function go(deck, payload = {}) {
  if (!RENDERERS[deck]) return;
  state.deck = deck;
  // Payload keys land in the deck's own state, which is how one deck hands
  // work to another — a decoded paper to the studio, a compound to the lab.
  if (Object.keys(payload).length) {
    ctx.deckState[deck] = { ...(ctx.deckState[deck] || {}), ...payload };
  }
  for (const button of document.querySelectorAll('.deck-btn')) {
    button.classList.toggle('active', button.dataset.deck === deck);
  }
  lab.goTo(DECK_WAYPOINTS[deck] || 'engine');
  // The console's panel sits on the right on a wide screen, so the subject is
  // pushed left to sit beside it rather than behind it.
  lab.setFraming(window.innerWidth > 900 ? 3.2 : 0);
  score.setMood(deck === 'graph' ? 'graph' : deck === 'command' ? 'command' : deck === 'verify' ? 'verify' : deck === 'studio' ? 'studio' : deck === 'decoder' ? 'decoder' : 'engine');
  score.cue('move');
  render();
  document.body.dataset.deck = deck;
  if (location.hash !== `#${deck}`) history.replaceState(null, '', `#${deck}`);
}

/**
 * Draw the active deck.
 */
function render() {
  $('panel-title').textContent = DECK_TITLES[state.deck] || 'ASTRA';
  const body = $('panel-body');
  try {
    fill(body, [RENDERERS[state.deck](ctx)]);
  } catch (error) {
    console.error('[astra] deck failed to render:', error);
    fill(body, [el('p.warn', { text: 'That deck failed to render. The console has the detail; the rest of the facility is unaffected.' })]);
  }
  body.scrollTop = 0;
}

/**
 * Mute or unmute the score.
 *
 * @param {boolean} muted Whether to mute.
 */
function setMuted(muted) {
  state.muted = muted;
  score.setMuted(muted);
  $('btn-sound').classList.toggle('off', muted);
  $('btn-sound').setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
}

/**
 * Turn the camera lens on or off.
 */
async function toggleLens() {
  const panel = $('lens-panel');
  if (state.lensOn) {
    lens.stop();
    state.lensOn = false;
    panel.hidden = true;
    return;
  }
  const started = await lens.start('environment');
  if (!started) {
    toast('No camera available, or access was declined.');
    return;
  }
  state.lensOn = true;
  panel.hidden = false;
  scanLoop();
}

/**
 * Poll the camera for a code and for the room's light.
 */
async function scanLoop() {
  if (!state.lensOn) return;
  const code = await lens.scan();
  if (code) {
    const parsed = interpretScan(code);
    if (parsed.kind === 'compound' && findAny(parsed.value)) {
      toast(`Scanned: ${findAny(parsed.value).name}`);
      score.cue('open');
      go('engine', { subject: parsed.value });
      toggleLens();
      return;
    }
    if (parsed.kind === 'query' && parsed.value) {
      go('engine', { query: parsed.value });
      toggleLens();
      return;
    }
  }
  const ambient = lens.ambient();
  if (ambient) {
    // Warm the facility toward the room it is sitting in, gently.
    document.documentElement.style.setProperty('--room-warmth', ambient.warmth.toFixed(3));
    document.documentElement.style.setProperty('--room-light', ambient.luminance.toFixed(3));
  }
  setTimeout(scanLoop, 700);
}

/**
 * Leave the entrance and open the console.
 */
function enterFacility() {
  if (state.entered) return;
  state.entered = true;
  document.body.classList.add('entered');
  $('intro').setAttribute('aria-hidden', 'true');
  score.start();
  setMuted(state.muted);
  const arrival = arrivalProfile({ referrer: document.referrer, search: location.search });
  const deck = RENDERERS[arrival.deck] ? arrival.deck : 'engine';
  telemetry.push('arrival', { profile: arrival.id });
  go(location.hash.slice(1) in RENDERERS ? location.hash.slice(1) : deck);
  toast(arrival.lead);
}

/**
 * Register the service worker so the facility works offline.
 */
function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline support is a bonus; the platform runs fine without it.
    });
  });
}

/**
 * Start everything.
 */
function boot() {
  if (lab.ok) {
    lab.setReducedMotion(ctx.reducedMotion);
    lab.start();
  } else {
    document.body.classList.add('no-webgl');
  }

  tilt.enablePointer(document.body);
  const feed = () => {
    tilt.update(1 / 60);
    lab.setTilt({ x: tilt.x, y: tilt.y });
    document.documentElement.style.setProperty('--tilt-x', tilt.x.toFixed(3));
    document.documentElement.style.setProperty('--tilt-y', tilt.y.toFixed(3));
    requestAnimationFrame(feed);
  };
  requestAnimationFrame(feed);

  const intro = new Intro({
    root: $('intro'),
    lab,
    score,
    onOpen: (id) => { enterFacility(); go('engine', { subject: id }); },
    onEnter: enterFacility,
  });
  intro.mount();

  // The first gesture anywhere starts the score, because browsers require one
  // and asking for a click just to hear music is a worse experience than
  // simply starting when the reader first touches the page.
  const wake = () => {
    score.start();
    setMuted(state.muted);
    window.removeEventListener('pointerdown', wake);
    window.removeEventListener('keydown', wake);
  };
  window.addEventListener('pointerdown', wake, { once: false });
  window.addEventListener('keydown', wake, { once: false });

  for (const button of document.querySelectorAll('.deck-btn')) {
    button.addEventListener('click', () => {
      if (!state.entered) enterFacility();
      go(button.dataset.deck);
    });
  }

  $('btn-sound').addEventListener('click', () => setMuted(!state.muted));
  $('btn-lens').addEventListener('click', toggleLens);
  $('btn-motion').addEventListener('click', () => ctx.enableMotion());
  $('btn-home').addEventListener('click', () => {
    state.entered = false;
    document.body.classList.remove('entered');
    $('intro').removeAttribute('aria-hidden');
    $('intro').scrollTo({ top: 0, behavior: ctx.reducedMotion ? 'auto' : 'smooth' });
    lab.goTo('intro');
    lab.setFraming(window.innerWidth > 900 ? -5.5 : 0);
    score.setMood('intro');
  });
  $('panel-toggle').addEventListener('click', () => {
    document.body.classList.toggle('panel-collapsed');
  });

  window.addEventListener('hashchange', () => {
    const deck = location.hash.slice(1);
    if (RENDERERS[deck] && state.entered) go(deck);
  });

  // Keyboard: 1-9 jump decks, Escape returns to the entrance.
  window.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea, select')) return;
    const decks = Object.keys(RENDERERS);
    const index = Number(event.key) - 1;
    if (index >= 0 && index < decks.length) {
      if (!state.entered) enterFacility();
      go(decks[index]);
    }
    if (event.key === 'Escape' && state.entered) $('btn-home').click();
  });

  updateStatus();
  registerWorker();

  // Deep links skip the entrance, because somebody arriving on a specific
  // dossier asked for that dossier rather than for the descent.
  if (location.hash.slice(1) in RENDERERS) enterFacility();
}

boot();

/** Exposed for the end-to-end harness, which drives the real app. */
globalThis.__astra = { ctx, go, state, progress, lab, score, telemetry };

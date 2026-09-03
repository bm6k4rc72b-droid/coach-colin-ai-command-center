/**
 * AETHER NEXUS — application shell.
 *
 * Wires the hall renderer, the receptionist, the mentor, the live feeds, the
 * learner's record and the seven decks into one console, and owns the things
 * that cross all of them: the entry gate, command routing, the transcript,
 * status, and the service worker.
 *
 * @module nexus/app
 */

import { Hall } from './hall.js';
import { Lens } from './camera.js';
import { Feeds } from './feeds.js';
import { Mentor, readSettings } from './mentor.js';
import { Progress } from './progress.js';
import { Receptionist, parseCommand } from './voice.js';
import { RoomTone } from './audio.js';
import { el, fill } from './dom.js';
import {
  renderAcademy, renderAtrium, renderLabs, renderLens, renderOps, renderSettings, renderSwarm,
} from './decks.js';
import { TRACKS } from './curriculum.js';
import { findLab } from './labs/index.js';

const $ = (id) => document.getElementById(id);

const hall = new Hall($('hall'));
const feeds = new Feeds();
const progress = new Progress();
const mentor = new Mentor();
const tone = new RoomTone();
const lens = new Lens(document.createElement('video'));

/** Deck titles as shown in the panel header. */
const DECK_TITLES = {
  atrium: 'Atrium',
  academy: 'Academy',
  labs: 'Training Ranges',
  ops: 'Live Operations',
  lens: 'Lens',
  swarm: 'Agent Swarm',
  settings: 'Settings',
};

/** Console state. */
const state = {
  deck: 'atrium',
  deckState: {},
  muted: false,
  cleanup: null,
};

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
  toast.timer = setTimeout(() => node.classList.remove('shown'), 3400);
}

/**
 * Append a line to the receptionist transcript.
 *
 * @param {'you'|'her'} who Speaker.
 * @param {string} text Line.
 * @param {object[]} [sources] Cited lessons.
 * @returns {HTMLElement} The line element.
 */
function say(who, text, sources = []) {
  const transcript = $('transcript');
  const line = el(`div.line.${who}`, {}, [
    el('span.who', { text: who === 'you' ? 'You' : 'Aether' }),
    el('span.body', { text }),
  ]);
  if (sources.length) {
    line.append(el('div.sources', {}, sources.map((source) => el('button.chip', {
      type: 'button',
      onclick: () => go('academy', { lesson: source.key }),
    }, [source.title]))));
  }
  transcript.append(line);
  while (transcript.children.length > 24) transcript.firstChild.remove();
  transcript.scrollTop = transcript.scrollHeight;
  return line;
}

const voice = new Receptionist({
  onAmplitude: (amp) => hall.setAmplitude(amp),
  onTranscript: (text, final) => {
    const interim = document.querySelector('.line.interim');
    if (!final) {
      if (interim) interim.querySelector('.body').textContent = text;
      else say('you', text).classList.add('interim');
      return;
    }
    interim?.remove();
    handle(text);
  },
  onStateChange: (change) => {
    if ('listening' in change) $('btn-mic').classList.toggle('listening', change.listening);
    if ('speaking' in change) $('btn-mic').classList.toggle('speaking', change.speaking);
  },
});

/**
 * Speak, unless muted.
 *
 * @param {string} text Line.
 * @param {object} [options] Passed through to the receptionist.
 */
function speak(text, options) {
  voice.speak(text, options);
}

/**
 * Read a lesson aloud — the abstract, not the whole thing.
 *
 * @param {object} entry Lesson record.
 */
function speakLesson(entry) {
  speak(`${entry.lesson.title}. ${entry.lesson.body[0]} The key points: ${entry.lesson.keyPoints.join('. ')}`);
}

/**
 * The context handed to every deck and lab.
 */
const ctx = {
  hall, feeds, progress, mentor, voice, lens, tone: (kind) => tone.cue(kind),
  toast, speak, speakLesson, go, render, setView, updateStatus, toggleMute,
  activeLab: null,
};

/**
 * Navigate to a deck.
 *
 * @param {string} deck Deck id.
 * @param {object} [deckState] Deck-specific state.
 */
function go(deck, deckState = {}) {
  if (!DECK_TITLES[deck]) return;
  state.deck = deck;
  state.deckState = deckState;
  for (const button of document.querySelectorAll('.deck-btn')) {
    button.classList.toggle('active', button.dataset.deck === deck);
  }
  $('panel').classList.remove('collapsed');
  render();
  tone.cue('tap');
}

/**
 * Render the active deck.
 */
function render() {
  const body = $('panel-body');
  $('panel-title').textContent = DECK_TITLES[state.deck];
  if (state.cleanup) {
    state.cleanup();
    state.cleanup = null;
  }
  if (ctx.activeLab && state.deck !== 'labs') {
    ctx.activeLab.destroy?.();
    ctx.activeLab = null;
  }
  body.scrollTop = 0;
  switch (state.deck) {
    case 'academy': renderAcademy(body, ctx, state.deckState); break;
    case 'labs': renderLabs(body, ctx, state.deckState); break;
    case 'ops': renderOps(body, ctx); break;
    case 'lens': state.cleanup = renderLens(body, ctx); break;
    case 'swarm': renderSwarm(body, ctx); break;
    case 'settings': renderSettings(body, ctx); break;
    default: renderAtrium(body, ctx);
  }
  updateStatus();
}

/**
 * Switch the centrepiece of the hall.
 *
 * @param {'avatar'|'globe'} view Which subject.
 */
function setView(view) {
  hall.setMode(view);
  $('btn-view').classList.toggle('on', view === 'globe');
  if (view === 'globe') {
    hall.setMarkers(feeds.markers());
    toast('Globe up. Markers are the live feeds — drag to spin, pinch to zoom.');
  }
}

/**
 * Mute or unmute both the room tone and the voice.
 *
 * @returns {boolean} The new mute state.
 */
function toggleMute() {
  state.muted = !state.muted;
  voice.setMuted(state.muted);
  tone.setMuted(state.muted);
  $('btn-sound').classList.toggle('on', !state.muted);
  $('btn-sound').textContent = state.muted ? '⨯' : '♪';
  return state.muted;
}

/**
 * Refresh the status strip.
 */
function updateStatus() {
  const health = feeds.health();
  const snap = progress.snapshot();
  const connected = Boolean(readSettings().key);
  fill($('statusbar'), [
    el('span.chip-status', { class: health.live ? 'live' : health.cached ? 'cached' : 'sim' }, [
      'FEEDS ', el('b', { text: `${health.live}/${health.total}` }),
    ]),
    el('span.chip-status', {}, ['CLEARANCE ', el('b', { text: snap.rank.clearance })]),
    el('span.chip-status', {}, ['XP ', el('b', { text: String(snap.xp) })]),
    el('span.chip-status', { class: connected ? 'live' : '' }, [
      'BRAIN ', el('b', { text: connected ? readSettings().provider.toUpperCase() : 'LOCAL' }),
    ]),
    el('span.chip-status', {}, ['VOICE ', el('b', { text: voice.voice?.name?.split(' ')[0] || 'default' })]),
  ]);
}

/**
 * Handle one utterance — spoken or typed.
 *
 * @param {string} text What was said.
 */
async function handle(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  say('you', trimmed);
  const command = parseCommand(trimmed);

  switch (command.intent) {
    case 'stop':
      voice.stop();
      return;
    case 'repeat':
      voice.repeat();
      return;
    case 'mute': {
      const muted = toggleMute();
      if (!muted) speak('Sound back on.');
      return;
    }
    case 'deck':
      go(command.arg);
      speak(`${DECK_TITLES[command.arg]}.`);
      return;
    case 'track': {
      const track = TRACKS.find((t) => t.id === command.arg);
      go('academy', { track: command.arg });
      speak(`${track.title}. ${track.tagline}`);
      return;
    }
    case 'lab': {
      const lab = findLab(command.arg);
      go('labs', { lab: command.arg });
      speak(`${lab.name}. ${lab.blurb}`);
      return;
    }
    case 'view':
      setView(command.arg);
      speak(command.arg === 'globe' ? 'Bringing the Earth up. The markers are the live feeds.' : 'Back to me.');
      return;
    case 'refresh':
      speak('Refreshing every source.');
      await feeds.refreshAll();
      hall.setMarkers(feeds.markers());
      render();
      return;
    case 'status': {
      const health = feeds.health();
      const snap = progress.snapshot();
      const items = feeds.allItems();
      const quake = items.find((i) => i.source === 'quakes');
      const launch = items.find((i) => i.source === 'launches');
      const report = [
        `${health.live} of ${health.total} sources are live${health.sim ? `, ${health.sim} simulated` : ''}.`,
        quake ? `Most recent seismic event: ${quake.title}, ${quake.detail}.` : '',
        launch ? `Next launch on the board: ${launch.title}.` : '',
        `You are ${snap.rank.name}, clearance ${snap.rank.clearance}, ${snap.lessonsDone} of ${snap.lessonsTotal} lessons complete.`,
      ].filter(Boolean).join(' ');
      say('her', report);
      speak(report);
      return;
    }
    case 'progress': {
      const snap = progress.snapshot();
      const line = `${snap.xp} experience, rank ${snap.rank.name}, clearance ${snap.rank.clearance}. ${snap.lessonsDone} of ${snap.lessonsTotal} lessons, ${snap.streak} day streak.`;
      say('her', line);
      speak(line);
      return;
    }
    case 'help':
    case 'ask':
    default: {
      const line = say('her', '…');
      const bodyNode = line.querySelector('.body');
      let buffer = '';
      const answer = await mentor.ask(command.arg || trimmed, (chunk) => {
        buffer += chunk;
        bodyNode.textContent = buffer;
        $('transcript').scrollTop = $('transcript').scrollHeight;
      });
      bodyNode.textContent = answer.text;
      if (answer.sources?.length) {
        line.append(el('div.sources', {}, answer.sources.map((source) => el('button.chip', {
          type: 'button',
          onclick: () => go('academy', { lesson: source.key }),
        }, [source.title]))));
      }
      speak(answer.text);
      return;
    }
  }
}

// ---------------------------------------------------------------- wiring

for (const button of document.querySelectorAll('.deck-btn')) {
  button.addEventListener('click', () => go(button.dataset.deck));
}

$('panel-toggle').addEventListener('click', () => {
  $('panel').classList.toggle('collapsed');
});

$('btn-view').addEventListener('click', () => {
  setView(hall.state.mode === 'globe' ? 'avatar' : 'globe');
});

$('btn-sound').addEventListener('click', toggleMute);

$('ask-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('ask');
  const text = input.value;
  input.value = '';
  handle(text);
});

// Push-to-talk: hold on touch, click to toggle on desktop.
const mic = $('btn-mic');
mic.addEventListener('click', () => {
  if (!voice.canListen) {
    toast('This browser has no speech recognition — type instead, it does everything speaking does.');
    return;
  }
  if (voice.listening) voice.stopListening();
  else voice.listen();
});

document.addEventListener('keydown', (event) => {
  if (event.target.matches('input, textarea, select')) return;
  if (event.key === '/') {
    event.preventDefault();
    $('ask').focus();
  }
  if (event.key === 'g') setView(hall.state.mode === 'globe' ? 'avatar' : 'globe');
  if (event.key === 'm') toggleMute();
  if (event.key === 'Escape') voice.stop();
  const decks = ['atrium', 'academy', 'labs', 'ops', 'lens', 'swarm', 'settings'];
  const index = Number(event.key) - 1;
  if (index >= 0 && index < decks.length) go(decks[index]);
});

feeds.subscribe(() => {
  updateStatus();
  if (hall.state.mode === 'globe') hall.setMarkers(feeds.markers());
  if (state.deck === 'ops') render();
  // A severe event flashes the room, once.
  const severe = feeds.allItems().find((item) => item.severity === 'high' && Date.now() - (item.at || 0) < 3600000);
  if (severe && severe.id !== feeds.lastAlerted) {
    feeds.lastAlerted = severe.id;
    hall.alert(0.8);
    tone.cue('alert');
    toast(`${severe.sourceLabel}: ${severe.title}`);
  }
});

progress.subscribe(() => updateStatus());

// The entry gate: browsers need a gesture before audio and speech, and it is
// also where the room comes up.
$('enter').addEventListener('click', async () => {
  $('gate').classList.add('gone');
  hall.start();
  tone.start();
  tone.cue('arrive');
  $('btn-sound').classList.add('on');
  render();
  feeds.start();
  const greeting = 'Welcome to the Nexus. I am Aether. I teach AI agents, AI app craft and cyber defence — and I can put the live sky on the globe while we talk. Ask me anything, or say “open the phishing range”.';
  setTimeout(() => {
    say('her', greeting);
    speak(greeting);
  }, 700);
});

// Install prompt (Android/desktop; iOS uses Share → Add to Home Screen).
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  $('btn-install').classList.remove('hidden');
});
$('btn-install').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $('btn-install').classList.add('hidden');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline support is a bonus, not a requirement — a failed
      // registration (file://, no HTTPS) must not break the console.
    });
  });
}

if (!hall.ok) {
  document.body.classList.add('no-webgl');
  toast('WebGL2 is unavailable here, so the hall is not drawn — everything else works.');
}

updateStatus();

// Exposed for the end-to-end suite (scripts/qa-nexus.mjs) and for anyone who
// wants to drive the console from the browser console. Read-only in spirit:
// nothing in the app reads it back.
window.__nexus = ctx;

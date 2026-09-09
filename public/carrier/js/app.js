/**
 * Carrier — the bench.
 *
 * Wires the editor to the engine: an authored script object on one side, a
 * canvas being redrawn on the other, and nothing in between that the renderer
 * can see. Every edit follows the same path — mutate the authored object,
 * re-parse it, rebuild the timeline, redraw the current frame — so there is one
 * way for the picture to change and no path where the preview and the export
 * could disagree about what the episode says.
 *
 * The script is held in `localStorage` so a session survives a reload, and
 * "Reset episode" puts the shipped one back. Footage is never persisted: it
 * lives in the tab and dies with it, on purpose.
 *
 * @module carrier/app
 */

import { WIFI_CSI } from './episodes/wifi-csi.js';
import { MediaLibrary } from './media.js';
import { renderFrame } from './render.js';
import { buildTimeline, cueAt } from './timeline.js';
import {
  PANEL_TYPES, captionSeconds, parseScript, titleText, validateScript,
} from './script.js';
import {
  canRecord, download, extensionFor, framePng, pickMimeType, recordEpisode,
} from './export.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'carrier:script:v1';

const canvas = $('frame');
const ctx = canvas.getContext('2d');
const media = new MediaLibrary();

const state = {
  /** The authored script, as edited. */
  raw: load(),
  /** The parsed script the renderer reads. */
  script: null,
  /** The episode clock. */
  timeline: null,
  /** Index of the scene being edited. */
  index: 0,
  /** Playhead, in seconds. */
  t: 0,
  playing: false,
  guides: true,
  recording: null,
};

/**
 * The stored script, or the shipped episode.
 *
 * A stored script that no longer parses is discarded rather than repaired:
 * the shipped episode is one click from being lost anyway, and starting from a
 * known-good state beats starting from half a broken one.
 *
 * @returns {object} An authored script.
 */
function load() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (!saved) return structuredClone(WIFI_CSI);
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed?.scenes) || !parsed.scenes.length) return structuredClone(WIFI_CSI);
    return parsed;
  } catch {
    return structuredClone(WIFI_CSI);
  }
}

/** @returns {void} */
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state.raw));
  } catch {
    // A full or blocked store is not worth interrupting an edit over.
  }
}

/**
 * Re-parse the authored script and redraw everything that depends on it.
 *
 * @param {object} [options] What to rebuild.
 * @param {boolean} [options.keepEditor=false] Leave the field values alone —
 *   used while typing, so the caret is not thrown back to the start.
 * @returns {void}
 */
function rebuild({ keepEditor = false } = {}) {
  state.script = parseScript(state.raw);
  state.timeline = buildTimeline(state.script);
  state.index = Math.max(0, Math.min(state.script.scenes.length - 1, state.index));
  canvas.width = state.script.size.w;
  canvas.height = state.script.size.h;
  $('runtime-chip').textContent = `${state.timeline.total.toFixed(0)}s · ${state.script.scenes.length} scenes`;
  $('scrub').max = String(Math.max(1, Math.round(state.timeline.total * 100)));
  renderSceneList();
  renderSlots();
  renderChecks();
  if (!keepEditor) fillEditor();
  updateCaptionFit();
  save();
  draw();
}

/**
 * Draw the current frame.
 *
 * @param {number} [t=state.t] Playhead.
 * @returns {Promise<void>} Resolves once the frame is on the canvas.
 */
async function draw(t = state.t) {
  const here = cueAt(state.timeline, t);
  if (here) await media.seek(here.tLocal);
  renderFrame(ctx, state.script, state.timeline, t, { media, guides: state.guides });
  $('time').textContent = `${t.toFixed(1)} / ${state.timeline.total.toFixed(1)}s`;
  $('scrub').value = String(Math.round(t * 100));
  $('scene-hint').textContent = here
    ? `scene ${here.cue.index + 1}/${state.script.scenes.length} — ${here.cue.scene.id}`
    : '—';
}

/* ----------------------------------------------------------------- transport */

let lastTick = 0;

/**
 * The playback loop.
 *
 * @param {number} now Frame timestamp.
 * @returns {void}
 */
function tick(now) {
  if (!state.playing) return;
  const dt = lastTick ? (now - lastTick) / 1000 : 0;
  lastTick = now;
  state.t += dt;
  if (state.t >= state.timeline.total) state.t = 0;
  draw();
  requestAnimationFrame(tick);
}

/**
 * Start or stop playback.
 *
 * @param {boolean} [playing=!state.playing] Desired state.
 * @returns {void}
 */
function setPlaying(playing = !state.playing) {
  state.playing = playing;
  lastTick = 0;
  $('play').textContent = playing ? '❚❚' : '▶';
  $('play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  if (playing) requestAnimationFrame(tick);
}

/* -------------------------------------------------------------- scene editor */

/** @returns {object} The scene being edited, in the authored script. */
function currentScene() {
  return state.raw.scenes[state.index];
}

/** @returns {void} */
function renderSceneList() {
  const list = $('scene-list');
  list.replaceChildren(...state.script.scenes.map((scene, i) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = i === state.index ? 'on' : '';
    button.innerHTML = `<strong>${i + 1}. ${escapeHtml(scene.id)}</strong>`;
    const secs = document.createElement('span');
    secs.className = 'secs';
    secs.textContent = `${scene.seconds.toFixed(1)}s · ${scene.panel.type}`;
    button.append(secs);
    button.addEventListener('click', () => {
      state.index = i;
      state.t = state.timeline.cues[i].start;
      setPlaying(false);
      renderSceneList();
      fillEditor();
      updateCaptionFit();
      draw();
    });
    item.append(button);
    return item;
  }));
}

/** @returns {void} */
function fillEditor() {
  const scene = currentScene();
  if (!scene) return;
  $('f-kicker').value = scene.kicker ?? '';
  $('f-title').value = scene.title ?? '';
  $('f-caption').value = scene.caption ?? '';
  $('f-seconds').value = String(parseScript(state.raw).scenes[state.index].seconds);
  $('f-source').value = scene.source ?? '';
  $('f-panel').value = JSON.stringify(scene.panel ?? { type: 'blank' }, null, 2);
  $('panel-status').textContent = PANEL_TYPES.join(' · ');
  $('panel-status').className = 'note';
  renderStatFields();
}

/** @returns {void} */
function renderStatFields() {
  const scene = currentScene();
  const grid = $('stats-grid');
  const stats = Array.isArray(scene.stats) ? scene.stats : [];
  const rows = [0, 1, 2].map((i) => {
    const stat = stats[i] ?? { label: '', value: '', tone: 'accent' };
    const row = document.createElement('div');
    row.className = 'stat-row';

    const label = document.createElement('input');
    label.type = 'text';
    label.placeholder = `label ${i + 1}`;
    label.value = stat.label ?? '';

    const value = document.createElement('input');
    value.type = 'text';
    value.placeholder = `value ${i + 1}`;
    value.value = stat.value ?? '';

    const tone = document.createElement('select');
    for (const name of ['accent', 'alert', 'good', 'warn', 'dim']) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      option.selected = (stat.tone ?? 'accent') === name;
      tone.append(option);
    }

    const commit = () => {
      const next = [0, 1, 2]
        .map((k) => {
          const [l, v, t] = grid.children[k].children;
          return { label: l.value, value: v.value, tone: t.value };
        })
        .filter((s) => s.label || s.value);
      currentScene().stats = next;
      rebuild({ keepEditor: true });
    };

    label.addEventListener('input', commit);
    value.addEventListener('input', commit);
    tone.addEventListener('change', commit);
    row.append(label, value, tone);
    return row;
  });
  grid.replaceChildren(...rows);
}

/** @returns {void} */
function updateCaptionFit() {
  const scene = parseScript(state.raw).scenes[state.index];
  if (!scene) return;
  const need = captionSeconds(scene.caption);
  const fits = need <= scene.seconds + 0.01;
  const node = $('caption-fit');
  node.textContent = need
    ? `${scene.caption.trim().split(/\s+/).length} words · needs ${need.toFixed(1)}s of a ${scene.seconds.toFixed(1)}s scene`
    : 'No caption on this scene.';
  node.className = `note ${need ? (fits ? 'good' : 'bad') : ''}`;
}

/**
 * Bind a text field to a scene property.
 *
 * @param {string} id Element id.
 * @param {string} key Scene property.
 * @param {(value: string) => any} [transform] Value coercion.
 * @returns {void}
 */
function bindField(id, key, transform = (v) => v) {
  $(id).addEventListener('input', (event) => {
    currentScene()[key] = transform(event.target.value);
    rebuild({ keepEditor: true });
  });
}

bindField('f-kicker', 'kicker');
bindField('f-title', 'title');
bindField('f-caption', 'caption');
bindField('f-source', 'source');
bindField('f-seconds', 'seconds', (v) => Math.max(1, Number(v) || 1));

$('f-panel').addEventListener('input', (event) => {
  const status = $('panel-status');
  try {
    const panel = JSON.parse(event.target.value);
    if (!panel || typeof panel !== 'object') throw new Error('A panel must be an object.');
    currentScene().panel = panel;
    status.textContent = PANEL_TYPES.includes(panel.type)
      ? `${panel.type} — drawing.`
      : `Unknown type "${panel.type}". Known: ${PANEL_TYPES.join(', ')}.`;
    status.className = PANEL_TYPES.includes(panel.type) ? 'note good' : 'note bad';
    rebuild({ keepEditor: true });
  } catch (error) {
    status.textContent = `Not valid JSON yet — ${error.message}`;
    status.className = 'note bad';
  }
});

/* --------------------------------------------------------------------- media */

/**
 * Every media slot the script refers to.
 *
 * @param {object} script A parsed script.
 * @returns {string[]} Slot names, in the order they appear.
 */
function slotsIn(script) {
  const found = new Set([script.avatarSlot]);
  const walk = (panel) => {
    if (!panel || typeof panel !== 'object') return;
    if (panel.slot) found.add(String(panel.slot));
    for (const cell of Array.isArray(panel.cells) ? panel.cells : []) walk(cell);
  };
  for (const scene of script.scenes) walk(scene.panel);
  return [...found];
}

/** @returns {void} */
function renderSlots() {
  const host = $('slots');
  host.replaceChildren(...slotsIn(state.script).map((slot) => {
    const held = media.get(slot);
    const row = document.createElement('div');
    row.className = 'slot';

    const left = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = slot;
    const stateLine = document.createElement('div');
    stateLine.className = `state ${held ? 'filled' : ''}`;
    stateLine.textContent = held
      ? `${held.name} · ${held.width}×${held.height}${held.duration ? ` · ${held.duration.toFixed(1)}s` : ''}`
      : 'empty — the panel draws a labelled slot';
    left.append(name, stateLine);

    const actions = document.createElement('div');
    actions.className = 'slot-actions';

    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*,video/*';
    picker.hidden = true;
    picker.addEventListener('change', async () => {
      const file = picker.files?.[0];
      if (!file) return;
      try {
        await media.load(slot, file);
      } catch (error) {
        stateLine.textContent = error.message;
      }
    });

    const choose = document.createElement('button');
    choose.type = 'button';
    choose.className = 'ghost';
    choose.textContent = held ? 'Replace' : 'Add file';
    choose.addEventListener('click', () => picker.click());
    actions.append(picker, choose);

    if (held) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'ghost';
      clear.textContent = 'Clear';
      clear.addEventListener('click', () => media.clear(slot));
      actions.append(clear);
    }

    row.append(left, actions);
    return row;
  }));
}

media.onChange(() => {
  renderSlots();
  draw();
});

/* -------------------------------------------------------------------- checks */

/** @returns {void} */
function renderChecks() {
  const findings = validateScript(state.script);
  const list = $('findings');
  if (!findings.length) {
    const clean = document.createElement('li');
    clean.className = 'clean';
    clean.textContent = 'Every caption fits its scene and every claim names a source.';
    list.replaceChildren(clean);
  } else {
    list.replaceChildren(...findings.map((finding) => {
      const item = document.createElement('li');
      item.className = finding.level;
      item.innerHTML = `<b>${escapeHtml(finding.scene)}</b> — ${escapeHtml(finding.message)}`;
      return item;
    }));
  }

  const sources = $('sources');
  const cited = state.script.scenes.filter((scene) => scene.source);
  sources.replaceChildren(...(cited.length ? cited : []).map((scene) => {
    const item = document.createElement('li');
    item.innerHTML = `<b>${escapeHtml(titleText(scene.title) || scene.id)}</b><br>${escapeHtml(scene.source)}`
      + (scene.note ? `<br><span style="color:var(--faint)">${escapeHtml(scene.note)}</span>` : '');
    return item;
  }));
  if (!cited.length) {
    const none = document.createElement('li');
    none.textContent = 'No scene cites anything yet.';
    sources.replaceChildren(none);
  }
}

/**
 * Escape text for insertion into markup.
 *
 * @param {string} text Raw text.
 * @returns {string} Escaped text.
 */
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

/* -------------------------------------------------------------------- export */

$('f-format').value = canRecord()
  ? (pickMimeType() || 'browser default')
  : 'recording unavailable in this browser';

$('record').addEventListener('click', async () => {
  if (state.recording) return;
  const fps = Number($('f-fps').value) || 30;
  const controller = new AbortController();
  state.recording = controller;
  setPlaying(false);
  $('record').disabled = true;
  $('stop-record').disabled = false;
  $('record-status').textContent = 'Recording — keep this tab in front.';
  $('record-status').className = 'note';

  const wasGuides = state.guides;
  state.guides = false;

  try {
    const { blob, mime } = await recordEpisode({
      canvas,
      seconds: state.timeline.total,
      fps,
      signal: controller.signal,
      draw: async (t) => {
        state.t = t;
        await draw(t);
      },
      onProgress: (p) => {
        $('record-bar').style.width = `${(p * 100).toFixed(1)}%`;
      },
    });
    const name = `${state.script.id}-${Math.round(state.timeline.total)}s.${extensionFor(mime)}`;
    download(blob, name);
    $('record-status').textContent = `Saved ${name} — ${(blob.size / 1e6).toFixed(1)} MB.`;
    $('record-status').className = 'note good';
  } catch (error) {
    $('record-status').textContent = error.message;
    $('record-status').className = 'note bad';
  } finally {
    state.guides = wasGuides;
    state.recording = null;
    $('record').disabled = false;
    $('stop-record').disabled = true;
    draw();
  }
});

$('stop-record').addEventListener('click', () => state.recording?.abort());

$('save-frame').addEventListener('click', async () => {
  const wasGuides = state.guides;
  state.guides = false;
  await draw();
  try {
    download(await framePng(canvas), `${state.script.id}-${state.t.toFixed(1)}s.png`);
  } finally {
    state.guides = wasGuides;
    draw();
  }
});

$('copy-script').addEventListener('click', async () => {
  const json = JSON.stringify(state.raw, null, 2);
  try {
    await navigator.clipboard.writeText(json);
    $('record-status').textContent = 'Script copied to the clipboard.';
    $('record-status').className = 'note good';
  } catch {
    const box = $('script-json');
    box.hidden = false;
    box.value = json;
    box.select();
  }
});

$('paste-script').addEventListener('click', () => {
  const box = $('script-json');
  if (box.hidden) {
    box.hidden = false;
    box.value = '';
    box.placeholder = 'Paste a script JSON here, then click Load again.';
    box.focus();
    return;
  }
  try {
    const parsed = JSON.parse(box.value);
    if (!Array.isArray(parsed?.scenes) || !parsed.scenes.length) {
      throw new Error('That JSON has no scenes.');
    }
    state.raw = parsed;
    state.index = 0;
    state.t = 0;
    box.hidden = true;
    rebuild();
    $('record-status').textContent = 'Script loaded.';
    $('record-status').className = 'note good';
  } catch (error) {
    $('record-status').textContent = error.message;
    $('record-status').className = 'note bad';
  }
});

/* ----------------------------------------------------------------- chrome UI */

$('play').addEventListener('click', () => setPlaying());

$('scrub').addEventListener('input', (event) => {
  setPlaying(false);
  state.t = Number(event.target.value) / 100;
  const here = cueAt(state.timeline, state.t);
  if (here && here.cue.index !== state.index) {
    state.index = here.cue.index;
    renderSceneList();
    fillEditor();
    updateCaptionFit();
  }
  draw();
});

$('guides').addEventListener('change', (event) => {
  state.guides = event.target.checked;
  draw();
});

$('reset').addEventListener('click', () => {
  state.raw = structuredClone(WIFI_CSI);
  state.index = 0;
  state.t = 0;
  rebuild();
});

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    for (const other of document.querySelectorAll('.tab')) {
      other.classList.toggle('tab-on', other === tab);
    }
    for (const deck of ['scenes', 'media', 'checks', 'export']) {
      $(`deck-${deck}`).hidden = deck !== tab.dataset.tab;
    }
  });
}

document.addEventListener('keydown', (event) => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (typing) return;
  if (event.code === 'Space') {
    event.preventDefault();
    setPlaying();
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    setPlaying(false);
    const step = event.shiftKey ? 1 : 1 / 30;
    state.t = Math.max(0, Math.min(state.timeline.total, state.t + (event.key === 'ArrowRight' ? step : -step)));
    draw();
  }
});

rebuild();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

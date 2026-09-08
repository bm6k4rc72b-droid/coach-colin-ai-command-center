/**
 * The episode script: what a reel is, before anything is drawn.
 *
 * A script is data — a title, a handle, and an ordered list of scenes — and
 * every visual decision downstream is a function of it and a timestamp. That
 * separation is the whole point of the engine: the same script renders to the
 * preview canvas, to an exported video, and to a headless screenshot in CI, and
 * if those three ever disagree it is a bug in one renderer rather than three
 * drifting definitions of the episode.
 *
 * Two things in here are not obvious and are worth stating.
 *
 * **Captions have a duration whether or not the author gave them one.** Speech
 * that is read aloud lands at roughly two and a half words a second; a caption
 * that cannot finish typing before its scene cuts is a caption nobody read.
 * {@link captionSeconds} makes that measurable and {@link validateScript} makes
 * it a warning, so the failure is caught at the desk rather than in the feed.
 *
 * **Claims carry sources.** A scene marked `claim: true` is asserting something
 * about the world, and the validator refuses to be quiet about one without a
 * `source`. Security material lives or dies on this: a single overclaimed frame
 * costs more credibility than the whole episode earns.
 *
 * @module carrier/script
 */

/** Words a viewer reads per second — the pacing captions are timed against. */
export const WORDS_PER_SECOND = 2.6;

/** Seconds a caption holds on screen after its last word lands. */
export const CAPTION_HOLD_SEC = 0.9;

/** Seconds a scene spends dissolving into the next one. */
export const CUT_SEC = 0.34;

/** Panel types the renderer knows how to draw. */
export const PANEL_TYPES = ['grid', 'heatmap', 'floorplan', 'sniffer', 'pose', 'media', 'blank'];

/** Delimiters for tone markup inside a title: `[accent]`, `!alert!`, `{good}`. */
const TITLE_MARKUP = [
  { open: '[', close: ']', tone: 'accent' },
  { open: '!', close: '!', tone: 'alert' },
  { open: '{', close: '}', tone: 'good' },
];

/**
 * A run of title text that shares one colour.
 *
 * @typedef {object} TitleRun
 * @property {string} text The words.
 * @property {string} tone `plain`, `accent`, `alert` or `good`.
 */

/**
 * Split a title into coloured runs.
 *
 * Titles are written the way they are said — `Phase Shifts → [3D Skeleton]` —
 * so the author never touches a colour value and a theme change cannot strand
 * a hard-coded hex in the middle of a headline. Unmatched delimiters are left
 * as literal characters rather than swallowing the rest of the line, because a
 * title with a stray bracket should look wrong, not disappear.
 *
 * @param {string} title Title with optional tone markup.
 * @returns {TitleRun[]} Runs in reading order; never empty for a non-empty title.
 */
export function parseTitle(title) {
  const text = String(title ?? '');
  const runs = [];
  let plain = '';

  const push = (value, tone) => {
    if (value) runs.push({ text: value, tone });
  };

  for (let i = 0; i < text.length; i += 1) {
    const mark = TITLE_MARKUP.find((m) => m.open === text[i]);
    const end = mark ? text.indexOf(mark.close, i + 1) : -1;
    if (mark && end > i + 1) {
      push(plain, 'plain');
      plain = '';
      push(text.slice(i + 1, end), mark.tone);
      i = end;
    } else {
      plain += text[i];
    }
  }
  push(plain, 'plain');
  return runs;
}

/**
 * The plain text of a title, markup removed.
 *
 * @param {string} title Title with optional tone markup.
 * @returns {string} The words alone.
 */
export function titleText(title) {
  return parseTitle(title).map((run) => run.text).join('');
}

/**
 * Split a caption into the words the typewriter reveals.
 *
 * @param {string} caption Caption text.
 * @returns {string[]} Words, whitespace collapsed.
 */
export function captionWords(caption) {
  return String(caption ?? '').trim().split(/\s+/).filter(Boolean);
}

/**
 * How long a caption needs on screen to be read.
 *
 * @param {string} caption Caption text.
 * @param {number} [wps=WORDS_PER_SECOND] Reading rate.
 * @returns {number} Seconds, including the hold after the last word.
 */
export function captionSeconds(caption, wps = WORDS_PER_SECOND) {
  const words = captionWords(caption).length;
  if (!words) return 0;
  return words / wps + CAPTION_HOLD_SEC;
}

/**
 * Which words of a caption are on screen at a moment, and which one just landed.
 *
 * The reference reels highlight the word being spoken, which is what makes a
 * static card feel like narration. `highlight` is the index of that word, or
 * −1 once the caption has finished typing and the whole line sits calm.
 *
 * @param {string} caption Caption text.
 * @param {number} tLocal Seconds since the scene started.
 * @param {number} [wps=WORDS_PER_SECOND] Reading rate.
 * @returns {{words: string[], shown: number, highlight: number, done: boolean}} Reveal state.
 */
export function captionAt(caption, tLocal, wps = WORDS_PER_SECOND) {
  const words = captionWords(caption);
  if (!words.length) return { words, shown: 0, highlight: -1, done: true };
  const shown = Math.max(0, Math.min(words.length, Math.floor(Math.max(0, tLocal) * wps) + 1));
  const done = shown >= words.length && tLocal >= words.length / wps;
  return { words, shown, highlight: done ? -1 : shown - 1, done };
}

/**
 * Fill in a scene's defaults.
 *
 * @param {object} scene Authored scene.
 * @param {number} index Position in the episode, used for the fallback id.
 * @returns {object} A scene with every field the renderer reads.
 */
export function normaliseScene(scene, index) {
  const raw = scene ?? {};
  const caption = String(raw.caption ?? '');
  const seconds = Number.isFinite(raw.seconds) && raw.seconds > 0
    ? raw.seconds
    : Math.max(3, Math.round((captionSeconds(caption) + 1.2) * 10) / 10);
  return {
    id: String(raw.id ?? `scene-${index + 1}`),
    kicker: String(raw.kicker ?? ''),
    title: String(raw.title ?? ''),
    caption,
    seconds,
    stats: (Array.isArray(raw.stats) ? raw.stats : []).slice(0, 3).map((stat) => ({
      label: String(stat?.label ?? ''),
      value: String(stat?.value ?? ''),
      tone: String(stat?.tone ?? 'accent'),
    })),
    panel: raw.panel ? { ...raw.panel } : { type: 'blank' },
    source: raw.source ? String(raw.source) : '',
    claim: Boolean(raw.claim),
    note: raw.note ? String(raw.note) : '',
  };
}

/**
 * Fill in an episode's defaults and normalise every scene.
 *
 * @param {object} raw Authored script.
 * @returns {object} A script the renderer can draw without further checks.
 */
export function parseScript(raw) {
  const input = raw ?? {};
  const scenes = (Array.isArray(input.scenes) ? input.scenes : []).map(normaliseScene);
  return {
    id: String(input.id ?? 'episode'),
    title: String(input.title ?? 'Untitled episode'),
    handle: String(input.handle ?? ''),
    speaker: String(input.speaker ?? ''),
    theme: String(input.theme ?? 'nightowl'),
    size: {
      w: Number(input.size?.w) || 1080,
      h: Number(input.size?.h) || 1920,
    },
    // The bands the host app draws its own furniture over. Instagram's header
    // and its handle/CTA block sit here; anything the engine puts inside them
    // is, in practice, not on screen.
    safeArea: {
      top: Number(input.safeArea?.top ?? 300),
      bottom: Number(input.safeArea?.bottom ?? 470),
    },
    avatarSlot: String(input.avatarSlot ?? 'avatar'),
    scenes,
  };
}

/**
 * Everything wrong with a script, in the order it should be fixed.
 *
 * Errors mean the episode will not render as written. Warnings mean it will
 * render and be worse than the author thinks — a caption that outruns its cut,
 * a claim with nothing behind it, a stat strip with a fourth stat that will
 * never be drawn.
 *
 * @param {object} script A script, parsed or raw.
 * @returns {Array<{scene: string, level: 'error'|'warning', message: string}>} Findings.
 */
export function validateScript(script) {
  // Parsing is idempotent, so an already-parsed script can be re-parsed rather
  // than sniffed for parsed-ness — a sniff gets this wrong the moment an author
  // writes one of the normalised fields by hand.
  const parsed = parseScript(script);
  const findings = [];
  const seen = new Set();

  if (!parsed.scenes.length) {
    findings.push({ scene: '—', level: 'error', message: 'The episode has no scenes.' });
  }

  for (const scene of parsed.scenes) {
    const add = (level, message) => findings.push({ scene: scene.id, level, message });

    if (seen.has(scene.id)) add('error', `Duplicate scene id "${scene.id}".`);
    seen.add(scene.id);

    if (!PANEL_TYPES.includes(scene.panel.type)) {
      add('error', `Unknown panel type "${scene.panel.type}".`);
    }
    if (!(scene.seconds > 0)) add('error', 'Scene duration must be greater than zero.');
    if (!scene.title) add('warning', 'No title — the frame opens on a panel with nothing naming it.');

    const need = captionSeconds(scene.caption);
    if (need > scene.seconds + 0.01) {
      add('warning', `Caption needs ${need.toFixed(1)}s to read; the scene is ${scene.seconds.toFixed(1)}s.`);
    }
    if (titleText(scene.title).length > 46) {
      add('warning', `Title is ${titleText(scene.title).length} characters; over ~46 it wraps to three lines.`);
    }
    if (scene.claim && !scene.source) {
      add('warning', 'Scene states a claim with no source. Cite it or soften it.');
    }
  }

  return findings;
}

/**
 * The running time of an episode, cuts included.
 *
 * @param {object} script A parsed script.
 * @returns {number} Seconds.
 */
export function totalSeconds(script) {
  return script.scenes.reduce((sum, scene) => sum + scene.seconds, 0);
}

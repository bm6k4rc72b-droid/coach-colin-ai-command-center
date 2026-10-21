/**
 * The film's running order and the four cars on the tray.
 *
 * Everything that decides *when* something happens lives here as plain data
 * and pure functions, so the pacing can be tested without a browser. The page
 * pins one stage and lays every scene on a single scroll timeline measured in
 * viewport heights: a scene with `len: 3` holds the screen for three screens of
 * scrolling, and neighbours cross-fade over `FADE` of a screen.
 *
 * @module miami-keys/scenes
 */

/** How long, in viewport heights, two neighbouring scenes overlap. */
export const FADE = 0.5;

/** Phones get shorter holds: the same film in less thumb travel. */
export const MOBILE_SCALE = 0.85;

/** No scene is shorter than this, or its words leave before they can be read. */
export const MIN_LEN = 2.3;

/** Copy timing inside a scene, in viewport heights (see `copyWindow`). */
export const COPY = { delay: FADE * 0.6, in: 0.45, stagger: 0.2, out: 0.35 };

export const FLEET = [
  {
    id: 'aventador',
    name: 'Lamborghini Aventador S',
    short: 'Aventador S',
    specs: ['730 hp', '0–60 in 2.9s', 'V12'],
    price: 1200,
    accent: '#b6ff2e',
    key: 'key-aventador',
  },
  {
    id: 'gtb',
    name: 'Ferrari 296 GTB',
    short: '296 GTB',
    specs: ['819 hp', '0–60 in 2.9s', 'Hybrid V6'],
    price: 1100,
    accent: '#ff3b30',
    key: 'key-gtb',
  },
  {
    id: 'cullinan',
    name: 'Rolls-Royce Cullinan',
    short: 'Cullinan',
    specs: ['563 hp', 'Coach doors', 'Starlight'],
    price: 1400,
    accent: '#f5f2ea',
    key: 'key-cullinan',
  },
  {
    id: 'g63',
    name: 'Mercedes-AMG G 63',
    short: 'G 63',
    specs: ['577 hp', '0–60 in 4.5s', 'V8 biturbo'],
    price: 900,
    accent: '#19e6ff',
    key: 'key-g63',
  },
];

/**
 * The thirteen scenes, in the order the brief fixes. `media` names an entry in
 * media.js; `kind` picks the treatment (`spin` gets the degree dial, `keys` is
 * the interactive grid). `len` is the hold in viewport heights.
 */
export const SCENES = [
  { id: 'hero', media: 'hero', kind: 'hero', len: 3.5, mood: 'neon', nav: 'Aventador' },
  { id: 'aventador-cockpit', media: 'aventador-cockpit', kind: 'shot', len: 2.6, mood: 'neon' },
  { id: 'aventador-spin', media: 'aventador-spin', kind: 'spin', len: 3, mood: 'neon', car: 'aventador' },
  { id: 'gtb', media: 'gtb', kind: 'shot', len: 3, mood: 'gold', nav: '296 GTB' },
  { id: 'gtb-cockpit', media: 'gtb-cockpit', kind: 'shot', len: 2.6, mood: 'gold' },
  { id: 'gtb-spin', media: 'gtb-spin', kind: 'spin', len: 3, mood: 'neon', car: 'gtb' },
  { id: 'cullinan', media: 'cullinan', kind: 'shot', len: 3, mood: 'white', nav: 'Cullinan' },
  { id: 'cullinan-side', media: 'cullinan-side', kind: 'shot', len: 2.6, mood: 'white' },
  { id: 'lambswool', media: 'lambswool', kind: 'shot', len: 2.6, mood: 'white' },
  { id: 'starlight', media: 'starlight', kind: 'shot', len: 2.6, mood: 'white' },
  { id: 'cullinan-spin', media: 'cullinan-spin', kind: 'spin', len: 3, mood: 'neon', car: 'cullinan' },
  { id: 'keys', media: null, kind: 'keys', len: 3, mood: 'neon', nav: 'Keys' },
  { id: 'final', media: 'final', kind: 'final', len: 2.6, mood: 'neon' },
];

/**
 * Lay the scenes end to end on one timeline.
 *
 * Scene 0 starts at 0 and is already on screen; every later scene starts `FADE`
 * before its predecessor ends, so the two cross-fade instead of cutting to
 * black. `total` is the scroll distance in viewport heights the pin needs.
 *
 * @param {{len: number}[]} scenes
 * @param {{mobile?: boolean}} [options]
 * @returns {{total: number, slots: {start: number, end: number}[]}}
 */
export function layout(scenes, { mobile = false } = {}) {
  const scale = mobile ? MOBILE_SCALE : 1;
  const slots = [];
  let cursor = 0;
  scenes.forEach((scene, i) => {
    const len = Math.max(scene.len * scale, MIN_LEN);
    const start = i === 0 ? 0 : cursor - FADE;
    const end = start + len;
    slots.push({ start, end });
    cursor = end;
  });
  return { total: cursor, slots };
}

/**
 * Which scene owns a point on the timeline. During a cross-fade the incoming
 * scene wins, so the progress rail and nav move as soon as the new picture
 * starts to appear.
 *
 * @param {{start: number, end: number}[]} slots
 * @param {number} t position in viewport heights
 * @returns {number}
 */
export function sceneAt(slots, t) {
  let found = 0;
  for (let i = 0; i < slots.length; i += 1) {
    if (t >= slots[i].start) found = i;
  }
  return found;
}

/**
 * How far through its own clip a scene's video should be at time `t`. The clip
 * starts as the scene starts fading in and finishes as it starts fading out, so
 * a spin completes its 360° while it is fully on screen.
 *
 * @param {{start: number, end: number}} slot
 * @param {number} t
 * @param {boolean} first the opening scene has no fade-in to wait for
 * @returns {number} 0..1
 */
export function clipProgress(slot, t, first = false) {
  const from = first ? slot.start : slot.start + FADE * 0.5;
  const to = slot.end - FADE;
  if (to <= from) return t >= to ? 1 : 0;
  return Math.min(1, Math.max(0, (t - from) / (to - from)));
}

/**
 * When a scene's words arrive and leave. They start arriving once the picture
 * is most of the way in, are all settled by `settled`, and start leaving
 * `COPY.out` before the next scene begins to cover this one. The opening scene's
 * words are already up when the page loads.
 *
 * @param {{start: number, end: number}} slot
 * @param {boolean} first
 * @returns {{enter: number, settled: number, leave: number}}
 */
export function copyWindow(slot, first = false) {
  const enter = first ? slot.start : slot.start + COPY.delay;
  const settled = first ? slot.start : enter + COPY.in + COPY.stagger;
  const leave = slot.end - FADE - COPY.out;
  return { enter, settled, leave };
}

/** "$1,200" — whole dollars, US grouping. */
export function price(amount) {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

/**
 * The film's content — and the rule that every frame of it is checkable.
 *
 * A marketing site for an instrument has one failure mode that matters: it
 * promises what the instrument does not do, and the first night someone relies
 * on that promise, the instrument is worthless and so is the person who sold
 * it. So this catalogue does not hold prose about features. It holds *pointers
 * into the console's own capability ledger*, and the section text is assembled
 * from those rows at load time.
 *
 * The consequence is strict and deliberate: **a feature cannot appear in the
 * film unless it exists in `capability.js`, and it is shown wearing whatever
 * state the ledger gives it.** A row the ledger calls UNSOUND appears in the
 * film as UNSOUND — in the section about the thing it is adjacent to, not
 * hidden at the bottom. If someone later softens a verdict in the ledger, the
 * film softens with it and the test suite says so. There is no second set of
 * words for the website to tell a different story with.
 *
 * Hardware lists (which satellites, which palettes, which cameras) are imported
 * from the console's own modules rather than retyped, for the same reason.
 *
 * @module black-optic-6-site/catalog
 */

import { CAPABILITIES, tally } from '../../black-optic-6/js/capability.js';
import { STATES } from '../../black-optic-6/js/provenance.js';
import { PALETTES, SOURCES } from '../../black-optic-6/js/thermal.js';
import { SATELLITES, TASKING_LADDER, LAYERS } from '../../black-optic-6/js/satellite.js';
import { FAMILIES as DEVICE_FAMILIES, ROUTES } from '../../black-optic-6/js/devices.js';
import { FAMILIES as CAMERA_FAMILIES } from '../../black-optic-6/js/argus.js';

/** Capability rows by id, for resolving the pointers below. */
const BY_ID = new Map(CAPABILITIES.map((row) => [row.id, row]));

/**
 * The headline counts, computed rather than typed.
 *
 * The title card quotes three numbers. Typing them into a sentence guarantees
 * that one day a capability is added and the sentence silently becomes false —
 * on the one page whose entire argument is that its numbers are checked. So the
 * sentence is assembled from the count, and a test asserts the assembled
 * sentence still contains it.
 */
const COUNT = tally();
const TOTAL = CAPABILITIES.length;

/** Resolve a capability id to its ledger row. Throws loudly — a typo here is a lie on the page. */
export function capability(id) {
  const row = BY_ID.get(id);
  if (!row) throw new Error(`no capability row: ${id}`);
  return row;
}

/** The ledger row plus its provenance state, ready to render. */
export function resolve(id) {
  const row = capability(id);
  const state = STATES[row.state] || STATES.UNSOUND;
  return {
    id: row.id,
    name: row.name,
    verdict: row.verdict,
    path: row.path || '',
    panel: row.panel || '',
    state: state.id,
    label: state.label,
    tone: state.tone,
    trustworthy: state.trustworthy,
    meaning: state.meaning,
  };
}

/**
 * The acts, in scroll order.
 *
 * `weight` buys scroll distance — thirteen thermal palettes need room, a title
 * card does not. `tint` steers the backdrop shader's haze colour, so the film
 * changes temperature as it moves rather than running one grade throughout.
 */
export const SCENES = Object.freeze([
  {
    id: 'arrival',
    weight: 1.1,
    act: 'I',
    title: 'Black Optic 6',
    kicker: 'Ranch sensing platform',
    line: `${TOTAL} capabilities. ${COUNT.LIVE} of them measure something right now, on the device in your hand; ${COUNT.LINK} more need one named piece of kit. ${COUNT.UNSOUND} are claims that no sensor at any price will support, and those are named too.`,
    tint: [0.14, 0.34, 0.56],
    energy: 0.3,
    shows: [],
  },
  {
    id: 'optics',
    weight: 1.35,
    act: 'II',
    title: 'Every camera is a sensor',
    kicker: 'Optics',
    line: 'The detection chain does not care what made the picture. Anything that can become a stream in a browser becomes a measuring instrument — the phone in your pocket, a Pocket 3 over USB, a PoE camera on the barn, an Argus on a fence post through a relay.',
    tint: [0.16, 0.44, 0.64],
    energy: 0.45,
    shows: ['perimeter-cameras', 'night-vision', 'motion-tracking', 'classifier', 'ghost-trail', 'colour-lock', 'template-lock', 'pan-tilt', 'dji-pocket', 'argus', 'vehicle-cam', 'polarized', 'glasses-feed'],
  },
  {
    id: 'thermal',
    weight: 1.5,
    act: 'III',
    title: 'Thirteen ways to see heat',
    kicker: 'Thermal',
    line: 'Every palette a thermal camera offers, and one line you will not find on a competitor: a palette applied to an ordinary camera is colouring brightness, not heat. A white shirt in shade paints hotter than a face in sun.',
    tint: [0.52, 0.26, 0.12],
    energy: 0.62,
    shows: ['thermal-palettes', 'thermal', 'radiometric', 'thermal-from-visible', 'swir'],
  },
  {
    id: 'satellite',
    weight: 1.35,
    act: 'IV',
    title: 'Five satellites, and what they cost',
    kicker: 'Orbital',
    line: 'Free imagery twice a day at 375 metres a pixel. The ladder up to 30 cm is four rungs long and every rung has a price on it. Nothing on that ladder resolves a person.',
    tint: [0.12, 0.36, 0.58],
    energy: 0.4,
    shows: ['satellite-imagery', 'fire-detections', 'ndvi-ground', 'spectral-rgb', 'spectral-ndvi', 'zone-ranking', 'reflectance-panel'],
  },
  {
    id: 'aerial',
    weight: 1.25,
    act: 'V',
    title: 'What is in your sky',
    kicker: 'Aerial',
    line: 'Your own aircraft plots from its telemetry. Somebody else\'s plots as a bearing, an angular size and a rate — never as an identification, because an unknown speck at unknown range has no size.',
    tint: [0.14, 0.32, 0.60],
    energy: 0.5,
    shows: ['aerial-detect', 'drone-telemetry', 'dji-drone', 'drone', 'drone-id'],
  },
  {
    id: 'wearables',
    weight: 1.2,
    act: 'VI',
    title: 'The sensor on you',
    kicker: 'Wearables',
    line: 'A chest strap or a Bluetooth watch puts your own heart rate on the same clock as everything else — so a spike at 03:12 has a camera frame next to it. The one on your wrist made by Apple does not, and that is Apple\'s decision, not a missing feature.',
    tint: [0.18, 0.46, 0.44],
    energy: 0.42,
    shows: ['wearable-hr', 'hrv', 'apple-watch', 'glasses-feed'],
  },
  {
    id: 'field',
    weight: 1.35,
    act: 'VII',
    title: 'The block, the game, the crew',
    kicker: 'Field',
    line: 'The same optics that hold a person hold a buck in the fruit at first light, and the same tracker that follows a vehicle counts bins off a row. Harvest is the feature nobody puts on a security board and everybody actually uses.',
    tint: [0.30, 0.44, 0.20],
    energy: 0.45,
    shows: ['harvest-tracking', 'yield-ranking', 'gait-analysis', 'timelapse-anomaly', 'geofence', 'acoustic-detect', 'vehicle-log', 'evidence-vault'],
  },
  {
    id: 'range',
    weight: 1.3,
    act: 'VIII',
    title: 'Steel at known distance',
    kicker: 'Marksmanship',
    line: 'A ballistics trainer against static targets: drop, drift, lag time, holdover. It is a range, on a screen — the maths that puts a hit on a plate at four hundred, practised without burning a box of ammunition.',
    tint: [0.44, 0.34, 0.14],
    energy: 0.5,
    shows: ['thermal-palettes', 'template-lock', 'auto-turret'],
  },
  {
    id: 'demo',
    weight: 1.4,
    act: 'IX',
    title: 'Run it here',
    kicker: 'Demo',
    line: 'Not a video of the product. The product, in this page, on your camera, running the same tracker and the same palettes the console runs.',
    tint: [0.16, 0.48, 0.60],
    energy: 0.7,
    shows: ['motion-tracking', 'colour-lock', 'thermal-palettes', 'spectral-rgb'],
  },
  {
    id: 'ledger',
    weight: 1.3,
    act: 'X',
    title: 'The rows that say no',
    kicker: 'Ledger',
    line: 'Eleven capabilities on the concept boards do not follow from any measurement, with any hardware, at any price. They are listed here by name because a feature quietly missing reads as a feature that works — until the night it matters.',
    tint: [0.40, 0.16, 0.22],
    energy: 0.35,
    shows: ['intent', 'threat-score', 'concealed-object', 'load-estimate', 'gait-id', 'through-wall-vitals', 'magnetic-firearm', 'auto-turret', 'nutrient-id', 'drone-id', 'thermal-from-visible'],
  },
  {
    id: 'launch',
    weight: 1,
    act: '—',
    title: 'Open the console',
    kicker: 'Enter',
    line: 'No account, no server, no telemetry leaving the device. Grant a camera and it starts measuring.',
    tint: [0.14, 0.40, 0.58],
    energy: 0.55,
    shows: ['blackout', 'evidence-vault', 'deterrence', 'mariachi'],
  },
]);

/** Look up a scene by id. */
export function scene(id) {
  return SCENES.find((s) => s.id === id) || null;
}

/**
 * Camera variants — the "which cameras" question, answered as a table.
 *
 * Built from the console's own device and Argus family lists so the site cannot
 * drift from what the console will actually open.
 */
export const CAMERA_VARIANTS = Object.freeze([
  ...DEVICE_FAMILIES.map((family) => ({
    id: family.id, name: family.name, route: family.route, note: family.note, state: 'LIVE',
  })),
  ...ROUTES.map((route) => ({
    id: route.id, name: route.name, route: route.route, note: route.note, state: route.state || 'LINK',
  })),
  ...CAMERA_FAMILIES.map((family) => ({
    id: `argus-${family.id}`,
    name: family.name,
    route: family.serves.includes('rtsp') ? 'RTSP → relay → WebRTC' : 'HTTP snapshot → relay',
    note: family.note,
    state: 'LINK',
  })),
]);

/** Thermal palettes, straight from the renderer that draws them. */
export const THERMAL_VARIANTS = Object.freeze(
  PALETTES.map((palette) => ({
    id: palette.id,
    name: palette.name,
    use: palette.use || '',
    stops: palette.stops || [],
  })),
);

/** The three honest sources a palette can be fed from. */
export const THERMAL_SOURCES = Object.freeze(Object.values(SOURCES));

/** Satellites, from the console's orbital panel. */
export const SATELLITE_VARIANTS = Object.freeze(
  SATELLITES.map((sat) => ({
    id: sat.id,
    name: sat.name,
    instrument: sat.instrument,
    nadirPixelM: sat.nadirPixelM,
    edgePixelM: sat.edgePixelM,
    swathKm: sat.swathKm,
    note: sat.note,
  })),
);

/** What more resolution costs. Four rungs, prices attached. */
export const RESOLUTION_LADDER = TASKING_LADDER;

/** Imagery layers the orbital panel can fetch. */
export const SATELLITE_LAYERS = Object.freeze(LAYERS.map((l) => ({ id: l.id, name: l.name })));

/**
 * Drones, watches and glasses — the three device families the brief asked to
 * highlight, each with the one sentence that decides whether it works.
 */
export const DEVICE_HIGHLIGHTS = Object.freeze([
  {
    group: 'Drones',
    items: [
      { name: 'DJI Mavic / Air / Mini', capability: 'dji-drone',
        detail: 'The controller pushes RTMP, which no browser plays. One relay on the ranch network turns it into a URL, and then it is just another camera.' },
      { name: 'DJI Pocket 3 / Action', capability: 'dji-pocket',
        detail: 'USB webcam mode, and the whole detection chain runs on it — gimbal stabilisation included. The single easiest upgrade on this list.' },
      { name: 'Anything else in the sky', capability: 'aerial-detect',
        detail: 'Tracked as bearing, angular size and angular rate. Reported as a contact, never as a model number.' },
      { name: 'Identifying a drone by sight', capability: 'drone-id',
        detail: 'Not possible from the camera, and the row says so.' },
    ],
  },
  {
    group: 'Smart watches',
    items: [
      { name: 'Bluetooth heart-rate strap or watch', capability: 'wearable-hr',
        detail: 'Standard Heart Rate Service over Web Bluetooth — Polar, Garmin, Wahoo, Whoop broadcast mode. Beats per minute, live, on the same clock as the cameras.' },
      { name: 'Heart rate variability', capability: 'hrv',
        detail: 'Computed from RR intervals when the strap sends them. It is a derived number and it is labelled as one.' },
      { name: 'Apple Watch', capability: 'apple-watch',
        detail: 'Apple exposes no live heart rate to a web page or to third-party apps in real time. A strap costs forty dollars and works today.' },
    ],
  },
  {
    group: 'Smart glasses',
    items: [
      { name: 'Ray-Ban Meta, Vuzix, Xreal', capability: 'glasses-feed',
        detail: 'No smart-glasses product exposes a live camera stream to a web page. The hardware can; the vendor does not open it. This is the honest answer, and it is not a build item.' },
      { name: 'Display glasses as a screen', capability: 'perimeter-cameras',
        detail: 'Glasses that present as an external monitor do work — the console renders to them like any other display. That is a viewing surface, not a sensor.' },
    ],
  },
]);

/**
 * The marksmanship section's framing.
 *
 * Stated plainly so nobody has to guess what was built: static targets at known
 * distance, the ballistics that get a round onto them, and nothing that aims
 * anything at a person. The turret row from the concept boards is shown here in
 * its ledger state rather than left out, because leaving it out is how it comes
 * back.
 */
export const RANGE_FRAMING = Object.freeze({
  is: 'A ballistics trainer: steel and paper at measured distance, drop and wind drift solved from the load, holdover practised against a clock.',
  isNot: 'Not a targeting system. Nothing in this platform tracks a person for a weapon, and the row that asked for it is in the ledger marked UNSOUND.',
  capability: 'auto-turret',
});

/** Every capability id the film points at, for the test that checks them all. */
export function citedIds() {
  const ids = new Set();
  for (const s of SCENES) for (const id of s.shows) ids.add(id);
  for (const group of DEVICE_HIGHLIGHTS) for (const item of group.items) ids.add(item.capability);
  ids.add(RANGE_FRAMING.capability);
  return [...ids];
}

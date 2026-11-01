/**
 * What the microphone heard, in ranch words.
 *
 * The classifier is YAMNet (Google, Apache-2.0): 521 AudioSet classes, run on
 * this device through MediaPipe's audio task, the TFLite file served from this
 * site so it works with Starlink down. It listens in 0.975 s windows with a
 * 0.48 s hop.
 *
 * AudioSet was not built for ranches, so each ranch event below is mapped to
 * YAMNet labels and the mapping is graded:
 *
 * - `direct` — AudioSet has the class (gunshot, chainsaw, truck, sheep).
 * - `proxy`  — the closest classes, which also fire on other things
 *   (coyote → howl/yip/canid; bolt cutters → clang/crack/metal snapping).
 * - BirdNET is the right tool for birds and is not loaded; YAMNet's bird
 *   classes are coarse. That is stated rather than hidden.
 *
 * Labels are matched exactly as YAMNet's label list spells them (checked
 * against the label file embedded in the bundled yamnet.tflite).
 *
 * @module black-optic-6/ai/audio-classes
 */

/** YAMNet's window hop in seconds. */
export const HOP_SEC = 0.48;

/** Ranch events and the YAMNet labels that evidence them. */
export const RANCH_EVENTS = Object.freeze([
  { id: 'gunshot', name: 'Gunshot', kind: 'direct', alert: true, labels: ['Gunshot, gunfire', 'Machine gun', 'Cap gun', 'Artillery fire'], confusions: 'Fireworks, firecrackers, a slammed tailgate and a nail gun can score here.' },
  { id: 'chainsaw', name: 'Chainsaw', kind: 'direct', alert: true, labels: ['Chainsaw', 'Sawing'], confusions: 'Two-stroke engines (dirt bikes, leaf blowers) overlap it.' },
  { id: 'truck', name: 'Truck / vehicle', kind: 'direct', alert: false, labels: ['Truck', 'Motor vehicle (road)', 'Car', 'Heavy engine (low frequency)', 'Medium engine (mid frequency)', 'Vehicle', 'Engine starting', 'Motorcycle'], confusions: 'Your own tractor sounds the same; a quad bike scores as motorcycle.' },
  { id: 'coyote', name: 'Coyote (proxy)', kind: 'proxy', alert: true, labels: ['Howl', 'Yip', 'Canidae, dogs, wolves', 'Whimper (dog)'], confusions: 'AudioSet has no coyote class: these are dog/wolf vocalisations, and your own dogs will fire them.' },
  { id: 'dog', name: 'Dog', kind: 'direct', alert: false, labels: ['Dog', 'Bark', 'Growling', 'Bow-wow'], confusions: 'Coyote yips can score here.' },
  { id: 'boltcutters', name: 'Bolt cutters (proxy)', kind: 'proxy', alert: true, labels: ['Clang', 'Crack', 'Breaking', 'Chink, clink', 'Tools', 'Scrape'], confusions: 'No AudioSet class exists for bolt cutters. Metal clangs from gates, chains and troughs fire these all day.' },
  { id: 'livestock', name: 'Livestock calling', kind: 'direct', alert: false, labels: ['Sheep', 'Bleat', 'Goat', 'Cattle, bovinae', 'Moo', 'Livestock, farm animals, working animals', 'Horse'], confusions: 'Normal at feeding time; sustained bleating at night is the useful signal.' },
  { id: 'voices', name: 'People', kind: 'direct', alert: true, labels: ['Speech', 'Shout', 'Yell', 'Screaming', 'Walk, footsteps', 'Whispering'], confusions: 'A radio or phone speaker is speech too.' },
  { id: 'aircraft', name: 'Aircraft', kind: 'direct', alert: false, labels: ['Aircraft', 'Helicopter', 'Fixed-wing aircraft, airplane', 'Aircraft engine', 'Propeller, airscrew'], confusions: 'A small drone sits closest to "Propeller, airscrew" or an insect buzz; there is no drone class.' },
  { id: 'glass', name: 'Glass breaking', kind: 'direct', alert: true, labels: ['Glass', 'Shatter'], confusions: 'Dropped bottles, wind chimes.' },
  { id: 'fire', name: 'Fire crackle', kind: 'direct', alert: true, labels: ['Fire', 'Crackle'], confusions: 'Rain on a tin roof and frying both crackle.' },
  { id: 'siren', name: 'Siren', kind: 'direct', alert: false, labels: ['Siren', 'Emergency vehicle', 'Police car (siren)', 'Ambulance (siren)', 'Fire engine, fire truck (siren)', 'Civil defense siren'], confusions: '' },
]);

/**
 * Collapse YAMNet categories into ranch-event scores (max over each event's labels).
 *
 * @param {{categoryName: string, score: number}[]} categories One window's output.
 * @returns {{id: string, name: string, kind: string, score: number, top: string|null, alert: boolean}[]}
 *   Sorted, strongest first.
 */
export function ranchScores(categories) {
  const byName = new Map();
  for (const c of categories ?? []) byName.set(c.categoryName ?? c.label, c.score);
  return RANCH_EVENTS.map((event) => {
    let score = 0; let top = null;
    for (const label of event.labels) {
      const s = byName.get(label) ?? 0;
      if (s > score) { score = s; top = label; }
    }
    return { id: event.id, name: event.name, kind: event.kind, alert: event.alert, score, top };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Debounce: an event is called only when it scores above `on` in at least
 * `need` of the last `window` hops, and released when it falls below `off`
 * for the whole window. One loud bang is one window; a chainsaw is many.
 */
export class EventGate {
  constructor({ on = 0.3, off = 0.15, window = 4, need = 2 } = {}) {
    Object.assign(this, { on, off, window, need });
    this.history = new Map();
    this.active = new Set();
  }

  /**
   * @param {{id: string, score: number}[]} scores One window's ranch scores.
   * @returns {{started: string[], ended: string[], active: string[]}}
   */
  push(scores) {
    const started = []; const ended = [];
    for (const { id, score } of scores) {
      const h = this.history.get(id) ?? [];
      h.push(score);
      if (h.length > this.window) h.shift();
      this.history.set(id, h);
      const hits = h.filter((s) => s >= this.on).length;
      if (!this.active.has(id) && hits >= this.need) { this.active.add(id); started.push(id); }
      if (this.active.has(id) && h.length === this.window && h.every((s) => s < this.off)) { this.active.delete(id); ended.push(id); }
    }
    return { started, ended, active: [...this.active] };
  }
}

/** The event definition for an id. */
export function eventFor(id) {
  return RANCH_EVENTS.find((e) => e.id === id) ?? null;
}

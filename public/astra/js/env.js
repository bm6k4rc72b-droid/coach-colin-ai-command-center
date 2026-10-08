/**
 * The photographed environment behind the facility.
 *
 * Seven plates — glass molecules on gold, a robotic assembly bay, a helix in
 * a museum cylinder, living cells — sit behind the WebGL lab as the room it
 * floats in. Each deck and each entrance chapter names the plate it stands
 * in front of, and moving between them crossfades two layers with a slow
 * drift, so the room changes the way a camera move would rather than the way
 * a slideshow does.
 *
 * The plates are decoration only. Nothing that carries a reading is drawn on
 * them, and with reduced motion on the drift stops and the crossfade is cut.
 *
 * @module astra/env
 */

/** Plate files, by name. */
export const PLATES = {
  emblem: './assets/env/emblem.jpg',
  assembly: './assets/env/assembly.jpg',
  nucleus: './assets/env/nucleus.jpg',
  helix: './assets/env/helix.jpg',
  cells: './assets/env/cells.jpg',
  bench: './assets/env/bench.jpg',
  orbit: './assets/env/orbit.jpg',
};

/**
 * Which plate each deck or entrance chapter stands in front of, and where the
 * plate's subject should sit in the frame (CSS background-position).
 */
const SCENES = {
  // Entrance chapters.
  gate: ['helix', '50% 40%'],
  problem: ['nucleus', '62% 50%'],
  tiers: ['bench', '50% 50%'],
  showcase: ['assembly', '70% 40%'],
  graph: ['orbit', '68% 45%'],
  enter: ['helix', '50% 40%'],
  // Decks.
  engine: ['bench', '50% 50%'],
  decoder: ['nucleus', '62% 50%'],
  ar: ['assembly', '70% 40%'],
  bodyfat: ['cells', '50% 50%'],
  compare: ['assembly', '70% 40%'],
  verify: ['helix', '50% 40%'],
  studio: ['orbit', '68% 45%'],
  command: ['helix', '50% 40%'],
  profile: ['cells', '50% 50%'],
  settings: ['bench', '50% 50%'],
};

/** The crossfading backdrop. */
export class Environment {
  /**
   * @param {HTMLElement} root The `#env` container.
   * @param {{ reducedMotion?: boolean }} [options] Behaviour flags.
   */
  constructor(root, { reducedMotion = false } = {}) {
    this.root = root;
    this.reducedMotion = reducedMotion;
    this.current = null;
    this.front = 0;
    this.layers = [0, 1].map(() => {
      const layer = document.createElement('div');
      layer.className = 'env-plate';
      root.appendChild(layer);
      return layer;
    });
    // Warm the cache so the first crossfade does not flash an empty layer.
    for (const src of Object.values(PLATES)) {
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
    }
  }

  /**
   * Stand in front of a scene's plate.
   *
   * @param {string} key A deck or chapter id.
   */
  show(key) {
    const scene = SCENES[key];
    if (!scene) return;
    const [plate, position] = scene;
    if (this.current === plate) return;
    this.current = plate;
    const incoming = this.layers[1 - this.front];
    const outgoing = this.layers[this.front];
    incoming.style.backgroundImage = `url("${PLATES[plate]}")`;
    incoming.style.backgroundPosition = position;
    incoming.dataset.plate = plate;
    // Restart the drift on the incoming layer so every arrival moves.
    incoming.classList.remove('on');
    void incoming.offsetWidth;
    incoming.classList.add('on');
    outgoing.classList.remove('on');
    this.front = 1 - this.front;
    this.root.dataset.plate = plate;
  }
}

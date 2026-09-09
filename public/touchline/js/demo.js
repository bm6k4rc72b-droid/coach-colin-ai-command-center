/**
 * A match that never happened, rendered from numbers.
 *
 * Two things need footage of a pitch: a person judging whether this app is
 * worth their time, and a test asserting that it measures what it claims to.
 * Neither can be served by a clip of a real match — the first because nobody
 * has one to hand, the second because nobody knows how fast the players in it
 * were actually running.
 *
 * So the app carries a synthetic one. Players are placed by a choreography
 * written in metres and seconds, projected through a real pinhole camera onto a
 * real 105 x 68 m pitch, and drawn as slabs of kit colour on mown grass. The
 * clip is deliberately unkind to the analysis: the grass is striped and noisy,
 * the lines are painted at their true width so they are three pixels across
 * near the camera and one at the far end, and players cross in front of one
 * another so the tracker has to cope with merged blobs.
 *
 * Because the choreography is written down, the right answers are known before
 * the app runs — {@link DEMO_TRUTH} states them. The end-to-end test drives the
 * shipped app against this clip and checks the reported speeds against the ones
 * asked for here, which is the only test that can catch an error introduced
 * anywhere between the pixels and the panel.
 *
 * The interface labels it as synthetic wherever it appears. A demo that looked
 * like real footage would be exactly the kind of thing this app was written to
 * argue against.
 *
 * @module touchline/demo
 */

import { FULL_PITCH, pitchLines, scaleAt, invert3 } from './pitch.js';

const RAD = Math.PI / 180;

/** Subtract two 3-vectors. */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Cross product of two 3-vectors. */
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Normalise a 3-vector. */
const unit = (a) => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

/** Kit colours, chosen to be far apart in chromaticity as the Laws require. */
export const KITS = Object.freeze({
  home: [30, 92, 200],
  away: [206, 42, 48],
  keeper: [242, 196, 40],
  official: [26, 26, 30],
});

/**
 * A camera's basis vectors and focal length.
 *
 * @param {object} spec Placement.
 * @returns {{right: number[], down: number[], forward: number[], f: number,
 *   position: number[], width: number, height: number}} The camera.
 */
export function cameraBasis({ position, target, fovDeg, width, height }) {
  const forward = unit(sub(target, position));
  const right = unit(cross(forward, [0, 0, 1]));
  const down = cross(forward, right);
  return {
    right,
    down,
    forward,
    f: width / 2 / Math.tan((fovDeg * RAD) / 2),
    position,
    width,
    height,
  };
}

/**
 * The ground-plane homography of a camera looking at a pitch.
 *
 * For points with z = 0 the full projection collapses to a 3x3 matrix, which is
 * exactly the matrix the app fits from marked landmarks — so the fixture can
 * hand a test the true answer to compare a fit against.
 *
 * @param {object} spec Camera placement, as for {@link cameraBasis}.
 * @returns {number[]} Row-major 3x3 pitch-to-image homography.
 */
export function camera(spec) {
  const { right, down, forward, f, position, width, height } = cameraBasis(spec);
  const R = [right, down, forward];
  const t = R.map((row) => -(row[0] * position[0] + row[1] * position[1] + row[2] * position[2]));
  const K = [f, 0, width / 2, 0, f, height / 2, 0, 0, 1];
  const cols = [
    [R[0][0], R[1][0], R[2][0]],
    [R[0][1], R[1][1], R[2][1]],
    [t[0], t[1], t[2]],
  ];
  const h = new Array(9).fill(0);
  for (let r = 0; r < 3; r += 1)
    for (let c = 0; c < 3; c += 1)
      for (let k = 0; k < 3; k += 1) h[r * 3 + c] += K[r * 3 + k] * cols[c][k];
  return h;
}

/**
 * Project a pitch point through a row-major 3x3.
 *
 * @param {number[]} h Matrix.
 * @param {number} x Pitch x, metres.
 * @param {number} y Pitch y, metres.
 * @returns {{x: number, y: number, w: number}} Image point and its scale.
 */
export function project(h, x, y) {
  const w = h[6] * x + h[7] * y + h[8];
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w, w };
}

/**
 * Project a point above the pitch, which a ground homography cannot do.
 *
 * This is exactly the error the app avoids by measuring players at their feet:
 * the top of a player's head is metres from where the ground mapping puts it.
 *
 * @param {object} basis Camera from {@link cameraBasis}.
 * @param {number} x Pitch x, metres.
 * @param {number} y Pitch y, metres.
 * @param {number} z Height above the pitch, metres.
 * @returns {{x: number, y: number, w: number}} Image point.
 */
export function projectAbove(basis, x, y, z) {
  const rel = sub([x, y, z], basis.position);
  const camera3 = [
    basis.right[0] * rel[0] + basis.right[1] * rel[1] + basis.right[2] * rel[2],
    basis.down[0] * rel[0] + basis.down[1] * rel[1] + basis.down[2] * rel[2],
    basis.forward[0] * rel[0] + basis.forward[1] * rel[1] + basis.forward[2] * rel[2],
  ];
  return {
    x: basis.width / 2 + (basis.f * camera3[0]) / camera3[2],
    y: basis.height / 2 + (basis.f * camera3[1]) / camera3[2],
    w: camera3[2],
  };
}

/** A deterministic noise source, so a failing test fails the same way twice. */
function noise(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Render one frame of the synthetic match.
 *
 * @param {object} scene What to draw.
 * @param {object} scene.basis Camera from {@link cameraBasis}.
 * @param {number[]} scene.pitchToImage Its ground homography.
 * @param {{x: number, y: number, kit: number[]}[]} scene.players Players.
 * @param {{x: number, y: number}} [scene.ball] Ball position.
 * @param {number} [scene.seed=7] Noise seed.
 * @param {{lengthM: number, widthM: number}} [scene.dimensions=FULL_PITCH] Pitch.
 * @param {Uint8ClampedArray} [scene.into] Buffer to reuse.
 * @returns {{data: Uint8ClampedArray, width: number, height: number,
 *   drawn: object[]}} An RGBA frame and what ended up in it.
 */
export function renderScene({
  basis,
  pitchToImage,
  players = [],
  ball = null,
  seed = 7,
  dimensions = FULL_PITCH,
  into = null,
}) {
  const width = basis.width;
  const height = basis.height;
  const data = into ?? new Uint8ClampedArray(width * height * 4);
  const rand = noise(seed);
  const imageToPitch = invert3(pitchToImage);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const w = imageToPitch[6] * (x + 0.5) + imageToPitch[7] * (y + 0.5) + imageToPitch[8];
      const px = (imageToPitch[0] * (x + 0.5) + imageToPitch[1] * (y + 0.5) + imageToPitch[2]) / w;
      const py = (imageToPitch[3] * (x + 0.5) + imageToPitch[4] * (y + 0.5) + imageToPitch[5]) / w;
      const inside =
        w > 0 && px >= -3 && px <= dimensions.lengthM + 3 && py >= -3 && py <= dimensions.widthM + 3;
      const n = (rand() - 0.5) * (inside ? 12 : 20);
      if (inside) {
        // Mown in five-metre stripes, so the turf model has real variation to
        // cope with rather than one flat green.
        const stripe = Math.floor(px / 5) % 2 === 0 ? 14 : 0;
        data[i] = 34 + stripe * 0.5 + n;
        data[i + 1] = 96 + stripe + n;
        data[i + 2] = 38 + stripe * 0.5 + n;
      } else {
        data[i] = 78 + n;
        data[i + 1] = 76 + n;
        data[i + 2] = 82 + n;
      }
      data[i + 3] = 255;
    }
  }

  const put = (x, y, r, g, b) => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const i = (py * width + px) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  };

  // Paint, drawn at the width 12 cm actually comes to at each point: three
  // pixels near the camera, one at the halfway line. Drawing every line the
  // same thickness would flatter the segmenter near the camera and slander it
  // in the distance.
  for (const line of pitchLines(dimensions)) {
    const a = project(pitchToImage, line.a.x, line.a.y);
    const b = project(pitchToImage, line.b.x, line.b.y);
    if (a.w <= 0 || b.w <= 0) continue;
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)) + 1;
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const { minM } = scaleAt(imageToPitch, x, y);
      const radius = minM > 1e-9 ? Math.max(0, Math.round(0.12 / minM / 2)) : 0;
      for (let dy = -radius; dy <= radius; dy += 1)
        for (let dx = -radius; dx <= radius; dx += 1) put(x + dx, y + dy, 232, 234, 230);
    }
  }

  const drawn = [];
  for (const player of players) {
    const foot = project(pitchToImage, player.x, player.y);
    if (foot.w <= 0) continue;
    const head = projectAbove(basis, player.x, player.y, 1.8);
    const pixelHeight = Math.abs(foot.y - head.y);
    if (!(pixelHeight > 2)) continue;
    const halfWidth = Math.max(1, (pixelHeight * 0.5) / 1.8 / 2);
    const [r, g, b] = player.kit;
    for (let y = Math.round(foot.y - pixelHeight); y <= Math.round(foot.y); y += 1) {
      const fromTop = (Math.round(foot.y) - y) / pixelHeight;
      for (let x = Math.round(foot.x - halfWidth); x <= Math.round(foot.x + halfWidth); x += 1) {
        if (fromTop > 0.84) put(x, y, 198, 156, 124);
        else if (fromTop < 0.45) put(x, y, r * 0.55, g * 0.55, b * 0.55);
        else put(x, y, r, g, b);
      }
    }
    drawn.push({ ...player, foot, pixelHeight });
  }

  if (ball) {
    const at = project(pitchToImage, ball.x, ball.y);
    if (at.w > 0) {
      const top = projectAbove(basis, ball.x, ball.y, 0.22);
      const radius = Math.max(1, Math.abs(at.y - top.y) / 2);
      for (let dy = -radius; dy <= radius; dy += 0.5)
        for (let dx = -radius; dx <= radius; dx += 0.5)
          if (dx * dx + dy * dy <= radius * radius) put(at.x + dx, at.y + dy - radius, 245, 245, 245);
    }
  }

  return { data, width, height, drawn };
}

/** The camera the demo films through: a phone on a fence by the near corner. */
export const DEMO_CAMERA = Object.freeze({
  position: [30, -34, 12],
  target: [28, 26, 0],
  fovDeg: 40,
  width: 640,
  height: 360,
});

/** Length of the demo loop, seconds. */
export const DEMO_SECONDS = 12;

/**
 * What the demo is doing, so a test can check the app against it.
 *
 * These are the numbers written into {@link choreography}, not numbers measured
 * from it. A test that agrees with these has verified the whole chain from
 * pixels to panel.
 */
export const DEMO_TRUTH = Object.freeze({
  /** The break: 7 m/s, held for 4.6 s, from x = 8 m to x = 40.2 m. */
  runnerSpeedMps: 7,
  runSeconds: 4.6,
  runDistanceM: 7 * 4.6,
  runnerLabel: 'the home player breaking from 8 m to 40.2 m along the pitch',
  /** The covering run across the pitch. */
  joggerSpeedMps: 3,
  /**
   * Players who do not move at all: three holding position, one deep, and the
   * goalkeeper. Every one of them must log exactly zero metres.
   */
  stationaryPlayers: 5,
  /**
   * Two more drift by a metre or two on a slow sine. Whether those register at
   * all depends on where they are standing: a metre at the far end of this
   * pitch is under the tracker's noise floor there, and not crediting it is the
   * intended behaviour rather than a miss.
   */
  driftingPlayers: 2,
  homeOutfield: 4,
  awayOutfield: 4,
  keepers: 1,
  passSpeedMps: 14,
  loopSeconds: 12,
});

/**
 * Where everybody is at a given moment of the demo.
 *
 * A break out of defence: one home player runs the length of the box at 7 m/s,
 * an opponent tracks across at 3 m/s to cut them off, and the rest hold their
 * positions so the app has something that should register exactly zero metres.
 * The ball is played ahead of the runner at 14 m/s.
 *
 * @param {number} t Seconds since the clip started.
 * @returns {{players: object[], ball: {x: number, y: number}}} The scene.
 */
export function choreography(t) {
  const loop = t % DEMO_SECONDS;
  const players = [
    { id: 'runner', x: 8 + 7 * Math.min(loop, 4.6), y: 26, kit: KITS.home },
    { id: 'tracker', x: 30 - 3 * Math.min(loop, 4.6), y: 44, kit: KITS.away },
    { id: 'holder-a', x: 20, y: 16, kit: KITS.home },
    { id: 'holder-b', x: 26, y: 52, kit: KITS.away },
    { id: 'holder-c', x: 34, y: 34, kit: KITS.home },
    { id: 'wide', x: 31 + 1.2 * Math.sin(loop * 0.8), y: 60, kit: KITS.away },
    { id: 'deep', x: 12, y: 50, kit: KITS.home },
    { id: 'press', x: 18 + 2 * Math.sin(loop * 0.5), y: 34, kit: KITS.away },
    { id: 'keeper', x: 3, y: 34, kit: KITS.keeper },
  ];
  // The ball is played ahead of the runner and then travels with them, which
  // gives the possession ledger something to attribute and the pass panel a
  // carrier to draw lanes from.
  const ball =
    loop < 1.2
      ? { x: 9 + 14 * loop, y: 27.5 }
      : { x: Math.min(8 + 7 * Math.min(loop, 4.6) + 1.4, 42), y: 26.6 };
  return { players, ball };
}

/**
 * The landmarks the demo's camera sees, with their exact image positions.
 *
 * The demo calibrates itself from these rather than asking a reader to tap four
 * points before anything happens. They are computed from the camera, so they
 * are the truth the app's own fit is checked against.
 *
 * @param {{lengthM: number, widthM: number}} [dimensions=FULL_PITCH] Pitch.
 * @returns {{id: string, label: string, image: {x: number, y: number},
 *   pitch: {x: number, y: number}}[]} Marks ready for `fitHomography`.
 */
export function demoMarks(dimensions = FULL_PITCH) {
  const h = camera(DEMO_CAMERA);
  const wanted = [
    ['box-left-far', 'Left box — far corner', 16.5, 54.16],
    ['box-left-near', 'Left box — near corner', 16.5, 13.84],
    ['box-left-goal-far', 'Left box — far goal line', 0, 54.16],
    ['six-left-near', 'Left six-yard — near corner', 5.5, 13.84],
    ['spot-left', 'Left penalty spot', 11, 34],
  ];
  void dimensions;
  return wanted.map(([id, label, x, y]) => {
    const at = project(h, x, y);
    return { id, label, image: { x: at.x, y: at.y }, pitch: { x, y } };
  });
}

/**
 * Play the demo into a canvas and hand back a stream the app can treat as a
 * camera.
 *
 * Rendering into a canvas and capturing it, rather than shipping an encoded
 * video, keeps the app dependency-free and means the clip is generated at
 * whatever size the analysis wants. It is browser-only; everything above this
 * point runs in Node so the tests can use it.
 *
 * @param {object} [options] Playback options.
 * @param {number} [options.fps=25] Frames a second.
 * @returns {{stream: MediaStream, marks: object[], stop: () => void}} A live
 *   stream of the synthetic match, the landmarks in it, and a way to stop it.
 */
export function startDemo(options = {}) {
  const fps = options.fps ?? 25;
  const basis = cameraBasis(DEMO_CAMERA);
  const pitchToImage = camera(DEMO_CAMERA);
  const canvas = document.createElement('canvas');
  canvas.width = DEMO_CAMERA.width;
  canvas.height = DEMO_CAMERA.height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(canvas.width, canvas.height);
  const startedAt = performance.now();
  let frame = 0;
  let timer = 0;

  const paint = () => {
    const t = (performance.now() - startedAt) / 1000;
    const scene = choreography(t);
    renderScene({
      basis,
      pitchToImage,
      players: scene.players,
      ball: scene.ball,
      seed: 11 + (frame % 997),
      into: image.data,
    });
    ctx.putImageData(image, 0, 0);
    frame += 1;
  };

  paint();
  timer = setInterval(paint, 1000 / fps);
  return {
    stream: canvas.captureStream(fps),
    marks: demoMarks(),
    stop: () => clearInterval(timer),
  };
}

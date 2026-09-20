/**
 * The god's-eye view: everything the app knows, drawn at its true size.
 *
 * The rule this renderer follows is that **nothing is drawn smaller than its
 * uncertainty.** A satellite detection is drawn as the pixel footprint it
 * actually covers, a camera fix as its error ellipse, a spread projection as
 * the band between its slow and fast runs. Where the app is unsure, the drawing
 * is big and vague, and where it is sure the drawing is small and sharp — so
 * the picture reads correctly at a glance, before anybody has read a number.
 *
 * This is the opposite of the usual convention, where every layer becomes a
 * crisp icon of identical size and a 4 km MODIS pixel, a surveyed node and a
 * grazing camera fix all look equally like facts.
 *
 * There is no basemap by default, and that is deliberate rather than a missing
 * feature. A procedurally generated hillshade would look convincing and be
 * fiction, and fiction under a fire projection is worse than an empty grid —
 * somebody would read a ridge off it. So the ground is a labelled coordinate
 * graticule with a true scale bar, and real map tiles are an explicit opt-in
 * with their attribution attached.
 *
 * Projection is Web Mercator, because it is conformal: a circle of given ground
 * radius draws as a circle rather than an ellipse, which matters when the
 * ellipses on screen are carrying meaning. Its famous area distortion is
 * irrelevant at incident scale and the scale bar is computed at the view's own
 * latitude.
 *
 * @module emberline/globe
 */

import { destination, distanceM, ellipseRing, metresPerDegreeLon, wrapLon } from './geo.js';

/** Tile size Web Mercator is conventionally defined against. */
const TILE = 256;

/**
 * Create a view over a canvas.
 *
 * @param {HTMLCanvasElement} canvas The target canvas.
 * @param {{lat: number, lon: number}} centre Initial centre.
 * @param {number} [zoom=11] Initial Web Mercator zoom.
 * @returns {object} A view with projection, camera and draw methods.
 */
export function createView(canvas, centre, zoom = 11) {
  const view = {
    canvas,
    centre: { ...centre },
    zoom,
    dpr: 1,
    width: 0,
    height: 0,
  };

  /** Recompute backing-store size for the current device pixel ratio. */
  view.resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    view.dpr = dpr;
    view.width = Math.max(1, Math.round(rect.width));
    view.height = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(view.width * dpr);
    canvas.height = Math.round(view.height * dpr);
    const context = canvas.getContext('2d');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return view;
  };

  /** Scale in pixels per Mercator world unit at the current zoom. */
  const worldPx = () => TILE * 2 ** view.zoom;

  /**
   * Project geographic coordinates to canvas pixels.
   *
   * @param {{lat: number, lon: number}} position Position.
   * @returns {{x: number, y: number}} Canvas pixels.
   */
  view.project = (position) => {
    const scale = worldPx();
    const cx = mercatorX(view.centre.lon) * scale;
    const cy = mercatorY(view.centre.lat) * scale;
    return {
      x: mercatorX(position.lon) * scale - cx + view.width / 2,
      y: mercatorY(position.lat) * scale - cy + view.height / 2,
    };
  };

  /**
   * Turn canvas pixels back into coordinates.
   *
   * @param {number} x Canvas x.
   * @param {number} y Canvas y.
   * @returns {{lat: number, lon: number}} Position.
   */
  view.unproject = (x, y) => {
    const scale = worldPx();
    const wx = (x - view.width / 2 + mercatorX(view.centre.lon) * scale) / scale;
    const wy = (y - view.height / 2 + mercatorY(view.centre.lat) * scale) / scale;
    return { lat: inverseMercatorY(wy), lon: wrapLon(wx * 360 - 180) };
  };

  /** Metres per screen pixel at the view centre. @returns {number} */
  view.metresPerPixel = () => {
    const a = view.unproject(view.width / 2, view.height / 2);
    const b = view.unproject(view.width / 2 + 64, view.height / 2);
    return distanceM(a, b) / 64;
  };

  /**
   * Pan by a pixel delta.
   *
   * @param {number} dx Pixels right.
   * @param {number} dy Pixels down.
   */
  view.panBy = (dx, dy) => {
    const centre = view.unproject(view.width / 2 - dx, view.height / 2 - dy);
    view.centre = { lat: clampLat(centre.lat), lon: centre.lon };
  };

  /**
   * Zoom about a screen point, keeping the ground under it fixed.
   *
   * @param {number} delta Zoom levels to add.
   * @param {number} [px] Screen x to zoom about; defaults to centre.
   * @param {number} [py] Screen y to zoom about.
   */
  view.zoomBy = (delta, px, py) => {
    const anchorX = px ?? view.width / 2;
    const anchorY = py ?? view.height / 2;
    const before = view.unproject(anchorX, anchorY);
    view.zoom = Math.min(18, Math.max(3, view.zoom + delta));
    const after = view.unproject(anchorX, anchorY);
    view.centre = {
      lat: clampLat(view.centre.lat + (before.lat - after.lat)),
      lon: view.centre.lon + (before.lon - after.lon),
    };
  };

  /**
   * Frame a set of positions with a margin.
   *
   * @param {Array<{lat: number, lon: number}>} positions Positions to include.
   * @param {number} [padPx=64] Screen margin.
   */
  view.fit = (positions) => {
    const valid = positions.filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
    if (!valid.length) return;
    const lats = valid.map((p) => p.lat);
    const lons = valid.map((p) => p.lon);
    view.centre = {
      lat: clampLat((Math.min(...lats) + Math.max(...lats)) / 2),
      lon: (Math.min(...lons) + Math.max(...lons)) / 2,
    };
    const spanLat = Math.max(0.004, Math.max(...lats) - Math.min(...lats));
    const spanLon = Math.max(0.004, Math.max(...lons) - Math.min(...lons));
    for (let z = 18; z >= 3; z -= 1) {
      view.zoom = z;
      const scale = TILE * 2 ** z;
      const wLat = Math.abs(mercatorY(Math.max(...lats)) - mercatorY(Math.min(...lats))) * scale;
      const wLon = (spanLon / 360) * scale;
      if (wLon < view.width - 96 && wLat < view.height - 96) break;
      void spanLat;
    }
  };

  return view;
}

/** Web Mercator x in `[0, 1]`. @param {number} lon @returns {number} */
const mercatorX = (lon) => (lon + 180) / 360;

/** Web Mercator y in `[0, 1]`. @param {number} lat @returns {number} */
function mercatorY(lat) {
  const phi = (clampLat(lat) * Math.PI) / 180;
  return (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2;
}

/** Inverse of {@link mercatorY}. @param {number} y @returns {number} */
function inverseMercatorY(y) {
  const n = Math.PI * (1 - 2 * y);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/** Mercator cannot represent the poles. @param {number} lat @returns {number} */
const clampLat = (lat) => Math.min(85.05, Math.max(-85.05, lat));

/**
 * Label rectangles already placed this frame.
 *
 * Two labels on top of each other are worse than one label, because the reader
 * cannot tell which marker either belongs to — and on this map the markers are
 * a school and a camera site. So every label is placed through
 * {@link placeLabel}, which nudges it clear of what is already down or drops it
 * rather than overprint. Reset at the start of each frame by {@link drawGround}.
 *
 * @type {Array<{x: number, y: number, w: number, h: number}>}
 */
let labelSlots = [];

/**
 * Draw a label near an anchor, moved clear of labels already placed.
 *
 * Candidate offsets are tried in order of preference — right of the marker
 * first, because that reads most naturally — and the first one that does not
 * collide wins. If every candidate collides the label is skipped: an unplaced
 * label costs one name, an overprinted one costs two.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {string} text The label.
 * @param {number} x Anchor x.
 * @param {number} y Anchor y.
 * @param {string} colour Fill colour.
 */
export function placeLabel(ctx, text, x, y, colour) {
  const w = ctx.measureText(text).width;
  const h = 12;
  const candidates = [
    [10, 4], [10, -10], [10, 17], [-w - 10, 4], [-w - 10, -10], [-w / 2, -13], [-w / 2, 21],
  ];
  for (const [dx, dy] of candidates) {
    const rect = { x: x + dx, y: y + dy - h, w, h: h + 3 };
    const clashes = labelSlots.some(
      (slot) =>
        rect.x < slot.x + slot.w && rect.x + rect.w > slot.x && rect.y < slot.y + slot.h && rect.y + rect.h > slot.y,
    );
    if (clashes) continue;
    labelSlots.push(rect);
    ctx.fillStyle = colour;
    ctx.fillText(text, x + dx, y + dy);
    return;
  }
}

/** The palette, in one place so the layers stay legible against each other. */
export const PALETTE = Object.freeze({
  ground: '#0a0d12',
  grid: 'rgba(120,150,180,0.13)',
  gridText: 'rgba(150,180,205,0.5)',
  satellite: 'rgba(255,150,40,0.85)',
  satelliteFill: 'rgba(255,120,20,0.16)',
  camera: '#4fd1ff',
  cameraWedge: 'rgba(79,209,255,0.10)',
  node: 'rgba(120,200,140,0.9)',
  nodeLost: '#ff4d4d',
  fix: '#ffe066',
  slow: 'rgba(255,225,120,0.5)',
  expected: 'rgba(255,140,40,0.75)',
  fast: 'rgba(255,60,40,0.55)',
  fastFill: 'rgba(255,60,40,0.07)',
  text: '#e8eef4',
});

/**
 * Paint the ground: a labelled graticule and a true scale bar.
 *
 * @param {object} view A view from {@link createView}.
 */
export function drawGround(view) {
  const ctx = view.canvas.getContext('2d');
  labelSlots = [];
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(0, 0, view.width, view.height);

  // Choose a graticule interval that gives a handful of lines at this zoom,
  // from a 1-2-5 sequence so the labels stay round numbers.
  const span = Math.abs(view.unproject(view.width, 0).lon - view.unproject(0, 0).lon);
  const step = niceStep(span / 5);
  const topLeft = view.unproject(0, 0);
  const bottomRight = view.unproject(view.width, view.height);

  ctx.lineWidth = 1;
  ctx.strokeStyle = PALETTE.grid;
  ctx.fillStyle = PALETTE.gridText;
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';

  for (let lon = Math.floor(topLeft.lon / step) * step; lon <= bottomRight.lon; lon += step) {
    const { x } = view.project({ lat: view.centre.lat, lon });
    if (x < -40 || x > view.width + 40) continue;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, view.height);
    ctx.stroke();
    ctx.fillText(formatDegrees(lon, 'EW'), x + 4, 12);
  }
  for (let lat = Math.floor(bottomRight.lat / step) * step; lat <= topLeft.lat; lat += step) {
    const { y } = view.project({ lat, lon: view.centre.lon });
    if (y < -40 || y > view.height + 40) continue;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(view.width, y);
    ctx.stroke();
    ctx.fillText(formatDegrees(lat, 'NS'), 4, y - 4);
  }

  drawScaleBar(view, ctx);
}

/**
 * A scale bar measured at the view's own latitude.
 *
 * @param {object} view The view.
 * @param {CanvasRenderingContext2D} ctx Target context.
 */
function drawScaleBar(view, ctx) {
  const mpp = view.metresPerPixel();
  const target = Math.min(160, view.width * 0.3);
  const metres = niceStep((target * mpp) / 1.4) * 1.4;
  const px = metres / mpp;
  // Right-aligned and lifted clear of the horizon slider and the coordinate
  // readout, both of which live along the bottom edge.
  const x = Math.max(14, view.width - px - 14);
  const y = view.height - 58;
  ctx.strokeStyle = 'rgba(232,238,244,0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x, y);
  ctx.lineTo(x + px, y);
  ctx.lineTo(x + px, y - 5);
  ctx.stroke();
  ctx.fillStyle = PALETTE.text;
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(metres >= 1000 ? `${(metres / 1000).toFixed(metres >= 10000 ? 0 : 1)} km` : `${Math.round(metres)} m`, x, y - 9);
}

/**
 * Round a span to a 1-2-5 step.
 *
 * @param {number} value Rough size.
 * @returns {number} A rounder size of the same order.
 */
function niceStep(value) {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  const step = normalised < 1.5 ? 1 : normalised < 3.5 ? 2 : normalised < 7.5 ? 5 : 10;
  return step * magnitude;
}

/**
 * Format a coordinate with a hemisphere letter.
 *
 * @param {number} value Degrees, signed.
 * @param {'EW'|'NS'} axis Which axis.
 * @returns {string} e.g. `121.30°W`.
 */
function formatDegrees(value, axis) {
  const letter = axis === 'EW' ? (value < 0 ? 'W' : 'E') : value < 0 ? 'S' : 'N';
  return `${Math.abs(value).toFixed(2)}°${letter}`;
}

/**
 * Trace a ring of positions as a canvas path.
 *
 * @param {object} view The view.
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {Array<{lat: number, lon: number}>} ring Positions.
 */
function tracePath(view, ctx, ring) {
  ctx.beginPath();
  ring.forEach((position, index) => {
    const { x, y } = view.project(position);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

/**
 * Draw satellite detections as their real ground footprints.
 *
 * @param {object} view The view.
 * @param {Array<object>} detections Detections with `scanKm`/`trackKm`.
 * @param {(d: object) => Array<{lat: number, lon: number}>} footprintOf Footprint builder.
 */
export function drawDetections(view, detections, footprintOf) {
  const ctx = view.canvas.getContext('2d');
  ctx.lineWidth = 1.25;
  for (const detection of detections) {
    tracePath(view, ctx, footprintOf(detection));
    ctx.fillStyle = PALETTE.satelliteFill;
    ctx.fill();
    ctx.strokeStyle = PALETTE.satellite;
    ctx.stroke();
  }
}

/**
 * Draw camera positions with their bearing wedges.
 *
 * @param {object} view The view.
 * @param {Array<object>} sightings Normalised sightings.
 * @param {number} [rangeM=40000] How far to draw each wedge.
 */
export function drawSightings(view, sightings, rangeM = 40000) {
  const ctx = view.canvas.getContext('2d');
  for (const s of sightings) {
    const spread = s.sigmaDeg * 2;
    tracePath(view, ctx, [
      s.position,
      destination(s.position, s.bearing - spread, rangeM),
      destination(s.position, s.bearing, rangeM),
      destination(s.position, s.bearing + spread, rangeM),
    ]);
    ctx.fillStyle = PALETTE.cameraWedge;
    ctx.fill();

    const from = view.project(s.position);
    const to = view.project(destination(s.position, s.bearing, rangeM));
    ctx.strokeStyle = PALETTE.camera;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = PALETTE.camera;
    ctx.beginPath();
    ctx.arc(from.x, from.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '11px system-ui, sans-serif';
    placeLabel(ctx, s.id, from.x, from.y, PALETTE.camera);
  }
}

/**
 * Draw network nodes, live and destroyed.
 *
 * @param {object} view The view.
 * @param {Array<object>} nodes Classified nodes.
 */
export function drawNodes(view, nodes) {
  const ctx = view.canvas.getContext('2d');
  for (const node of nodes) {
    const { x, y } = view.project(node);
    const lost = node.state === 'lost';
    ctx.strokeStyle = lost ? PALETTE.nodeLost : PALETTE.node;
    ctx.fillStyle = lost ? 'rgba(255,77,77,0.22)' : 'rgba(120,200,140,0.16)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(x - 3.5, y - 3.5, 7, 7);
    ctx.fill();
    ctx.stroke();
    if (lost) {
      // A destroyed node gets a cross through it — the one symbol on this map
      // that means a thing has stopped existing rather than been estimated.
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 6);
      ctx.lineTo(x + 6, y + 6);
      ctx.moveTo(x + 6, y - 6);
      ctx.lineTo(x - 6, y + 6);
      ctx.stroke();
    }
  }
}

/**
 * Draw a spread projection as the band it is, not as a line.
 *
 * The fast ring is filled and the slow ring is cut out of it, so what a reader
 * sees is the region the front could be in — wide when the model is uncertain,
 * narrow when it is not.
 *
 * @param {object} view The view.
 * @param {object} projection A projection from the spread module.
 */
export function drawSpread(view, projection) {
  if (!projection?.spreadsAtAll) return;
  const ctx = view.canvas.getContext('2d');

  ctx.save();
  tracePath(view, ctx, projection.fast.ring);
  ctx.fillStyle = PALETTE.fastFill;
  ctx.fill('evenodd');
  ctx.restore();

  const rings = [
    [projection.slow.ring, PALETTE.slow, 1.2, [4, 4]],
    [projection.expected.ring, PALETTE.expected, 2.2, []],
    [projection.fast.ring, PALETTE.fast, 1.4, [7, 5]],
  ];
  for (const [ring, colour, width, dash] of rings) {
    tracePath(view, ctx, ring);
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/**
 * Draw a fused hypothesis: its error ellipse, then its centre.
 *
 * @param {object} view The view.
 * @param {object} hypothesis A fused hypothesis.
 * @param {boolean} [selected=false] Whether to emphasise it.
 */
export function drawHypothesis(view, hypothesis, selected = false) {
  const ctx = view.canvas.getContext('2d');
  const ring = ellipseRing(hypothesis.position, hypothesis.ellipse, 64);
  tracePath(view, ctx, ring);
  ctx.fillStyle = 'rgba(255,224,102,0.10)';
  ctx.fill();
  ctx.strokeStyle = PALETTE.fix;
  ctx.lineWidth = selected ? 2.4 : 1.4;
  ctx.stroke();

  const { x, y } = view.project(hypothesis.position);
  ctx.fillStyle = PALETTE.fix;
  ctx.beginPath();
  ctx.arc(x, y, selected ? 6 : 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(10,13,18,0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/**
 * Draw a marked place with its arrival window.
 *
 * @param {object} view The view.
 * @param {object} place A place with `name` and an `arrival` window.
 */
export function drawPlace(view, place) {
  const ctx = view.canvas.getContext('2d');
  const { x, y } = view.project(place);
  const urgent = place.arrival?.reachable && !place.arrival.beyondHorizon && place.arrival.earliestMin < 60;
  ctx.strokeStyle = urgent ? '#ff6b6b' : 'rgba(232,238,244,0.8)';
  ctx.fillStyle = urgent ? 'rgba(255,107,107,0.22)' : 'rgba(232,238,244,0.12)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x, y - 9);
  ctx.lineTo(x + 7, y + 5);
  ctx.lineTo(x - 7, y + 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.font = '11px system-ui, sans-serif';
  placeLabel(ctx, place.name, x, y, PALETTE.text);
}

/**
 * Nearest interactive thing to a tap, in screen space.
 *
 * Hit-testing on screen distance rather than ground distance is deliberate: a
 * finger is a fixed number of pixels wide whatever the zoom, so the target a
 * user meant is the one nearest on screen.
 *
 * @param {object} view The view.
 * @param {number} x Tap x.
 * @param {number} y Tap y.
 * @param {Array<{position: {lat: number, lon: number}}>} targets Candidates.
 * @param {number} [radiusPx=26] Hit radius.
 * @returns {?object} The nearest target inside the radius.
 */
export function hitTest(view, x, y, targets, radiusPx = 26) {
  let best = null;
  let bestDistance = radiusPx;
  for (const target of targets) {
    const position = target.position ?? target;
    const projected = view.project(position);
    const d = Math.hypot(projected.x - x, projected.y - y);
    if (d < bestDistance) {
      bestDistance = d;
      best = target;
    }
  }
  return best;
}

export { metresPerDegreeLon };

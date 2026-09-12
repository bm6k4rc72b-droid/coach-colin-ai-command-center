/**
 * The radio layer: what Wi-Fi can honestly tell you about a fire, and what it cannot.
 *
 * "Wi-Fi sensing" covers two genuinely different things, and conflating them is
 * how this feature becomes a lie. This module keeps them apart.
 *
 * ## One: the network dying is a measurement
 *
 * This is the strong one, and it is almost never used. A fire front moving
 * across ground destroys the infrastructure on that ground — it burns the power
 * drop, melts the fibre, takes out the pole-mounted radio, cooks the camera on
 * the mast. Every one of those devices was answering a ping a minute ago and is
 * not answering now.
 *
 * So a network of known, fixed, mapped nodes is a **grid of binary fire sensors
 * that already exists**, and nobody installed it for that. The pattern of which
 * nodes went dark, in what order, at what time, traces where the front has
 * physically been — and unlike a satellite pixel it is not hours old, not
 * blocked by cloud, and not 375 m wide. It is the exact location of a thing
 * that has stopped existing.
 *
 * {@link frontFromNodeLoss} reads that. It works because it is looking for
 * something crude: a device going away. The reason it is trustworthy is the same
 * reason it is limited — a node that goes dark tells you something happened at a
 * surveyed coordinate, and nothing about what. A backhoe, a substation fault or
 * a squirrel produces the same silence as a fire, so the module requires a
 * *spatial and temporal pattern* — several nodes, in a line, in order, moving
 * in a consistent direction at a plausible speed — before it will say "front",
 * and reports single losses as single losses.
 *
 * ## Two: sensing people through walls, which this app cannot do alone
 *
 * The research is real — channel state information from a commodity Wi-Fi link
 * carries enough multipath structure to locate and count people in a room, and
 * mmWave presence sensors do a plainer version for the price of a smoke alarm.
 * On a fire the question it answers is the one that matters most: *is anybody
 * still in that building?*
 *
 * And it is not reachable from a browser. Not "not yet", not "with a
 * permission" — there is no radio API in any shipping engine, iOS exposes no CSI
 * to any app at any privilege level, and Android exposes one signal-strength
 * number per access point when presence sensing needs per-subcarrier phase. The
 * published work runs on patched Intel/Atheros NICs, ESP32 boards in CSI mode,
 * or an SDR.
 *
 * So this is an adapter, not a pretence. Attach one of those devices, stream
 * frames over a WebSocket, and the contacts fuse with everything else. Attach
 * nothing and {@link capability} says exactly that and the panel stays empty —
 * because an invented occupancy reading is worse than no reading, and it is
 * worse in the specific way that gets a crew sent into a building for nobody.
 *
 * The wire format is deliberately small enough for an ESP32 sketch or a
 * twenty-line Python bridge:
 *
 * ```json
 * {"t": 1757600000000,
 *  "nodes": [{"id": "ap-14", "lat": 38.60, "lon": -121.30, "up": false,
 *             "lastSeen": 1757599880000, "rssi": null}],
 *  "contacts": [{"id": "c1", "lat": 38.601, "lon": -121.299, "rangeM": 6.2,
 *                "confidence": 0.7, "motion": 0.3, "throughWall": true}],
 *  "sensor": {"kind": "csi", "label": "ESP32-CSI, station 4"}}
 * ```
 *
 * ## And a note on what this is pointed at
 *
 * Sensing through the walls of a building you do not control is, in most
 * jurisdictions, not something you may lawfully do, and it does not stop being
 * surveillance because the radio is cheap or the intent is good. Occupancy
 * sensing on a fire is one of the narrow cases where it is defensible, and the
 * case rests on it being a building that is *on fire* and a crew deciding
 * whether to enter it. That is a much smaller permission than "we have a
 * through-wall sensor", and the distinction is worth keeping in the file rather
 * than only in a policy document.
 *
 * @module emberline/rf
 */

import { bearingDelta, bearingDeg, centroid, distanceM } from './geo.js';

/** Node silence past which a node counts as lost, milliseconds. */
export const NODE_LOSS_MS = 180_000;

/** Fewest lost nodes that can describe a front rather than a coincidence. */
export const MIN_FRONT_NODES = 3;

/**
 * Why no through-wall data is present, in words an operator can act on.
 *
 * @returns {{state: 'absent', headline: string, detail: string,
 *   options: Array<{name: string, note: string}>}} The explanation and the
 *   hardware that would change the answer.
 */
export function capability() {
  return {
    state: 'absent',
    headline: 'No radio sensor attached — nothing can be said about who is inside',
    detail:
      'A browser has no radio API. `navigator.wifi` does not exist in any shipping engine, iOS exposes no channel state information to any app at any privilege level, and Android gives one signal-strength number per access point where presence sensing needs per-subcarrier phase and amplitude. This panel stays empty rather than guessing, because a fabricated occupancy reading is what sends a crew into a building for nobody.',
    options: [
      { name: 'ESP32 in CSI mode', note: 'About ten pounds a board. Streams channel state information over the wire format above; good for one room or one corridor.' },
      { name: 'Patched Intel 5300 / Atheros NIC', note: 'What most of the published through-wall work actually ran on. A laptop and a firmware patch.' },
      { name: 'mmWave presence sensor (60 GHz)', note: 'Sold as an occupancy sensor. Reports people and coarse position directly, no CSI processing needed.' },
      { name: 'Software-defined radio', note: 'Most capable and most work. Also the one most likely to be illegal to point at a building you do not own.' },
    ],
  };
}

/**
 * Classify each known node as up, lost or unknown.
 *
 * @param {Array<{id: string, lat: number, lon: number, up?: boolean, lastSeen?: number, label?: string}>} nodes
 *   The surveyed node inventory.
 * @param {number} [nowMs=Date.now()] Current time.
 * @returns {Array<object>} Nodes with `state` and `silentMs` attached.
 */
export function classifyNodes(nodes, nowMs = Date.now()) {
  return (nodes ?? []).map((node) => {
    const lastSeen = Number.isFinite(node.lastSeen) ? node.lastSeen : null;
    const silentMs = lastSeen == null ? null : Math.max(0, nowMs - lastSeen);
    let state;
    if (node.up === true) state = 'up';
    else if (node.up === false) state = 'lost';
    else if (silentMs == null) state = 'unknown';
    else state = silentMs > NODE_LOSS_MS ? 'lost' : 'up';
    return { ...node, state, silentMs, lostAtMs: state === 'lost' ? lastSeen : null };
  });
}

/**
 * Read a fire front out of the order and geometry of node losses.
 *
 * The test is deliberately hard to pass. Nodes must have gone dark in an order
 * that is consistent with a front sweeping through: each successive loss
 * further along one direction, at a speed a fire could actually manage, over a
 * span of time long enough to be a fire rather than a switch failure taking a
 * whole segment down at once.
 *
 * That last condition is the one that catches the common false positive. When
 * an upstream switch or a power feed fails, every node behind it goes silent
 * within seconds, in no spatial order at all. A fire takes minutes to cross the
 * distance between two nodes. So simultaneity is the signature of an
 * infrastructure fault, and progression is the signature of a fire, and this
 * function will not call the first one a front.
 *
 * @param {Array<object>} nodes Classified nodes from {@link classifyNodes}.
 * @param {object} [options] Tuning.
 * @param {number} [options.maxSpeedMs=15] Fastest plausible front, m/s. Above
 *   this it is not a fire spreading between nodes.
 * @param {number} [options.minSpanMs=240000] Shortest loss sequence that can be
 *   a front rather than a simultaneous outage.
 * @returns {{isFront: boolean, nodes: Array<object>, headingDeg: ?number,
 *   speedMs: ?number, leadingEdge: ?{lat: number, lon: number}, spanMs: number,
 *   confidence: number, note: string}} The verdict with its reasoning.
 */
export function frontFromNodeLoss(nodes, options = {}) {
  const maxSpeedMs = options.maxSpeedMs ?? 15;
  const minSpanMs = options.minSpanMs ?? 240_000;

  const lost = (nodes ?? [])
    .filter((n) => n.state === 'lost' && Number.isFinite(n.lostAtMs))
    .sort((a, b) => a.lostAtMs - b.lostAtMs);

  if (lost.length === 0) {
    return blankFront('Every mapped node is still answering. Nothing has been destroyed on this network.');
  }
  if (lost.length < MIN_FRONT_NODES) {
    const names = lost.map((n) => n.label ?? n.id).join(', ');
    return {
      ...blankFront(
        `${lost.length} node${lost.length === 1 ? '' : 's'} lost (${names}). One or two losses are not a front — that is equally a power cut, a backhaul fault, or a failed radio. Worth a look, not a conclusion.`,
      ),
      nodes: lost,
    };
  }

  const spanMs = lost[lost.length - 1].lostAtMs - lost[0].lostAtMs;
  if (spanMs < minSpanMs) {
    return {
      ...blankFront(
        `${lost.length} nodes went dark inside ${Math.round(spanMs / 1000)} s of each other. A fire cannot cross the ground between them that fast — this is an upstream fault taking a whole segment down at once, not a front.`,
      ),
      nodes: lost,
      spanMs,
    };
  }

  // Direction of travel: bearing from the first loss to the last.
  const first = lost[0];
  const last = lost[lost.length - 1];
  const headingDeg = bearingDeg(first, last);
  const totalM = distanceM(first, last);
  const speedMs = spanMs > 0 ? totalM / (spanMs / 1000) : 0;

  if (!(speedMs > 0) || speedMs > maxSpeedMs) {
    return {
      ...blankFront(
        `The losses run ${(totalM / 1000).toFixed(1)} km in ${Math.round(spanMs / 60000)} min, which is ${speedMs.toFixed(1)} m/s. That is outside what a fire front does between nodes, so the ordering is probably coincidence.`,
      ),
      nodes: lost,
      spanMs,
    };
  }

  // How monotonic is the progression? Each successive loss should be further
  // along the heading than the one before it. Scoring this rather than
  // demanding it lets a front with one out-of-order node still register, with
  // the disorder reflected in the confidence instead of thrown away.
  let ordered = 0;
  let previousAlong = -Infinity;
  const rad = Math.PI / 180;
  for (const node of lost) {
    const range = distanceM(first, node);
    const bearing = bearingDeg(first, node);
    const along = range * Math.cos(bearingDelta(headingDeg, bearing) * rad);
    if (along >= previousAlong) ordered += 1;
    previousAlong = Math.max(previousAlong, along);
  }
  const monotonicity = ordered / lost.length;
  const confidence = Math.min(0.85, 0.3 + 0.45 * monotonicity + 0.1 * Math.min(1, lost.length / 8));

  const isFront = monotonicity >= 0.7;
  const note = isFront
    ? `${lost.length} mapped nodes destroyed in sequence over ${Math.round(spanMs / 60000)} min, progressing towards ${Math.round(headingDeg)}° at about ${speedMs.toFixed(1)} m/s. These are surveyed coordinates where hardware stopped existing — not a detection with a pixel size, and not hours old. What it cannot tell you is that fire did it; a contractor cutting a trench through the same corridor would look similar, more slowly.`
    : `${lost.length} nodes lost over ${Math.round(spanMs / 60000)} min, but the order is scattered rather than progressive (${Math.round(monotonicity * 100)}% in sequence). Something is taking nodes out; it does not look like one front moving through them.`;

  return {
    isFront,
    nodes: lost,
    headingDeg,
    speedMs,
    leadingEdge: { lat: last.lat, lon: last.lon },
    spanMs,
    confidence: isFront ? confidence : confidence * 0.5,
    note,
  };
}

/**
 * The no-front result.
 *
 * @param {string} note Why.
 * @returns {object} A front verdict with nothing in it.
 */
function blankFront(note) {
  return {
    isFront: false,
    nodes: [],
    headingDeg: null,
    speedMs: null,
    leadingEdge: null,
    spanMs: 0,
    confidence: 0,
    note,
  };
}

/**
 * Nodes that are still up but lie ahead of a moving front.
 *
 * The operational value of reading a front off node losses is not the history,
 * it is the list this returns: which of the things still working are about to
 * stop. A repeater that is about to burn is a repeater whose traffic should be
 * rerouted now, and a camera about to burn is a camera worth watching in the
 * meantime.
 *
 * @param {Array<object>} nodes Classified nodes.
 * @param {object} front A front from {@link frontFromNodeLoss}.
 * @param {number} [withinM=5000] How far ahead to look.
 * @returns {Array<{id: string, label: string, distanceM: number, etaMin: ?number}>}
 *   Nodes in the path, nearest first.
 */
export function nodesInPath(nodes, front, withinM = 5000) {
  if (!front?.isFront || !front.leadingEdge) return [];
  const rad = Math.PI / 180;
  return (nodes ?? [])
    .filter((n) => n.state === 'up')
    .map((node) => {
      const range = distanceM(front.leadingEdge, node);
      const bearing = bearingDeg(front.leadingEdge, node);
      const off = bearingDelta(front.headingDeg, bearing);
      const along = range * Math.cos(off * rad);
      const across = Math.abs(range * Math.sin(off * rad));
      return { node, range, along, across };
    })
    // Ahead of the edge, and inside a corridor either side of the heading —
    // a node 90 degrees off the front's travel is not in its path.
    .filter((entry) => entry.along > 0 && entry.along <= withinM && entry.across <= withinM / 2)
    .map((entry) => ({
      id: entry.node.id,
      label: entry.node.label ?? entry.node.id,
      distanceM: entry.along,
      etaMin: front.speedMs > 0 ? entry.along / front.speedMs / 60 : null,
    }))
    .sort((a, b) => a.distanceM - b.distanceM);
}

/**
 * Parse an adapter frame off the wire.
 *
 * Hostile-input hardened on purpose: this arrives over a WebSocket from a
 * device on a network, and a malformed frame should produce an empty reading
 * and a reason, never a throw that stops the render loop during an incident.
 *
 * @param {string|object} payload JSON text or an already-parsed object.
 * @returns {{ok: boolean, atMs: ?number, nodes: Array<object>, contacts: Array<object>,
 *   sensor: ?object, error: ?string}} The parsed frame.
 */
export function parseAdapterFrame(payload) {
  let frame = payload;
  if (typeof payload === 'string') {
    try {
      frame = JSON.parse(payload);
    } catch {
      return { ok: false, atMs: null, nodes: [], contacts: [], sensor: null, error: 'Frame was not valid JSON.' };
    }
  }
  if (!frame || typeof frame !== 'object') {
    return { ok: false, atMs: null, nodes: [], contacts: [], sensor: null, error: 'Frame was not an object.' };
  }

  const nodes = Array.isArray(frame.nodes)
    ? frame.nodes
        .filter((n) => n && typeof n.id === 'string' && Number.isFinite(n.lat) && Number.isFinite(n.lon))
        .map((n) => ({
          id: n.id,
          label: typeof n.label === 'string' ? n.label : n.id,
          lat: n.lat,
          lon: n.lon,
          up: typeof n.up === 'boolean' ? n.up : undefined,
          lastSeen: Number.isFinite(n.lastSeen) ? n.lastSeen : undefined,
          rssi: Number.isFinite(n.rssi) ? n.rssi : null,
        }))
    : [];

  const contacts = Array.isArray(frame.contacts)
    ? frame.contacts
        .filter((c) => c && typeof c.id === 'string')
        .map((c) => ({
          id: c.id,
          lat: Number.isFinite(c.lat) ? c.lat : null,
          lon: Number.isFinite(c.lon) ? c.lon : null,
          rangeM: Number.isFinite(c.rangeM) ? c.rangeM : null,
          bearingDeg: Number.isFinite(c.bearingDeg) ? c.bearingDeg : null,
          // Confidence arrives from a device whose calibration this app has no
          // way to check, so it is clamped and carried, never trusted as a
          // probability.
          confidence: Number.isFinite(c.confidence) ? Math.min(1, Math.max(0, c.confidence)) : 0.5,
          motion: Number.isFinite(c.motion) ? Math.min(1, Math.max(0, c.motion)) : 0,
          throughWall: c.throughWall === true,
        }))
    : [];

  return {
    ok: true,
    atMs: Number.isFinite(frame.t) ? frame.t : null,
    nodes,
    contacts,
    sensor: frame.sensor && typeof frame.sensor === 'object' ? frame.sensor : null,
    error: null,
  };
}

/**
 * Summarise occupancy, with the sensor's limits in the sentence.
 *
 * @param {Array<object>} contacts Contacts from an adapter frame.
 * @param {?object} sensor The sensor descriptor, if any.
 * @returns {{count: number, moving: number, still: number, headline: string, detail: string}}
 *   What can be said about who is there.
 */
export function occupancy(contacts, sensor) {
  if (!sensor) {
    const c = capability();
    return { count: 0, moving: 0, still: 0, headline: c.headline, detail: c.detail };
  }
  const list = contacts ?? [];
  const moving = list.filter((c) => c.motion > 0.15).length;
  const still = list.length - moving;
  const label = sensor.label ?? sensor.kind ?? 'attached sensor';
  if (list.length === 0) {
    return {
      count: 0,
      moving: 0,
      still: 0,
      headline: 'No contacts',
      detail: `${label} is reporting and sees nobody. A person lying still is the hardest case for any of these sensors, so this is weaker evidence of an empty building than it looks.`,
    };
  }
  return {
    count: list.length,
    moving,
    still,
    headline: `${list.length} contact${list.length === 1 ? '' : 's'} — ${moving} moving, ${still} still`,
    detail: `From ${label}. These are radio returns, not identified people: two people close together read as one contact, and a contact is not a headcount. Position is good to a metre or two at best.`,
  };
}

/**
 * Link attenuation as a fire proxy — included, and not recommended.
 *
 * Kept in the module because somebody will ask for it, and the useful answer is
 * a measured one. Fire does affect a radio link: heat changes air density and
 * so refractive index, and combustion products are weakly ionised, both of
 * which perturb a path. The effect at Wi-Fi frequencies is small, and it is
 * buried under things that perturb a link far more — rain, a truck parking in
 * the Fresnel zone, a node's own thermal throttling, an antenna sagging on a
 * hot day.
 *
 * So a drop in link margin is reported as what it is: a drop in link margin. It
 * is corroboration for a fire that something else already found, and never a
 * detection in its own right.
 *
 * @param {{rssiNow: number, rssiBaseline: number, pathLengthM: number}} link A link's state.
 * @returns {{dropDb: number, significant: boolean, note: string}} The reading and its worth.
 */
export function linkAttenuation(link) {
  const dropDb = (link.rssiBaseline ?? 0) - (link.rssiNow ?? 0);
  // Below about 6 dB, ordinary multipath and weather cover it entirely.
  const significant = dropDb >= 6;
  return {
    dropDb,
    significant,
    note: significant
      ? `This link has lost ${dropDb.toFixed(1)} dB against its baseline over ${Math.round(link.pathLengthM)} m. Something is in the path. Fire and smoke can do this; so can rain, a vehicle, or a moved antenna — take it as corroboration of a fire found another way, not as a detection.`
      : `${dropDb.toFixed(1)} dB off baseline, which is inside normal variation for a link this length. Nothing can be read into it.`,
  };
}

/**
 * The centre of a set of node losses, for seeding a fire hypothesis.
 *
 * @param {Array<object>} lostNodes Nodes known lost.
 * @returns {?{lat: number, lon: number}} The centroid, or null.
 */
export function lossCentroid(lostNodes) {
  if (!lostNodes?.length) return null;
  return centroid(lostNodes.map((n) => ({ lat: n.lat, lon: n.lon })));
}

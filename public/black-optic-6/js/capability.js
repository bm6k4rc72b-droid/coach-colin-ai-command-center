/**
 * The feature list, answered honestly — one row per thing the platform claims.
 *
 * This is the ledger a specification becomes when somebody checks it against
 * physics, against what a browser is allowed to touch, and against whether the
 * measurement actually supports the sentence written next to it. Every capability
 * on the concept boards is in here, including the ones this console does not and
 * will not provide, because a feature quietly missing reads as a feature that
 * works until the night it matters.
 *
 * Three kinds of "no" appear, and they are genuinely different:
 *
 * - `BLOCKED` — the sensor exists in your hand and the platform will not expose
 *   it. A native app could; a web page cannot. Nothing you buy changes this.
 * - `HARDWARE` — no software anywhere gets there without a sensor you do not
 *   own. The row names the sensor and roughly what it costs.
 * - `UNSOUND` — you could buy every sensor on the list and the claim still would
 *   not follow from the data. These are not build items. They are the rows worth
 *   reading twice, because they are the ones a competitor will happily ship.
 *
 * @module black-optic-6/capability
 */

/** Where each capability was specified, for tracing a row back to the board. */
export const BOARDS = Object.freeze({
  console: 'Ranch operations console',
  optics: 'Multispectral tactical imaging',
  biometric: 'Biometric & kinetic',
  physics: 'Physics-based visions',
  stack: 'All-vision stack',
});

/**
 * A capability row.
 *
 * @typedef {object} Capability
 * @property {string} id Stable identifier.
 * @property {string} name As written on the board.
 * @property {string} board Which board asked for it.
 * @property {string} state Provenance state id.
 * @property {string} verdict One sentence: what is actually true.
 * @property {string} [path] What would change the answer, where anything would.
 * @property {string} [panel] The console panel that delivers it, when one does.
 */

/** Every capability, in the order the console presents them. */
export const CAPABILITIES = Object.freeze([
  // ---------------------------------------------------------------- shipping
  {
    id: 'perimeter-cameras',
    name: 'Ranch perimeter cameras',
    board: 'console',
    state: 'LIVE',
    verdict: 'This device\'s cameras run the detection pipeline; any camera that publishes HLS, MJPEG or WebRTC can be added as another view.',
    panel: 'optics',
  },
  {
    id: 'motion-tracking',
    name: 'Motion tracking',
    board: 'console',
    state: 'LIVE',
    verdict: 'Movement is tracked against a learned background and reported in metres and metres per second, not pixels, once the view is calibrated.',
    panel: 'watch',
  },
  {
    id: 'classifier',
    name: 'Ranch intelligence classifier — animal vs human vs machine',
    board: 'stack',
    state: 'LIVE',
    verdict: 'Separated on geometry and motion — standing height, width ratio, silhouette solidity, ground speed, gait periodicity. No recognition model, and no identity.',
    panel: 'watch',
  },
  {
    id: 'gait-analysis',
    name: 'Gait analysis — cadence, stride, balance',
    board: 'biometric',
    state: 'LIVE',
    verdict: 'Step cadence, stride length, path sinuosity and dwell are measured from the track. These are kinematics: how a body moved, not whose body it is.',
    panel: 'watch',
  },
  {
    id: 'night-vision',
    name: 'Night vision',
    board: 'console',
    state: 'LIVE',
    verdict: 'Low-light gain, temporal noise suppression and a false-colour map that spreads eight bits of murky luminance across a palette the eye can read. This is enhanced visible light — it is not thermal, and it sees nothing in true darkness.',
    panel: 'optics',
  },
  {
    id: 'ghost-trail',
    name: 'Ghost trail replay',
    board: 'stack',
    state: 'LIVE',
    verdict: 'Every track keeps its full path; replaying it redraws where a subject went, with timestamps and ground distances.',
    panel: 'watch',
  },
  {
    id: 'timelapse-anomaly',
    name: 'Time-lapse anomaly vision',
    board: 'stack',
    state: 'LIVE',
    verdict: 'The background model is the change detector — a fence gap or a moved gate that persists shows as a region that never settles back.',
    panel: 'watch',
  },
  {
    id: 'acoustic-detect',
    name: 'Acoustic vision — event detection',
    board: 'optics',
    state: 'LIVE',
    verdict: 'Sound level, band energy and sharp transients (a shot, a gate, a fence cut) are detected and timestamped from this device\'s microphone.',
    panel: 'acoustic',
  },
  {
    id: 'geofence',
    name: 'Geofence tripwire',
    board: 'stack',
    state: 'LIVE',
    verdict: 'Satellite positioning against a boundary you draw, with the fix\'s own accuracy radius shown — a 30 m fix cannot resolve a 10 m boundary and the console says so rather than alerting.',
    panel: 'perimeter',
  },
  {
    id: 'evidence-vault',
    name: 'Forensic evidence vault — 30s before and after',
    board: 'stack',
    state: 'LIVE',
    verdict: 'A rolling buffer keeps the seconds before an event as well as after it, hashed on write so a clip can be shown not to have been altered. Stored on this device.',
    panel: 'vault',
  },
  {
    id: 'deterrence',
    name: 'Light & sound deterrence',
    board: 'stack',
    state: 'LIVE',
    verdict: 'Screen flood and siren from this device, manually triggered. Crude, and effective at close range.',
    panel: 'watch',
  },
  {
    id: 'blackout',
    name: 'Blackout protocol — passive sensors only',
    board: 'stack',
    state: 'LIVE',
    verdict: 'Kills every emission the console controls: screen to black, no torch, no siren, no network calls. Sensors keep recording.',
    panel: 'watch',
  },

  // ------------------------------------------------------------------ linked
  {
    id: 'thermal',
    name: 'Thermal night vision',
    board: 'console',
    state: 'LINK',
    verdict: 'Real, and genuinely the right sensor for a dark vineyard — but it needs a thermal camera. No phone has one.',
    path: 'A fixed thermal IP camera that publishes a stream (roughly £600–2,500) links straight in. Clip-on units (FLIR ONE, Seek) work only through their own apps, so they cannot feed this console.',
    panel: 'optics',
  },
  {
    id: 'vehicle-cam',
    name: 'Mounted vehicle camera',
    board: 'console',
    state: 'LINK',
    verdict: 'Any dash or gimbal camera that publishes a stream on the ranch network appears as another view.',
    path: 'Needs an RTSP/HLS or WebRTC URL. Cameras that only talk to a vendor cloud cannot be used.',
    panel: 'optics',
  },
  {
    id: 'polarized',
    name: 'Polarized vision — cut glare off water and glass',
    board: 'optics',
    state: 'LINK',
    verdict: 'The cheapest real capability on the boards. Polarisation has to happen at the lens; no processing recovers what glare already saturated.',
    path: 'A circular polarising filter clipped over the lens, about £20. The console\'s glare view then does the rest.',
    panel: 'optics',
  },
  {
    id: 'ndvi-ground',
    name: 'Multispectral / NDVI — vine stress',
    board: 'stack',
    state: 'LINK',
    verdict: 'Vine stress shows in near-infrared, which every phone camera filters out deliberately.',
    path: 'An NIR-converted camera (a filter swap, or a purpose-built unit at £250–1,200) — or skip it and read Sentinel-2 from orbit at 10 m, free, every few days.',
    panel: 'satellite',
  },
  {
    id: 'rf-tomography',
    name: 'RF Wi-Fi tomography — presence behind a wall',
    board: 'physics',
    state: 'LINK',
    verdict: 'The published work is real and the console will read a sensor that does it. What is not real is doing it from a phone: browsers expose no radio, iOS exposes no channel state to any app, and Android reports only per-network signal strength.',
    path: 'An ESP32 in CSI mode (about £8) or a 60 GHz presence module streaming to the console over a socket. Expect coarse presence and motion, not the skeletons in the demo clips — those came from a purpose-built radio, and the models behind them were trained in the room they were tested in.',
    panel: 'links',
  },
  {
    id: 'micro-doppler',
    name: 'Radar micro-Doppler — breathing and presence',
    board: 'physics',
    state: 'LINK',
    verdict: 'Breathing rate through plasterboard at two to four metres is a real, shipping capability. It is a room sensor.',
    path: 'A 60 GHz mmWave presence module, roughly £25–60, on a socket bridge.',
    panel: 'links',
  },
  {
    id: 'magnetic-vehicle',
    name: 'Magnetic anomaly — vehicle detection',
    board: 'physics',
    state: 'LINK',
    verdict: 'A vehicle perturbs the Earth\'s field measurably within a couple of metres, which makes a buried magnetometer a good gate sensor. Safari exposes no magnetometer, so it cannot be this phone.',
    path: 'A magnetometer node at the gate, bridged to the console.',
    panel: 'links',
  },
  {
    id: 'drone',
    name: 'Drone synthetic vision',
    board: 'stack',
    state: 'LINK',
    verdict: 'A drone feed is just another camera to this console, and its stills can be flown into the satellite panel as a fresher, sharper layer.',
    path: 'A drone that publishes RTSP or RTMP, and — for anything beyond line of sight — the licence your jurisdiction requires.',
    panel: 'optics',
  },
  {
    id: 'wearable-hr',
    name: 'Wearable heart rate — auto SOS on spike',
    board: 'biometric',
    state: 'LINK',
    verdict: 'A watch cannot stream heart rate to a web page. The data exists; the live path to a browser does not.',
    path: 'A companion app exporting to a local endpoint the console polls. Camera-based pulse (already in Baseline, on this device, for the operator) needs a still face and good light — no use on a moving rider.',
    panel: 'links',
  },

  // ---------------------------------------------------------------- modelled
  {
    id: 'satellite-imagery',
    name: 'Satellite camera access',
    board: 'stack',
    state: 'MODEL',
    verdict: 'Real imagery over your coordinates, and not a live camera: daily 250 m true colour and 375 m thermal from VIIRS and MODIS, free; 10 m from Sentinel-2 every few days; about 3 m daily from commercial constellations, paid. Nothing civilian looks at your ranch on demand, and nothing at these resolutions shows a person.',
    path: 'The console computes each satellite\'s next look over your coordinates and fetches the most recent scene. For sub-metre, you are chartering a tasking, not clicking a button.',
    panel: 'satellite',
  },
  {
    id: 'fire-detections',
    name: 'Thermal detections from orbit',
    board: 'stack',
    state: 'MODEL',
    verdict: 'Fire and hot-spot detections over your land within a few hours of overpass, at 375 m per pixel, with the real ground footprint drawn rather than a dot.',
    path: 'Already wired to NASA FIRMS through the fire console in this repository.',
    panel: 'satellite',
  },
  {
    id: 'vehicle-log',
    name: 'Vehicle fingerprint — entry log',
    board: 'stack',
    state: 'MODEL',
    verdict: 'Size class, colour, direction, speed and a timestamped entry log are all supportable. Make, model and tyre tread from a perimeter camera at night are not.',
    path: 'Plate capture is a different camera at a different angle with its own lighting, and in most places its own legal basis.',
    panel: 'watch',
  },

  // ----------------------------------------------------------------- blocked
  {
    id: 'lidar',
    name: 'LiDAR depth — 3D point cloud perimeter',
    board: 'physics',
    state: 'BLOCKED',
    verdict: 'Your iPhone Pro has the sensor. Safari does not expose it to any web page, so this console cannot reach it.',
    path: 'A native iOS app can. Same phone, same sensor, different container — that is the only route.',
  },
  {
    id: 'wifi-scan',
    name: 'Wi-Fi spectrum and node signal readout',
    board: 'console',
    state: 'BLOCKED',
    verdict: 'No browser on any platform will list networks or report signal strength. The RF panel on the concept board cannot be filled by a web app at all.',
    path: 'Sensor nodes that report their own link quality over the network, which is what the link panel shows.',
  },
  {
    id: 'glasses-feed',
    name: 'Smart-glasses live feed',
    board: 'console',
    state: 'BLOCKED',
    verdict: 'Meta Ray-Bans publish no third-party live video interface. The glasses can stream to Meta\'s own apps and nowhere else.',
    path: 'None currently. A body camera that publishes RTSP does the same job today.',
  },

  // ---------------------------------------------------------------- hardware
  {
    id: 'swir',
    name: 'SWIR vision — see through fog, smoke, dust',
    board: 'optics',
    state: 'HARDWARE',
    verdict: 'Short-wave infrared genuinely punches through fog and smoke. It needs an InGaAs sensor: a different material, not a different setting.',
    path: 'Roughly £8,000–25,000, and some configurations are export-controlled. For a vineyard, thermal at a tenth of the price solves most of the same nights.',
  },
  {
    id: 'acoustic-bearing',
    name: 'Acoustic vision — bearing and range to a gunshot',
    board: 'optics',
    state: 'HARDWARE',
    verdict: 'Detecting the shot takes one microphone. Putting a bearing and a range on it takes several, at known positions, sharing a clock — that is what the commercial systems are.',
    path: 'Four or more synchronised microphone nodes across the property. The console already timestamps events precisely enough to be one of those nodes.',
  },

  // ----------------------------------------------------------------- unsound
  {
    id: 'intent',
    name: 'Stress & intent analysis · aggression predictor',
    board: 'biometric',
    state: 'UNSOUND',
    verdict: 'Not built, and not a hardware problem. There is no validated mapping from posture or micro-movement to intent, and the published attempts fail hardest across body types, disability and skin tone. A number here would be invented, and at two in the morning an invented number is acted on exactly like a measured one.',
    path: 'What the console shows instead: where someone is, how fast they are moving, which way they are heading, and how long they have been there. That is what a decision can honestly rest on.',
  },
  {
    id: 'threat-score',
    name: 'Threat assessment · overall confidence score',
    board: 'console',
    state: 'UNSOUND',
    verdict: 'A single percentage over a whole property has no denominator — nothing states what it is a fraction of. It reads as certainty and carries none.',
    path: 'Per-sensor status, each with its own provenance. Three cameras up and one offline is a fact; 92% is not.',
  },
  {
    id: 'concealed-object',
    name: 'Concealed object / bulge detection',
    board: 'biometric',
    state: 'UNSOUND',
    verdict: 'Not built. Clothing folds look like everything at perimeter range and in bad light; the false-positive rate against an ordinary person carrying ordinary things is the entire story, and acting on it means escalating on somebody\'s phone in their pocket.',
    path: 'Millimetre-wave portal scanners do this at airport range, in a doorway, cooperatively. There is no distant version.',
  },
  {
    id: 'load-estimate',
    name: 'Load / body mass estimate',
    board: 'biometric',
    state: 'UNSOUND',
    verdict: 'Height and width are measurable; mass is not. Turning a silhouette into kilograms needs a density assumption that varies more between people than the thing being estimated.',
    path: 'The console reports standing height in metres with its error, which is what the camera can actually support.',
  },
  {
    id: 'gait-id',
    name: 'Authorized gait library — identify personnel by gait',
    board: 'biometric',
    state: 'UNSOUND',
    verdict: 'Not built. Gait identification degrades with footwear, ground, slope, load and injury — every one of which changes daily on a ranch. Building an identity database that is wrong in either direction is worse than having none: the wrong stranger is waved through and the wrong ranch hand is challenged.',
    path: 'Known vehicles at known times, a gate code, or a tag your people carry. Identity should be something a person holds, not something inferred about their body.',
  },
  {
    id: 'through-wall-vitals',
    name: 'Heartbeat through walls at perimeter range',
    board: 'physics',
    state: 'UNSOUND',
    verdict: 'Breathing at two to four metres through an interior wall is real. A heartbeat through a barn wall from across the yard is not — the chest motion is under a millimetre and the return is far below what survives that path.',
    path: 'Use the mmWave module for what it does: presence and breathing, inside a room, at short range.',
  },
  {
    id: 'magnetic-firearm',
    name: 'Magnetic anomaly — firearm detection',
    board: 'physics',
    state: 'UNSOUND',
    verdict: 'A magnetometer senses a car at a couple of metres because a car is a tonne of steel. A handgun is a few hundred grams and needs the sensor within about a hand\'s width — which is a search, not a perimeter.',
    path: 'None at a distance. The vehicle case is real and is a separate row.',
  },
]);

/**
 * Capabilities in one state.
 *
 * @param {string} state Provenance state id.
 * @returns {Capability[]} Matching rows.
 */
export function inState(state) {
  return CAPABILITIES.filter((row) => row.state === state);
}

/**
 * How many capabilities sit in each state.
 *
 * @returns {Record<string, number>} Counts by state id.
 */
export function tally() {
  const counts = {};
  for (const row of CAPABILITIES) counts[row.state] = (counts[row.state] ?? 0) + 1;
  return counts;
}

/**
 * The capabilities a panel is responsible for.
 *
 * @param {string} panel Panel id.
 * @returns {Capability[]} Rows that panel delivers.
 */
export function forPanel(panel) {
  return CAPABILITIES.filter((row) => row.panel === panel);
}

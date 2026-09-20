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
  world: 'World feeds — off the ranch',
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
    id: 'thermal-palettes',
    name: 'Thermal palettes — every view a thermal camera offers',
    board: 'optics',
    state: 'LIVE',
    verdict: 'All thirteen: White Hot, Black Hot, Ironbow, Lava, Arctic, Rainbow, Rainbow HC, Amber, Sepia, Glowbow, Rain, Green Hot, Red Hot — with auto gain, manual level and span, isotherm bands and fusion edges. A palette is a colour ramp over a field of numbers, so all of them render on whatever field the console has.',
    panel: 'optics',
  },
  {
    id: 'thermal-from-visible',
    name: 'Thermal imaging from an ordinary camera',
    board: 'optics',
    state: 'UNSOUND',
    verdict: 'An ironbow ramp over a night-time frame looks exactly like thermal imaging and is nothing of the kind: it is colouring brightness. A white shirt in shade will paint hotter than a face in sun, which is backwards, and in true darkness there is nothing to colour at all. The palettes are offered because they are genuinely useful for seeing contrast — the console just refuses to call the result heat, and withholds every temperature readout unless a radiometric camera is linked.',
    path: 'A thermal camera. Nothing else produces a temperature field, and no amount of processing recovers one from visible light.',
  },
  {
    id: 'radiometric',
    name: 'Spot temperatures, isotherms and emissivity correction',
    board: 'optics',
    state: 'LINK',
    verdict: 'Degrees, spot meters, area minimum and maximum, isotherms in Celsius, and the emissivity correction most people skip — bare metal at 0.1 emissivity reads far colder than it is, and the correction is a fourth-power one rather than an offset.',
    path: 'A radiometric thermal camera reporting a temperature per pixel. A thermal camera sending only a picture gives you the palettes and no degrees.',
    panel: 'optics',
  },
  {
    id: 'colour-lock',
    name: 'Colour tracking',
    board: 'stack',
    state: 'LIVE',
    verdict: 'CAMShift: a hue histogram of the subject, back-projected and followed uphill each frame, with the window resized from the mass it encloses. Follows a red quad bike through a turn where a template tracker would let go, and keeps holding when the subject stops moving — which the motion tracker cannot, because a stationary thing becomes background.',
    panel: 'watch',
  },
  {
    id: 'template-lock',
    name: 'Object tracking',
    board: 'stack',
    state: 'LIVE',
    verdict: 'Normalised cross-correlation against a stored patch, searched around the last position. Tells two things of the same colour apart, which colour tracking cannot, and pays for it by breaking when the subject turns. Refuses to lock onto a flat patch, because a textureless region correlates with everywhere.',
    panel: 'watch',
  },
  {
    id: 'harvest-tracking',
    name: 'Harvest tracking',
    board: 'stack',
    state: 'LIVE',
    verdict: 'Loads logged against blocks give progress by row, a picking rate with the spread across the gaps between loads, and a finish window — a window rather than a time, widened while the rate is still unsettled, because a single predicted finish reads as a promise and the first wrong one costs the console its credibility with the crew.',
    panel: 'harvest',
  },
  {
    id: 'yield-ranking',
    name: 'Yield per block',
    board: 'stack',
    state: 'LIVE',
    verdict: 'Kilograms per hectare, ranked, with every figure marked measured or extrapolated. Below a quarter of a block picked the console gives no yield at all — fruit is not spread evenly enough for the arithmetic to mean anything.',
    panel: 'harvest',
  },
  {
    id: 'aerial-detect',
    name: 'Drone and aerial contact tracking',
    board: 'stack',
    state: 'LIVE',
    verdict: 'Anything tracked wholly above the horizon line is airborne, with its angular width and angular rate measured. Needs a calibrated view, because without a horizon "above the middle of the frame" is not the same thing.',
    panel: 'aerial',
  },
  {
    id: 'drone-telemetry',
    name: 'Your own aircraft',
    board: 'stack',
    state: 'LINK',
    verdict: 'Position, altitude, ground speed and climb rate from the aircraft itself — a measurement rather than an inference, and the only part of the aerial deck that is one.',
    path: 'Telemetry bridged onto the links socket from the controller or a ground station.',
    panel: 'aerial',
  },
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
    id: 'argus',
    name: 'Reolink Argus and other IP cameras',
    board: 'console',
    state: 'LINK',
    verdict: 'The console builds the RTSP and snapshot addresses, tests the connection, and tells the two failures apart that look identical in a browser: a camera that is not answering, and a camera answering into a page that is not allowed to read it.',
    path: 'Battery Argus models serve no RTSP, ONVIF or RTMP at all — go2rtc on any machine that stays on speaks Reolink\'s own protocol and is the way in. Wired Reolink and ONVIF cameras serve RTSP, which still needs a relay because no browser plays RTSP.',
    panel: 'optics',
  },
  {
    id: 'canvas-taint',
    name: 'Measuring a camera the browser will not let this page read',
    board: 'console',
    state: 'UNSOUND',
    verdict: 'A snapshot straight from a camera on the local network displays perfectly and can be measured by nothing. Drawing a cross-origin image taints the canvas, and every deck here — motion, tracking, thermal, vegetation indices — reads pixels back off one. The console checks this explicitly and reports "measurable: no" rather than showing a picture that quietly supports no measurement.',
    path: 'A relay on the same origin as the console, or one that sends cross-origin permission. That is the whole fix, and it is one program on a machine that is already on.',
  },
  {
    id: 'mariachi',
    name: 'Mariachi in the background',
    board: 'console',
    state: 'LIVE',
    verdict: 'A son jalisciense in D, synthesised note by note — guitarrón on the roots and fifths, vihuela chopping the offbeats, two trumpets in parallel diatonic thirds, violins underneath, and the hemiola alternating so it stays a son rather than becoming a waltz. No recording is shipped, so nothing here is anybody\'s copyright.',
    path: 'Off by default, and it stops itself when the acoustic watch is armed or blackout is called.',
    panel: 'watch',
  },
  {
    id: 'music-during-watch',
    name: 'Music while the acoustic watch is listening',
    board: 'console',
    state: 'UNSOUND',
    verdict: 'Not allowed, and the console enforces it rather than warning about it. The acoustic deck detects impulses on this device\'s microphone; a speaker playing trumpets into that microphone is an impulse detector listening to itself. Blackout stops it too — sound is an emission, and a console playing music through a blackout is giving away the position it was asked to hide.',
    path: 'Stop the acoustic watch, or play the music on something that is not the device doing the listening.',
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
    name: 'Wearable heart rate',
    board: 'biometric',
    state: 'LINK',
    verdict: 'Live, over Bluetooth, from any sensor implementing the standard heart rate service — every chest strap, and watches with broadcast mode switched on. Rate, and beat-to-beat intervals where the sensor sends them.',
    path: 'Pair from the bio deck. Garmin needs Broadcast Heart Rate enabled; Polar and Wahoo broadcast during a workout.',
    panel: 'bio',
  },
  {
    id: 'hrv',
    name: 'Heart rate variability',
    board: 'biometric',
    state: 'LINK',
    verdict: 'RMSSD over the last sixty beats, where the sensor reports intervals. A millisecond figure, reported as itself.',
    path: 'Needs a sensor that sends RR intervals — chest straps do, most optical wrist sensors do not.',
    panel: 'bio',
  },
  {
    id: 'dji-pocket',
    name: 'DJI Pocket / Action camera',
    board: 'console',
    state: 'LINK',
    verdict: 'Put it in USB webcam mode and it is a standard UVC device — it appears in the camera picker and the whole detection chain runs on it, gimbal stabilisation included. No SDK, nothing to install.',
    path: 'USB-C to the machine running the console. On iPhone this needs a 15 or later, which is the first with USB-C video in.',
    panel: 'optics',
  },
  {
    id: 'dji-drone',
    name: 'DJI drone feed',
    board: 'stack',
    state: 'LINK',
    verdict: 'The controller pushes RTMP, which no browser plays. One relay on the ranch network turns that into a URL this console opens like any other camera.',
    path: 'MediaTX, nginx-rtmp or OBS on a machine at the house. Then paste the HLS URL into camera sources.',
    panel: 'optics',
  },
  {
    id: 'pan-tilt',
    name: 'Auto-track spotlight / camera head',
    board: 'stack',
    state: 'LIVE',
    verdict: 'A closed loop that keeps the current contact centred in frame, damped so the picture settles rather than hunting. Outputs pan and tilt rates for a head over the sensor link.',
    path: 'Any pan-tilt head that accepts rate commands on the bridge socket.',
    panel: 'watch',
  },
  {
    id: 'spectral-rgb',
    name: 'Vegetation index from an ordinary camera',
    board: 'stack',
    state: 'LIVE',
    verdict: 'TGI, VARI and Excess Green computed live from this device or any linked camera, with the bare ground between rows masked out before anything is averaged.',
    path: 'Nothing to buy. Fly the phone or the Pocket over a block on an overcast day.',
    panel: 'spectral',
  },
  {
    id: 'zone-ranking',
    name: 'Worst-zone ranking',
    board: 'stack',
    state: 'LIVE',
    verdict: 'The output worth having: not a picture, a ranked list of cells to walk to with a tissue bag. Turns forty hectares into three flags.',
    panel: 'spectral',
  },
  {
    id: 'spectral-ndvi',
    name: 'NDVI, NDRE and the rest',
    board: 'stack',
    state: 'LINK',
    verdict: 'Every index the console knows becomes available the moment a source supplies the bands. NDVI and SAVI need near-infrared; NDRE and CIre need red edge, which is the band that still works once the canopy has closed and NDVI has flattened.',
    path: 'A £30 filter swap gets NIR. A multispectral drone camera at £3,000–8,000 gets red edge. Sentinel-2 gets both, free, at 10 m, every few days.',
    panel: 'spectral',
  },
  {
    id: 'reflectance-panel',
    name: 'Flight-to-flight comparison',
    board: 'stack',
    state: 'LINK',
    verdict: 'Two flights are only comparable if brightness was turned into reflectance. Without a calibration panel in shot, this week and last week are different scales and the difference between them is mostly the weather.',
    path: 'A calibration panel of known reflectance, about £150, photographed at the start of every flight.',
    panel: 'spectral',
  },
  {
    id: 'sonar-mapping',
    name: 'Sonar mapping — dam and reservoir',
    board: 'physics',
    state: 'LINK',
    verdict: 'Occupancy mapping from beam returns, with the beam drawn as the cone it actually is rather than a ray. Real, cheap, and it answers how deep the dam is now and how much silt arrived this winter.',
    path: 'Any sonar or fishfinder that puts range and bearing on a socket — a small ROV, or a transducer on a boat.',
    panel: 'subsurface',
  },
  {
    id: 'dam-capacity',
    name: 'Stored water and silt',
    board: 'physics',
    state: 'LINK',
    verdict: 'Mean depth across the soundings times surface area, reported as an upper bound because sloping banks hold less than a prism.',
    path: 'Run several track lines rather than one. The console says when there are too few soundings to believe the number.',
    panel: 'subsurface',
  },
  {
    id: 'sonar-slam',
    name: 'Sonar SLAM — position without satellites',
    board: 'physics',
    state: 'MODEL',
    verdict: 'The mapping half is real. The localisation half drifts: underwater there is no fix, and a degree of compass bias at half a metre per second is about nine metres of error after ten minutes, with nothing in the data to reveal it. The console corrects the pose by matching each scan against the map already built, and shows the drift estimate rather than drawing a confident track.',
    path: 'Scan matching bounds drift where there is structure — a wall, a bank, a jetty. In the featureless middle of a dam it cannot, and the console says so. A USBL beacon or a doppler velocity log is what fixes it properly.',
    panel: 'subsurface',
  },

  // ---------------------------------------------------------------- modelled
  {
    id: 'earthquakes',
    name: 'Earthquake feed',
    board: 'world',
    state: 'LINK',
    verdict: 'USGS event solutions over your coordinates, with range and bearing from the ranch. Keyless, public domain, and the one world feed that needs no relay and no server at all — USGS sends CORS headers, so the browser fetches it directly.',
    path: 'Already live. Solutions are automatic until a seismologist reviews them, and the console shows which is which because an automatic magnitude gets revised.',
    panel: 'world',
  },
  {
    id: 'shaking-here',
    name: 'What the shaking was at this ranch',
    board: 'world',
    state: 'UNSOUND',
    verdict: 'The console reports the intensity USGS published — ShakeMap\'s modelled maximum, and the Did You Feel It value people actually reported — and refuses to compute its own. Predicting site intensity needs a regional equation whose coefficients cannot be checked at three in the morning, and getting them wrong produces a confident number that is out by two whole intensity units. That is the difference between going to look at the tank foundations and going back to bed.',
    path: 'A ground-motion sensor on the property would measure it instead of estimating it. An accelerometer that logs peak ground acceleration is a few hundred dollars and reports what actually happened here rather than what a model expects.',
  },
  {
    id: 'fire-points',
    name: 'Active fire detections as points',
    board: 'world',
    state: 'LINK',
    verdict: 'NASA FIRMS publishes VIIRS and MODIS hotspot detections as records rather than as a picture, which is what lets the console put a range and bearing on one. It needs a free MAP_KEY, and the key cannot sit in a static page, so it is fetched through the relay.',
    path: 'Free key from NASA FIRMS, then the same relay the cameras use. The keyless thermal-anomaly imagery in the orbital panel keeps working without either.',
    panel: 'world',
  },
  {
    id: 'traffic-cams',
    name: 'Public traffic cameras',
    board: 'world',
    state: 'LINK',
    verdict: 'Agency cameras pointed at public roads and published deliberately — Caltrans District 4 covers Napa. The frames display on any page because an image tag needs no CORS; the camera list does need the relay, and so does measuring anything off a frame.',
    path: 'Frames work now. The relay adds the catalog and makes the frames measurable rather than merely visible.',
    panel: 'world',
  },
  {
    id: 'cam-discovery',
    name: 'Finding cameras nobody published',
    board: 'world',
    state: 'UNSOUND',
    verdict: 'Not built and not a gap. This console reads catalogs that an agency published on purpose. Unsecured private cameras are trivially findable on the open internet, and opening one is a stranger\'s living room rather than a road — no part of this platform will search for, index, or open a camera whose owner did not publish it.',
    path: 'Nothing changes this one. Every other row on this ledger says no because of physics, a platform, or a measurement that does not support the claim; this one is a decision, and it is the only row here that would still be refused if it became trivial.',
  },
  {
    id: 'regional-news',
    name: 'Regional headlines',
    board: 'world',
    state: 'LINK',
    verdict: 'Location-matched articles through GDELT, whose terms permit commercial use with citation. Google News is implemented but gated: its terms restrict it to personal, non-commercial use, and a vineyard is a business. Needs the relay.',
    path: 'The relay. The panel states in place that these are string matches rather than verified incidents, and that an empty result means nothing was indexed, not that nothing happened.',
    panel: 'world',
  },
  {
    id: 'news-as-warning',
    name: 'Headlines as an early warning',
    board: 'world',
    state: 'UNSOUND',
    verdict: 'Indexing lag on both sources runs from minutes to hours, and a query match is not an incident. The first you hear about a fire on your own ground will not be a news API. Treating a quiet feed as an all-clear is the specific mistake this row exists to prevent.',
    path: 'For fire specifically: the thermal detections above, and CAL FIRE / Watch Duty for official incident reporting. For the property itself, the sensors on it.',
  },
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

  {
    id: 'apple-watch',
    name: 'Apple Watch live heart rate',
    board: 'biometric',
    state: 'BLOCKED',
    verdict: 'An Apple Watch never exposes the heart rate service to another device, and Safari has no Web Bluetooth on any Apple hardware. Both doors are shut.',
    path: 'A chest strap and a Chrome or Android device, or a companion app writing HealthKit data to a local endpoint.',
  },
  {
    id: 'hyperspectral-true',
    name: 'True hyperspectral camera',
    board: 'stack',
    state: 'HARDWARE',
    verdict: 'A hundred or more contiguous narrow bands per pixel. Real instrument, real results, and push-broom optics that need a stabilised gimbal and calibration every flight.',
    path: '£15,000–60,000. Before spending it: every published vineyard result worth copying was flown on a five-band multispectral camera at a tenth of the price, and the limit on both is the tissue testing, not the sensor.',
  },

  // ----------------------------------------------------------------- unsound
  {
    id: 'drone-id',
    name: 'Identifying a drone from the camera',
    board: 'stack',
    state: 'UNSOUND',
    verdict: 'One camera measures angles, never range. A gull at thirty metres and a quadcopter at a hundred and fifty subtend the same angle and cross the frame at the same rate, and nothing in a single image stream separates them. The console reports the two angles it measured and what they are consistent with, rather than a label it cannot support.',
    path: 'A second camera a known distance away gives parallax, and parallax gives range. A microphone picks up a rotor signature nothing else in the sky produces. A receiver on the control and video bands is how the commercial detectors actually do it.',
  },
  {
    id: 'auto-turret',
    name: 'Autonomous turret — object tracking with a firing mechanism',
    board: 'stack',
    state: 'UNSOUND',
    verdict: 'Not built. A loop that detects a target, predicts where it will be and releases a firing mechanism is an autonomous weapon, and the fact that the detector is ordinary computer vision is exactly the problem: this console classifies on geometry and confuses a person with a post often enough that a human reads the frame and decides. Removing the human from that is not a feature, and it is not something a lead-time calculation makes safe.',
    path: 'What is built instead: a pan-tilt loop that keeps a subject centred in frame from the present error, with no prediction of where anything is going and no output that could drive a trigger. Detection-triggered light and sound stay under a person\'s hand.',
  },
  {
    id: 'nutrient-id',
    name: 'Nutrient deficiency identification from spectra',
    board: 'stack',
    state: 'UNSOUND',
    verdict: 'No camera at any price measures nitrogen, phosphorus or potassium. It measures reflected light. An index says where a block differs from itself, which is genuinely valuable; it does not say which element is short, and the published work that maps spectra to a named deficiency did it by pairing every flight with laboratory tissue tests from the same vines on the same day.',
    path: 'Use the map to pick where to sample, then let a laboratory name the deficiency. The camera finds the spot; it cannot do the chemistry.',
  },
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

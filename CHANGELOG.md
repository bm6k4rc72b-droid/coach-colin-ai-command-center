# Changelog

This changelog records public product changes. For the authoritative description
of current runtime behavior, see [`docs/CURRENT-STATE.md`](docs/CURRENT-STATE.md).

## [Unreleased] — 2026-08-24

### Added

- Added a **world deck** to Black Optic 6: the feeds from off the ranch, each
  one labelled with what it actually needs. USGS earthquakes with a range and
  bearing from the gate — the only one that works on the static deploy with no
  key, no relay and no server, because USGS sends the CORS header a browser
  needs. Public traffic cameras (Caltrans District 4 covers Napa) whose frames
  display anywhere but whose catalog and pixel readback need the relay. NASA
  FIRMS fire points, which need a free key. GDELT headlines, which need the
  relay and carry the licence that matters: Google News is implemented but gated
  behind an explicit personal-use declaration, because its terms exclude a
  working business, and the source picker substitutes GDELT and says why.

  The seismic panel will not compute what the shaking was at the ranch. It
  reports the intensity USGS published — preferring Did You Feel It, what people
  actually reported, over ShakeMap's modelled maximum — and where neither exists
  it says so rather than running a half-remembered prediction equation and
  printing a number that is out by two intensity units. Unreviewed solutions are
  marked, because an automatic magnitude gets revised; a depth at or above zero
  is flagged as fixed by the analyst rather than solved for; and above M6 the
  panel notes that the rupture is tens of kilometres long, so the epicentre is a
  misleading distance. A feed that cannot be reached shows no rows at all, since
  an empty list reads as a quiet week.

  Seven new ledger rows, three of them refusals: estimating site shaking,
  treating headlines as an early warning, and finding cameras nobody published —
  the last being the only row on the ledger whose "what would change the answer"
  is *nothing*, because it is a decision rather than a limit. The film picked up
  a twelfth act from the same ledger automatically.

  Found and fixed a real bug in the process: `Number(null)` is `0` and
  `Number.isFinite(0)` is `true`, so the obvious guard turned a magnitude USGS
  had not assigned into a confident **M0.0** and an absent Did You Feel It count
  into "0 reports" — which reads as nobody felt it rather than nobody was asked.

  `npm run test:black-optic-6` is now 213 unit tests. The console QA also gained
  browser discovery and lost a `networkidle0` wait that hung it instead of
  failing.

### Changed

- Replaced the **Black Optic 6 film's** vector operator with a photographic
  plate. It is composited rather than cut out, and the reason is in the pixels:
  the plate is graded cold, so the white hat sits at b\* ≈ −22 — bluer than most
  of the background — and the leather coat sits at L ≈ 2, b\* ≈ −3, which is the
  same pixel as the dark corners of the frame. No colour threshold separates
  them, and the topology that would (the Earth's glow rings him) breaks at the
  bottom where coat and floor merge. So the plate is kept whole and given a
  separable edge feather that reaches exactly zero on all four sides, landing it
  on the near-black page with no visible edge and keeping the Earth and console
  panels at full fidelity. An elliptical feather was tried first and is recorded
  in the docs as the instructive failure — any ellipse generous enough to spare
  the subject extends past the plate's own bounds and leaves a visible rectangle.
  The approach is now a push-in framed against the frame rather than against
  anatomy, still linear in scroll so the rate of growth is constant, with the
  gait model reduced to the footfall bob. Each act declares which side the plate
  takes so it clears the alternating text column, and the film closes by
  dissolving to a second plate. The vector rig remains as the fallback for the
  first frames of every load and for browsers that never get the plates.

### Added

- Added the **Black Optic 6 film** at `/black-optic-6-site/` — a scroll-driven
  cinematic showcase for the console. Anamorphic WebGL backdrop (vertically oval
  bokeh, horizontal blue streak flares, elliptical vignette, mustache distortion,
  halation and grain), parallax plates, a 3D card reveal, and an original
  operator drawn from a joint rig who walks toward the lens as you scroll — his
  gait driven by ground covered rather than a timer, so scrolling back walks him
  backwards through the same footfalls, and his apparent size linear in scroll
  because reciprocal distance is what gets interpolated. Eleven acts cover every
  camera route, all thirteen thermal palettes as live ramps, five satellites and
  four priced rungs of resolution ladder, drones, watches and glasses, harvest
  and field work, a marksmanship trainer, an interactive demo and the ledger's
  refusals. Every claim on the page is read out of `capability.js` at load time
  wearing the ledger's own state — there is no second copy of the marketing text,
  a typo in a capability id throws rather than rendering a blank card, and a test
  fails if an unsound row is quietly dropped. Ten guides read each act aloud
  through the browser's own offline speech engine, from sentences composed from
  those same rows. The range act is a ballistics trainer against static steel —
  lag-time wind drift, true-MOA conversions, and a solver that marks its own rows
  amber past transonic. `npm run test:black-optic-6-site` (83 unit tests) and
  `npm run qa:black-optic-6-site` (35 checks in real Chromium).
- Made the **Black Optic 6** camera path work end to end, for nothing. The dev
  server now proxies `/relay` to a camera relay (go2rtc by default,
  `CAMERA_RELAY_URL` to point elsewhere), which serves the stream from the
  console's own origin — no cross-origin read to be refused, no tainted canvas,
  no mixed-content block — so frames become measurable rather than merely
  visible. The Argus panel writes a ready-to-paste go2rtc config for the camera
  entered, ordering the free route before the one that costs money, adds the
  stream through the local relay in one press, and itemises what the whole setup
  costs. `npm run qa:camera-relay` stands a relay up and proves the chain against
  the real dev server.
- Added Reolink Argus support and a mariachi ensemble to **Black Optic 6**. The
  Argus panel identifies battery models (which serve no RTSP at all) from wired
  ones, builds the right RTSP and snapshot addresses, and tests the connection —
  reporting whether frames are *measurable* separately from whether a picture
  arrived, because a cross-origin snapshot taints the canvas and every deck reads
  pixels back off one. Relay setup for go2rtc, MediaMTX and Frigate is spelled
  out. The mariachi is a son jalisciense synthesised note by note — guitarrón,
  vihuela, two trumpets in parallel diatonic thirds, violins, and an alternating
  hemiola — with no recording shipped. Off by default, and it stops itself when
  the acoustic watch is listening or blackout is called.
- Added thermal palettes and the tracking suite to **Black Optic 6**. All
  thirteen palettes a thermal camera offers, with auto and manual gain, isotherm
  bands, fusion edges, spot and area measurement, and emissivity correction —
  every temperature readout withheld unless a radiometric camera is linked, since
  a palette over a visible camera colours brightness rather than heat. Colour
  (CAMShift) and appearance (cross-correlation) trackers follow one specific
  subject even when it stops moving, each refusing to lock onto a region it
  cannot hold. Harvest tracking turns logged loads into progress, a rate with its
  spread, and a finish window rather than a promised time. Aerial contacts above
  a calibrated horizon are measured in angular size and rate, with what they are
  consistent with rather than an identification one camera cannot support.
- Extended **Black Optic 6** with three decks and two device routes. Spectral
  computes vegetation indices over the live frame — only the ones the connected
  source has bands for — masks the bare alleys before averaging, ranks the worst
  cells to walk to, and states on every reading that no camera measures a
  nutrient. Subsurface builds a sonar occupancy map with the beam drawn as a
  cone, corrects position by matching each scan against the map already built,
  and reports the drift rather than hiding it. Bio pairs a Bluetooth heart rate
  sensor. A DJI Pocket or Action in USB webcam mode now appears in a camera
  picker and runs the whole detection chain; a pan-tilt loop keeps a contact
  centred from present error only. An autonomous turret with a firing mechanism
  was declined and recorded in the ledger as such, with a test asserting the
  tracking controller contains no lead or intercept maths.
- Added **Black Optic 6**, a ranch perimeter console at `public/black-optic-6/`.
  Eight decks — optics with a calibrated detection chain reporting metres,
  contacts and events, an acoustic watch, a geofence that refuses to call a
  crossing its satellite fix cannot resolve, NASA orbital imagery with overpass
  timing, a hashed evidence vault holding the thirty seconds before an event,
  external sensor links, and a capability ledger. Every reading carries a
  provenance badge and only measured states may raise an alarm; seven specified
  capabilities are marked unsound and deliberately not built, each with what the
  console does instead. Reuses Sentry's detection chain and views and
  Emberline's overpass prediction rather than duplicating them.
  `npm run test:black-optic-6`, `npm run qa:black-optic-6`.
- Added **Emberline**, a fire tracker at `public/emberline/` that fuses
  satellite detections, camera cross-bearings and network node loss into ranked
  fire hypotheses and projects them forward with Rothermel's surface spread
  model. Detections are drawn as their real ground footprint from the FIRMS
  `scan`/`track` fields rather than as dots; the spread projection is the band
  between a slow and a fast run of the whole model, so arrival at a place is a
  window rather than a time; corroboration is weighted by source independence,
  so forty pixels off one overpass count as one look; camera fixes carry the
  error ellipse their crossing angle earns and are corrected upwind for plume
  lean. Node loss is read as a fire front only when it progresses in space and
  time, which keeps an upstream switch failure from being reported as one.
  Crown fire, spotting, unaided through-wall sensing and single arrival times
  are refused explicitly, in the app rather than only in the documentation.
  Ships a scenario with known answers that the test suite also runs against.
  `npm run test:emberline` (38 unit tests).
- Added **Vice Command**, a scroll-driven 1986 crime picture at `public/vice/`
  that carries three real things: the app catalog, an outreach and automation
  swarm, and licensed in-person security including open-house details. Eight
  acts run off one number — the police arrive at 25% of the scroll, the army at
  50%, a saucer detonates the skyline at 75% and a shield stops the front — with
  a generated four-band city, a cast drawn as vector paths, five original
  synthesised music cues, an eleven-app 3D rack, a felony-star HUD, and a
  detonation built as closed-form ballistics so scrubbing back up runs the whole
  film backwards. The three marks hold at every width because section heights
  are solved from measured content rather than chosen, and scroll progress is
  interpolated between measured section tops rather than page height. The swarm
  console refuses to call an over-committed plan ready, naming the channels over
  their caution line and the hours of approval the selection would cost; the
  security estimator derives every figure from one rate card and prints its
  assumptions, including when the four-hour minimum raised the booking. The
  commercial recordings named in the brief are not used — the score is original,
  with a per-cue hook for licensed files — and the set pieces are labelled as
  parody, with no real person depicted. `npm run test:vice` (77 unit tests) and
  `npm run qa:vice` (57 end-to-end checks at 1440px and 390px).
- Added **Carrier**, a bench for vertical security-briefing reels at
  `public/carrier/`: a script format, five animated diagram panels (RF
  containment heatmap, facility floor plan with a timed patrol, passive capture
  table, pose reconstruction in confidence-map and keypoint forms, media slot),
  a live 1080×1920 preview, and real-time recording to MP4 or WebM. The layout
  is computed against the host platform's own chrome bands, so headlines are not
  delivered underneath somebody else's navigation. Ships with one finished
  seven-scene episode on passive Wi-Fi sensing, with per-scene citations and a
  checker that warns when a caption cannot be read before its cut or a claim
  names no source. `npm run test:carrier`, `npm run qa:carrier`.
- Added Touchline at `public/touchline/`: a match-analysis app that turns
  footage of a pitch into distances, speeds, possession and passing-lane
  geometry in metres, measured on-device from a homography fitted to marked
  pitch landmarks. Sides come from kit colour with goalkeepers and officials
  labelled as neither; possession is reported with the share of the clock that
  could be attributed; player totals carry their tracking coverage and are never
  extrapolated; pass lanes are reported as measurements rather than a completion
  percentage. Ships a synthetic demo clip that the unit and end-to-end suites
  also run against. `npm run test:touchline` (75 unit tests) and
  `npm run qa:touchline` (42 end-to-end checks).
- Added honest aircraft identity narration: callsign, operator, registration,
  type, and route come only from selected-contact context, and missing operator,
  route, or type enrichment is named explicitly.
- Added local, publication-compatible copies of the two README PNGs, with source
  records and third-party-license boundaries in `docs/media/README.md`.
- Added regression coverage for aircraft identity narration and optional-key
  loading feedback.

### Changed

- First-run presentation now opens with Detection `DENSE` at 75%, `ELASTIC`
  allocation, Fade 7%, Outside 1%, scope feather 11%, and aircraft 3D models in
  `PROXIMITY`. Stored state and share links still override these baselines.
- The 17 selected README GIFs remain unchanged and are documented separately
  from the two owner-published PNGs.
- Bundled datacenter and dam snapshots now omit contact-oriented fields and
  note values containing email or phone identifiers. Feature geometry, names,
  operator/capacity/river metadata, counts, and ODbL terms are unchanged.
- Public documentation and the L9 release matrix no longer reference non-public
  planning material or repository history.

### Fixed

- A missing optional FIRMS key no longer turns the complete Environmental
  mission into `LOAD FAILED`. The FIRMS row still reports `KEY REQUIRED`, while
  earthquakes continue to load. Real lifecycle and fetch failures retain
  failure priority.
- The mapped-installations layer retries after an unavailable request when it is
  enabled or the camera settles.
- Aircraft trails attach to the rendered aircraft transform and remain near the
  rear center across headings. Parked aircraft do not draw a moving head
  segment.
- Grounded aircraft keep validated floor evidence through temporary terrain
  outages and wait for measured photoreal-surface evidence before a 3D model
  takes over from its billboard.
- Cockpit altitude uses aviation MSL data rather than Cesium render height.

### Security

- Production transitive dependencies resolve to patched DOMPurify and
  protobufjs releases without changing the Cesium version or application APIs.
- Production dependency audit reports no known advisories; remaining audit
  findings are confined to development and QA tooling.

## [Unreleased] — 2026-08-23

### Added

- Added a first-run mission launcher for Contacts, Space Missions,
  Environmental, and manual exploration.
- Added terrain-validity gating and bounded last-known placement for grounded
  aircraft models.

### Changed

- Environmental consistently presents both earthquakes and NASA FIRMS fires,
  with honest optional-key degradation.
- The tracked aircraft trail acceptance bar is visual: roughly rear-center,
  stable across headings, with minor hull overlap allowed and no conspicuous
  top, bottom, or lateral projection.

## [Unreleased] — 2026-08-18 to 2026-08-22

### Added

- Added the four-source Map Source tray, share-link v2 state, cockpit/context
  voice parity, MSL altitude readouts, and close-range tracked aircraft models.
- Added the L9 release-candidate matrix, AIS feed watchdog, voice cost controls,
  satellite classes, and the shared world-overlay host.
- Added deterministic first-run, map-source, floor, overlay, tracking, and
  aircraft-model regression harnesses.

### Changed

- Consolidated world labels, cards, tracked readouts, CCTV thumbnails, cable
  labels, mission labels, and detection presentation under shared allocation and
  lifecycle rules.
- Reduced idle rendering through the render governor and explicit scope mask.
- Improved cockpit layout, context restoration, keyless feed honesty, and
  aircraft 2D/3D handoffs.

### Fixed

- Fixed degenerate depth picks, map-source restore states, route-camera motion,
  bright-ground label readability, grounded display flooring, and cross-layer
  tracking cleanup.
- Fixed stale overlay callbacks, parked-idle render leaks, cable-label sweep
  starvation, and several share-link state conflicts.

## [Unreleased] — 2026-08-02 to 2026-08-16

### Added

- Added Global Context modes, Cockpit briefing surfaces, Radio context,
  satellite mission replay, and real per-class aircraft models with adjacent
  provenance records.
- Added a shared screen-space overlay system with bounded allocation for labels,
  cards, callouts, detection brackets, and selected-object presentation.

### Changed

- Unified right-side product controls and responsive cockpit/map layouts.
- Migrated public-safe neighborhood geometry to DataSF and tightened safe local
  development defaults.
- Improved proxy resilience, annotation outline bounds, CCTV enable pacing,
  contact de-emphasis, and deterministic visual stacking.

## [Unreleased] — July 2026

### Added

- Added live NASA FIRMS fires, optional live TomTom traffic, Caltrans and TfL
  CCTV packs, CCTV viewsheds and direct-manipulation calibration, citywide CCTV
  cards, Natural Earth regions, analyst queries, and voice routing QA.
- Added the end-to-end vertical-datum system for aircraft, vessels, CCTV,
  annotations, trails, and terrain-aware rendering.
- Added aircraft class silhouettes, path-derived display heading, ADSBDB
  enrichment, cached CelesTrak TLE lookup, and next-ISS-pass prediction.

### Fixed

- Fixed elevated-airport aircraft placement, vessel sea-surface placement,
  close-zoom FIRMS anchors, antimeridian region framing, annotation resolution,
  cross-layer tracking ownership, and CCTV projection lifecycle issues.

## [Unreleased] — June 2026

### Added

- Added OpenAI Realtime voice control, scene-aware entity context, viewport image
  grounding, the AI HUD summary, live AIS vessels, infrastructure layers, map
  source switching, free-text navigation, and server-side data proxies.
- Added hybrid map annotations, 3D aircraft, panoptic detection, tracking
  harnesses, and public data attribution.
- Added MIT source licensing, security guidance, contribution guidance, data
  source notices, and third-party asset boundaries.

### Changed

- Removed the experimental AI video-edit style and retained seven deterministic
  visual styles.
- Moved Realtime text-history trimming to the server-side retention policy while
  keeping only the latest viewport image in conversation context.

## [0.7.0] — 2026-02-18

- Added the Bikeshare Pulse layer and panoptic label improvements.
- Improved tracked-item boxes, post-render alignment, and CCTV projection
  quality.
- Removed the experimental shift-drag CCTV calibration interaction.

## [0.6.0] — 2026-02-10

- Added the initial multi-layer 3D globe experience, visual styles, live
  aircraft, satellites, earthquakes, CCTV, traffic, FIRMS, infrastructure, and
  performance controls.
- Added entity inspection, tracking, scenes, keyboard controls, and shareable
  views.

## [0.1.0] — 2026-02-09

- Initial project version.

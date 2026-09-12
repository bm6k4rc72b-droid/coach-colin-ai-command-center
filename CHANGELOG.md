# Changelog

This changelog records public product changes. For the authoritative description
of current runtime behavior, see [`docs/CURRENT-STATE.md`](docs/CURRENT-STATE.md).

## [Unreleased] — 2026-08-24

### Added

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

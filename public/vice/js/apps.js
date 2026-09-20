/**
 * The garage.
 *
 * Every app in the operation, in the order they should be sold. Priority is
 * not alphabetical and it is not chronological — it is what the owner has
 * actually put money and marketing behind, which is why FireHazmat and the
 * Broker Ranch platform sit at the front and the rest of the command-center
 * suite fills in behind them.
 *
 * Each record carries a `tier`, which is what the showcase sorts on:
 *
 *   - `flagship` — shipped, marketed, has paying or prospective users.
 *   - `platform` — a system rather than a single app.
 *   - `suite`    — part of the command center, live at a path in this repo.
 *
 * `href` is only ever a link that has been seen to exist. Where an app is real
 * but its public URL is not known here, `href` is `null` and the card asks the
 * reader to get in touch instead of guessing at an App Store id.
 *
 * @module vice/apps
 */

/** The catalog. Order within a tier is the order it was ranked in. */
export const APPS = Object.freeze([
  {
    id: 'firehazmat',
    tier: 'flagship',
    name: 'FireHazmat',
    tagline: 'ERG 2024 in your pocket, offline, with live plume modelling.',
    blurb:
      'The hazmat reference tool first responders actually open on scene: 3,541 materials and 62 guides available with no signal, ERG isolation and protective-action distances drawn on a live map, and day/night, small/large-spill toggles that change the ring while you look at it. Weather and wind are pulled in and folded into the plume.',
    points: [
      '3,541 materials · 62 ERG guides · fully offline',
      'Live PAZ rings and plume cones over a real map',
      'Placard scan, UN/CAS/guide search, response wizard',
      'Table 3 TIH shortcuts: ammonia, chlorine, HF, SO₂',
    ],
    media: 'media/firehazmat-map.avif',
    mediaAlt: 'FireHazmat showing ammonia isolation and protective-action zones over San Francisco',
    alt: 'media/firehazmat-search.avif',
    altText: 'FireHazmat search screen listing hazard classes and ERG Table 3 shortcuts',
    accent: '#ff4a2b',
    handle: '@firehazmatapp',
    href: 'https://www.instagram.com/firehazmatapp/',
    cta: 'See it on Instagram',
    audience: 'Fire · EMS · hazmat teams',
  },
  {
    id: 'artifact',
    tier: 'platform',
    name: 'Artifact — Broker Ranch',
    tagline: 'LiDAR-powered property intelligence for luxury estates and ranches.',
    blurb:
      'Scan, plan, value. Photogrammetry and LiDAR build a live 3D twin of a house and its land — front, plan and side views on one screen — with square footage, boundary, elevation, material detection, mesh coverage and a satellite feed beside it. Built for the properties where "about four thousand square feet" is not an acceptable answer.',
    points: [
      '3D scanner: all angles, live rotation, 99%+ mesh coverage',
      'House and lot measured — sq ft, acreage, elevation, boundary',
      'WiFi mesh planning across the whole parcel',
      'Satellite and ground feeds on the same console',
    ],
    media: 'media/artifact-broker-ranch.avif',
    mediaAlt: 'Artifact luxury property management console showing a 3D LiDAR scan of an estate',
    alt: 'media/broker-ranch-ops.avif',
    altText: 'Broker Ranch operations site listing the God’s Eye View app card',
    accent: '#38d6ff',
    handle: 'broker-ranch-ops.higgsfield.app',
    href: 'https://broker-ranch-ops.higgsfield.app',
    cta: 'Open Broker Ranch Ops',
    audience: 'Brokerages · ranch owners · estate managers',
  },
  {
    id: 'gods-eye',
    tier: 'platform',
    name: "God's Eye View",
    tagline: 'Everything above the ranch, on a globe you can talk to.',
    blurb:
      'Live aircraft, vessels and orbital contacts on one photoreal globe, with seismic activity, active fires and weather fronts layered on top and voice command to the map so it can be flown hands-free. Public sources only, presented like a cockpit.',
    points: [
      'Aircraft, ships and satellites on one 3D Earth',
      'Fires, quakes and weather as toggleable layers',
      'Voice control — say where to go, hands free',
      'Public feeds only, cited on screen',
    ],
    media: 'media/broker-ranch-ops.avif',
    mediaAlt: "God's Eye View described on the Broker Ranch operations site",
    accent: '#7ce38b',
    href: '../',
    cta: 'Launch the globe',
    audience: 'Ops centers · security directors',
  },
  {
    id: 'sentry',
    tier: 'suite',
    name: 'Sentry',
    tagline: 'Perimeter watch that says what it saw and how sure it is.',
    blurb:
      'Camera-side detection, zones, behaviour classification and an RF view, with a dossier for every contact — written so a court, an insurer or a client can follow the reasoning rather than take the box at its word.',
    points: ['Zone and behaviour alerts', 'Per-contact dossiers', 'Runs on the device'],
    accent: '#ff9f1c',
    href: '../sentry/',
    cta: 'Open Sentry',
    audience: 'Estates · sites · events',
  },
  {
    id: 'nexus',
    tier: 'suite',
    name: 'Nexus',
    tagline: 'The training hall: curriculum, drills and a mentor that watches.',
    blurb:
      'Security and readiness curriculum with progress tracking, live drills and an agent swarm that runs the scenarios — the classroom half of the operation.',
    points: ['Curriculum and progress', 'Live drills', 'Mentor feedback'],
    accent: '#c77dff',
    href: '../nexus/',
    cta: 'Open Nexus',
    audience: 'Teams in training',
  },
  {
    id: 'baseline',
    tier: 'suite',
    name: 'Baseline',
    tagline: 'Vitals and readiness from a camera, measured not guessed.',
    blurb:
      'Signal from the face, a breathing coach, and a ledger of every reading with its own confidence — for the days when "how are you feeling" needs a number behind it.',
    points: ['Camera vitals', 'Breathing protocol', 'Readings with error bars'],
    accent: '#4cc9f0',
    href: '../baseline/',
    cta: 'Open Baseline',
    audience: 'Coaching clients',
  },
  {
    id: 'touchline',
    tier: 'suite',
    name: 'Touchline',
    tagline: 'Match analysis in metres, with its own error bars.',
    blurb:
      'Footage of a pitch becomes distances, speeds, possession and passing lanes, measured on-device from a fitted homography — and it refuses to report a number it could not actually see.',
    points: ['Speeds and distances in metres', 'Possession with coverage', 'Runs from a phone on a fence'],
    accent: '#7ce38b',
    href: '../touchline/',
    cta: 'Open Touchline',
    audience: 'Coaches · academies',
  },
  {
    id: 'carrier',
    tier: 'suite',
    name: 'Carrier',
    tagline: 'Vertical briefing reels, rendered from a script.',
    blurb:
      'Write the script, get a 1080×1920 reel with animated diagram panels and per-scene citations — the content engine that keeps the social calendar fed without a studio day.',
    points: ['Script in, MP4 out', 'Animated diagram panels', 'Citations per scene'],
    accent: '#ff4a8d',
    href: '../carrier/',
    cta: 'Open Carrier',
    audience: 'Marketing · social',
  },
  {
    id: 'astra',
    tier: 'suite',
    name: 'Astra',
    tagline: 'The lab bench: sensors, evidence and comparisons.',
    blurb:
      'An instrument-grade workspace for putting two things side by side and being honest about which one won.',
    points: ['Sensor capture', 'Evidence decks', 'A/B comparisons'],
    accent: '#ffd166',
    href: '../astra/',
    cta: 'Open Astra',
    audience: 'Research · product',
  },
  {
    id: 'harvest-eye',
    tier: 'suite',
    name: 'Harvest Eye',
    tagline: 'Crop condition and yield forecast from a walk down the row.',
    blurb:
      'Point a phone down a row and get colour-graded condition, tracking and a forecast with its own ledger — built for the ranch side of the business.',
    points: ['Row-walk capture', 'Condition grading', 'Forecast with a ledger'],
    accent: '#95d5b2',
    href: '../harvest-eye/',
    cta: 'Open Harvest Eye',
    audience: 'Ranch · agriculture',
  },
  {
    id: 'jose-montes',
    tier: 'suite',
    name: 'Montes & Co.',
    tagline: 'A cinematic listing site with the real monthly numbers on it.',
    blurb:
      'The luxury-estate build: scroll-linked 3D, cinematic property plates, live mortgage arithmetic and a voice concierge. The template for every client site the shop ships.',
    points: ['Scroll-linked 3D estate', 'Live ownership maths', 'Voice concierge'],
    accent: '#e0aaff',
    href: '../jose-montes/',
    cta: 'Open the estate site',
    audience: 'Real estate clients',
  },
]);

/** Tier ranking, lowest first. */
const TIER_ORDER = Object.freeze({ flagship: 0, platform: 1, suite: 2 });

/**
 * The catalog in billing order.
 *
 * Sorted by tier and then by the order the apps were ranked in, which is the
 * order the showcase rack turns through them.
 *
 * @param {object[]} [apps] Catalog to sort.
 * @returns {object[]} A new array, highest billing first.
 */
export function ranked(apps = APPS) {
  return apps
    .map((app, index) => ({ app, index }))
    .sort((a, b) => {
      const tier = (TIER_ORDER[a.app.tier] ?? 9) - (TIER_ORDER[b.app.tier] ?? 9);
      return tier !== 0 ? tier : a.index - b.index;
    })
    .map((entry) => entry.app);
}

/**
 * The apps that get a full plate with artwork rather than a rack card.
 *
 * @param {object[]} [apps] Catalog.
 * @returns {object[]} Apps carrying media.
 */
export function headliners(apps = APPS) {
  return ranked(apps).filter((app) => Boolean(app.media));
}

/**
 * Look one up.
 *
 * @param {string} id App id.
 * @param {object[]} [apps] Catalog.
 * @returns {object|null} The app, or null.
 */
export function appById(id, apps = APPS) {
  return apps.find((app) => app.id === id) || null;
}

/**
 * Where a card should point, given the page it is being rendered on.
 *
 * Internal apps are siblings of this one, so their links are relative and keep
 * working under a GitHub Pages project subpath. External links are returned
 * untouched. An app with no known URL returns null, and the caller renders a
 * "talk to us" affordance rather than a dead link.
 *
 * @param {object} app An app record.
 * @returns {string|null} A URL, or null when none is known.
 */
export function linkFor(app) {
  return app && app.href ? app.href : null;
}

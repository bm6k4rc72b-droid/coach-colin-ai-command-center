/**
 * The security desk.
 *
 * In-person protective services — open houses, private events, estates and
 * ranch property — and an estimator that turns an enquiry into a number
 * before anybody picks up a phone.
 *
 * Two honesty rules are built into this module rather than into the copy on
 * top of it, because copy gets rewritten and modules do not:
 *
 *   1. **The rate card is one constant.** {@link RATE_CARD} is the single
 *      place hourly rates live. They ship as an indicative card and are meant
 *      to be edited to the real ones. Nothing else in the app hard-codes a
 *      price, so there is no way for the site to quote two different numbers.
 *   2. **An estimate is labelled an estimate.** {@link quote} returns the
 *      assumptions it used alongside the total, and the UI is expected to
 *      print them. A number with no stated assumptions is how a security
 *      company ends up arguing about an invoice on a Sunday.
 *
 * Licensing is not decoration. Armed and unarmed private security are licensed
 * per state, and posting a rate does not create the licence — {@link LICENSING}
 * is rendered on the page next to every price.
 *
 * @module vice/security
 */

import { clamp } from './mathkit.js';

/**
 * Hourly rates, per officer, in US dollars.
 *
 * Indicative. Replace with the operation's real card — every quote on the site
 * is derived from these four numbers.
 */
export const RATE_CARD = Object.freeze({
  unarmed: 45,
  armed: 68,
  executive: 125,
  /** A marked vehicle on site, per hour, on top of the officer. */
  vehicle: 18,
});

/** What has to be true before anyone stands a post. */
export const LICENSING = Object.freeze({
  note:
    'Every officer is licensed and insured for the state the detail is worked in, and armed posts are staffed only by officers carrying the current armed endorsement for that state. Licence numbers and a certificate of insurance go out with the contract, before the first shift, every time.',
  insured: true,
});

/** Minimum billable hours on any single detail. */
export const MINIMUM_HOURS = 4;

/**
 * The services offered, each with the defaults its estimate starts from.
 */
export const SERVICES = Object.freeze([
  {
    id: 'open-house',
    name: 'Open House Detail',
    tagline: 'A licensed officer at the door of your listing.',
    blurb:
      'The realtor problem in one line: an empty luxury home, an open front door, and a stranger you have never met walking in alone. An officer works the entry, logs every visitor, keeps eyes on the rooms your agents are not standing in, and closes the property down with you at the end.',
    includes: [
      'Visitor log — every arrival timed and recorded',
      'Entry post and interior sweeps between groups',
      'Sign-in verification and vehicle notes on request',
      'Full close-down walk with the listing agent',
    ],
    defaults: { officers: 1, hours: 4, tier: 'unarmed', vehicle: false },
    audience: 'Listing agents · brokerages',
    accent: '#ff2e88',
  },
  {
    id: 'private-event',
    name: 'Private Event Security',
    tagline: 'Guest lists, doors, and a quiet room when it is needed.',
    blurb:
      'Weddings, launches, private parties and family events. Officers on the doors, on the list and on the floor, briefed on who is expected and who is not, and trained to end a problem with a conversation rather than a scene.',
    includes: [
      'Door and guest-list control',
      'Floor coverage with a named supervisor',
      'Vendor and staff access management',
      'Written incident report inside 24 hours',
    ],
    defaults: { officers: 3, hours: 6, tier: 'unarmed', vehicle: false },
    audience: 'Hosts · planners · venues',
    accent: '#ffb020',
  },
  {
    id: 'estate',
    name: 'Estate & Residential Post',
    tagline: 'A standing post at the house, on the nights it matters.',
    blurb:
      'Overnight or around the clock at a private residence — during a renovation, after an incident, while the family is away, or simply because the property warrants it. Posted, patrolled and logged.',
    includes: [
      'Fixed post with scheduled interior and grounds patrols',
      'Gate, camera and alarm response coordination',
      'Shift log handed over on every relief',
      'Escalation path agreed with you in writing first',
    ],
    defaults: { officers: 1, hours: 12, tier: 'armed', vehicle: true },
    audience: 'Homeowners · estate managers',
    accent: '#38d6ff',
  },
  {
    id: 'executive',
    name: 'Executive Protection',
    tagline: 'Close protection, travel and advance work.',
    blurb:
      'One-on-one protection for a principal, with route planning, venue advance, secure transport and a detail that stays invisible in every photograph taken that day.',
    includes: [
      'Advance work on every venue before arrival',
      'Route planning with alternates',
      'Secure transport and arrival/departure control',
      'Discreet posture — protection, not an entourage',
    ],
    defaults: { officers: 2, hours: 8, tier: 'executive', vehicle: true },
    audience: 'Principals · talent · family offices',
    accent: '#c77dff',
  },
  {
    id: 'ranch-patrol',
    name: 'Ranch & Property Patrol',
    tagline: 'Marked patrol across acreage the police do not drive.',
    blurb:
      'Scheduled and randomised patrol of ranch, land and vacant-property portfolios, with the property boundary and structures already mapped by the Artifact scan, so a patrol report says which gate and which outbuilding rather than "the north side".',
    includes: [
      'Marked vehicle patrol on a randomised schedule',
      'Gate, fence line and outbuilding checks',
      'Geotagged, timestamped patrol report per pass',
      'Mapped against the property scan, not a landmark',
    ],
    defaults: { officers: 1, hours: 8, tier: 'armed', vehicle: true },
    audience: 'Ranch owners · land holders',
    accent: '#7ce38b',
  },
  {
    id: 'vacant-listing',
    name: 'Vacant Listing Watch',
    tagline: 'Eyes on the empty inventory between showings.',
    blurb:
      'Staged, furnished and vacant properties checked on a schedule — doors, lockboxes, windows, water and squatter risk — with photographs filed against every visit so the seller sees the house was actually looked at.',
    includes: [
      'Scheduled interior and exterior checks',
      'Lockbox and access-log review',
      'Photo-documented condition report per visit',
      'Immediate call-out on anything found open',
    ],
    defaults: { officers: 1, hours: 4, tier: 'unarmed', vehicle: true },
    audience: 'Brokerages · asset managers',
    accent: '#4cc9f0',
  },
]);

/**
 * Multipliers applied on top of the hourly rate.
 *
 * Each is a real reason a shift costs more, and each is printed on the quote.
 */
export const UPLIFTS = Object.freeze({
  overnight: { label: 'Overnight (22:00–06:00)', factor: 1.2 },
  weekend: { label: 'Weekend', factor: 1.15 },
  holiday: { label: 'Public holiday', factor: 1.5 },
  shortNotice: { label: 'Booked inside 48 hours', factor: 1.25 },
});

/**
 * Look up a service.
 *
 * @param {string} id Service id.
 * @param {object[]} [services] Catalog.
 * @returns {object|null} The service, or null.
 */
export function serviceById(id, services = SERVICES) {
  return services.find((service) => service.id === id) || null;
}

/**
 * Estimate a detail.
 *
 * Hours below the minimum are billed at the minimum and the quote says so
 * rather than quietly inflating the hours, because a client who books two
 * hours and is charged for four without being told does not book again.
 *
 * @param {object} input The enquiry.
 * @param {string} input.service Service id.
 * @param {number} [input.officers] Officers on the detail.
 * @param {number} [input.hours] Hours requested.
 * @param {'unarmed'|'armed'|'executive'} [input.tier] Officer tier.
 * @param {boolean} [input.vehicle] Marked vehicle on site.
 * @param {string[]} [input.uplifts] Uplift keys from {@link UPLIFTS}.
 * @param {number} [input.days] How many days the detail runs.
 * @param {object} [rates] Rate card override.
 * @returns {object} The estimate, its parts, and its assumptions.
 */
export function quote(input, rates = RATE_CARD) {
  const service = serviceById(input.service);
  const defaults = service ? service.defaults : { officers: 1, hours: MINIMUM_HOURS, tier: 'unarmed', vehicle: false };

  const officers = Math.max(1, Math.round(input.officers ?? defaults.officers));
  const requestedHours = Math.max(0.5, input.hours ?? defaults.hours);
  const days = Math.max(1, Math.round(input.days ?? 1));
  const tier = rates[input.tier ?? defaults.tier] ? (input.tier ?? defaults.tier) : 'unarmed';
  const vehicle = input.vehicle ?? defaults.vehicle;

  const billedHours = Math.max(requestedHours, MINIMUM_HOURS);
  const minimumApplied = billedHours > requestedHours;

  const hourly = rates[tier];
  const applied = (input.uplifts || [])
    .map((key) => UPLIFTS[key])
    .filter(Boolean);
  const factor = applied.reduce((carry, uplift) => carry * uplift.factor, 1);

  const officerCost = hourly * billedHours * officers * days * factor;
  const vehicleCost = vehicle ? rates.vehicle * billedHours * days : 0;
  const total = officerCost + vehicleCost;

  const assumptions = [
    `${officers} officer${officers === 1 ? '' : 's'} at the ${tier} rate of $${hourly}/hour`,
    `${billedHours} billed hour${billedHours === 1 ? '' : 's'}${days > 1 ? ` × ${days} days` : ''}`,
  ];
  if (minimumApplied) {
    assumptions.push(`${MINIMUM_HOURS}-hour minimum applied — you asked for ${requestedHours}`);
  }
  if (vehicle) assumptions.push(`Marked vehicle on site at $${rates.vehicle}/hour`);
  for (const uplift of applied) assumptions.push(`${uplift.label} — ×${uplift.factor}`);

  return {
    service: service ? service.name : 'Custom detail',
    officers,
    tier,
    billedHours,
    days,
    vehicle,
    minimumApplied,
    factor: Number(factor.toFixed(3)),
    officerCost: Math.round(officerCost),
    vehicleCost: Math.round(vehicleCost),
    total: Math.round(total),
    assumptions,
    /** Every quote off this page is an estimate until a contract is signed. */
    disclaimer:
      'Indicative estimate. Travel outside the service area, permits, and details requiring a supervisor are quoted separately, and the figure is confirmed in writing before any officer is scheduled.',
  };
}

/**
 * Format a dollar amount the way the quote card prints it.
 *
 * @param {number} value Amount.
 * @returns {string} A currency string.
 */
export function money(value) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/**
 * A one-line summary of a detail, for the enquiry email.
 *
 * @param {object} estimate The result of {@link quote}.
 * @returns {string} A single sentence.
 */
export function summarise(estimate) {
  const vehicle = estimate.vehicle ? ' with a marked vehicle' : '';
  const days = estimate.days > 1 ? ` across ${estimate.days} days` : '';
  return `${estimate.service}: ${estimate.officers} ${estimate.tier} officer${estimate.officers === 1 ? '' : 's'}${vehicle}, ${estimate.billedHours} hours${days} — estimated ${money(estimate.total)}.`;
}

/**
 * How busy a week of booked details would leave the team.
 *
 * @param {object[]} details Estimates from {@link quote}.
 * @param {number} [officersAvailable] Officers on the roster.
 * @returns {object} Hours committed, utilisation and whether it fits.
 */
export function weekLoad(details, officersAvailable = 6) {
  const officerHours = details.reduce(
    (carry, detail) => carry + detail.billedHours * detail.officers * detail.days,
    0,
  );
  const capacity = Math.max(1, officersAvailable) * 40;
  return {
    officerHours,
    capacity,
    utilisation: Number(clamp(officerHours / capacity, 0, 4).toFixed(2)),
    overCommitted: officerHours > capacity,
  };
}

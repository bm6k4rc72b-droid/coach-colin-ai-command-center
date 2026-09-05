/**
 * The portfolio.
 *
 * Listing records plus the pure functions that format and sort them. Prices,
 * areas and dates are stored as numbers and formatted at the edge, so the
 * search, the sort and the concierge all reason about the same values rather
 * than about strings that happen to look like money.
 *
 * @module jose-montes/listings
 */

/** The agent, in one place, so the markup and the concierge never disagree. */
export const AGENT = {
  name: 'Jose Montes',
  title: 'Central Coast #1 Realtor',
  brokerage: 'Montes & Co. Coastal Properties',
  phone: '(805) 555-0142',
  email: 'jose@montescoastal.com',
  license: 'DRE #02141908',
  service: ['Pismo Beach', 'Avila Beach', 'Shell Beach', 'San Luis Obispo', 'Arroyo Grande', 'Paso Robles'],
};

/**
 * The listings, newest first.
 *
 * `plate` names a file in `media/`; `hi` is the full-resolution original on
 * the render CDN, loaded as an upgrade when the network allows.
 */
export const LISTINGS = [
  {
    id: 'ocean-view-123',
    address: '123 Ocean View Dr',
    city: 'Pismo Beach',
    price: 1250000,
    beds: 4,
    baths: 3,
    sqft: 2150,
    lot: 0.31,
    year: 2019,
    status: 'active',
    days: 6,
    plate: 'estate-twilight',
    tag: 'Signature listing',
    blurb: 'Four bedrooms above the swell line, with a great room that opens the whole west wall to the Pacific. Built in 2019 and barely lived in.',
    features: ['Ocean views from three levels', 'Chef\'s kitchen, Calacatta island', 'Infinity-edge pool and fire terrace', 'Owned solar, 14.2 kW'],
  },
  {
    id: 'bluff-trail-8',
    address: '8 Bluff Trail',
    city: 'Shell Beach',
    price: 2895000,
    beds: 5,
    baths: 5.5,
    sqft: 4380,
    lot: 0.62,
    year: 2022,
    status: 'active',
    days: 21,
    plate: 'pool-terrace-dusk',
    tag: 'Bluff-front',
    blurb: 'The last buildable bluff parcel on the trail, finished in glass and board-formed concrete. The pool edge and the horizon line up at sunset.',
    features: ['120 ft of private bluff frontage', 'Guest casita and gym', 'Glass wind wall to the terrace', 'Stair access to the cove'],
  },
  {
    id: 'olive-grove-1440',
    address: '1440 Olive Grove Ln',
    city: 'Arroyo Grande',
    price: 1685000,
    beds: 4,
    baths: 3.5,
    sqft: 3120,
    lot: 2.4,
    year: 2016,
    status: 'pending',
    days: 34,
    plate: 'great-room-sunset',
    tag: 'In escrow',
    blurb: 'Two and a half acres of mature olives with a low ranch house that has been taken back to the studs and rebuilt properly.',
    features: ['180 mature olive trees', 'Detached studio', 'Ag well plus district water', 'Rebuilt 2021'],
  },
  {
    id: 'vintners-ridge-77',
    address: '77 Vintners Ridge',
    city: 'Paso Robles',
    price: 3400000,
    beds: 5,
    baths: 4,
    sqft: 4900,
    lot: 18.6,
    year: 2014,
    status: 'active',
    days: 58,
    plate: 'vineyard-estate',
    tag: 'Estate + vineyard',
    blurb: 'Eighteen acres on the west side, eleven of them planted to Rhône varietals under contract, with a villa that looks down the rows.',
    features: ['11 producing acres under contract', 'Barrel room and crush pad', 'Two-bedroom guest house', 'Willow Creek District'],
  },
  {
    id: 'harbor-light-19',
    address: '19 Harbor Light Way',
    city: 'Avila Beach',
    price: 2150000,
    beds: 3,
    baths: 3,
    sqft: 2480,
    lot: 0.18,
    year: 2021,
    status: 'sold',
    days: 0,
    plate: 'primary-suite-dawn',
    tag: 'Sold — 6% over ask',
    blurb: 'Represented the buyer against four competing offers and still closed under appraisal. The suite catches the sun coming up over the hills.',
    features: ['Steps from the promenade', 'Primary suite with ocean deck', 'Sold in 11 days', 'Closed $129k over list'],
  },
  {
    id: 'monarch-rise-500',
    address: '500 Monarch Rise',
    city: 'San Luis Obispo',
    price: 1495000,
    beds: 4,
    baths: 3,
    sqft: 2760,
    lot: 0.29,
    year: 2018,
    status: 'active',
    days: 12,
    plate: 'kitchen-marble',
    tag: 'New this week',
    blurb: 'Walkable to downtown, quiet at the end of the rise, with the kitchen that every open house ends up standing in.',
    features: ['Walk to Higuera St', 'Waterfall marble island', 'Owned solar and battery', 'Three-car tandem garage'],
  },
];

/** The record the practice puts its name to. */
export const TRACK_RECORD = {
  closed: 412,
  volume: 738000000,
  listToSale: 1.032,
  medianDays: 11,
  years: 14,
  repeat: 0.61,
};

/**
 * Format a price the way a listing sheet does.
 *
 * @param {number} value Dollars.
 * @param {boolean} [exact] Whether to print every digit rather than round.
 * @returns {string} Formatted price.
 */
export function money(value, exact = false) {
  if (!Number.isFinite(value)) return '—';
  if (exact || value < 1000) {
    return `$${Math.round(value).toLocaleString('en-US')}`;
  }
  if (value >= 1000000) {
    const millions = value / 1000000;
    const digits = millions >= 10 ? 1 : 2;
    return `$${Number(millions.toFixed(digits))}M`;
  }
  return `$${Math.round(value / 1000)}K`;
}

/**
 * Price per square foot, rounded to the nearest dollar.
 *
 * @param {{ price: number, sqft: number }} listing A listing.
 * @returns {number} Dollars per square foot, or 0 when the area is unknown.
 */
export function pricePerSqft(listing) {
  if (!listing?.sqft) return 0;
  return Math.round(listing.price / listing.sqft);
}

/**
 * A one-line summary: beds, baths, area.
 *
 * @param {object} listing A listing.
 * @returns {string} The summary line.
 */
export function specLine(listing) {
  const baths = Number.isInteger(listing.baths) ? listing.baths : listing.baths.toFixed(1);
  return `${listing.beds} bed · ${baths} bath · ${listing.sqft.toLocaleString('en-US')} sqft`;
}

/**
 * Filter and sort the portfolio.
 *
 * The text query matches address, city, tag and blurb, so "pismo", "vineyard"
 * and "pool" all find something sensible.
 *
 * @param {Array<object>} listings The portfolio.
 * @param {object} [query] Filters.
 * @param {string} [query.text] Free text.
 * @param {string} [query.status] `active`, `pending`, `sold`, or `all`.
 * @param {number} [query.maxPrice] Ceiling in dollars.
 * @param {number} [query.minBeds] Minimum bedrooms.
 * @param {'price'|'price-desc'|'newest'|'size'} [query.sort] Ordering.
 * @returns {Array<object>} The matching listings.
 */
export function selectListings(listings, query = {}) {
  const text = String(query.text || '').trim().toLowerCase();
  const status = query.status && query.status !== 'all' ? query.status : null;
  const rows = listings.filter((listing) => {
    if (status && listing.status !== status) return false;
    if (query.maxPrice && listing.price > query.maxPrice) return false;
    if (query.minBeds && listing.beds < query.minBeds) return false;
    if (!text) return true;
    const haystack = `${listing.address} ${listing.city} ${listing.tag} ${listing.blurb}`.toLowerCase();
    return text.split(/\s+/).every((word) => haystack.includes(word));
  });

  const order = {
    price: (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    size: (a, b) => b.sqft - a.sqft,
    newest: (a, b) => a.days - b.days,
  }[query.sort || 'newest'];
  return rows.slice().sort(order);
}

/**
 * Find the listing a spoken phrase is about.
 *
 * Matches on street number, street name or city, in that order of confidence,
 * so "one twenty three" and "the pismo house" both land on the same record.
 *
 * @param {Array<object>} listings The portfolio.
 * @param {string} phrase What the visitor said.
 * @returns {object|null} The listing, or null when nothing is close enough.
 */
export function matchListing(listings, phrase) {
  const text = String(phrase || '').toLowerCase();
  if (!text.trim()) return null;
  const digits = text.match(/\b\d{1,5}\b/);
  if (digits) {
    const byNumber = listings.find((l) => l.address.startsWith(`${digits[0]} `));
    if (byNumber) return byNumber;
  }
  for (const listing of listings) {
    const street = listing.address.replace(/^\d+\s+/, '').toLowerCase();
    const stem = street.split(/\s+/)[0];
    if (stem.length > 3 && text.includes(stem)) return listing;
  }
  for (const listing of listings) {
    const city = listing.city.toLowerCase();
    // "Avila" is how people say "Avila Beach", so the first word counts too.
    if (text.includes(city) || text.includes(city.split(/\s+/)[0])) return listing;
  }
  // Last resort: a distinctive word from the listing's own copy. "the
  // vineyard one" and "the bluff house" are how people actually refer to
  // properties they have only half remembered.
  let best = null;
  let bestScore = 0;
  for (const listing of listings) {
    const words = `${listing.tag} ${listing.blurb}`.toLowerCase().match(/[a-z]{5,}/g) || [];
    const score = new Set(words.filter((word) => text.includes(word))).size;
    if (score > bestScore) { best = listing; bestScore = score; }
  }
  return bestScore > 0 ? best : null;
}

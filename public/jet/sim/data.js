// ─────────────────────────────────────────────────────────────────────────────
// JET ATELIER · CONFIGURATION DATA
// Four GENERIC airframe classes. Weights, speeds and efficiencies are typical of
// their class, not the specification of any manufacturer's aircraft. Prices are
// illustrative, for the configurator only.
// ─────────────────────────────────────────────────────────────────────────────

export const AIRFRAMES = {
  mid: { cabinL: 7.6, cabinW: 1.96, cabinH: 1.83, zones: 2, oew: 10400, mtow: 17100, fuelCap: 5700, mach: 0.80, cruiseFt: 43000, LD: 14.6, tsfc: 0.68, taxiClimbKg: 260, climbDescentH: 0.35, dpPsi: 9.5, base: 24.5, scale: 0.78, maxPax: 9 },
  super: { cabinL: 9.6, cabinW: 2.19, cabinH: 1.86, zones: 2, oew: 12600, mtow: 20000, fuelCap: 6800, mach: 0.82, cruiseFt: 45000, LD: 16.4, tsfc: 0.63, taxiClimbKg: 300, climbDescentH: 0.35, dpPsi: 10.2, base: 32, scale: 0.88, maxPax: 12 },
  long: { cabinL: 13.1, cabinW: 2.44, cabinH: 1.91, zones: 3, oew: 22700, mtow: 41100, fuelCap: 18000, mach: 0.85, cruiseFt: 45000, LD: 17.8, tsfc: 0.61, taxiClimbKg: 520, climbDescentH: 0.4, dpPsi: 10.4, base: 62, scale: 1.0, maxPax: 16 },
  ultra: { cabinL: 16.7, cabinW: 2.49, cabinH: 1.91, zones: 4, oew: 26300, mtow: 47800, fuelCap: 20500, mach: 0.85, cruiseFt: 45000, LD: 19.2, tsfc: 0.57, taxiClimbKg: 580, climbDescentH: 0.4, dpPsi: 10.7, base: 78, scale: 1.12, maxPax: 19 },
};

// Cabin zone modules: seats, sleeping berths, added mass (kg) and price (US$ M).
export const ZONES = {
  club: { seats: 4, berths: 2, kg: 520, price: 0.9, color: '#3ff3ff' },
  dining: { seats: 4, berths: 0, kg: 610, price: 1.3, color: '#ffb86b' },
  divan: { seats: 3, berths: 2, kg: 430, price: 0.8, color: '#8b5cff' },
  media: { seats: 4, berths: 1, kg: 560, price: 1.6, color: '#ff4fd8' },
  suite: { seats: 2, berths: 2, kg: 780, price: 2.4, color: '#5dffa8' },
  office: { seats: 3, berths: 0, kg: 480, price: 1.1, color: '#ffe066' },
};
export const ZONE_IDS = Object.keys(ZONES);

export const PAINTS = {
  pearl: { color: '#d9dde3', metal: 0.25, rough: 0.2, price: 0.35 },
  obsidian: { color: '#0d0f14', metal: 0.55, rough: 0.18, price: 0.45 },
  midnight: { color: '#101a3a', metal: 0.6, rough: 0.2, price: 0.45 },
  champagne: { color: '#c9b48a', metal: 0.75, rough: 0.22, price: 0.55 },
  racing: { color: '#123b2c', metal: 0.5, rough: 0.2, price: 0.45 },
  holo: { color: '#9aa8ff', metal: 0.9, rough: 0.12, price: 0.9, iridescent: true },
};
export const ACCENTS = { magenta: '#ff4fd8', cyan: '#3ff3ff', gold: '#d9b25f', ember: '#ff6a3d', none: null };
export const LEATHERS = { ivory: '#cfc5b2', cognac: '#8a4b25', graphite: '#2c2f36', oxblood: '#4d1620', sky: '#aac4d9' };
export const VENEERS = { walnut: '#5a3a24', ebony: '#1e1714', oak: '#a8804f', carbon: '#1b1d22', maple: '#d2b48c' };
export const METALS = { gold: '#d4a94f', chrome: '#d9dde4', bronze: '#9c6b3f', black: '#2a2a2e' };

// Cities for the mission planner (airport reference points, decimal degrees).
export const CITIES = {
  LAX: { name: 'Los Angeles', lat: 33.9425, lon: -118.4081 }, JFK: { name: 'New York', lat: 40.6413, lon: -73.7781 },
  MIA: { name: 'Miami', lat: 25.7959, lon: -80.2870 }, TEB: { name: 'Teterboro', lat: 40.8501, lon: -74.0608 },
  LHR: { name: 'London', lat: 51.4700, lon: -0.4543 }, LBG: { name: 'Paris Le Bourget', lat: 48.9694, lon: 2.4414 },
  NCE: { name: 'Nice', lat: 43.6584, lon: 7.2159 }, DXB: { name: 'Dubai', lat: 25.2532, lon: 55.3657 },
  HND: { name: 'Tokyo Haneda', lat: 35.5494, lon: 139.7798 }, HKG: { name: 'Hong Kong', lat: 22.3080, lon: 113.9185 },
  SIN: { name: 'Singapore', lat: 1.3644, lon: 103.9915 }, SYD: { name: 'Sydney', lat: -33.9399, lon: 151.1753 },
  GRU: { name: 'São Paulo', lat: -23.4356, lon: -46.4731 }, JNB: { name: 'Johannesburg', lat: -26.1392, lon: 28.2460 },
  ASE: { name: 'Aspen', lat: 39.2232, lon: -106.8688 }, HNL: { name: 'Honolulu', lat: 21.3187, lon: -157.9225 },
};

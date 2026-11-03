/**
 * Upcoming launches from The Space Devs' Launch Library 2 (free, no key,
 * 15 requests an hour), filtered to SpaceX by default. Vandenberg Space Force
 * Base is about 15 km from Lompoc, so every launch is also given its distance
 * and bearing from the ranch: a Falcon 9 from SLC-4E is a sound and a sight
 * on the Central Coast, and its sonic boom is routinely heard.
 *
 * @module black-optic-6/space/launches
 */

import { bearingDeg, compass, haversineKm } from '../intel/geo.js';

export const LL2 = 'https://ll.thespacedevs.com/2.2.0';
export const launchesUrl = (provider = 'SpaceX', limit = 12) => `${LL2}/launch/upcoming/?limit=${limit}${provider ? `&lsp__name=${encodeURIComponent(provider)}` : ''}&mode=normal`;

/**
 * @returns {{id: string, name: string, net: Date|null, status: string, provider: string, rocket: string,
 *   mission: string, orbit: string, pad: string, location: string, lat: number|null, lon: number|null,
 *   webcast: boolean, windowStart: Date|null, windowEnd: Date|null}[]}
 */
export function parseLaunches(json) {
  const d = (v) => (v ? new Date(v) : null);
  return (Array.isArray(json?.results) ? json.results : []).map((r) => ({
    id: String(r.id ?? ''), name: String(r.name ?? ''), net: d(r.net),
    status: String(r.status?.name ?? r.status?.abbrev ?? ''),
    provider: String(r.launch_service_provider?.name ?? ''),
    rocket: String(r.rocket?.configuration?.full_name ?? r.rocket?.configuration?.name ?? ''),
    mission: String(r.mission?.description ?? r.mission?.name ?? ''),
    orbit: String(r.mission?.orbit?.name ?? ''),
    pad: String(r.pad?.name ?? ''), location: String(r.pad?.location?.name ?? ''),
    lat: Number.isFinite(Number(r.pad?.latitude)) ? Number(r.pad.latitude) : null,
    lon: Number.isFinite(Number(r.pad?.longitude)) ? Number(r.pad.longitude) : null,
    webcast: Boolean(r.webcast_live), windowStart: d(r.window_start), windowEnd: d(r.window_end),
  })).filter((l) => l.name).sort((a, b) => (a.net ?? 0) - (b.net ?? 0));
}

/** Distance and bearing of a launch pad from the ranch. */
export function fromRanch(launch, ranch) {
  if (launch.lat == null || launch.lon == null) return null;
  const km = haversineKm(ranch, launch);
  const brg = bearingDeg(ranch, launch);
  return { km, bearing: brg, compass: compass(brg), local: km < 250 };
}

/** "in 3 d 4 h" style countdown. */
export function countdown(to, now = new Date()) {
  if (!to) return '—';
  let s = Math.round((+to - +now) / 1000);
  const sign = s < 0 ? '−' : '';
  s = Math.abs(s);
  const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60);
  return `T${sign ? '+' : '−'} ${d ? `${d} d ` : ''}${h} h ${String(m).padStart(2, '0')} min`;
}

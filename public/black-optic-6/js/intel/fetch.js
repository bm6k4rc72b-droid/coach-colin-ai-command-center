/**
 * Fetch JSON from a public API with a polite cache.
 *
 * Every response is kept in the browser's Cache Storage with the time it was
 * fetched, and is reused until it is older than the source asks (CelesTrak:
 * two hours; Launch Library: its hourly quota). When the network or the
 * server's cross-origin policy refuses, the last good copy is returned and
 * marked stale, so the panel can say how old it is instead of going blank.
 *
 * @module black-optic-6/intel/fetch
 */

const CACHE = 'bo6-open-data';

async function openCache() {
  try { return typeof caches !== 'undefined' ? await caches.open(CACHE) : null; } catch { return null; }
}

/**
 * @param {string} url
 * @param {number} maxAgeMs Reuse a cached copy younger than this.
 * @param {{timeoutMs?: number, headers?: object}} [options]
 * @returns {Promise<{json: any, at: number, cached: boolean, stale?: boolean}>}
 */
export async function getJson(url, maxAgeMs, { timeoutMs = 25000, headers } = {}) {
  const cache = await openCache();
  const hit = cache ? await cache.match(url).catch(() => null) : null;
  const hitAt = hit ? Number(hit.headers.get('x-bo6-at')) || 0 : 0;
  if (hit && Date.now() - hitAt < maxAgeMs) return { json: await hit.clone().json(), at: hitAt, cached: true };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    try { res = await fetch(url, { signal: ctl.signal, headers }); } finally { clearTimeout(timer); }
    if (!res.ok) throw new Error(`${new URL(url).host} answered HTTP ${res.status}`);
    const text = await res.text();
    const json = JSON.parse(text);
    if (cache) await cache.put(url, new Response(text, { headers: { 'content-type': 'application/json', 'x-bo6-at': String(Date.now()) } })).catch(() => {});
    return { json, at: Date.now(), cached: false };
  } catch (error) {
    if (hit) return { json: await hit.json(), at: hitAt, cached: true, stale: true };
    throw new Error(explain(error, url));
  }
}

/** A refused fetch, in words. Browsers report CORS refusals and offline alike as "Failed to fetch". */
export function explain(error, url) {
  const host = (() => { try { return new URL(url).host; } catch { return url; } })();
  if (error?.name === 'AbortError') return `${host} did not answer in time`;
  if (/failed to fetch|networkerror|load failed/i.test(String(error?.message))) return `${host} could not be reached from this page (offline, or the server does not allow requests from other websites)`;
  return String(error?.message ?? error);
}

/** "3 min ago" for a timestamp. */
export function ago(at, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 90) return `${s} s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

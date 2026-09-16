/**
 * Regional headlines — and the several ways that can mislead you.
 *
 * A news panel on a security console is the most dangerous panel on it, because
 * it looks like situational awareness and is nothing of the kind. Four things
 * are true of every headline feed keyed to a place, and this module is built so
 * that none of them can be quietly forgotten:
 *
 * 1. **A location-matched headline is a string match, not an incident.** An
 *    article is returned because it mentions the place, which catches a fire on
 *    the next ridge and equally catches a restaurant review and a story about
 *    somewhere with the same name in another state.
 * 2. **Silence is not safety.** An empty result means nothing was published and
 *    indexed matching that query, which is a fact about newsrooms and crawlers,
 *    not about the valley. A panel that renders "all clear" on an empty fetch is
 *    lying, so this one renders "nothing published" and keeps the distinction.
 * 3. **Nothing here is timely enough to act on.** Indexing lag on both sources
 *    runs from minutes to hours. The first you will hear about a fire on the
 *    property is not going to be a news API.
 * 4. **The licence is not the same for both sources**, and the difference
 *    matters for a working ranch rather than a hobby project. See below.
 *
 * **On licensing, because this one has teeth.** Google News' terms restrict use
 * to *personal, non-commercial* purposes. A vineyard is a business, so for
 * anything touching the commercial operation that source is not available, and
 * this module will not select it unless the caller explicitly declares personal
 * use. GDELT's terms permit academic, commercial and governmental use of the
 * dataset provided it is cited and linked — so GDELT is the default here, and
 * the citation travels with the results rather than living in a footer.
 *
 * Neither source is fetchable directly from a browser on a static page; both go
 * through the same local relay the cameras use.
 *
 * @module black-optic-6/newsfeed
 */

import { LOCAL_RELAY_PATH } from './argus.js';

/** The two sources, with the terms that decide which one a given deployment may use. */
export const SOURCES = Object.freeze([
  {
    id: 'gdelt',
    name: 'GDELT Project',
    commercial: true,
    credit: 'GDELT Project',
    link: 'https://www.gdeltproject.org/about.html#termsofuse',
    terms: 'Academic, commercial and governmental dataset use permitted, with citation and a link. Linked articles remain their publisher\'s.',
  },
  {
    id: 'google-news',
    name: 'Google News RSS',
    commercial: false,
    credit: 'Google News RSS',
    link: 'https://www.google.com/intl/en_us/terms_google_news.html',
    terms: 'Personal, non-commercial use only. Not available to a commercial deployment without separate permission from Google.',
  },
]);

/**
 * Pick a source for a deployment.
 *
 * `personalUse` has to be asserted by the caller; it does not default to true,
 * because the failure mode of guessing wrong is a licence breach rather than a
 * rendering glitch. The returned record always says why.
 */
export function chooseSource({ personalUse = false, prefer = null } = {}) {
  const wanted = prefer ? SOURCES.find((source) => source.id === prefer) : null;

  if (wanted && !wanted.commercial && !personalUse) {
    return {
      source: SOURCES.find((source) => source.id === 'gdelt'),
      substituted: true,
      reason: `${wanted.name} is restricted to personal, non-commercial use and this deployment has not declared that. Using GDELT, whose terms permit commercial use with citation.`,
    };
  }
  if (wanted) return { source: wanted, substituted: false, reason: '' };

  return {
    source: SOURCES.find((source) => source.id === 'gdelt'),
    substituted: false,
    reason: 'GDELT by default — it is the source whose terms cover a working business.',
  };
}

/** Timespans GDELT's DOC API accepts, as a short menu rather than free text. */
export const SPANS = Object.freeze([
  { id: '1h', label: 'Past hour' },
  { id: '12h', label: 'Past 12 hours' },
  { id: '24h', label: 'Past day' },
  { id: '3d', label: 'Past 3 days' },
  { id: '7d', label: 'Past week' },
]);

/**
 * Build a GDELT DOC 2.0 query.
 *
 * Quoting the place matters: unquoted, `napa county` is two terms and matches
 * an article containing both words anywhere, which is most of the internet.
 * `sourcelang:english` is applied because the panel has no translation and an
 * untranslated headline is not information.
 */
export function gdeltQuery(place, { span = '24h', max = 20, extra = '' } = {}) {
  const trimmed = String(place || '').trim();
  if (!trimmed) return null;
  const validSpan = SPANS.some((entry) => entry.id === span) ? span : '24h';
  const limit = Math.max(1, Math.min(250, Math.floor(max)));

  const terms = [`"${trimmed.replace(/"/g, '')}"`];
  if (extra) terms.push(String(extra).trim());
  terms.push('sourcelang:english');

  const params = new URLSearchParams({
    query: terms.join(' '),
    mode: 'artlist',
    format: 'json',
    maxrecords: String(limit),
    timespan: validSpan,
    sort: 'datedesc',
  });
  return `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;
}

/** The same query through the local relay, which is the address that actually works. */
export function gdeltViaRelay(place, options = {}, relayPath = LOCAL_RELAY_PATH) {
  const direct = gdeltQuery(place, options);
  if (!direct) return null;
  const query = direct.slice(direct.indexOf('?'));
  return `${relayPath}/gdelt/api/v2/doc/doc${query}`;
}

/** GDELT stamps are `YYYYMMDDTHHMMSSZ`, which `Date` will not parse on its own. */
export function parseGdeltTime(stamp) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(String(stamp || ''));
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Normalise a GDELT response.
 *
 * Articles without a usable link are dropped: a headline with nowhere to go
 * cannot be checked, and an unverifiable headline on a security console is
 * worse than no headline.
 */
export function parseGdelt(payload) {
  const rows = Array.isArray(payload?.articles) ? payload.articles : [];
  const articles = [];
  for (const row of rows) {
    const url = String(row?.url || '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    let domain = String(row?.domain || '').trim();
    if (!domain) {
      try { domain = new URL(url).hostname; } catch { domain = ''; }
    }
    articles.push({
      title: String(row?.title || '').trim() || '(untitled)',
      url,
      domain,
      publishedMs: parseGdeltTime(row?.seendate),
      language: String(row?.language || '').trim() || null,
      country: String(row?.sourcecountry || '').trim() || null,
    });
  }
  articles.sort((a, b) => (b.publishedMs ?? 0) - (a.publishedMs ?? 0));
  return { articles, dropped: rows.length - articles.length, claimed: rows.length };
}

/**
 * What an empty result means, spelled out.
 *
 * This exists as its own function because it is the sentence most likely to be
 * replaced with "All clear" by somebody trying to make the panel feel finished.
 */
export function emptyVerdict(place, span) {
  const window = SPANS.find((entry) => entry.id === span)?.label?.toLowerCase() || 'that window';
  return `Nothing published and indexed mentioning ${place} in ${window}. That is a fact about what newsrooms filed and crawlers picked up — it is not evidence that nothing happened.`;
}

/**
 * The standing caveat shown beside any result set.
 *
 * Returned rather than hard-coded into the panel so a test can assert it is
 * still there and still says the two things that matter.
 */
export function caveat() {
  return 'These are articles that mention the place, not verified incidents, and not a risk ranking. Indexing lag runs from minutes to hours, so nothing here is fast enough to act on.';
}

/** The citation that has to travel with the results. */
export function creditFor(sourceId) {
  const source = SOURCES.find((entry) => entry.id === sourceId);
  if (!source) return null;
  return { credit: source.credit, link: source.link, terms: source.terms };
}

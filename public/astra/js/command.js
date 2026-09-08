/**
 * The Autonomous Marketing Command Centre.
 *
 * The private half of the platform: what visitors are asking, what the library
 * can and cannot answer, what new research has landed, and — from all of that —
 * a campaign proposal an operator approves or rejects before anything is built.
 *
 * Three things are deliberate here.
 *
 * **Nothing publishes itself.** The command centre proposes; a person approves.
 * Every generated campaign carries the compliance verdict of its own assets, so
 * approving is an informed act rather than a rubber stamp.
 *
 * **Telemetry never leaves the device.** The dashboard is built from events
 * stored in this browser. That makes it honest about what it is — a view of
 * *your* session, not a claim about a population — and it means the platform
 * ships no tracking.
 *
 * **The radar reads real literature.** Europe PMC is queried directly from the
 * browser, cached last-good, and degraded visibly to CACHED or OFFLINE rather
 * than quietly serving stale results as fresh ones.
 *
 * @module astra/command
 */

import { GOALS, PEPTIDES, corpusSize } from './data/peptides.js';
import { scoreEvidence, tier } from './evidence.js';
import { corpusVerdict } from './engine.js';

const TELEMETRY_KEY = 'astra.telemetry.v1';
const RADAR_KEY = 'astra.radar.v1';

/**
 * Local, device-only event store.
 *
 * The executive dashboard is built from this. It is capped so it cannot grow
 * without bound, and it holds no identifiers of any kind.
 */
export class Telemetry {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.events = this.#read();
  }

  /**
   * Read the stored events.
   *
   * @returns {Array<object>} Events, oldest first.
   */
  #read() {
    try {
      const raw = JSON.parse(this.storage?.getItem(TELEMETRY_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  /**
   * Record an event.
   *
   * @param {string} kind Event type.
   * @param {object} [detail] Context.
   * @returns {object} The stored event.
   */
  push(kind, detail = {}) {
    const event = { kind, at: Date.now(), ...detail };
    this.events.push(event);
    if (this.events.length > 800) this.events = this.events.slice(-800);
    try {
      this.storage?.setItem(TELEMETRY_KEY, JSON.stringify(this.events));
    } catch {
      // Storage full or disabled; the dashboard degrades to this session only.
    }
    return event;
  }

  /**
   * Events of a kind.
   *
   * @param {string} kind Event type.
   * @returns {Array<object>} Matching events.
   */
  of(kind) {
    return this.events.filter((event) => event.kind === kind);
  }

  /** Forget everything. */
  clear() {
    this.events = [];
    try {
      this.storage?.removeItem(TELEMETRY_KEY);
    } catch {
      // Nothing to clear.
    }
  }
}

/**
 * Count occurrences of a field across events, most frequent first.
 *
 * @param {Array<object>} events Events.
 * @param {string} field Field name.
 * @returns {Array<{ value: string, count: number }>} Ranked counts.
 */
export function tally(events, field) {
  const counts = new Map();
  for (const event of events) {
    const value = event[field];
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

/**
 * Build the executive dashboard.
 *
 * @param {Telemetry} telemetry The event store.
 * @param {object} progressState The reader's progression record.
 * @returns {object} The dashboard model.
 */
export function executiveDashboard(telemetry, progressState) {
  const asks = telemetry.of('ask');
  const dossiers = telemetry.of('dossier');
  const checks = telemetry.of('claim-check');
  const compliance = telemetry.of('compliance');
  const size = corpusSize();
  const verdict = corpusVerdict();

  const topics = tally(asks, 'topic');
  const compounds = tally(dossiers, 'peptide');
  const blocked = compliance.filter((event) => event.severity === 'block').length;

  // The demand signal that drives a campaign proposal: what people ask about,
  // weighted against how well the library answers it.
  const demand = GOALS.map((goal) => {
    const asked = asks.filter((event) => (event.goals || []).includes(goal.id)).length;
    const covered = PEPTIDES.filter((peptide) => peptide.goals.includes(goal.id));
    const strength = covered.length
      ? covered.reduce((sum, peptide) => sum + scoreEvidence(peptide.studies).score, 0) / covered.length
      : 0;
    return { goal, asked, covered: covered.length, strength, gap: asked * (1 - strength) };
  }).sort((a, b) => b.gap - a.gap || b.asked - a.asked);

  return {
    size,
    verdict,
    counts: {
      sessions: new Set(telemetry.events.map((event) => new Date(event.at).toDateString())).size,
      asks: asks.length,
      dossiers: dossiers.length,
      checks: checks.length,
      complianceRuns: compliance.length,
      blocked,
    },
    topics: topics.slice(0, 6),
    compounds: compounds.slice(0, 6),
    demand,
    literacy: progressState ? {
      xp: progressState.xp,
      streak: progressState.streak,
      sourcesOpened: (progressState.actions || {})['pubmed-open'] || 0,
      papersDecoded: (progressState.actions || {})['paper-decode'] || 0,
    } : null,
    attention: attentionItems({ blocked, demand, verdict }),
  };
}

/**
 * What needs a human's attention, in priority order.
 *
 * @param {object} parts Dashboard parts.
 * @returns {Array<{ level: string, title: string, body: string }>} Attention items.
 */
function attentionItems({ blocked, demand, verdict }) {
  const items = [];
  if (blocked) {
    items.push({
      level: 'high',
      title: `${blocked} piece${blocked === 1 ? '' : 's'} of copy blocked by the guardian`,
      body: 'Blocked copy is copy somebody tried to publish. Review what was written and whether the underlying claim exists in the library at all.',
    });
  }
  const topGap = demand.find((item) => item.gap > 0);
  if (topGap) {
    items.push({
      level: 'medium',
      title: `Demand outruns evidence on ${topGap.goal.label.toLowerCase()}`,
      body: `Readers ask about it ${topGap.asked} time${topGap.asked === 1 ? '' : 's'} while the library averages ${Math.round(topGap.strength * 100)}% confidence across ${topGap.covered} compounds. That gap is the campaign — teach why the evidence is thin rather than pretending it is not.`,
    });
  }
  if (verdict.humanShare < 0.5) {
    items.push({
      level: 'medium',
      title: `Only ${Math.round(verdict.humanShare * 100)}% of catalogued studies are in humans`,
      body: 'This is the single most useful fact about the category, and it should be on the homepage rather than buried in a dossier.',
    });
  }
  items.push({
    level: 'low',
    title: 'Radar sweep',
    body: 'Run the research radar to check whether anything published since the last sweep changes a dossier.',
  });
  return items;
}

/**
 * The research radar.
 *
 * Queries Europe PMC for recent literature on each compound. Europe PMC is used
 * rather than a scraped source because it serves CORS headers, needs no key,
 * and returns structured records — which means the radar is real rather than a
 * simulation of one.
 */
export class Radar {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.status = 'idle';
    this.cache = this.#read();
  }

  /**
   * Read the last-good sweep.
   *
   * @returns {{ at: number, items: Array<object> }|null} The cached sweep.
   */
  #read() {
    try {
      return JSON.parse(this.storage?.getItem(RADAR_KEY) || 'null');
    } catch {
      return null;
    }
  }

  /**
   * Build the Europe PMC query for a compound.
   *
   * @param {object} peptide A peptide record.
   * @returns {string} The query URL.
   */
  static queryFor(peptide) {
    const terms = [peptide.name, ...(peptide.aka || [])].slice(0, 3).map((term) => `"${term}"`).join(' OR ');
    const query = `(${terms}) AND (FIRST_PDATE:[${new Date().getFullYear() - 2}-01-01 TO ${new Date().getFullYear() + 1}-01-01])`;
    return `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=5&sort=P_PDATE_D%20desc`;
  }

  /**
   * Normalise one Europe PMC record.
   *
   * @param {object} raw The API record.
   * @param {object} peptide The compound it was found for.
   * @returns {object} A radar item.
   */
  static normalise(raw, peptide) {
    const guessTier = /randomi[sz]ed|clinical trial/i.test(`${raw.title} ${raw.pubType || ''}`)
      ? 'human-rct'
      : /trial|patients|participants/i.test(`${raw.title} ${raw.pubType || ''}`)
        ? 'human-trial'
        : /mice|rat|murine|in vivo/i.test(raw.title || '')
          ? 'animal'
          : /in vitro|cell/i.test(raw.title || '')
            ? 'invitro'
            : 'mechanistic';
    return {
      id: raw.id || `${peptide.id}-${raw.pmid || raw.doi || raw.title}`,
      peptide: peptide.id,
      peptideName: peptide.name,
      title: raw.title || 'Untitled record',
      journal: raw.journalTitle || raw.bookOrReportDetails || 'Unknown source',
      year: Number(raw.pubYear) || null,
      authors: raw.authorString || '',
      tier: guessTier,
      url: raw.doi ? `https://doi.org/${raw.doi}` : `https://europepmc.org/article/${raw.source || 'MED'}/${raw.id}`,
    };
  }

  /**
   * Sweep the radar.
   *
   * @param {object} [options] Options.
   * @param {number} [options.limit] How many compounds to query.
   * @param {Function} [options.fetcher] Injected fetch, for tests.
   * @returns {Promise<{ status: string, at: number, items: Array<object> }>} The sweep.
   */
  async sweep({ limit = 6, fetcher = globalThis.fetch } = {}) {
    this.status = 'sweeping';
    const targets = PEPTIDES.slice(0, limit);
    const items = [];
    let failures = 0;

    for (const peptide of targets) {
      try {
        const response = await fetcher(Radar.queryFor(peptide), { headers: { accept: 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        for (const raw of data?.resultList?.result || []) items.push(Radar.normalise(raw, peptide));
      } catch {
        failures += 1;
      }
    }

    if (!items.length) {
      // Nothing came back. Serve the last good sweep and say so, rather than
      // pretending an empty feed is a quiet week in the literature.
      this.status = this.cache ? 'cached' : 'offline';
      return { status: this.status, at: this.cache?.at || 0, items: this.cache?.items || [] };
    }

    items.sort((a, b) => (b.year || 0) - (a.year || 0) || tier(a.tier).rank - tier(b.tier).rank);
    const sweep = { at: Date.now(), items: items.slice(0, 40), partial: failures > 0 };
    this.cache = sweep;
    try {
      this.storage?.setItem(RADAR_KEY, JSON.stringify(sweep));
    } catch {
      // Cache is a nicety; the sweep still returns.
    }
    this.status = failures ? 'partial' : 'live';
    return { status: this.status, ...sweep };
  }

  /**
   * What is stored without hitting the network.
   *
   * @returns {{ status: string, at: number, items: Array<object> }} The cached sweep.
   */
  last() {
    return { status: this.cache ? 'cached' : 'offline', at: this.cache?.at || 0, items: this.cache?.items || [] };
  }
}

/**
 * Propose a campaign.
 *
 * The proposal is derived from the demand-versus-evidence gap rather than from
 * whatever is trending, which is what makes it defensible: the campaign teaches
 * the thing the audience is asking about *and* the library is honest about.
 *
 * @param {object} dashboard The executive dashboard model.
 * @param {object} [options] Options.
 * @param {number} [options.days] Campaign length.
 * @returns {object} The campaign proposal.
 */
export function proposeCampaign(dashboard, { days = 7 } = {}) {
  const lead = dashboard.demand[0] || { goal: GOALS[0], asked: 0, strength: 0, covered: 0 };
  const compounds = PEPTIDES
    .filter((peptide) => peptide.goals.includes(lead.goal.id))
    .map((peptide) => ({ peptide, reading: scoreEvidence(peptide.studies) }))
    .sort((a, b) => b.reading.score - a.reading.score);

  const anchor = compounds[0];
  const contrast = compounds[compounds.length - 1];

  const title = anchor && contrast && anchor.peptide.id !== contrast.peptide.id
    ? `What peptide research actually shows about ${lead.goal.label.toLowerCase()}`
    : `Reading the evidence on ${lead.goal.label.toLowerCase()}`;

  const beats = [
    { day: 1, format: 'Reel', brief: `Open the campaign with the category fact: ${Math.round(dashboard.verdict.humanShare * 100)}% of catalogued studies here are in humans. State it plainly, no compound named.` },
    { day: 2, format: 'Carousel', brief: `The evidence pyramid, explained in eight slides, with ${anchor ? anchor.peptide.name : 'the best-supported compound'} placed on it.` },
    { day: 3, format: 'Story set', brief: 'Five questions to ask of any peptide claim. One per story, with a poll on the last.' },
    { day: 4, format: 'Long-form article', brief: anchor && contrast ? `${anchor.peptide.name} versus ${contrast.peptide.name}: same goal, ${Math.round(anchor.reading.score * 100)}% versus ${Math.round(contrast.reading.score * 100)}% confidence. Why the gap exists.` : 'A single compound, read properly, from abstract to limitations.' },
    { day: 5, format: 'Reel', brief: 'Decode one abstract on camera in forty seconds. Show the limitation sentence.' },
    { day: 6, format: 'Email', brief: 'The research guide as a download. Lead magnet is the literacy tool, not a product.' },
    { day: 7, format: 'Carousel + Reel', brief: 'Answer the questions the audience sent during the week, with tiers attached to each answer.' },
  ].slice(0, days);

  return {
    title,
    opportunity: lead.asked
      ? `Readers asked about ${lead.goal.label.toLowerCase()} ${lead.asked} time${lead.asked === 1 ? '' : 's'} while the library averages ${Math.round(lead.strength * 100)}% confidence across ${lead.covered} compounds. Demand is outrunning evidence, and that gap is the story.`
      : `No strong demand signal has been recorded yet, so this proposal leads with ${lead.goal.label.toLowerCase()} on library strength alone. Run it, then let the dashboard reshape the next one.`,
    goal: lead.goal,
    anchor: anchor ? anchor.peptide : null,
    contrast: contrast ? contrast.peptide : null,
    days,
    beats,
    deliverables: [
      `${beats.filter((beat) => beat.format.includes('Reel')).length} Reels`,
      `${beats.filter((beat) => beat.format.includes('Carousel')).length} carousels`,
      '1 long-form article',
      '5 Stories',
      '1 email',
      '1 downloadable research guide',
    ],
    guardrails: [
      'Every asset states its evidence tier on screen or in the first line.',
      'No dose appears in any asset unless attributed to a named trial protocol.',
      'No compound is described as treating, curing or reversing anything.',
      'Every claim links to the dossier, and every dossier claim expands to its sources.',
      'The guardian runs on every asset before it is queued; blocked assets do not reach the approval screen.',
    ],
    approval: {
      required: true,
      note: 'Nothing here is scheduled, sent or published. Approving generates the asset drafts in the Content Studio; publishing remains a manual act by a person.',
    },
  };
}

/**
 * Arrival profiles — the website that reorganises itself around the visitor.
 *
 * Reads the referrer and campaign parameters and returns a configuration for
 * the entry experience. This changes emphasis and ordering only: the same
 * evidence, the same tiers, the same caveats reach every visitor, because a
 * page that softens its caveats for the audience most likely to buy is the
 * exact failure this platform exists to avoid.
 *
 * @param {object} [context] Overrides for testing.
 * @param {string} [context.referrer] Document referrer.
 * @param {string} [context.search] Query string.
 * @returns {object} The arrival profile.
 */
export function arrivalProfile({ referrer = '', search = '' } = {}) {
  const params = new URLSearchParams(search || '');
  const source = (params.get('utm_source') || '').toLowerCase();
  const ref = String(referrer || '').toLowerCase();

  const match = (...needles) => needles.some((needle) => source.includes(needle) || ref.includes(needle));

  if (match('instagram', 'tiktok', 'facebook')) {
    return {
      id: 'social',
      label: 'Arrived from social',
      lead: 'You have probably seen a claim about one of these. Check it.',
      deck: 'verify',
      order: ['verify', 'engine', 'graph', 'decoder'],
      note: 'Social arrivals land on the myth detector, because they usually arrive holding a specific claim.',
    };
  }
  if (match('scholar.google', 'pubmed', 'doi.org', 'europepmc', 'nih.gov')) {
    return {
      id: 'research',
      label: 'Arrived from the literature',
      lead: 'You came from a paper. Start with the decoder and the graph.',
      deck: 'decoder',
      order: ['decoder', 'graph', 'engine', 'compare'],
      note: 'Readers arriving from a journal want the tools, not the primer.',
    };
  }
  if (match('google', 'bing', 'duckduckgo')) {
    return {
      id: 'search',
      label: 'Arrived from search',
      lead: 'You asked a question. Ask it here instead.',
      deck: 'engine',
      order: ['engine', 'verify', 'compare', 'graph'],
      note: 'Search arrivals get the intelligence engine with the query prefilled where one is available.',
    };
  }
  if (params.get('campaign') || source.includes('email') || source.includes('newsletter')) {
    return {
      id: 'campaign',
      label: 'Arrived from a campaign',
      lead: 'Continue where the campaign left off.',
      deck: 'engine',
      order: ['engine', 'timeline', 'compare', 'verify'],
      note: 'Campaign arrivals resume the compound the campaign was about.',
    };
  }
  return {
    id: 'direct',
    label: 'Direct arrival',
    lead: 'Search, compare, verify, understand.',
    deck: 'engine',
    order: ['engine', 'graph', 'verify', 'compare'],
    note: 'The full introduction, in the order the platform was designed to be met.',
  };
}

/**
 * Colin's weekly research briefing.
 *
 * Uses ASTRA's own research radar — a live Europe PMC sweep per compound,
 * newest first — and falls back to the newest studies already in the library
 * when the network is down. Headlines are read as headlines: the briefing
 * says plainly that a title is not a conclusion.
 *
 * @module astra/showcase/briefing
 */

import { Radar } from '../js/command.js';
import { STUDIES } from './sections.js';

const radar = new Radar();

/**
 * Fetch the briefing.
 *
 * @param {{ limit?: number }} [options] How many items.
 * @returns {Promise<{ live: boolean, items: Array<{ title: string, year: number|null, peptide: string, url: string|null, tier: string }> }>} Items.
 */
export async function fetchBriefing({ limit = 5 } = {}) {
  try {
    const sweep = await Promise.race([
      radar.sweep({ limit: 3 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 9000)),
    ]);
    if (sweep?.items?.length) {
      // One headline per compound, newest first, so the briefing is not all one drug.
      const seen = new Set();
      const items = [];
      for (const item of sweep.items) {
        const key = item.peptide || item.peptideName;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ title: item.title, year: item.year || null, peptide: item.peptideName || item.peptide || '', url: item.url || null, tier: item.tier || '' });
        if (items.length >= limit) break;
      }
      return { live: sweep.status === 'live' || sweep.status === 'partial', items };
    }
  } catch (error) {
    // Fall through to the library.
  }
  const items = STUDIES.slice().sort((a, b) => b.year - a.year).slice(0, limit)
    .map((s) => ({ title: s.title, year: s.year, peptide: s.peptideName, url: null, tier: s.tier }));
  return { live: false, items };
}

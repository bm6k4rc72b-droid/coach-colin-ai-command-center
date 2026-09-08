/**
 * The Research Paper Decoder.
 *
 * Paste an abstract; get back the five things a reader actually needs: what
 * was studied, who or what it was studied in, what was found, what limits the
 * finding, and — the section nobody writes but everybody needs — what the
 * study does not prove.
 *
 * This runs entirely locally on structural cues: design vocabulary, sample-size
 * patterns, species words, statistical reporting, and hedging language. It is
 * deliberately conservative. When it cannot tell, it says so rather than
 * guessing, because a decoder that invents a confident reading of a paper is
 * worse than no decoder at all. If a language model is connected, ASTRA layers
 * a written summary on top of this skeleton — but the tier and the
 * "doesn't prove" list still come from here.
 *
 * @module astra/decoder
 */

import { TIERS, tier } from './evidence.js';

/** Design signatures, most specific first — the first match wins. */
const DESIGNS = [
  {
    id: 'meta-analysis', tier: 'human-rct', label: 'Systematic review / meta-analysis',
    test: /\b(meta[- ]analy|systematic review|pooled analysis)/i,
    note: 'A synthesis of other studies. Its quality is bounded by the studies it pooled — check what it included and what it excluded.',
  },
  {
    id: 'rct', tier: 'human-rct', label: 'Randomised controlled trial',
    test: /\b(randomi[sz]ed|randomly assigned|randomi[sz]ation)\b/i,
    note: 'Assignment by chance is what lets a study support a causal claim.',
  },
  {
    id: 'crossover', tier: 'human-trial', label: 'Crossover trial',
    test: /\bcross[- ]?over\b/i,
    note: 'Each participant acts as their own control. Watch for carryover between periods.',
  },
  {
    id: 'open-label', tier: 'human-trial', label: 'Open-label / single-arm trial',
    test: /\b(open[- ]label|single[- ]arm|uncontrolled trial|pilot study|phase (i|1)\b)/i,
    note: 'Everyone knew who got what. Expectation effects are unconstrained.',
  },
  {
    id: 'cohort', tier: 'human-observational', label: 'Cohort / longitudinal study',
    test: /\b(cohort|prospective(ly)? followed|longitudinal|follow[- ]up study)\b/i,
    note: 'Nobody assigned the exposure, so confounding is the first explanation to rule out.',
  },
  {
    id: 'case-control', tier: 'human-observational', label: 'Case-control study',
    test: /\bcase[- ]control\b/i,
    note: 'Works backwards from outcome to exposure. Recall and selection bias are the standing risks.',
  },
  {
    id: 'cross-sectional', tier: 'human-observational', label: 'Cross-sectional / survey',
    test: /\b(cross[- ]sectional|survey|questionnaire[- ]based)\b/i,
    note: 'A snapshot. It cannot establish which came first.',
  },
  {
    id: 'case-report', tier: 'human-observational', label: 'Case report / case series',
    test: /\b(case report|case series|we (report|describe) (a|the) case)\b/i,
    note: 'One or a handful of people, with no comparison group.',
  },
  {
    id: 'animal', tier: 'animal', label: 'Animal study',
    test: /\b(mice|mouse|rat|rats|murine|rodent|rabbit|canine|porcine|swine|zebrafish|in vivo model)\b/i,
    note: 'An animal result is a hypothesis about humans, not a finding in them.',
  },
  {
    id: 'invitro', tier: 'invitro', label: 'In vitro / cell study',
    test: /\b(in vitro|cell line|cultured|fibroblast|keratinocyte|hek293|assay|incubated with)\b/i,
    note: 'Concentration and exposure in a dish are frequently unreachable in a body.',
  },
  {
    id: 'review', tier: 'mechanistic', label: 'Narrative review',
    test: /\b(this review|we review|narrative review|overview of the literature)\b/i,
    note: 'A summary shaped by whoever wrote it. Not a new result.',
  },
];

/** Species and population cues. */
const POPULATIONS = [
  { test: /\b(healthy (?:volunteer|adult|subject|participant)s?)\b/i, label: 'Healthy human volunteers', human: true },
  { test: /\b(?:patients?|participants?|subjects?) with ([a-z0-9 ,'\-]{3,60})/i, label: null, human: true, clause: true },
  { test: /\b(?:male|female)? ?(?:wistar|sprague[- ]dawley|c57bl|balb\/c) ?(?:rats?|mice)?\b/i, label: 'Laboratory rodents (named strain)', human: false },
  { test: /\b(?:mice|mouse|rats?|murine|rodents?)\b/i, label: 'Rodents', human: false },
  { test: /\b(?:rabbits?|dogs?|canine|pigs?|porcine|swine|primates?|monkeys?)\b/i, label: 'Non-rodent animals', human: false },
  { test: /\b(?:men|women|adults|children|adolescents|elderly|older adults|patients?|participants?)\b/i, label: 'Human participants', human: true },
  { test: /\b(?:cells?|cell lines?|cultures?|explants?)\b/i, label: 'Cells or tissue, not an organism', human: false },
];

/** Phrases that mark a limitation the authors admitted to. */
const LIMIT_CUES = /\b(limitation|limited by|small sample|underpowered|short duration|not powered|single[- ]cent(?:re|er)|did not (?:assess|measure|include)|were not (?:blinded|randomi[sz]ed)|further (?:research|study|studies|trials?) (?:is|are) (?:needed|warranted)|should be interpreted with caution|preliminary|exploratory|no control group|self[- ]reported|attrition|drop[- ]?out)/i;

/** Hedge words. Their density says how firmly the authors are standing behind the claim. */
const HEDGES = /\b(?:may|might|could|suggests?|suggested|appears?|appeared|potentially|potential|possible|possibly|seems?|seemed|indicates? that|preliminary|warrants? further|hypothesi[sz]e)\b/gi;

/** Overclaim words in an abstract's conclusion. */
const STRONG = /\b(?:proves?|proved|demonstrates? conclusively|confirms?|establishes?|is effective|cures?|guarantees?|safe and effective)\b/gi;

/** A sentinel that stands in for a period we do not want to split on. */
const DOT = String.fromCharCode(1);

/**
 * Split prose into sentences without breaking on decimals or common
 * abbreviations.
 *
 * @param {string} text Prose.
 * @returns {string[]} Sentences.
 */
export function sentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    // Protect abbreviations and decimals from the sentence splitter.
    .replace(/\b(vs|e\.g|i\.e|et al|Fig|approx|No|no|cf|Dr|ca)\./g, (m) => m.replace('.', DOT))
    .replace(/(\d)\.(\d)/g, `$1${DOT}$2`)
    .split(/(?<=[.!?])\s+(?=[A-Z(“"])/)
    .map((sentence) => sentence.split(DOT).join('.').trim())
    .filter((sentence) => sentence.length > 12);
}

/**
 * Pull sample sizes out of an abstract.
 *
 * @param {string} text The abstract.
 * @returns {{ n: number|null, mentions: number[] }} The best guess and everything found.
 */
export function sampleSize(text) {
  const mentions = [];
  const patterns = [
    /\bn\s*=\s*([\d,]{1,8})/gi,
    /\b([\d,]{2,8})\s+(?:patients|participants|subjects|adults|volunteers|men|women|children|animals|mice|rats)\b/gi,
    /\benrol(?:led|ment of)\s+([\d,]{1,8})\b/gi,
    /\b(?:total of|included)\s+([\d,]{2,8})\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of String(text || '').matchAll(pattern)) {
      const value = Number(match[1].replace(/,/g, ''));
      if (Number.isFinite(value) && value > 1 && value < 10000000) mentions.push(value);
    }
  }
  // The largest credible figure is usually the enrolled total; smaller numbers
  // are typically arms or subgroups.
  const n = mentions.length ? Math.max(...mentions) : null;
  return { n, mentions: [...new Set(mentions)].sort((a, b) => b - a) };
}

/**
 * Extract reported statistics.
 *
 * @param {string} text The abstract.
 * @returns {{ pValues: string[], intervals: string[], effects: string[], hasStats: boolean }} What was reported.
 */
export function statistics(text) {
  const source = String(text || '');
  const pValues = [...source.matchAll(/\bp\s*[<>=]\s*0?\.\d+/gi)].map((m) => m[0].replace(/\s+/g, ''));
  const intervals = [...source.matchAll(/95%\s*(?:CI|confidence interval)[^.;)]{0,44}/gi)].map((m) => m[0].trim());
  const effects = [...source.matchAll(/[-−]?\d+(?:\.\d+)?\s?%|(?:hazard|odds|risk) ratio[^.;)]{0,30}/gi)].map((m) => m[0].trim());
  return {
    pValues: [...new Set(pValues)].slice(0, 8),
    intervals: [...new Set(intervals)].slice(0, 4),
    effects: [...new Set(effects)].slice(0, 8),
    hasStats: Boolean(pValues.length || intervals.length),
  };
}

/**
 * Identify the design.
 *
 * @param {string} text The abstract.
 * @returns {{ id: string, label: string, tier: string, note: string, confident: boolean }} The design reading.
 */
export function design(text) {
  const source = String(text || '');
  const human = /\b(?:patients?|participants?|volunteers?|men|women|adults|children|humans?)\b/i.test(source);
  const nonHuman = /\b(?:mice|mouse|rats?|murine|in vitro|cell line)\b/i.test(source);
  for (const candidate of DESIGNS) {
    if (!candidate.test.test(source)) continue;
    // An abstract that says "randomised" about mice is still an animal study.
    if (candidate.tier.startsWith('human') && !human && nonHuman) continue;
    return { ...candidate, confident: true };
  }
  return {
    id: 'unclear',
    label: 'Design not stated in the text supplied',
    tier: human ? 'human-observational' : 'mechanistic',
    note: 'The abstract does not name a design. That is itself worth noting — read the methods before citing it.',
    confident: false,
  };
}

/**
 * Identify the study population.
 *
 * @param {string} text The abstract.
 * @returns {{ label: string, human: boolean, detail: string|null }} The population reading.
 */
export function population(text) {
  const source = String(text || '');
  for (const candidate of POPULATIONS) {
    const match = source.match(candidate.test);
    if (!match) continue;
    if (candidate.label === null) {
      return { label: `People with ${trimClause(match[1])}`, human: true, detail: match[0].trim() };
    }
    return { label: candidate.label, human: candidate.human, detail: match[0].trim() };
  }
  return { label: 'Not identifiable from the text supplied', human: false, detail: null };
}

/**
 * Cut a captured phrase at the point it stops describing the population.
 *
 * "patients with ulcerative colitis were enrolled" describes people with
 * ulcerative colitis, not people with "ulcerative colitis were enrolled" — the
 * capture has to stop at the verb.
 *
 * @param {string} phrase The raw capture.
 * @returns {string} The condition alone.
 */
function trimClause(phrase) {
  const words = String(phrase || '').trim().split(/\s+/);
  const boundary = /^(?:were|was|who|whom|whose|and|receiv\w*|enrolled|randomi[sz]ed|undergo\w*|underwent|treated|assigned|aged|attending|presenting|admitted|recruited|participat\w*|in|for|over|at|during|from)$/i;
  const kept = [];
  for (const word of words) {
    if (boundary.test(word.replace(/[.,;:]/g, ''))) break;
    kept.push(word);
    if (kept.length >= 6) break;
  }
  return (kept.join(' ') || words[0] || '').replace(/[.,;:]+$/, '').trim();
}

/**
 * Score how hedged the writing is.
 *
 * @param {string} text The abstract.
 * @returns {{ hedges: number, strong: number, density: number, verdict: string }} The reading.
 */
export function hedging(text) {
  const source = String(text || '');
  const words = source.split(/\s+/).filter(Boolean).length || 1;
  const hedges = (source.match(HEDGES) || []).length;
  const strong = (source.match(STRONG) || []).length;
  const density = hedges / words;
  let verdict;
  if (strong > hedges && strong >= 2) verdict = 'The conclusion is stated more strongly than abstracts usually allow. Check whether the results section supports that language.';
  else if (density > 0.02) verdict = 'Heavily hedged. The authors are signalling that this is suggestive rather than settled.';
  else if (hedges === 0) verdict = 'No hedging at all, which is unusual. Either the result is very clean or the abstract is overselling.';
  else verdict = 'Conventionally hedged for a scientific abstract.';
  return { hedges, strong, density, verdict };
}

/**
 * Limitations the decoder infers from structure when the authors did not state
 * them.
 *
 * @param {object} parts Decoded parts.
 * @returns {string[]} Inferred limitations.
 */
function inferredLimits({ designReading, populationReading, sample, stats }) {
  const out = [];
  if (sample.n === null) out.push('No sample size appears in the text supplied. A result without an n cannot be weighed at all.');
  else if (sample.n < 30) out.push(`Sample of ${sample.n}. At that size, chance and individual variation can produce the whole result.`);
  else if (sample.n < 100) out.push(`Sample of ${sample.n}. Enough to detect a large effect, not enough to rule out a small one or to characterise rare harms.`);
  if (!stats.hasStats) out.push('No p-values or confidence intervals appear in the text supplied, so the precision of the estimate is unknown.');
  if (!populationReading.human) out.push('No human participants. Every conclusion about people is an extrapolation.');
  if (designReading.id === 'open-label') out.push('No blinding described, so expectation effects are uncontrolled.');
  if (designReading.id === 'cohort' || designReading.id === 'cross-sectional') out.push('Observational design. Association is not causation here, however clean the numbers look.');
  if (!designReading.confident) out.push('The design is not stated in the abstract, which means it cannot be graded from the abstract alone.');
  return out;
}

/**
 * The section nobody writes: what this study does not establish.
 *
 * @param {object} parts Decoded parts.
 * @returns {string[]} Statements about what remains unproven.
 */
function notProven({ designReading, populationReading, sample, stats, tierInfo, source }) {
  const out = [];
  if (!populationReading.human) {
    out.push('That the effect occurs in humans. Species differences in dose, metabolism and physiology are the usual reason animal findings do not translate.');
  }
  if (designReading.id === 'invitro') {
    out.push('That the concentration used is achievable in a living body, let alone at the target tissue.');
  }
  if (['cohort', 'cross-sectional', 'case-control', 'case-report'].includes(designReading.id)) {
    out.push('That the exposure caused the outcome. Nothing was assigned, so an unmeasured common cause remains the leading rival explanation.');
  }
  if (designReading.id === 'open-label' || designReading.id === 'case-report') {
    out.push('That the effect exceeds what an expectation of benefit would have produced on its own.');
  }
  if (sample.n !== null && sample.n < 100) {
    out.push('That the compound is safe. A study of this size cannot detect an adverse event occurring in fewer than roughly one in a hundred people.');
  }
  if (!/\b(?:long[- ]term|days|weeks|months|years|follow[- ]up of \d+)\b/i.test(source)) {
    out.push('That the effect persists. No duration is described, so nothing is established beyond the period studied.');
  }
  if (!stats.hasStats) {
    out.push('That the difference reported is larger than measurement noise, since no inferential statistics appear here.');
  }
  if (/\b(?:surrogate|biomarker|levels? of|concentrations? of|expression of|in vitro)\b/i.test(source)) {
    out.push('That moving this marker changes anything a person would notice. A biomarker is a proxy until an outcome trial says otherwise.');
  }
  out.push(`That anything here transfers to a different population, dose, route or duration than the one studied. This is ${tierInfo.label.toLowerCase()} evidence — confidence from it is capped at ${Math.round(tierInfo.ceiling * 100)}%.`);
  return out;
}

/**
 * Decode an abstract.
 *
 * @param {string} text The pasted abstract or paper text.
 * @returns {object} The decoded report.
 */
export function decode(text) {
  const source = String(text || '').trim();
  const words = source.split(/\s+/).filter(Boolean).length;
  if (words < 18) {
    return {
      ok: false,
      reason: 'Too short to decode. Paste the abstract — ideally including the methods and results sentences, since that is where the design and the numbers live.',
    };
  }

  const lines = sentences(source);
  const designReading = design(source);
  const populationReading = population(source);
  const sample = sampleSize(source);
  const stats = statistics(source);
  const hedge = hedging(source);
  const tierInfo = tier(designReading.tier);

  // What was studied: the first sentence stating an aim, else the opener.
  const aim = lines.find((line) => /\b(?:we (?:investigated|examined|assessed|evaluated|tested|aimed|sought)|the (?:aim|purpose|objective)|this study (?:examined|investigated|evaluated|assessed))\b/i.test(line))
    || lines[0] || source.slice(0, 240);

  // What was found: prefer sentences carrying numbers or comparison language.
  const found = lines.filter((line) => /\b(?:significant|increased?|decreased?|reduc(?:ed|tion)|improved?|higher|lower|versus|compared with|no difference|did not differ)\b/i.test(line)
    || /\d/.test(line)).slice(0, 4);

  return {
    ok: true,
    words,
    design: designReading,
    tier: tierInfo,
    population: populationReading,
    sample,
    stats,
    hedge,
    whatWasStudied: aim,
    whatWasFound: found.length ? found : [lines[lines.length - 1] || source.slice(0, 240)],
    limitations: lines.filter((line) => LIMIT_CUES.test(line)).slice(0, 4),
    inferredLimitations: inferredLimits({ designReading, populationReading, sample, stats }),
    doesNotProve: notProven({ designReading, populationReading, sample, stats, tierInfo, source }),
    ceiling: tierInfo.ceiling,
  };
}

/**
 * A one-line grading of a decoded paper, for lists and cards.
 *
 * @param {object} report The result of {@link decode}.
 * @returns {string} One line.
 */
export function headline(report) {
  if (!report.ok) return report.reason;
  const n = report.sample.n ? `n=${report.sample.n}` : 'sample not stated';
  return `${report.design.label} · ${report.population.label} · ${n} · ${report.tier.label}`;
}

/** Re-exported so the UI can render tier chips without a second import. */
export { TIERS };

/**
 * The Peptide Intelligence Engine.
 *
 * Two jobs. First, retrieval: turn a plain-language question into the parts of
 * the corpus that answer it, ranked. Second, the dossier: assemble those parts
 * into the eight fixed sections the platform always answers in, so that every
 * compound is presented in the same order with the same headings and nothing
 * gets a friendlier layout because it is more popular.
 *
 * The section order is deliberate. Human evidence comes before preclinical
 * evidence, and uncertainties come before regulatory status, because that is
 * the order a careful reader needs rather than the order a marketer would pick.
 *
 * @module astra/engine
 */

import {
  GOALS, PEPTIDES, STACKS, SYSTEMS, allStudies, claimStudies, findAny, findPeptide, findStack, pubmedUrl,
} from './data/peptides.js';
import { band, scoreEvidence, tier, tierMix } from './evidence.js';

/** Words carrying no retrieval signal. */
const STOP = new Set(`a about actually all also am an and any anything are around as at be because been before being
but by can could did do does doing done for from get give go had has have how i if in into is it its just know like
make many me more most much my need no not now of on one only or other our out over really said same say see should
show so some such take tell than that the their them then there these they thing think this those to too us use very
want was way we well were what when where which who why will with within would you your`.split(/\s+/));

/**
 * Split text into comparable tokens.
 *
 * Folds case, strips punctuation, drops stop words, and reduces simple plurals
 * so "peptides" matches "peptide" and "studies" matches "study".
 *
 * @param {string} text Input.
 * @returns {string[]} Tokens.
 */
export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+\-\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
      if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
      return word;
    })
    .filter((word) => word.length > 1 && !STOP.has(word));
}

/**
 * The searchable index.
 *
 * Every compound, stack, claim, mechanism and study becomes one document with
 * a weight, so a question can land on the specific study that answers it
 * rather than only on the compound that owns it.
 *
 * @returns {Array<object>} Index documents.
 */
export function buildIndex() {
  const docs = [];
  for (const peptide of PEPTIDES) {
    // A compound's own document has to summarise everything filed under it —
    // its mechanisms and claims included — or a question phrased in mechanism
    // words lands on a stack that happens to name the compound instead.
    docs.push({
      kind: 'peptide',
      id: peptide.id,
      peptide: peptide.id,
      title: peptide.name,
      weight: 1.6,
      text: [
        peptide.name, peptide.full, ...(peptide.aka || []), peptide.klass, peptide.tagline, peptide.summary,
        ...peptide.goals, ...peptide.systems,
        ...peptide.mechanisms.map((mechanism) => `${mechanism.title} ${mechanism.detail}`),
        ...peptide.claims.map((claim) => claim.text),
      ].join(' '),
    });
    for (const mechanism of peptide.mechanisms) {
      docs.push({
        kind: 'mechanism', id: `${peptide.id}/${mechanism.id}`, peptide: peptide.id,
        title: `${peptide.name} — ${mechanism.title}`, weight: 1,
        text: `${peptide.name} ${mechanism.title} ${mechanism.detail}`,
      });
    }
    for (const claim of peptide.claims) {
      docs.push({
        kind: 'claim', id: `${peptide.id}/${claim.id}`, peptide: peptide.id,
        title: `${peptide.name} — ${claim.text}`, weight: 1.2,
        text: `${peptide.name} ${claim.text} ${claim.note || ''}`,
      });
    }
    for (const study of peptide.studies) {
      docs.push({
        kind: 'study', id: study.id, peptide: peptide.id,
        title: study.title, weight: 1.1,
        text: `${peptide.name} ${study.title} ${study.design} ${study.population} ${study.finding} ${study.limitation}`,
      });
    }
  }
  for (const stack of STACKS) {
    docs.push({
      kind: 'stack', id: stack.id, peptide: stack.id, title: stack.name, weight: 1.4,
      text: [stack.name, stack.full, stack.tagline, stack.summary, stack.rationale, ...stack.goals].join(' '),
    });
  }
  for (const doc of docs) doc.tokens = tokenize(doc.text);
  return docs;
}

const INDEX = buildIndex();

/** Inverse document frequency across the index, computed once. */
const IDF = (() => {
  const counts = new Map();
  for (const doc of INDEX) {
    for (const token of new Set(doc.tokens)) counts.set(token, (counts.get(token) || 0) + 1);
  }
  const idf = new Map();
  for (const [token, count] of counts) idf.set(token, Math.log(1 + INDEX.length / count));
  return idf;
})();

/**
 * Search the corpus.
 *
 * @param {string} query Plain-language question.
 * @param {number} [limit] Maximum results.
 * @returns {Array<{ doc: object, score: number }>} Ranked hits.
 */
export function search(query, limit = 8) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const wanted = new Set(tokens);
  const results = [];
  for (const doc of INDEX) {
    let score = 0;
    const seen = new Set();
    for (const token of doc.tokens) {
      if (!wanted.has(token) || seen.has(token)) continue;
      seen.add(token);
      score += IDF.get(token) || 0.5;
    }
    if (!score) continue;
    // Coverage matters more than raw hits: a document matching four of four
    // query terms beats one matching four of forty.
    const coverage = seen.size / wanted.size;
    results.push({ doc, score: score * doc.weight * (0.55 + 0.45 * coverage) });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Identify a compound the question actually names.
 *
 * Name, id, alias and class-word matching only — no retrieval fallback, so a
 * question that mentions no compound resolves to nothing rather than to
 * whatever the index happened to rank first.
 *
 * @param {string} query The question.
 * @returns {object|null} A peptide or stack record.
 */
export function resolveNamed(query) {
  const text = String(query || '').toLowerCase();
  for (const entry of [...PEPTIDES, ...STACKS]) {
    const names = [entry.name, entry.id, ...(entry.aka || [])].map((name) => String(name).toLowerCase());
    if (names.some((name) => text.includes(name))) return entry;
  }
  // Class words map to the class exemplar.
  if (/\bglp[\s-]?1\b|\bincretin\b/.test(text)) return findPeptide('semaglutide');
  if (/\bcopper peptide\b/.test(text)) return findPeptide('ghk-cu');
  if (/\bthymosin\b/.test(text)) return findPeptide('tb-500');
  return null;
}

/**
 * Identify which compound a question is about, falling back to retrieval.
 *
 * @param {string} query The question.
 * @returns {object|null} A peptide or stack record.
 */
export function resolveSubject(query) {
  const named = resolveNamed(query);
  if (named) return named;
  const [top] = search(query, 1);
  return top ? findAny(top.doc.peptide) : null;
}

/**
 * The evidence reading for any entry — compound or stack.
 *
 * This is the single place the stack rule lives, and every surface that shows a
 * confidence number must come through here. Pooling a stack's members' studies
 * would make a combination look *better* than its parts, which is exactly
 * backwards: an unstudied combination is bounded below by its weakest member,
 * then penalised again for an interaction surface nobody has measured.
 *
 * @param {object|string} subject A peptide record, stack record, or id.
 * @returns {object} A reading, with `band` always consistent with `score`.
 */
export function entryReading(subject) {
  const entry = typeof subject === 'string' ? findAny(subject) : subject;
  if (!entry) return scoreEvidence([]);
  if (!entry.members) return scoreEvidence(entry.studies);

  const members = entry.members.map((id) => findPeptide(id)).filter(Boolean);
  const readings = members.map((member) => scoreEvidence(member.studies));
  const weakest = readings.reduce((acc, reading) => (reading.score < acc.score ? reading : acc), readings[0] || scoreEvidence([]));
  const score = Number((weakest.score * STACK_PENALTY).toFixed(3));
  return {
    ...weakest,
    score,
    band: band(score),
    reasons: [
      `No study of this combination exists, so its confidence is bounded by its weakest component.`,
      ...weakest.reasons,
    ],
  };
}

/**
 * What an unstudied combination costs on top of its weakest member.
 *
 * Four unapproved compounds with no pharmacokinetic data for any pairing is a
 * larger unknown than any one of them alone, and the number says so.
 */
const STACK_PENALTY = 0.7;

/**
 * The eight sections, in the order the platform always uses.
 */
export const SECTIONS = [
  { n: '01', id: 'what', title: 'What it is' },
  { n: '02', id: 'mechanism', title: 'Proposed mechanism' },
  { n: '03', id: 'human', title: 'Human evidence' },
  { n: '04', id: 'preclinical', title: 'Preclinical evidence' },
  { n: '05', id: 'active', title: 'Active research' },
  { n: '06', id: 'uncertainties', title: 'Known uncertainties' },
  { n: '07', id: 'regulatory', title: 'Regulatory considerations' },
  { n: '08', id: 'sources', title: 'Sources' },
];

/**
 * Build the dossier for a compound.
 *
 * @param {string|object} subject A peptide id, stack id, or record.
 * @returns {object|null} The dossier, or null if the subject is unknown.
 */
export function dossier(subject) {
  const entry = typeof subject === 'string' ? findAny(subject) : subject;
  if (!entry) return null;
  if (entry.members) return stackDossier(entry);

  const human = entry.studies.filter((study) => tier(study.tier).rank <= 3);
  const preclinical = entry.studies.filter((study) => tier(study.tier).rank >= 4 && tier(study.tier).rank <= 5);
  const reading = scoreEvidence(entry.studies);

  const claims = entry.claims.map((claim) => {
    const cited = claimStudies(entry, claim);
    const claimReading = scoreEvidence(cited.length ? cited : [{ tier: claim.tier, n: 0 }]);
    return { ...claim, studies: cited, reading: claimReading, tierInfo: tier(claim.tier) };
  });

  return {
    kind: 'peptide',
    entry,
    reading,
    claims,
    mix: tierMix(entry.studies),
    sections: {
      what: {
        body: entry.summary,
        facts: [
          ['Class', entry.klass],
          ['Also called', (entry.aka || []).join(', ') || '—'],
          ['Body systems', entry.systems.map((id) => SYSTEMS.find((s) => s.id === id)?.label || id).join(', ')],
          ['Evidence ceiling', `${reading.best.label} — confidence capped at ${Math.round(reading.best.ceiling * 100)}%`],
        ],
      },
      mechanism: {
        body: entry.mechanisms.length
          ? 'Proposed routes of action, each carrying the evidence tier it was demonstrated at. A mechanism is a hypothesis about how something could work; it is not evidence that it does.'
          : 'No mechanism has been characterised.',
        items: entry.mechanisms.map((mechanism) => ({ ...mechanism, tierInfo: tier(mechanism.tier) })),
      },
      human: {
        body: human.length
          ? `${human.length} human ${human.length === 1 ? 'study' : 'studies'} in the corpus. Read the limitation on each one — it is usually the part that decides what the study can be used for.`
          : 'No human study exists in this corpus for this compound. Everything below is animal, cell or mechanism, and no amount of it substitutes for a trial in people.',
        studies: human,
      },
      preclinical: {
        body: preclinical.length
          ? 'Animal and cell work. Useful for generating hypotheses and for understanding mechanism; historically a poor predictor of human results.'
          : 'No preclinical studies are catalogued here.',
        studies: preclinical,
      },
      active: {
        body: activeResearchNote(entry),
        items: entry.timeline.slice(-3).reverse(),
      },
      uncertainties: { body: 'What this compound does not have settled.', items: entry.uncertainties },
      regulatory: {
        body: entry.regulatory.headline,
        detail: entry.regulatory.detail,
        sport: entry.regulatory.sport,
        status: entry.regulatory.status,
        reported: entry.reported,
      },
      sources: {
        body: 'Every study cited above, with a live literature search rather than a link that can rot. Verify before republishing.',
        studies: entry.studies.map((study) => ({ ...study, url: pubmedUrl(study) })),
      },
    },
  };
}

/**
 * Build the dossier for a stack.
 *
 * A stack's confidence is bounded by its weakest member, which is the whole
 * point of giving stacks their own path through the engine.
 *
 * @param {object} stack The stack record.
 * @returns {object} The dossier.
 */
function stackDossier(stack) {
  const members = stack.members.map((id) => findPeptide(id)).filter(Boolean);
  const readings = members.map((member) => ({ member, reading: scoreEvidence(member.studies) }));
  const weakest = readings.reduce((acc, item) => (item.reading.score < acc.reading.score ? item : acc), readings[0]);
  const reading = entryReading(stack);

  return {
    kind: 'stack',
    entry: stack,
    members,
    readings,
    weakest,
    reading,
    sections: {
      what: {
        body: stack.summary,
        facts: [
          ['Components', members.map((member) => member.name).join(' + ')],
          ['Studies of the combination', '0'],
          ['Confidence bound', `${weakest.member.name} is the weakest link at ${Math.round(weakest.reading.score * 100)}%`],
        ],
      },
      mechanism: { body: stack.rationale, items: [] },
      human: { body: 'No human study of this combination exists. The members are listed below with their own evidence.', studies: [] },
      preclinical: { body: 'No preclinical study of this combination exists either.', studies: [] },
      active: { body: stack.evidenceNote, items: [] },
      uncertainties: { body: 'What combining compounds costs you, on top of what each one already lacks.', items: stack.uncertainties },
      regulatory: {
        body: 'Each component carries its own regulatory status; the strictest one governs the combination.',
        detail: members.map((member) => `${member.name}: ${member.regulatory.headline}`).join(' '),
        sport: 'Assume prohibited in tested sport unless every component is cleared.',
        status: 'not-approved',
        reported: null,
      },
      sources: { body: 'The combination has no literature. These are the members’ studies.', studies: members.flatMap((member) => member.studies.map((study) => ({ ...study, url: pubmedUrl(study) }))) },
    },
  };
}

/**
 * A sentence describing where a compound's research currently stands.
 *
 * @param {object} entry A peptide record.
 * @returns {string} The note.
 */
function activeResearchNote(entry) {
  const latest = entry.timeline[entry.timeline.length - 1];
  const humanCount = entry.studies.filter((study) => tier(study.tier).rank <= 3).length;
  if (entry.regulatory.status === 'approved') {
    return `Active clinical programme. The literature is large and growing, and the open questions are about duration, discontinuation and population rather than whether the compound does anything. Most recent milestone in this corpus: ${latest.year}, ${latest.label.toLowerCase()}.`;
  }
  if (!humanCount) {
    return `No registered human programme is visible in this corpus. Interest is running well ahead of the research — the most recent milestone here is cultural rather than clinical: ${latest.year}, ${latest.label.toLowerCase()}. Watch the Research Radar for anything that changes that.`;
  }
  return `Human work exists but is not advancing quickly. Most recent milestone in this corpus: ${latest.year}, ${latest.label.toLowerCase()}.`;
}

/**
 * Rank compounds against a reader's stated interests.
 *
 * @param {string[]} goals Selected goal ids.
 * @returns {Array<{ entry: object, score: number, reading: object }>} Ranked compounds.
 */
export function rankForGoals(goals) {
  const wanted = new Set(goals && goals.length ? goals : GOALS.map((goal) => goal.id));
  return PEPTIDES.map((entry) => {
    const overlap = entry.goals.filter((goal) => wanted.has(goal)).length;
    const reading = scoreEvidence(entry.studies);
    // Relevance first, then evidence — a reader interested in recovery should
    // see the recovery compounds, ordered so the best-supported leads.
    return { entry, reading, score: overlap * 2 + reading.score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
}

/**
 * The strongest and weakest things in the corpus, for the intro and the
 * executive dashboard.
 *
 * @returns {{ strongest: object[], weakest: object[], humanShare: number }} A summary.
 */
export function corpusVerdict() {
  const scored = PEPTIDES.map((entry) => ({ entry, reading: scoreEvidence(entry.studies) }))
    .sort((a, b) => b.reading.score - a.reading.score);
  const studies = allStudies();
  const humanShare = studies.filter((study) => tier(study.tier).rank <= 3).length / studies.length;
  return { strongest: scored.slice(0, 3), weakest: scored.slice(-3).reverse(), humanShare };
}

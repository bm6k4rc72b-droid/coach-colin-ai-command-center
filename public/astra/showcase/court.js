/**
 * Courtroom Sector 7 — the debate arena as a trial, with Colin on the bench.
 *
 * A motion goes on trial. The Defence argues FOR it, the Prosecution
 * AGAINST, three rounds each. The motion's compound brings its own studies
 * into court as lettered exhibits, and citing one is worth what its design
 * is worth: a randomised trial carries weight, a rat study rather less, and
 * an exhibit that points the other way hurts whoever leans on it. Either
 * side may object to the other's last argument; the judge sustains an
 * objection only when the argument really does what it is accused of. A
 * jury of twelve — the room's votes first, the rest following the judge's
 * scorecard — decides with him, and the library sentences the motion.
 *
 * Pure logic: no DOM, no three.js, so it can be tested on its own.
 *
 * @module astra/showcase/court
 */

import { TIERS } from '../js/evidence.js';
import { CUES, motionLean, scoreArgument } from './wing.js';

const tierOf = (id) => TIERS.find((t) => t.id === id) || TIERS[TIERS.length - 1];
const fallacy = (label) => CUES.fallacy.find(([, l]) => l === label)[0];
const evidenceCue = (text) => CUES.evidence.some(([re]) => re.test(text));
const LIMITATION = CUES.evidence.find(([, l]) => l === 'Weighs a limitation')[0];

export const SIDES = { a: { role: 'Defence', stance: 'FOR' }, b: { role: 'Prosecution', stance: 'AGAINST' } };
export const JURY_SIZE = 12;
export const ROUNDS = 3;

/**
 * Objections either side may raise against the other's last argument. Each
 * carries the test the judge applies: sustained only if the argument does
 * what it is accused of.
 */
export const OBJECTIONS = [
  { id: 'hearsay', label: 'Hearsay', gloss: 'A friend’s story offered as evidence', test: (text) => fallacy('Anecdote').test(text) || fallacy('Unnamed authority').test(text) },
  { id: 'speculation', label: 'Speculation', gloss: 'A possibility dressed as a finding', test: (text) => /\b(could|might|may well|probably|presumably|surely|potentially|imagine|i (think|believe|reckon|bet|feel))\b/i.test(text) && !evidenceCue(text) },
  { id: 'overstatement', label: 'Overstatement', gloss: 'An absolute the evidence cannot carry', test: (text) => fallacy('Absolute claim').test(text) || fallacy('Appeal to popularity').test(text) },
  { id: 'relevance', label: 'Relevance', gloss: 'Nothing to do with the motion or its exhibits', test: (text, kase) => !evidenceCue(text) && !citedLetters(text, kase).length && !(kase.subject && new RegExp(kase.subject.name.split(/[\s(]/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)) },
  { id: 'ad-hominem', label: 'Ad hominem', gloss: 'Attacks the person, not the argument', test: (text) => fallacy('Ad hominem').test(text) || fallacy('Conspiracy').test(text) },
];

/** Exhibit letters an argument names ("Exhibit B", "exhibits A and C"). */
export function citedLetters(text, kase) {
  const letters = new Set();
  for (const m of String(text || '').matchAll(/\bexhibits?\s+([A-F](?:\s*(?:,|and|&)\s*[A-F])*)\b/gi)) {
    for (const l of m[1].match(/\b[a-f]\b/gi)) letters.add(l.toUpperCase());
  }
  return [...letters].filter((l) => kase.exhibits.some((e) => e.letter === l));
}

/**
 * Open a case on a motion.
 *
 * @param {{ motion: string, names?: { a: string, b: string }, at?: number, seed?: number }} options The motion and the parties.
 * @returns {object} The case.
 */
export function openCase({ motion, names = { a: 'Defence', b: 'Prosecution' }, at = 0, seed = Date.now() }) {
  const lean = motionLean(motion);
  const analysis = lean.analysis;
  const subject = analysis.ok ? analysis.subject : null;
  // Exhibits: the studies the claim analysis matched first (for, then
  // against), then the compound's other studies, up to six.
  const ordered = [
    ...(analysis.supporting || []).flatMap((item) => item.studies || []),
    ...(analysis.contradicting || []).map((item) => item.study).filter(Boolean),
    ...(subject?.studies || []),
  ];
  const seen = new Set();
  const exhibits = [];
  for (const study of ordered) {
    if (seen.has(study.id) || exhibits.length >= 6) continue;
    seen.add(study.id);
    const tier = tierOf(study.tier);
    exhibits.push({
      letter: 'ABCDEF'[exhibits.length],
      id: study.id,
      title: study.title,
      year: study.year,
      journal: study.journal,
      design: study.design,
      population: study.population,
      n: study.n,
      finding: study.finding,
      limitation: study.limitation,
      direction: study.direction ?? 1,
      tier: tier.id,
      tierLabel: tier.label,
      ceiling: tier.ceiling,
    });
  }
  const tag = (subject?.id || 'GEN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const kase = {
    number: `COLIN-${new Date(seed).getFullYear()}-${tag}-${String(Math.abs(seed) % 1000).padStart(3, '0')}`,
    motion,
    subject: subject ? { id: subject.id, name: subject.name } : null,
    level: analysis.ok ? analysis.verdict.level : 'unknown',
    lean: analysis.ok && subject ? analysis.verdict.headline : 'The library holds no graded verdict on this motion.',
    favoured: lean.favoured,
    exhibits,
    names: { a: names.a || 'Defence', b: names.b || 'Prosecution' },
    round: 1,
    turn: 'a',
    totals: { a: 0, b: 0 },
    audience: { a: 0, b: 0 },
    jury: Array(JURY_SIZE).fill(null),
    log: [],
    last: null,
    opened: at,
    gavelAt: at,
    objection: null,
    witness: null,
    closed: false,
    done: false,
    verdict: null,
  };
  record(kase, at, 'court', `Case ${kase.number} opened. Motion: “${motion}”. Defence: ${kase.names.a}. Prosecution: ${kase.names.b}.`);
  for (const e of exhibits) record(kase, at, 'exhibit', `Exhibit ${e.letter} entered: ${e.title} (${e.year}) — ${e.tierLabel}${e.direction < 0 ? ', points against' : ''}.`);
  return kase;
}

function record(kase, at, kind, text) {
  kase.log.push({ at: Math.max(0, at - kase.opened), kind, text });
}

const other = (side) => (side === 'a' ? 'b' : 'a');

/**
 * What citing an exhibit is worth to a side. A strong supportive study
 * helps the Defence in proportion to its tier's ceiling; the Prosecution
 * gains from contrary studies and from exposing weak ones, and loses for
 * leaning on a strong study that supports the motion unless it argues a
 * limitation.
 *
 * @returns {{ points: number, note: string }} The exhibit's contribution.
 */
export function exhibitValue(exhibit, side, text) {
  const weight = Math.round(exhibit.ceiling * 10);
  const tag = `Exhibit ${exhibit.letter} (${exhibit.tierLabel})`;
  if (side === 'a') {
    if (exhibit.direction < 0) return { points: -4, note: `${tag} cuts against the motion` };
    return { points: weight, note: `${tag} supports the motion` };
  }
  if (exhibit.direction < 0) return { points: weight + 2, note: `${tag} contradicts the motion` };
  if (exhibit.ceiling <= 0.45) return { points: Math.round((1 - exhibit.ceiling) * 6), note: `${tag} exposed as weak evidence` };
  if (LIMITATION.test(text)) return { points: 3, note: `Fair cross-examination of ${tag}` };
  return { points: -3, note: `${tag} supports the other side` };
}

/**
 * Hear one argument from whichever side's turn it is.
 *
 * @param {object} kase The case.
 * @param {string} text The argument.
 * @param {{ cited?: string[], at?: number }} [options] Exhibits cited by tapping, and the clock.
 * @returns {object|null} The judge's scoring, or null if out of turn or empty.
 */
export function argue(kase, text, { cited = [], at = 0 } = {}) {
  const said = String(text || '').trim();
  if (!said || kase.closed || kase.done) return null;
  const side = kase.turn;
  const base = scoreArgument(said, side === 'a' ? 'for' : 'against', { favoured: kase.favoured });
  const letters = [...new Set([...cited, ...citedLetters(said, kase)])];
  const exhibitNotes = [];
  let exhibitPoints = 0;
  for (const letter of letters) {
    const exhibit = kase.exhibits.find((e) => e.letter === letter);
    if (!exhibit) continue;
    const v = exhibitValue(exhibit, side, said);
    exhibitPoints += v.points;
    exhibitNotes.push(`${v.points >= 0 ? '+' : ''}${v.points} ${v.note}`);
  }
  exhibitPoints = Math.min(20, exhibitPoints);
  const points = Math.max(0, base.points + exhibitPoints);
  kase.totals[side] += points;
  // Fallacies are objected to by the bench itself, without waiting for counsel.
  const autoObjections = base.minus.filter((m) => !/^Too thin/.test(m));
  const result = { side, points, plus: base.plus, minus: base.minus, exhibits: exhibitNotes, letters, autoObjections };
  kase.last = { side, text: said, points, objected: false };
  record(kase, at, 'argument', `${SIDES[side].role} (${kase.names[side]}): “${said}” — ${points} pts${exhibitNotes.length ? ` · ${exhibitNotes.join(' · ')}` : ''}`);
  for (const o of autoObjections) record(kase, at, 'objection', `The bench objects: ${o}. Sustained.`);
  if (side === 'a') kase.turn = 'b';
  else { kase.turn = 'a'; kase.round += 1; }
  if (kase.round > ROUNDS) {
    kase.closed = true;
    record(kase, at, 'court', 'Closing arguments heard. The jury may retire.');
  }
  return result;
}

/**
 * Object to the other side's last argument.
 *
 * @param {object} kase The case.
 * @param {string} kind An OBJECTIONS id.
 * @param {{ at?: number }} [options] Clock.
 * @returns {{ ok: boolean, sustained?: boolean, objection?: object, by?: string, reason?: string }} The ruling.
 */
export function object(kase, kind, { at = 0 } = {}) {
  const objection = OBJECTIONS.find((o) => o.id === kind);
  const last = kase.last;
  if (!objection) return { ok: false, reason: 'Unknown objection.' };
  if (!last) return { ok: false, reason: 'Nothing has been argued yet.' };
  if (last.objected) return { ok: false, reason: 'That argument has already been objected to.' };
  if (kase.done) return { ok: false, reason: 'The court has risen.' };
  const by = other(last.side);
  const sustained = Boolean(objection.test(last.text, kase));
  if (sustained) {
    kase.totals[last.side] = Math.max(0, kase.totals[last.side] - 5);
    kase.totals[by] += 5;
  } else {
    kase.totals[by] = Math.max(0, kase.totals[by] - 3);
  }
  last.objected = true;
  kase.objection = { kind, label: objection.label, sustained, at, by };
  record(kase, at, 'objection', `${SIDES[by].role} objects: ${objection.label}. ${sustained ? 'Sustained (+5 / −5).' : 'Overruled (−3).'}`);
  return { ok: true, sustained, objection, by };
}

/**
 * Call an exhibit to the witness stand: its finding under direct
 * examination, its limitation under cross.
 *
 * @returns {object|null} The exhibit, or null.
 */
export function callWitness(kase, letter, { at = 0 } = {}) {
  const exhibit = kase.exhibits.find((e) => e.letter === letter);
  if (!exhibit) return null;
  kase.witness = { letter, at };
  record(kase, at, 'witness', `Exhibit ${letter} takes the stand. Direct: ${exhibit.finding} Cross: ${exhibit.limitation}`);
  return exhibit;
}

/** A juror from the room votes. Returns false once all twelve seats are taken by votes. */
export function vote(kase, side) {
  if (kase.done) return false;
  const total = kase.audience.a + kase.audience.b;
  kase.audience[side] += 1;
  kase.jury = seatJury(kase);
  return total + 1 <= JURY_SIZE;
}

/**
 * Seat the jury: the room's votes first (scaled to twelve if more people
 * voted), the empty seats following the judge's scorecard.
 *
 * @returns {Array<'a'|'b'|null>} Twelve seats.
 */
export function seatJury(kase, { final = false } = {}) {
  const { a, b } = kase.audience;
  let seatsA = a;
  let seatsB = b;
  if (a + b > JURY_SIZE) {
    seatsA = Math.round((JURY_SIZE * a) / (a + b));
    seatsB = JURY_SIZE - seatsA;
  }
  const seats = [...Array(seatsA).fill('a'), ...Array(seatsB).fill('b')];
  if (final) {
    const empty = JURY_SIZE - seats.length;
    const sum = kase.totals.a + kase.totals.b;
    const share = sum ? kase.totals.a / sum : 0.5;
    const toA = Math.round(empty * share);
    seats.push(...Array(toA).fill('a'), ...Array(empty - toA).fill('b'));
  }
  while (seats.length < JURY_SIZE) seats.push(null);
  return seats;
}

/**
 * The verdict: the judge's scorecard 70%, the jury 30%.
 *
 * @returns {{ winner: 'a'|'b'|null, score: { a: number, b: number }, jury: { a: number, b: number }, level: string }} The verdict.
 */
export function deliberate(kase, { at = 0 } = {}) {
  kase.jury = seatJury(kase, { final: true });
  const jury = { a: kase.jury.filter((s) => s === 'a').length, b: kase.jury.filter((s) => s === 'b').length };
  const sum = kase.totals.a + kase.totals.b;
  const judge = (k) => (sum ? kase.totals[k] / sum : 0.5);
  const score = { a: 0.7 * judge('a') + 0.3 * (jury.a / JURY_SIZE), b: 0.7 * judge('b') + 0.3 * (jury.b / JURY_SIZE) };
  const winner = Math.abs(score.a - score.b) < 0.02 ? null : score.a > score.b ? 'a' : 'b';
  kase.verdict = { winner, score, jury, level: kase.level, at };
  kase.done = true;
  kase.closed = true;
  kase.gavelAt = at;
  record(kase, at, 'verdict', `Jury ${jury.a}–${jury.b}. ${winner ? `Verdict for the ${SIDES[winner].role} (${kase.names[winner]}), ${Math.round(score[winner] * 100)}–${Math.round(score[other(winner)] * 100)}.` : 'No majority: a draw.'} The library on the motion: ${kase.lean.replace(/\.?$/, '.')} Sentence: ${SENTENCES[kase.level] || SENTENCES.unknown}`);
  return kase.verdict;
}

/**
 * The court sentences the motion — never a person — according to what the
 * graded evidence says about it, whoever won the argument.
 */
export const SENTENCES = {
  contradicted: 'The claim is sentenced to life in the retraction archive, without parole.',
  unsupported: 'The claim is remanded to a rodent facility until it can produce a human trial.',
  overstated: 'A suspended sentence: the claim may return once it drops the word “proven”.',
  mixed: 'Bail granted, on condition the claim reports to a replication study every week.',
  supported: 'Case dismissed. The claim leaves court without a stain on its methods section.',
  unknown: 'Mistrial: the court cannot find the compound in its records.',
};

const stamp = (ms) => {
  const s = Math.floor(ms);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** The court record as plain text, for download. */
export function transcript(kase) {
  return [
    'COLIN BIOMEDICAL TECHNOLOGIES — COURTROOM SECTOR 7 · JUDICIAL DIVISION',
    `Case No. ${kase.number}`,
    `Motion: ${kase.motion}`,
    `Defence (FOR): ${kase.names.a} · Prosecution (AGAINST): ${kase.names.b}`,
    '',
    ...kase.log.map((entry) => `[${stamp(entry.at)}] ${entry.text}`),
    '',
    `Scorecard: Defence ${kase.totals.a} · Prosecution ${kase.totals.b}`,
    'An educational debate game. The court rules on arguments, not on medicine: no diagnosis, no dosing, no personal advice.',
  ].join('\n');
}

/**
 * Claim analysis: the myth detector, the social-media fact checker and the
 * marketing compliance guardian.
 *
 * All three are the same engine wearing different hats. A sentence comes in;
 * the engine works out which compound it is about, what it asserts, whether the
 * corpus supports it, what contradicts it, and what regulatory language risk it
 * carries. The myth detector shows the reader the evidence chain; the fact
 * checker shows a marketer whether a line is publishable; the guardian shows
 * which words are the problem and offers a compliant rewrite.
 *
 * The compliance rules encode the ordinary regulatory line for a wellness
 * business: you may describe research, and you may not promise outcomes,
 * diagnose, treat, or imply a drug approval that does not exist. It is a
 * drafting aid, not legal advice, and the UI says so.
 *
 * @module astra/claims
 */

import { PEPTIDES, STACKS, findAny } from './data/peptides.js';
import { band, scoreEvidence, tier } from './evidence.js';
import { resolveNamed, search } from './engine.js';

/**
 * Regulatory language risks, worst first.
 *
 * Each rule names the pattern, why it is a problem, and how to say the same
 * thing without the problem — the rewrite is the part that makes the tool
 * usable rather than merely discouraging.
 */
export const COMPLIANCE_RULES = [
  {
    id: 'disease-treatment',
    severity: 'block',
    label: 'Treatment or cure claim',
    test: /\b(cures?|treats?|treatment for|heals?|reverses?|eliminates?|fixes)\s+(?!inflammation\b)([a-z]+(?:\s+[a-z]+)?)\b|\b(cure|remedy) for\b/i,
    why: 'Stating that a product treats, cures or reverses a disease is a drug claim. Only an approved drug may make one, and only for its approved indication.',
    fix: 'Describe the research instead: "studies in [population] examined whether it affects [outcome]". Name the population and the design.',
  },
  {
    id: 'diagnosis',
    severity: 'block',
    label: 'Diagnostic or prescriptive language',
    test: /\b(you (?:need|should take|should use)|the right (?:dose|protocol) for you|we recommend (?:you )?(?:take|start|dose)|prescribe[ds]?|your protocol)\b/i,
    why: 'Telling an individual what to take is practising medicine. It also removes the clinician who should be assessing the person.',
    fix: 'Move to education: "here is what the research examined, and here are the questions to take to a clinician".',
  },
  {
    id: 'guarantee',
    severity: 'block',
    label: 'Guaranteed outcome',
    test: /\b(guarantee[ds]?|guaranteed results|100%|always works|will (?:definitely )?(?:give|get) you|risk[- ]free|no side effects|completely safe)\b/i,
    why: 'A guarantee of results — or of safety — cannot be supported by any evidence base, and is the language regulators look for first.',
    fix: 'Replace certainty with the actual finding and its bounds: what percentage of participants, over what period, in what trial.',
  },
  {
    id: 'unapproved-as-approved',
    severity: 'block',
    label: 'Implies approval that does not exist',
    test: /\b(FDA[- ]approved|clinically proven|doctor[- ]approved|medically approved|pharmaceutical grade|prescription strength)\b/i,
    why: 'Most compounds discussed here are not approved for anything. "Clinically proven" and "pharmaceutical grade" imply a regulatory status that does not exist.',
    fix: 'State the real status: "not approved by the FDA for any indication; studied in [design] research".',
  },
  {
    id: 'superlative',
    severity: 'warn',
    label: 'Unqualified superlative',
    test: /\b(the (?:best|most powerful|strongest|#1)|miracle|breakthrough|game[- ]?changer|revolutionary|unmatched|ultimate)\b/i,
    why: 'A superlative is an implied comparative claim, and comparative claims need head-to-head evidence that almost never exists here.',
    fix: 'Swap the superlative for the specific: what was measured, against what comparator, in which trial.',
  },
  {
    id: 'anecdote-as-evidence',
    severity: 'warn',
    label: 'Testimonial presented as evidence',
    test: /\b(my clients?|our (?:clients?|customers?|patients?) (?:report|see|get)|people are seeing|everyone who|thousands of (?:people|users))\b/i,
    why: 'Testimonials are the weakest tier of evidence and, when used to support a health claim, are treated by regulators as the claim itself.',
    fix: 'Keep the story, drop the implied proof, and attach the actual evidence tier alongside it.',
  },
  {
    id: 'dosing',
    severity: 'warn',
    label: 'Dosing instruction',
    test: /\b(\d+\s?(?:mg|mcg|iu)\b[^.]{0,40}\b(?:daily|per day|twice|weekly|before bed|on an empty stomach))|\b(?:take|inject|administer)\s+\d+/i,
    why: 'Publishing a dose reads as instruction even when framed as information, and no dose-finding trial exists for most of these compounds.',
    fix: 'If dosing must appear, attribute it — "the trial protocol used X" — and say plainly that it is not a recommendation.',
  },
  {
    id: 'comparative-drug',
    severity: 'warn',
    label: 'Comparison against a medicine',
    test: /\b(better than|as good as|instead of|replaces?|alternative to)\s+(?:[a-z]+\s+)?(?:ozempic|wegovy|semaglutide|steroids?|testosterone|surgery|medication|drugs?|antidepressants?)\b/i,
    why: 'Comparing an unapproved compound favourably against an approved medicine is both a comparative claim and an implied treatment claim.',
    fix: 'Compare evidence bases rather than products: "here is what has been tested in each, and at what tier".',
  },
  {
    id: 'urgency',
    severity: 'note',
    label: 'Pressure or scarcity framing',
    test: /\b(limited (?:time|stock)|act now|before it'?s banned|while supplies last|last chance|only \d+ left)\b/i,
    why: 'Scarcity pressure around a health product invites a decision made without a clinician, and reads badly to a regulator reviewing intent.',
    fix: 'Let the education carry the urgency. If a deadline is real, state what it actually is.',
  },
  {
    id: 'missing-context',
    severity: 'note',
    label: 'Research claim with no tier attached',
    test: /\b(studies show|research shows|science says|proven to|shown to|research suggests)\b/i,
    why: 'Not wrong, but incomplete: "studies show" hides whether the studies were in humans or in mice.',
    fix: 'Name the tier in the sentence: "in rodent studies…", "in one randomised human trial…".',
  },
];

/**
 * Run the compliance rules over a piece of copy.
 *
 * @param {string} text Marketing copy, caption or script.
 * @returns {{ findings: Array<object>, verdict: string, severity: string, score: number }} The report.
 */
export function complianceCheck(text) {
  const source = String(text || '');
  const findings = [];
  for (const rule of COMPLIANCE_RULES) {
    const match = source.match(rule.test);
    if (!match) continue;
    findings.push({
      id: rule.id,
      severity: rule.severity,
      label: rule.label,
      phrase: match[0].trim(),
      why: rule.why,
      fix: rule.fix,
    });
  }

  const blocks = findings.filter((finding) => finding.severity === 'block').length;
  const warns = findings.filter((finding) => finding.severity === 'warn').length;
  const notes = findings.filter((finding) => finding.severity === 'note').length;

  let severity = 'clear';
  let verdict = 'No regulatory language risks detected. That is not legal clearance — it means none of the patterns this tool knows about fired.';
  if (blocks) {
    severity = 'block';
    verdict = `Do not publish as written. ${blocks} ${blocks === 1 ? 'phrase reads' : 'phrases read'} as a drug, treatment or guarantee claim.`;
  } else if (warns) {
    severity = 'warn';
    verdict = `Rewrite before publishing. ${warns} ${warns === 1 ? 'phrase needs' : 'phrases need'} qualification to stay on the education side of the line.`;
  } else if (notes) {
    severity = 'note';
    verdict = 'Publishable with a small improvement — the claims would be stronger with their evidence tier attached.';
  }

  const score = Math.max(0, 1 - (blocks * 0.4 + warns * 0.18 + notes * 0.06));
  return { findings, verdict, severity, score: Number(score.toFixed(2)) };
}

/**
 * Rewrite copy into a compliant, evidence-attached version.
 *
 * The rewrite is deliberately conservative and mechanical: it strips the
 * offending constructions, attaches the tier, and hands the result back as a
 * draft. It is a starting point for a human, not a finished caption.
 *
 * @param {string} text Original copy.
 * @param {object} [analysis] A prior claim analysis, to attach the right tier.
 * @returns {string} The rewritten draft.
 */
export function compliantRewrite(text, analysis = null) {
  let out = String(text || '');
  const swaps = [
    [/\bclinically proven\b/gi, 'studied in clinical research'],
    [/\bFDA[- ]approved\b/gi, 'not FDA-approved'],
    [/\bpharmaceutical grade\b/gi, 'research-grade'],
    [/\bcures?\b/gi, 'has been studied in'],
    [/\btreats?\b/gi, 'has been studied in'],
    [/\bguaranteed?\b/gi, 'reported in research as'],
    [/\b100%\b/gi, 'in the trials reviewed,'],
    [/\bno side effects\b/gi, 'a side-effect profile that has not been fully characterised'],
    [/\bmiracle\b/gi, 'much-discussed'],
    [/\bbreakthrough\b/gi, 'notable'],
    [/\bthe best\b/gi, 'one of the most-studied'],
    [/\byou (?:need|should take)\b/gi, 'research has examined'],
    [/\bwill (?:give|get) you\b/gi, 'was associated in studies with'],
    [/\bstudies show\b/gi, analysis?.tierPhrase || 'studies in this area report'],
    [/\bresearch shows\b/gi, analysis?.tierPhrase || 'research in this area reports'],
  ];
  for (const [pattern, replacement] of swaps) out = out.replace(pattern, replacement);
  out = out.replace(/\s{2,}/g, ' ').trim();

  const tail = analysis && analysis.subject
    ? `\n\nEvidence level: ${analysis.reading.band.label.toLowerCase()} (${analysis.tierInfo.label}). ${analysis.subject.regulatory ? analysis.subject.regulatory.headline : ''} Educational information only — not medical advice, and not a recommendation to use anything.`
    : '\n\nEducational information only — not medical advice.';
  return out + tail;
}

/** Assertion patterns, used to work out what a claim is actually asserting. */
const ASSERTIONS = [
  { id: 'heals', test: /\b(heal|repair|regenerat|recover|fix)\w*\b/i, topic: 'tissue repair' },
  { id: 'inflammation', test: /\b(inflammat|swelling|anti[- ]?inflammatory)\w*\b/i, topic: 'inflammation' },
  { id: 'fat-loss', test: /\b(fat loss|lose (?:weight|fat)|burns? fat|weight loss|slim)\b/i, topic: 'fat loss' },
  { id: 'muscle', test: /\b(muscle|lean mass|strength|gains?|hypertroph)\w*\b/i, topic: 'muscle and strength' },
  { id: 'gut', test: /\b(gut|leaky gut|intestin|colitis|ibd|digest)\w*\b/i, topic: 'gut health' },
  { id: 'skin', test: /\b(skin|collagen|wrinkle|elastin|hair)\w*\b/i, topic: 'skin and hair' },
  { id: 'cognition', test: /\b(focus|memory|cognit|brain|nootropic|clarity|bdnf)\w*\b/i, topic: 'cognition' },
  { id: 'mood', test: /\b(anxiety|stress|mood|calm|depress)\w*\b/i, topic: 'mood and stress' },
  { id: 'gh', test: /\b(growth hormone|gh|igf|secretagogue)\b/i, topic: 'growth hormone axis' },
  { id: 'longevity', test: /\b(anti[- ]?aging|ageing|longevity|younger|reverse[sd]? aging)\b/i, topic: 'ageing' },
  { id: 'safety', test: /\b(safe|side effects?|harmless|toxic)\b/i, topic: 'safety' },
];

/**
 * Analyse a claim: what it says, what supports it, what contradicts it.
 *
 * This is the myth detector's engine and the fact checker's engine at once.
 *
 * @param {string} text The claim, as somebody wrote it.
 * @returns {object} The analysis.
 */
export function analyseClaim(text) {
  const source = String(text || '').trim();
  if (source.split(/\s+/).filter(Boolean).length < 3) {
    return { ok: false, reason: 'Paste a full claim — a sentence, a caption or an ad line. Three words is not enough to check.' };
  }

  // Only a compound the claim actually names. Attributing a stray claim to
  // whatever the index ranks first would let the detector "verify" a sentence
  // about something it has never heard of.
  const subject = resolveNamed(source);
  const assertions = ASSERTIONS.filter((assertion) => assertion.test.test(source));
  const compliance = complianceCheck(source);

  // Find the corpus claims closest to what was asserted.
  const hits = search(`${subject ? subject.name : ''} ${source}`, 6)
    .filter((hit) => hit.doc.kind === 'claim' || hit.doc.kind === 'study');

  const supporting = [];
  const contradicting = [];
  if (subject && subject.claims) {
    for (const claim of subject.claims) {
      const relevant = assertions.some((assertion) => assertion.test.test(claim.text))
        || hits.some((hit) => hit.doc.id === `${subject.id}/${claim.id}`);
      if (!relevant) continue;
      const cited = subject.studies.filter((study) => (claim.studies || []).includes(study.id));
      const record = { claim, studies: cited, tierInfo: tier(claim.tier) };
      // A corpus claim marked with a negative direction is the platform's own
      // counter-evidence, and it belongs on the other side of the ledger.
      if (claim.direction === -1 || /contradicted/i.test(claim.note || '')) contradicting.push(record);
      else supporting.push(record);
    }
    for (const study of subject.studies) {
      if (study.direction === -1) contradicting.push({ study, tierInfo: tier(study.tier) });
    }
  }

  const evidenceBase = supporting.flatMap((item) => item.studies);
  const reading = scoreEvidence(evidenceBase.length
    ? evidenceBase
    : supporting.map((item) => ({ tier: item.claim.tier, n: 0 })));

  const tierInfo = supporting.length
    ? supporting.reduce((acc, item) => (item.tierInfo.rank < acc.rank ? item.tierInfo : acc), supporting[0].tierInfo)
    : tier('anecdotal');

  const verdict = claimVerdict({ subject, supporting, contradicting, reading, compliance, assertions });

  return {
    ok: true,
    text: source,
    subject,
    assertions,
    supporting,
    contradicting,
    reading: supporting.length ? reading : { ...scoreEvidence([]), band: band(0) },
    tierInfo,
    tierPhrase: tierPhrase(tierInfo),
    compliance,
    verdict,
  };
}

/**
 * Phrase a tier the way it should appear in a caption.
 *
 * @param {object} tierInfo A tier record.
 * @returns {string} A caption-ready phrase.
 */
export function tierPhrase(tierInfo) {
  switch (tierInfo.id) {
    case 'human-rct': return 'in randomised human trials';
    case 'human-trial': return 'in early human trials';
    case 'human-observational': return 'in observational human studies';
    case 'animal': return 'in animal studies';
    case 'invitro': return 'in cell studies';
    case 'mechanistic': return 'as a proposed mechanism, not a demonstrated result';
    default: return 'in anecdotal reports rather than in research';
  }
}

/**
 * Compose the verdict paragraph.
 *
 * @param {object} parts Analysis parts.
 * @returns {{ level: string, headline: string, body: string }} The verdict.
 */
function claimVerdict({ subject, supporting, contradicting, reading, compliance, assertions }) {
  if (!subject) {
    return {
      level: 'unknown',
      headline: 'No compound identified',
      body: 'This claim does not name a compound the corpus covers, so there is nothing to check it against. Name the compound and try again.',
    };
  }
  const topic = assertions.length ? assertions.map((a) => a.topic).join(', ') : 'an unspecified outcome';
  if (contradicting.length && !supporting.length) {
    return {
      level: 'contradicted',
      headline: 'Contradicted by the evidence',
      body: `The claim concerns ${topic} for ${subject.name}, and the corpus holds evidence pointing the other way. This is the strongest negative reading the platform gives: it is not that support is missing, it is that a study looked and did not find it.`,
    };
  }
  if (!supporting.length) {
    return {
      level: 'unsupported',
      headline: 'No supporting evidence found',
      body: `${subject.name} has nothing in this corpus addressing ${topic}. Absence of evidence here is exactly that — not proof the claim is false, but no basis for repeating it as fact.`,
    };
  }
  const strongest = supporting.reduce((acc, item) => (item.tierInfo.rank < acc.tierInfo.rank ? item : acc), supporting[0]);
  if (strongest.tierInfo.rank <= 2) {
    return {
      level: contradicting.length ? 'mixed' : 'supported',
      headline: contradicting.length ? 'Supported, with contradicting evidence' : 'Supported by human evidence',
      body: `${subject.name} has ${strongest.tierInfo.label.toLowerCase()} evidence relating to ${topic}: ${strongest.claim.text.toLowerCase()}. ${strongest.claim.note || ''}${contradicting.length ? ` There are also ${contradicting.length} findings in the corpus pointing the other way; a fair version of this claim mentions them.` : ''}`,
    };
  }
  return {
    level: 'overstated',
    headline: `Overstated — this is ${strongest.tierInfo.label.toLowerCase()} evidence`,
    body: `The underlying research on ${subject.name} and ${topic} exists, but it sits at the ${strongest.tierInfo.label.toLowerCase()} tier. ${strongest.tierInfo.caveat} The claim as written implies a level of certainty the evidence does not carry${compliance.severity === 'block' ? ', and it also carries language a regulator would read as a treatment claim' : ''}.`,
  };
}

/**
 * The fact-checker view: is this publishable, and what has to change.
 *
 * @param {string} text Draft caption, script or ad.
 * @returns {object} The publish decision.
 */
export function factCheck(text) {
  const analysis = analyseClaim(text);
  if (!analysis.ok) return analysis;
  const blockers = analysis.compliance.findings.filter((finding) => finding.severity === 'block');
  const publishable = !blockers.length && !['contradicted', 'unsupported'].includes(analysis.verdict.level);
  return {
    ...analysis,
    publishable,
    blockers,
    decision: publishable
      ? (analysis.compliance.severity === 'clear' ? 'APPROVED' : 'APPROVED WITH EDITS')
      : 'HOLD',
    reason: publishable
      ? 'The claim maps to evidence in the library and carries no blocking language. Attach the tier before publishing.'
      : blockers.length
        ? 'Blocked on language, not on science: the wording makes a claim only an approved drug may make.'
        : 'Blocked on evidence: the library does not support this claim at any tier.',
    rewrite: compliantRewrite(text, analysis),
  };
}

/**
 * Every compound the corpus can check a claim against, for the UI's hints.
 *
 * @returns {string[]} Compound names.
 */
export function checkableSubjects() {
  return [...PEPTIDES, ...STACKS].map((entry) => entry.name);
}

/**
 * Resolve a compound by name for the claim tools.
 *
 * @param {string} id Identifier.
 * @returns {object|null} The record.
 */
export function subjectById(id) {
  return findAny(id);
}

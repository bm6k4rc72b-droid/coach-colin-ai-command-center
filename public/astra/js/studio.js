/**
 * The Content Studio.
 *
 * One paper in, thirty pieces out — and every one of them passes back through
 * the compliance guardian before it is shown, so the studio cannot hand a user
 * a caption the platform's own fact checker would block. That round trip is the
 * whole design: generation and governance are the same pipeline, not two
 * features that happen to sit in the same app.
 *
 * Everything here is template-driven and local. A connected language model
 * rewrites the drafts into better prose (see `astra.js`), but the structure,
 * the evidence tier and the compliance pass are produced here so the output is
 * identical in kind whether or not a key is configured.
 *
 * @module astra/studio
 */

import { complianceCheck, tierPhrase } from './claims.js';
import { tier } from './evidence.js';

/** Formats the studio produces, and how many assets each contributes. */
export const FORMATS = [
  { id: 'carousel', label: 'Instagram carousel', count: 8, icon: '▤' },
  { id: 'reel', label: 'Reel / TikTok script', count: 1, icon: '▶' },
  { id: 'youtube', label: 'YouTube script', count: 1, icon: '▷' },
  { id: 'email', label: 'Email', count: 1, icon: '✉' },
  { id: 'blog', label: 'Blog outline', count: 1, icon: '▦' },
  { id: 'infographic', label: 'Infographic concept', count: 1, icon: '◈' },
  { id: 'faq', label: 'FAQ', count: 6, icon: '?' },
  { id: 'hooks', label: 'Short-form hooks', count: 6, icon: '⚡' },
  { id: 'quiz', label: 'Educational quiz', count: 5, icon: '✓' },
];

/**
 * How many assets a full run produces.
 *
 * @returns {number} The total.
 */
export function assetCount() {
  return FORMATS.reduce((sum, format) => sum + format.count, 0);
}

/**
 * Shape the source material into the facts every template draws on.
 *
 * @param {object} input Source.
 * @param {object} [input.report] A decoded paper from `decoder.js`.
 * @param {object} [input.peptide] The compound the paper concerns.
 * @returns {object} The fact sheet.
 */
export function factSheet({ report, peptide }) {
  const name = peptide ? peptide.name : 'this compound';
  const tierInfo = report ? report.tier : tier('mechanistic');
  const n = report && report.sample.n ? report.sample.n : null;
  const design = report ? report.design.label : 'research';
  const population = report ? report.population.label : 'an unstated population';
  const finding = report && report.whatWasFound.length ? report.whatWasFound[0] : 'The study reported its primary outcome.';
  const doesNotProve = report ? report.doesNotProve.slice(0, 3) : [];
  const limitation = report && (report.limitations[0] || report.inferredLimitations[0]);

  return {
    name,
    tierInfo,
    phrase: tierPhrase(tierInfo),
    n,
    design,
    population,
    finding: trimSentence(finding),
    limitation: limitation ? trimSentence(limitation) : 'The study does not report a limitation, which is itself worth noting.',
    doesNotProve,
    regulatory: peptide?.regulatory?.headline || 'Regulatory status varies by jurisdiction — check before publishing.',
    ceiling: Math.round(tierInfo.ceiling * 100),
    sampleText: n ? `${n} ${report.population.human ? 'participants' : 'animals'}` : 'an unstated number of subjects',
  };
}

/**
 * Shorten a sentence for a caption without cutting mid-word.
 *
 * @param {string} text Source sentence.
 * @param {number} [max] Character budget.
 * @returns {string} The trimmed sentence.
 */
function trimSentence(text, max = 190) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/**
 * The standard disclosure every generated asset carries.
 *
 * @param {object} facts The fact sheet.
 * @returns {string} The disclosure line.
 */
export function disclosure(facts) {
  return `Educational information about published research. Not medical advice, not a recommendation, and not a claim of treatment. Evidence level: ${facts.tierInfo.label}.`;
}

/**
 * Generate the full package.
 *
 * @param {object} input Source, as accepted by {@link factSheet}.
 * @returns {{ facts: object, assets: Array<object>, blocked: number, warnings: number }} The package.
 */
export function generatePackage(input) {
  const facts = factSheet(input);
  const assets = [
    ...carousel(facts),
    reel(facts),
    youtube(facts),
    email(facts),
    blog(facts),
    infographic(facts),
    ...faq(facts),
    ...hooks(facts),
    ...quiz(facts),
  ];

  // The governance pass. Anything the guardian blocks is marked rather than
  // silently dropped, so the user can see what the templates tried to say and
  // why it did not survive.
  for (const asset of assets) {
    asset.compliance = complianceCheck([asset.title, asset.body].filter(Boolean).join(' '));
    asset.disclosure = disclosure(facts);
  }

  return {
    facts,
    assets,
    blocked: assets.filter((asset) => asset.compliance.severity === 'block').length,
    warnings: assets.filter((asset) => asset.compliance.severity === 'warn').length,
  };
}

/**
 * Instagram carousel — eight slides that walk the same path the dossier does.
 *
 * @param {object} facts Fact sheet.
 * @returns {Array<object>} Slides.
 */
function carousel(facts) {
  const slides = [
    ['01 · The claim you have seen', `You have been told ${facts.name} does something remarkable. Here is what the study actually did.`],
    ['02 · What was studied', `${facts.design}. ${facts.population}. ${facts.sampleText}.`],
    ['03 · What they found', facts.finding],
    ['04 · What tier that is', `This is ${facts.tierInfo.label.toLowerCase()} evidence. ${facts.tierInfo.definition}`],
    ['05 · The ceiling', `Evidence at this tier caps confidence at ${facts.ceiling}%. No number of studies at this level reaches the certainty of a randomised human trial.`],
    ['06 · The limitation', facts.limitation],
    ['07 · What it does not prove', facts.doesNotProve[0] || 'That the result transfers outside the population, dose and duration studied.'],
    ['08 · Where to read it', 'Every claim in this post expands into its sources on the platform. Read the paper, not the caption.'],
  ];
  return slides.map(([title, body], index) => ({
    format: 'carousel', id: `carousel-${index + 1}`, label: `Carousel slide ${index + 1}`, title, body,
  }));
}

/**
 * Reel / TikTok script — a hook, a turn, and a reason to trust the account.
 *
 * @param {object} facts Fact sheet.
 * @returns {object} The asset.
 */
function reel(facts) {
  return {
    format: 'reel',
    id: 'reel-1',
    label: 'Reel / TikTok script (35–45s)',
    title: `${facts.name}: what the study actually says`,
    body: [
      `[0–3s · HOOK] Everyone is talking about ${facts.name}. Almost nobody has read the study.`,
      `[3–9s · SETUP] Here is the design: ${facts.design.toLowerCase()}, in ${facts.population.toLowerCase()}, ${facts.sampleText}.`,
      `[9–20s · FINDING] What they found: ${facts.finding}`,
      `[20–30s · TURN] Here is the part the ads skip. ${facts.limitation}`,
      `[30–40s · TIER] That makes this ${facts.tierInfo.label.toLowerCase()} evidence — confidence capped at ${facts.ceiling}%.`,
      `[40–45s · CTA] Read the source yourself. Link in bio opens the paper, not a product page.`,
      '',
      '[ON-SCREEN TEXT] Evidence level badge, visible for the whole video.',
    ].join('\n'),
  };
}

/**
 * Long-form video script skeleton.
 *
 * @param {object} facts Fact sheet.
 * @returns {object} The asset.
 */
function youtube(facts) {
  return {
    format: 'youtube',
    id: 'youtube-1',
    label: 'YouTube script outline (8–10 min)',
    title: `Reading the ${facts.name} research properly`,
    body: [
      'COLD OPEN (0:00) — State the popular claim, then say you are going to read the actual paper on camera.',
      `CONTEXT (0:45) — What ${facts.name} is, and where it came from.`,
      `THE STUDY (2:00) — ${facts.design}. ${facts.population}. ${facts.sampleText}. Show the abstract on screen.`,
      `THE RESULT (4:00) — ${facts.finding}`,
      `THE TIER (5:30) — Explain the evidence hierarchy. This study sits at ${facts.tierInfo.label.toLowerCase()}: ${facts.tierInfo.definition}`,
      `THE LIMITS (7:00) — ${facts.limitation}`,
      `WHAT IT DOES NOT PROVE (8:00) — ${facts.doesNotProve.slice(0, 2).join(' ') || 'That the result transfers beyond the conditions studied.'}`,
      `REGULATORY (9:00) — ${facts.regulatory}`,
      'CLOSE (9:30) — Where to read it, and an invitation to send the next claim to be checked.',
    ].join('\n'),
  };
}

/**
 * Email.
 *
 * @param {object} facts Fact sheet.
 * @returns {object} The asset.
 */
function email(facts) {
  return {
    format: 'email',
    id: 'email-1',
    label: 'Email',
    title: `Subject: What the ${facts.name} study actually found`,
    body: [
      'Preheader: The design, the number, the limitation, and what it does not establish.',
      '',
      `A study on ${facts.name} keeps getting quoted. It is worth reading properly, because the design decides what the result can be used for.`,
      '',
      `**The design.** ${facts.design}, in ${facts.population.toLowerCase()}, with ${facts.sampleText}.`,
      `**The finding.** ${facts.finding}`,
      `**The tier.** ${facts.tierInfo.label} — ${facts.tierInfo.definition} Confidence from evidence at this level is capped at ${facts.ceiling}%.`,
      `**The limitation.** ${facts.limitation}`,
      `**What it does not prove.** ${facts.doesNotProve[0] || 'That the result transfers beyond the conditions studied.'}`,
      '',
      'The full dossier — every claim expandable into its sources — is on the platform.',
      '',
      disclosure(facts),
    ].join('\n'),
  };
}

/**
 * Blog outline.
 *
 * @param {object} facts Fact sheet.
 * @returns {object} The asset.
 */
function blog(facts) {
  return {
    format: 'blog',
    id: 'blog-1',
    label: 'Blog outline (1,400–1,800 words)',
    title: `${facts.name}: reading the evidence, not the marketing`,
    body: [
      'H1 — The claim, stated fairly, as its advocates state it.',
      'H2 — Where the claim comes from: the specific study, named and linked.',
      `H2 — What the study did: ${facts.design.toLowerCase()}, ${facts.population.toLowerCase()}, ${facts.sampleText}.`,
      `H2 — What it found: ${facts.finding}`,
      'H2 — The evidence hierarchy, explained once, properly. Where this study sits and why the tier caps what it can support.',
      `H2 — The limitations, including the ones the authors did not list: ${facts.limitation}`,
      'H2 — What would have to be true for the claim to hold, and what study would establish it.',
      `H2 — Regulatory reality: ${facts.regulatory}`,
      'H2 — How to read the next study you see, in five questions.',
      'Close — Sources, in full, with links to the primary literature.',
    ].join('\n'),
  };
}

/**
 * Infographic concept.
 *
 * @param {object} facts Fact sheet.
 * @returns {object} The asset.
 */
function infographic(facts) {
  return {
    format: 'infographic',
    id: 'infographic-1',
    label: 'Infographic concept',
    title: `The evidence pyramid, with ${facts.name} placed on it`,
    body: [
      'CONCEPT — A vertical pyramid, seven tiers, dark ground with a single neon accent per tier.',
      'TOP TO BOTTOM — Human RCT · Human trial · Observational · Animal · In vitro · Mechanism · Anecdote.',
      `MARKER — A glowing band at the ${facts.tierInfo.label} tier, labelled with this study.`,
      `SIDE PANEL — Design: ${facts.design}. Population: ${facts.population}. n: ${facts.n || 'not stated'}.`,
      `FOOTER — "Confidence at this tier caps at ${facts.ceiling}%." Plus the disclosure line.`,
      'PALETTE — Match the compound card system: deep near-black ground, compound accent, gold rule lines.',
    ].join('\n'),
  };
}

/**
 * FAQ entries.
 *
 * @param {object} facts Fact sheet.
 * @returns {Array<object>} Assets.
 */
function faq(facts) {
  const pairs = [
    [`Was ${facts.name} studied in humans?`, facts.tierInfo.rank <= 3
      ? `Yes — this study was in ${facts.population.toLowerCase()}. Human evidence is where confidence starts, not where it ends: the design and the sample still decide what it supports.`
      : `Not in this study. It was ${facts.design.toLowerCase()} in ${facts.population.toLowerCase()}, so every statement about people is an extrapolation.`],
    ['How many people were in the study?', facts.n
      ? `${facts.sampleText}. ${facts.n < 100 ? 'At that size, a study can detect a large effect but cannot rule out a small one or characterise uncommon harms.' : 'That is large enough to estimate the average effect with reasonable precision.'}`
      : 'The abstract does not state a sample size, which by itself limits how far the result can be taken.'],
    ['Does this mean it works?', `It means one study at the ${facts.tierInfo.label.toLowerCase()} tier reported a result. ${facts.tierInfo.caveat}`],
    ['What does the study not prove?', facts.doesNotProve[0] || 'That the finding transfers to a different population, dose, route or duration.'],
    ['Is it approved?', facts.regulatory],
    ['Where can I read it myself?', 'Every claim on the platform expands into its sources, and each source opens a live literature search rather than a summary written by us.'],
  ];
  return pairs.map(([title, body], index) => ({
    format: 'faq', id: `faq-${index + 1}`, label: `FAQ ${index + 1}`, title, body,
  }));
}

/**
 * Short-form hooks.
 *
 * These are the highest-risk assets in the package — a hook is where
 * overclaiming happens — so they are written to be provocative about the
 * *evidence* rather than about an outcome.
 *
 * @param {object} facts Fact sheet.
 * @returns {Array<object>} Assets.
 */
function hooks(facts) {
  const lines = [
    `Everyone quotes the ${facts.name} study. Almost nobody has read its limitations section.`,
    `${facts.sampleText}. That number decides what this study can and cannot tell you.`,
    `${facts.tierInfo.label} evidence caps confidence at ${facts.ceiling}%. Here is why that ceiling exists.`,
    `The most useful part of any paper is the sentence starting "a limitation of this study".`,
    `Before you repeat a peptide claim: was it humans, and how many?`,
    `Here is the question that separates research from marketing — what would this study have to show to be wrong?`,
  ];
  return lines.map((body, index) => ({
    format: 'hooks', id: `hook-${index + 1}`, label: `Hook ${index + 1}`, title: `Hook ${index + 1}`, body,
  }));
}

/**
 * Educational quiz.
 *
 * @param {object} facts Fact sheet.
 * @returns {Array<object>} Assets.
 */
function quiz(facts) {
  const questions = [
    {
      q: `What kind of study was this?`,
      options: [facts.design, 'A randomised human trial', 'A survey of users', 'A laboratory assay'],
      answer: 0,
      why: `It was ${facts.design.toLowerCase()}. Design is the first thing to identify, because it bounds everything else.`,
    },
    {
      q: 'What does the evidence tier tell you?',
      options: ['How large the effect was', 'How much confidence the design can support', 'How recent the study is', 'How popular the compound is'],
      answer: 1,
      why: 'Tier is about design quality, not effect size. A strong design can find a small effect; a weak one cannot establish a large one.',
    },
    {
      q: 'A study finds an association in a cohort. What can it establish?',
      options: ['Causation', 'Association only', 'Safety', 'Optimal dose'],
      answer: 1,
      why: 'Nobody assigned the exposure, so an unmeasured common cause remains a live rival explanation.',
    },
    {
      q: `Why can ${facts.ceiling}% be the ceiling for this evidence?`,
      options: ['Because the study was small', 'Because the tier caps it regardless of how many studies exist', 'Because the effect was modest', 'Because it was industry-funded'],
      answer: 1,
      why: 'Ceilings are per tier. Accumulating more studies at the same tier raises confidence toward the cap but never past it.',
    },
    {
      q: 'What is the most reliable sign that a health claim is being oversold?',
      options: ['It cites a study', 'It names a mechanism', 'It promises an outcome without naming a design or population', 'It uses scientific words'],
      answer: 2,
      why: 'Mechanism and citation are both easy to supply. A named design and population is what an honest claim carries.',
    },
  ];
  return questions.map((question, index) => ({
    format: 'quiz',
    id: `quiz-${index + 1}`,
    label: `Quiz question ${index + 1}`,
    title: question.q,
    body: question.options.map((option, i) => `${i === question.answer ? '✔' : '·'} ${option}`).join('\n') + `\n\nWhy: ${question.why}`,
    quiz: question,
  }));
}

/**
 * Export the package as Markdown, so it can leave the platform intact.
 *
 * @param {object} pack The generated package.
 * @returns {string} Markdown.
 */
export function toMarkdown(pack) {
  const lines = [`# Content package — ${pack.facts.name}`, '', `Evidence level: **${pack.facts.tierInfo.label}** (confidence ceiling ${pack.facts.ceiling}%).`, '', disclosure(pack.facts), ''];
  for (const format of FORMATS) {
    const items = pack.assets.filter((asset) => asset.format === format.id);
    if (!items.length) continue;
    lines.push(`## ${format.label}`, '');
    for (const asset of items) {
      lines.push(`### ${asset.title}`, '');
      if (asset.body) lines.push(asset.body, '');
      if (asset.compliance.severity !== 'clear') {
        lines.push(`> Compliance: ${asset.compliance.verdict}`, '');
      }
    }
  }
  return lines.join('\n');
}

/**
 * The A/B laboratory.
 *
 * Generates messaging variants from the same evidence, records the outcome a
 * user reports back, and recommends what to test next. The recommendation is a
 * simple Thompson-style preference: variants with better observed performance
 * are favoured, but a variant with little data keeps a share of the traffic
 * because a concept tested twice has not been tested.
 *
 * @param {object} facts Fact sheet.
 * @returns {Array<object>} Variants.
 */
export function variants(facts) {
  return [
    { id: 'authority', angle: 'Authority', line: `${facts.design} in ${facts.population.toLowerCase()}: here is exactly what it found.`, thesis: 'Leads with rigour. Attracts the reader who already distrusts peptide marketing.' },
    { id: 'contrarian', angle: 'Contrarian', line: `The ${facts.name} study everyone quotes has a limitation nobody mentions.`, thesis: 'Leads with the gap. Highest engagement, highest risk of reading as a takedown.' },
    { id: 'literacy', angle: 'Teach the skill', line: 'Three questions that tell you whether a peptide claim is worth believing.', thesis: 'Sells the capability rather than the compound. Best for durable audience growth.' },
    { id: 'plain', angle: 'Plain answer', line: `Is ${facts.name} supported by human evidence? Short answer, with the source.`, thesis: 'Matches search intent. Lower ceiling, more reliable floor.' },
    { id: 'story', angle: 'Narrative', line: `How a ${facts.tierInfo.label.toLowerCase()} finding became a marketing certainty.`, thesis: 'Explains the whole category through one compound. Strong for long-form.' },
  ];
}

/**
 * Recommend the next test.
 *
 * @param {Array<object>} results Recorded results: `{ id, impressions, conversions }`.
 * @returns {{ leader: object|null, next: object|null, note: string }} The recommendation.
 */
export function recommendNext(results) {
  const scored = (results || []).filter((result) => result && result.impressions > 0).map((result) => {
    const rate = result.conversions / result.impressions;
    // Confidence in a rate scales with the square root of the sample; a 2-for-4
    // variant should not beat a 180-for-1000 one.
    const certainty = Math.min(1, Math.sqrt(result.impressions) / 32);
    return { ...result, rate, certainty, score: rate * certainty };
  }).sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return { leader: null, next: null, note: 'No results recorded yet. Run any two variants against comparable audiences before reading anything into the numbers.' };
  }
  const leader = scored[0];
  const untested = (results || []).filter((result) => !result.impressions || result.impressions < 300);
  const next = untested.length ? untested[0] : scored[scored.length - 1];
  const note = leader.certainty < 0.5
    ? `${leader.id} is ahead on rate but on thin data — ${leader.impressions} impressions is not a result yet. Keep both running before concluding anything.`
    : `${leader.id} is the leader at ${(leader.rate * 100).toFixed(1)}%. Test ${next.id} next: ${untested.length ? 'it has not had a fair sample' : 'it is the weakest performer and worth one more read before retiring'}.`;
  return { leader, next, note };
}

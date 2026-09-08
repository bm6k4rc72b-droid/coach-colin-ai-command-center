/**
 * Unit tests for the intelligence engine, the graph, the comparison lab and
 * the reviewers.
 *
 * Retrieval and the dossier are what answer a reader's question, so their
 * behaviour is part of the product rather than an implementation detail — as is
 * the rule that a stack can never out-rank its weakest component.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PEPTIDES, STACKS, findAny, findPeptide } from '../../public/astra/js/data/peptides.js';
import { scoreEvidence, tier } from '../../public/astra/js/evidence.js';
import {
  SECTIONS, buildIndex, corpusVerdict, dossier, entryReading, rankForGoals,
  resolveNamed, resolveSubject, search, tokenize,
} from '../../public/astra/js/engine.js';
import { buildGraph, knowledgeGraph, layout, neighbourhood, path } from '../../public/astra/js/graph.js';
import { AXES, comparable, compare } from '../../public/astra/js/compare.js';
import {
  REVIEWERS, convene, detectableEffect, falsePositiveRisk, power, simulate,
} from '../../public/astra/js/reviewers.js';

/* ----------------------------------------------------------- retrieval */

test('tokenising drops stop words and folds simple plurals', () => {
  const tokens = tokenize('What are the studies about peptides and their mechanisms?');
  assert.ok(!tokens.includes('the'));
  assert.ok(!tokens.includes('are'));
  assert.ok(tokens.includes('study'), tokens.join(','));
  assert.ok(tokens.includes('peptide'), tokens.join(','));
  assert.ok(tokens.includes('mechanism'), tokens.join(','));
});

test('the index covers every kind of corpus record', () => {
  const kinds = new Set(buildIndex().map((doc) => doc.kind));
  assert.deepEqual([...kinds].sort(), ['claim', 'mechanism', 'peptide', 'stack', 'study']);
});

test('retrieval puts the right record first', () => {
  const expectations = [
    ['what does semaglutide do for weight', 'semaglutide'],
    ['copper peptide and collagen', 'ghk-cu'],
    ['tripeptide for gut inflammation and colitis', 'kpv'],
    ['growth hormone releasing hormone analogue for visceral fat', 'tesamorelin'],
    ['nootropic heptapeptide for focus', 'semax'],
  ];
  for (const [query, expected] of expectations) {
    const [top] = search(query, 1);
    assert.ok(top, `no result for "${query}"`);
    assert.equal(top.doc.peptide, expected, `"${query}" resolved to ${top.doc.peptide}`);
  }
});

test('naming a compound beats retrieval, and naming nothing resolves to nothing', () => {
  assert.equal(resolveNamed('is BPC-157 any good').id, 'bpc-157');
  assert.equal(resolveNamed('what about Ozempic').id, 'semaglutide', 'brand names must resolve');
  assert.equal(resolveNamed('tell me about GLP-1 drugs').id, 'semaglutide', 'class words must resolve');
  assert.equal(resolveNamed('copper peptide for skin').id, 'ghk-cu');
  assert.equal(resolveNamed('I want to recover faster'), null, 'a goal is not a compound');
  // resolveSubject may fall back to retrieval; resolveNamed must not.
  assert.ok(resolveSubject('I want to recover faster'));
});

/* ------------------------------------------------------------- dossier */

test('every compound produces a complete dossier', () => {
  for (const entry of [...PEPTIDES, ...STACKS]) {
    const report = dossier(entry.id);
    assert.ok(report, `${entry.id} produced no dossier`);
    for (const section of SECTIONS) {
      assert.ok(report.sections[section.id], `${entry.id} is missing section ${section.id}`);
      assert.ok(report.sections[section.id].body.length > 20, `${entry.id}/${section.id} is empty`);
    }
    assert.ok(report.reading.score >= 0 && report.reading.score <= 1);
  }
  assert.equal(dossier('nope'), null);
});

test('the dossier separates human from preclinical evidence', () => {
  const report = dossier('semaglutide');
  assert.ok(report.sections.human.studies.length >= 3);
  assert.equal(report.sections.preclinical.studies.length, 0);
  for (const study of report.sections.human.studies) {
    assert.ok(tier(study.tier).rank <= 3, `${study.id} is not human evidence`);
  }
});

test('a compound with no human evidence says so plainly', () => {
  const report = dossier('kpv');
  assert.equal(report.sections.human.studies.length, 0);
  assert.match(report.sections.human.body, /No human study/i);
});

test('every source in a dossier carries a live literature link', () => {
  for (const entry of PEPTIDES) {
    for (const study of dossier(entry.id).sections.sources.studies) {
      assert.ok(study.url.startsWith('https://pubmed.ncbi.nlm.nih.gov/'), `${study.id} has no source link`);
    }
  }
});

test('dosing appears in a dossier only as regulatory context', () => {
  for (const entry of PEPTIDES) {
    const { regulatory } = dossier(entry.id).sections;
    assert.ok(regulatory.reported, `${entry.id} lost its reported-dosing framing`);
    assert.ok(regulatory.reported.note.length > 20);
  }
  // A stack never reports dosing at all.
  assert.equal(dossier('klow').sections.regulatory.reported, null);
});

/* --------------------------------------------------------- the stack rule */

test('a stack can never out-rank its weakest component', () => {
  for (const stack of STACKS) {
    const reading = entryReading(stack);
    const members = stack.members.map((id) => scoreEvidence(findPeptide(id).studies).score);
    const weakest = Math.min(...members);
    assert.ok(reading.score <= weakest,
      `${stack.id} scored ${reading.score}, above its weakest member at ${weakest}`);
    assert.ok(reading.score < Math.max(...members),
      `${stack.id} must not inherit its strongest member's confidence`);
  }
});

test('a stack reading is internally consistent', () => {
  for (const stack of STACKS) {
    const reading = entryReading(stack);
    // The band shown must be the band the score actually falls in.
    assert.ok(reading.score >= reading.band.min,
      `${stack.id} shows "${reading.band.label}" for a score of ${reading.score}`);
    assert.match(reading.reasons[0], /bounded by its weakest component/i);
  }
});

test('KLOW is speculative, not well established', () => {
  const reading = entryReading('klow');
  assert.ok(reading.score < 0.25, `KLOW scored ${reading.score}`);
  assert.match(dossier('klow').sections.what.facts.find(([label]) => label === 'Studies of the combination')[1], /^0$/);
});

/* -------------------------------------------------------------- interests */

test('ranking for a goal surfaces compounds that address it', () => {
  const ranked = rankForGoals(['gut-health']);
  assert.ok(ranked.length >= 2);
  for (const { entry } of ranked.slice(0, 2)) {
    assert.ok(entry.goals.includes('gut-health'), `${entry.id} is not a gut-health compound`);
  }
});

test('within a goal, better evidence ranks higher', () => {
  const ranked = rankForGoals(['metabolic']).filter(({ entry }) => entry.goals.includes('metabolic'));
  for (let i = 1; i < ranked.length; i += 1) {
    assert.ok(ranked[i - 1].score >= ranked[i].score, 'ranking must be monotonic');
  }
});

test('the corpus verdict reports an honest human share', () => {
  const verdict = corpusVerdict();
  assert.ok(verdict.humanShare > 0 && verdict.humanShare < 1);
  assert.equal(verdict.strongest[0].entry.regulatory.status, 'approved',
    'the best-evidenced compound should be an approved drug');
});

/* ---------------------------------------------------------------- graph */

test('the graph connects compounds to mechanisms, systems and studies', () => {
  const graph = buildGraph();
  const kinds = new Set(graph.nodes.map((node) => node.kind));
  assert.deepEqual([...kinds].sort(), ['mechanism', 'peptide', 'stack', 'study', 'system']);
  assert.ok(graph.edges.length > graph.nodes.length, 'a map with fewer edges than nodes is a list');
  // Every edge must land on nodes that exist.
  const ids = new Set(graph.nodes.map((node) => node.id));
  for (const edge of graph.edges) {
    assert.ok(ids.has(edge.from), `dangling edge from ${edge.from}`);
    assert.ok(ids.has(edge.to), `dangling edge to ${edge.to}`);
  }
});

test('the layout is deterministic and framed', () => {
  const first = layout(buildGraph());
  const second = layout(buildGraph());
  assert.equal(first.nodes.length, second.nodes.length);
  for (let i = 0; i < first.nodes.length; i += 1) {
    assert.equal(first.nodes[i].x, second.nodes[i].x, 'the map must be in the same place every visit');
  }
  for (const node of first.nodes) {
    assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z));
    assert.ok(Math.abs(node.x) <= 15 && Math.abs(node.z) <= 15, 'nodes must stay in the camera box');
  }
});

test('the graph answers "what connects these two things"', () => {
  const graph = knowledgeGraph({ iterations: 40 });
  const route = path(graph, 'peptide:bpc-157', 'peptide:kpv');
  assert.ok(route.length >= 3, 'two gut compounds should connect through something');
  assert.equal(route[0].id, 'peptide:bpc-157');
  assert.equal(route[route.length - 1].id, 'peptide:kpv');
  assert.deepEqual(path(graph, 'peptide:bpc-157', 'nope'), []);
});

test('a compound has neighbours of every kind', () => {
  const graph = knowledgeGraph({ iterations: 40 });
  const { node, neighbours } = neighbourhood(graph, 'peptide:bpc-157');
  assert.equal(node.label, 'BPC-157');
  const kinds = new Set(neighbours.map((item) => item.node.kind));
  assert.ok(kinds.has('system') && kinds.has('mechanism') && kinds.has('study'));
});

/* ------------------------------------------------------------ comparison */

test('every pairing produces a comparison on every axis', () => {
  const options = comparable();
  assert.equal(options.length, PEPTIDES.length + STACKS.length);
  const result = compare('bpc-157', 'semaglutide');
  assert.equal(result.axes.length, AXES.length);
  for (const axis of result.axes) {
    assert.ok(axis.left.length > 10 && axis.right.length > 10, `${axis.id} is empty on one side`);
  }
  assert.equal(compare('bpc-157', 'bpc-157'), null, 'a compound cannot be compared with itself');
  assert.equal(compare('bpc-157', 'nope'), null);
});

test('the comparison ranks evidence, not effect, and says so', () => {
  const result = compare('bpc-157', 'semaglutide');
  assert.match(result.verdict.headline, /Semaglutide has the .* better evidence base/);
  assert.match(result.verdict.caution, /ranks evidence, not effect/i);
});

test('a stack loses to its own strongest component', () => {
  const result = compare('klow', 'ghk-cu');
  assert.equal(result.verdict.headline.startsWith('GHK-Cu'), true, result.verdict.headline);
});

/* ------------------------------------------------------------- reviewers */

test('the panel convenes on any compound and reaches a consensus', () => {
  for (const entry of [...PEPTIDES, ...STACKS]) {
    const debate = convene(entry.id);
    assert.equal(debate.opinions.length, REVIEWERS.length);
    for (const opinion of debate.opinions) {
      assert.ok(opinion.body.length > 80, `${entry.id}/${opinion.reviewer.id} said almost nothing`);
    }
    assert.ok(debate.consensus.verdict.length > 40);
    assert.ok(debate.consensus.agreed.length >= 2);
    assert.ok(debate.consensus.disputed.length >= 1);
  }
  assert.equal(convene('nope'), null);
});

test('the panel is harsher on a compound with no human evidence', () => {
  const weak = convene('kpv');
  const strong = convene('semaglutide');
  assert.equal(weak.opinions[1].position, 'opposed', 'the clinical reviewer should refuse to review nothing');
  assert.notEqual(strong.opinions[1].position, 'opposed');
  assert.match(weak.consensus.verdict, /does not have the evidence|splits/i);
});

/* ------------------------------------------------------------- simulator */

test('the minimum detectable effect falls as the sample grows', () => {
  assert.ok(detectableEffect(40) > detectableEffect(400));
  assert.ok(detectableEffect(400) > detectableEffect(4000));
  // The textbook figure: ~0.28 for 200 per arm.
  assert.ok(Math.abs(detectableEffect(400) - 0.28) < 0.03, String(detectableEffect(400)));
});

test('power rises with sample size and with effect size', () => {
  assert.ok(power(2000, 0.4) > power(40, 0.4));
  assert.ok(power(400, 0.8) > power(400, 0.2));
  assert.ok(power(400, 0) <= 0.06, 'no effect means no power to detect one');
});

test('false-positive risk falls with power and with prior plausibility', () => {
  const implausibleSmall = falsePositiveRisk({ n: 24, prior: 0.05, effect: 0.3 });
  const plausibleLarge = falsePositiveRisk({ n: 3000, prior: 0.5, effect: 0.5 });
  assert.ok(implausibleSmall > 0.7, `an underpowered study of an implausible idea should mostly be wrong (${implausibleSmall})`);
  assert.ok(plausibleLarge < 0.15, String(plausibleLarge));
  // Flexible analysis costs you, holding everything else equal.
  assert.ok(falsePositiveRisk({ n: 400, prior: 0.3, bias: 0.2 }) > falsePositiveRisk({ n: 400, prior: 0.3 }));
});

test('the simulator downgrades a study for each missing safeguard', () => {
  const gold = simulate({ n: 2000, effect: 0.5, prior: 0.4, blinded: true, randomised: true, preregistered: true, weeks: 52 });
  const sloppy = simulate({ n: 2000, effect: 0.5, prior: 0.4, blinded: false, randomised: false, preregistered: false, weeks: 52 });
  assert.ok(sloppy.falsePositiveRisk > gold.falsePositiveRisk);
  assert.equal(gold.verdict.level, 'strong');
  assert.ok(sloppy.notes.length >= 3, 'each missing safeguard should be named');
  assert.equal(gold.tier.id, 'human-rct');
  assert.equal(sloppy.tier.id, 'human-observational');
});

test('an animal study is called an animal study however well designed', () => {
  const result = simulate({ n: 4000, effect: 1, prior: 0.9, blinded: true, randomised: true, preregistered: true, weeks: 52, human: false });
  assert.equal(result.tier.id, 'animal');
  assert.match(result.verdict.text, /animal study/i);
  assert.ok(result.confidence <= tier('animal').ceiling + 1e-9);
});

test('an underpowered design is named as underpowered', () => {
  const result = simulate({ n: 20, effect: 0.15, prior: 0.3, blinded: true, randomised: true, preregistered: true, weeks: 12 });
  assert.ok(['weak', 'underpowered'].includes(result.verdict.level), result.verdict.level);
  assert.ok(result.notes.some((note) => /smaller than this study can detect|cannot characterise harms/i.test(note)));
});

test('every compound in the corpus resolves through findAny', () => {
  for (const entry of [...PEPTIDES, ...STACKS]) {
    assert.equal(findAny(entry.id).id, entry.id);
  }
});

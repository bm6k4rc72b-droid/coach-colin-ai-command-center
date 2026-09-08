/**
 * Unit tests for the reader-facing literacy tools: the paper decoder, the claim
 * analysers, the content studio and the progression system.
 *
 * These are the parts a person points at something and gets an answer from, so
 * the tests are written as the questions a user would actually ask — does it
 * spot a mouse study described in trial language, does it block a treatment
 * claim, does the studio ever hand back copy its own guardian would reject.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  decode, design, headline, hedging, population, sampleSize, sentences, statistics,
} from '../../public/astra/js/decoder.js';
import {
  COMPLIANCE_RULES, analyseClaim, complianceCheck, compliantRewrite, factCheck, tierPhrase,
} from '../../public/astra/js/claims.js';
import {
  FORMATS, assetCount, disclosure, factSheet, generatePackage, recommendNext, toMarkdown, variants,
} from '../../public/astra/js/studio.js';
import {
  ACTIONS, DROPS, RANKS, UNLOCKS, dayKey, rankFor, unlocksFor,
} from '../../public/astra/js/progress.js';
import { findPeptide } from '../../public/astra/js/data/peptides.js';
import { tier } from '../../public/astra/js/evidence.js';

/* --------------------------------------------------------------- decoder */

const RCT_ABSTRACT = `We investigated whether once-weekly semaglutide reduces body weight in adults with obesity. In this randomised, double-blind, placebo-controlled trial, 1,961 participants with a BMI of 30 or more were assigned to semaglutide 2.4 mg or placebo for 68 weeks. Mean change in body weight was -14.9% with semaglutide versus -2.4% with placebo (p<0.001, 95% CI -12.4 to -11.5). Gastrointestinal adverse events were more common in the treatment group. A limitation of this study is that all participants received lifestyle intervention.`;

const MOUSE_ABSTRACT = `The aim of this study was to determine whether a synthetic pentadecapeptide accelerates tendon-to-bone healing. Male Wistar rats (n=48) underwent Achilles tendon transection and received treatment or vehicle for 14 days. Treated animals showed greater load to failure than controls. Expression of VEGF was higher in the treated group. These findings suggest the peptide may promote healing, although further study is warranted.`;

const VAGUE_ABSTRACT = `This compound has been the subject of considerable interest in recent years. Many practitioners report favourable outcomes across a wide range of applications. The mechanism is believed to involve several complementary pathways which together support the body natural repair processes and overall wellbeing over time.`;

test('sentence splitting survives decimals and abbreviations', () => {
  const lines = sentences('We gave 2.5 mg vs. placebo. Change was -14.9% (p<0.001). No. 3 was excluded. Further study is warranted.');
  assert.equal(lines.length, 4, lines.join(' | '));
  assert.ok(lines[0].includes('2.5 mg'), lines[0]);
  assert.ok(lines[1].includes('-14.9%'), lines[1]);
});

test('the decoder refuses to guess from too little text', () => {
  const report = decode('BPC-157 is great.');
  assert.equal(report.ok, false);
  assert.match(report.reason, /Too short/);
});

test('a randomised human trial is graded as one', () => {
  const report = decode(RCT_ABSTRACT);
  assert.equal(report.ok, true);
  assert.equal(report.design.id, 'rct');
  assert.equal(report.tier.id, 'human-rct');
  assert.equal(report.population.human, true);
  assert.equal(report.sample.n, 1961);
  assert.ok(report.stats.hasStats);
  assert.ok(report.stats.pValues.length >= 1, report.stats.pValues.join());
  assert.ok(report.stats.intervals.length >= 1, report.stats.intervals.join());
  assert.ok(report.limitations.length >= 1, 'the stated limitation should be picked up');
  assert.match(headline(report), /Randomised controlled trial/);
});

test('a rodent study is never graded as human evidence', () => {
  const report = decode(MOUSE_ABSTRACT);
  assert.equal(report.design.id, 'animal');
  assert.equal(report.tier.id, 'animal');
  assert.equal(report.population.human, false);
  assert.equal(report.sample.n, 48);
  assert.ok(report.doesNotProve.some((line) => /occurs in humans/i.test(line)),
    'an animal study must say it does not establish a human effect');
});

test('"randomised" applied to rats does not promote the study', () => {
  const report = decode(`In this randomised experiment, male Wistar rats (n=60) received the peptide or vehicle for 21 days. Treated rats showed greater collagen density than controls.`);
  assert.equal(report.tier.id, 'animal', 'design words must not outrank the species');
});

test('an abstract with no design, no numbers and no limits is called out', () => {
  const report = decode(VAGUE_ABSTRACT);
  assert.equal(report.ok, true);
  assert.equal(report.design.confident, false);
  assert.equal(report.sample.n, null);
  assert.equal(report.stats.hasStats, false);
  assert.ok(report.inferredLimitations.length >= 3);
  assert.ok(report.inferredLimitations.some((line) => /No sample size/i.test(line)));
  assert.ok(report.inferredLimitations.some((line) => /No p-values/i.test(line)));
});

test('every decode says what the study does not prove', () => {
  for (const abstract of [RCT_ABSTRACT, MOUSE_ABSTRACT, VAGUE_ABSTRACT]) {
    const report = decode(abstract);
    assert.ok(report.doesNotProve.length >= 1);
    // The transfer caveat is universal and always names the tier's ceiling.
    assert.ok(report.doesNotProve.some((line) => /capped at \d+%/.test(line)));
  }
});

test('a small study is told it cannot establish safety', () => {
  const report = decode(`This open-label pilot study enrolled 18 patients with chronic tendinopathy over 12 weeks. Pain scores improved from baseline. The study had no control group.`);
  assert.ok(report.doesNotProve.some((line) => /cannot detect an adverse event/i.test(line)));
  assert.ok(report.inferredLimitations.some((line) => /Sample of 18/.test(line)));
});

test('sample sizes are found in several phrasings', () => {
  assert.equal(sampleSize('a total of 412 patients were enrolled').n, 412);
  assert.equal(sampleSize('n = 1,961').n, 1961);
  assert.equal(sampleSize('enrolled 72 participants').n, 72);
  assert.equal(sampleSize('no numbers here').n, null);
});

test('statistics extraction finds p-values, intervals and effects', () => {
  const stats = statistics('The hazard ratio was 0.80 (95% CI 0.72 to 0.90; p<0.001), a 20% reduction.');
  assert.ok(stats.pValues.includes('p<0.001'));
  assert.ok(stats.intervals.length >= 1);
  assert.ok(stats.effects.some((effect) => effect.includes('20')));
});

test('hedging is measured in both directions', () => {
  assert.match(hedging('The results may suggest a possible effect which could potentially indicate that further study is warranted.').verdict, /hedged/i);
  assert.match(hedging('This proves the compound is effective and confirms it is safe and effective.').verdict, /more strongly/i);
});

test('population detection distinguishes people from cells', () => {
  assert.equal(population('healthy volunteers were recruited').human, true);
  assert.equal(population('patients with ulcerative colitis were enrolled').label, 'People with ulcerative colitis');
  assert.equal(population('cultured tendon fibroblast cell lines were incubated').human, false);
  assert.equal(design('cells were incubated with the peptide in vitro').id, 'invitro');
});

/* ---------------------------------------------------------- claim tools */

test('every compliance rule has a reason and a fix', () => {
  for (const rule of COMPLIANCE_RULES) {
    assert.ok(rule.why.length > 40, `${rule.id} needs a reason`);
    assert.ok(rule.fix.length > 30, `${rule.id} needs a fix`);
    assert.ok(['block', 'warn', 'note'].includes(rule.severity));
  }
});

test('a treatment claim is blocked', () => {
  const report = complianceCheck('This peptide cures inflammation and treats arthritis — guaranteed results.');
  assert.equal(report.severity, 'block');
  assert.ok(report.findings.some((finding) => finding.id === 'disease-treatment'));
  assert.ok(report.findings.some((finding) => finding.id === 'guarantee'));
  assert.match(report.verdict, /Do not publish/);
});

test('an implied approval is blocked', () => {
  const report = complianceCheck('Our FDA-approved, pharmaceutical grade BPC-157 is clinically proven.');
  assert.equal(report.severity, 'block');
  assert.ok(report.findings.some((finding) => finding.id === 'unapproved-as-approved'));
});

test('dosing instructions are flagged', () => {
  const report = complianceCheck('Take 500mcg daily on an empty stomach for best results.');
  assert.ok(report.findings.some((finding) => finding.id === 'dosing'));
});

test('honest educational copy passes', () => {
  const report = complianceCheck('In one randomised trial of 1,961 adults, mean body weight fell by about 15% over 68 weeks. Educational information only.');
  assert.equal(report.severity, 'clear', JSON.stringify(report.findings));
  assert.ok(report.score > 0.9);
  // Even a clean pass refuses to call itself legal clearance.
  assert.match(report.verdict, /not legal clearance/i);
});

test('the rewrite removes what the guardian objected to', () => {
  const original = 'Our clinically proven peptide cures inflammation — guaranteed, with no side effects.';
  const rewritten = compliantRewrite(original, analyseClaim(original));
  const after = complianceCheck(rewritten);
  assert.ok(!after.findings.some((finding) => finding.severity === 'block'),
    `rewrite still blocks: ${after.findings.map((f) => f.id).join()}`);
  assert.match(rewritten, /not medical advice/i);
});

test('the myth detector walks claim to evidence to confidence', () => {
  const analysis = analyseClaim('BPC-157 heals any injury in days.');
  assert.equal(analysis.ok, true);
  assert.equal(analysis.subject.id, 'bpc-157');
  assert.ok(['overstated', 'unsupported', 'mixed'].includes(analysis.verdict.level), analysis.verdict.level);
  assert.ok(analysis.reading.score <= tier('animal').ceiling + 1e-9);
});

test('a claim naming no known compound says so rather than guessing', () => {
  const analysis = analyseClaim('This mushroom extract cures everything overnight.');
  assert.equal(analysis.verdict.level, 'unknown');
  assert.match(analysis.verdict.body, /does not name a compound/i);
});

test('the fact checker holds copy the library cannot support', () => {
  const held = factCheck('BPC-157 is clinically proven to cure tendon injuries in humans, guaranteed.');
  assert.equal(held.decision, 'HOLD');
  assert.ok(held.blockers.length >= 1);
  assert.ok(held.rewrite.length > 40);
});

test('the fact checker approves an accurately tiered claim', () => {
  const approved = factCheck('In randomised human trials, semaglutide produced about 15% mean weight loss over 68 weeks.');
  assert.match(approved.decision, /^APPROVED/);
  assert.equal(approved.publishable, true);
});

test('tier phrasing is caption-ready and never overstates', () => {
  assert.equal(tierPhrase(tier('animal')), 'in animal studies');
  assert.equal(tierPhrase(tier('human-rct')), 'in randomised human trials');
  assert.match(tierPhrase(tier('mechanistic')), /not a demonstrated result/);
});

/* ---------------------------------------------------------------- studio */

test('one paper becomes exactly thirty assets across every format', () => {
  const report = decode(MOUSE_ABSTRACT);
  const pack = generatePackage({ report, peptide: findPeptide('bpc-157') });
  assert.equal(pack.assets.length, 30);
  assert.equal(assetCount(), 30);
  for (const format of FORMATS) {
    assert.equal(pack.assets.filter((asset) => asset.format === format.id).length, format.count,
      `${format.id} produced the wrong number of assets`);
  }
});

test('the studio never emits copy its own guardian would block', () => {
  for (const [abstract, id] of [[MOUSE_ABSTRACT, 'bpc-157'], [RCT_ABSTRACT, 'semaglutide'], [VAGUE_ABSTRACT, 'kpv']]) {
    const pack = generatePackage({ report: decode(abstract), peptide: findPeptide(id) });
    assert.equal(pack.blocked, 0,
      `${id}: ${pack.assets.filter((a) => a.compliance.severity === 'block').map((a) => a.id).join()}`);
    for (const asset of pack.assets) {
      assert.ok(asset.disclosure.includes('Not medical advice'), `${asset.id} lost its disclosure`);
      assert.ok(asset.title.length > 3);
    }
  }
});

test('the package carries the paper\'s tier, not the compound\'s reputation', () => {
  const pack = generatePackage({ report: decode(MOUSE_ABSTRACT), peptide: findPeptide('bpc-157') });
  assert.equal(pack.facts.tierInfo.id, 'animal');
  assert.equal(pack.facts.ceiling, 45);
  assert.match(disclosure(pack.facts), /Animal model/);
  const carousel = pack.assets.filter((asset) => asset.format === 'carousel');
  assert.ok(carousel.some((slide) => /animal model/i.test(slide.body)), 'the carousel must state the tier');
});

test('the studio works with no decoded paper at all', () => {
  const pack = generatePackage({ peptide: findPeptide('kpv') });
  assert.equal(pack.assets.length, 30);
  assert.equal(pack.blocked, 0);
});

test('the package exports as readable Markdown', () => {
  const markdown = toMarkdown(generatePackage({ report: decode(RCT_ABSTRACT), peptide: findPeptide('semaglutide') }));
  assert.match(markdown, /^# Content package/);
  for (const format of FORMATS) assert.ok(markdown.includes(`## ${format.label}`), `${format.id} missing from export`);
});

test('the fact sheet degrades gracefully with nothing to work from', () => {
  const facts = factSheet({});
  assert.equal(facts.name, 'this compound');
  assert.ok(facts.limitation.length > 20);
});

test('the A/B lab weights a result by how much of it there is', () => {
  const thin = recommendNext([
    { id: 'A', impressions: 4, conversions: 2 },
    { id: 'B', impressions: 1000, conversions: 180 },
  ]);
  assert.equal(thin.leader.id, 'B', 'a 2-of-4 variant must not beat 180-of-1000');
  const empty = recommendNext([]);
  assert.equal(empty.leader, null);
  assert.match(empty.note, /No results recorded/);
});

test('the A/B lab offers five distinct angles', () => {
  const list = variants(factSheet({ peptide: findPeptide('bpc-157') }));
  assert.equal(list.length, 5);
  assert.equal(new Set(list.map((variant) => variant.angle)).size, 5);
});

/* ----------------------------------------------------------- progression */

test('every action is worth points and describes itself', () => {
  for (const [id, action] of Object.entries(ACTIONS)) {
    assert.ok(action.xp > 0, `${id} is worth nothing`);
    assert.ok(action.label.length > 8, `${id} needs a label`);
  }
  // Reading the primary literature must beat reading a summary.
  assert.ok(ACTIONS['pubmed-open'].xp > ACTIONS['dossier-open'].xp);
  assert.ok(ACTIONS['contradiction-found'].xp > ACTIONS['sources-expand'].xp);
});

test('ranks ascend and every unlock is reachable', () => {
  for (let i = 1; i < RANKS.length; i += 1) {
    assert.ok(RANKS[i].at > RANKS[i - 1].at, 'rank thresholds must ascend');
  }
  const top = RANKS[RANKS.length - 1].level;
  for (const unlock of UNLOCKS) {
    assert.ok(unlock.at <= top, `${unlock.id} is unreachable`);
    assert.ok(unlock.blurb.length > 12);
  }
});

test('rank progress is reported against the next threshold', () => {
  const start = rankFor(0);
  assert.equal(start.level, 1);
  assert.equal(start.toNext, RANKS[1].at);
  const mid = rankFor(RANKS[2].at);
  assert.equal(mid.level, 3);
  assert.ok(mid.progress >= 0 && mid.progress <= 1);
  const top = rankFor(999999);
  assert.equal(top.next, null);
  assert.equal(top.progress, 1);
});

test('clearance opens capabilities in a teaching order', () => {
  assert.equal(unlocksFor(1).open.length, 1, 'a visitor gets the map and nothing else');
  assert.ok(unlocksFor(7).locked.length === 0, 'the top rank opens everything');
  const decoderUnlock = UNLOCKS.find((unlock) => unlock.id === 'decoder');
  const commandUnlock = UNLOCKS.find((unlock) => unlock.id === 'command');
  assert.ok(decoderUnlock.at < commandUnlock.at, 'read a paper before you run a campaign');
});

test('every research drop is a real finding rather than a badge', () => {
  assert.ok(DROPS.length >= 8);
  for (const drop of DROPS) {
    assert.ok(drop.title.length > 6, `${drop.id} needs a title`);
    assert.ok(drop.body.length > 100, `${drop.id} should teach something`);
  }
  assert.equal(new Set(DROPS.map((drop) => drop.id)).size, DROPS.length);
});

test('day keys are local and consecutive', () => {
  const today = dayKey();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(dayKey(Date.now() - 86400000), today);
});

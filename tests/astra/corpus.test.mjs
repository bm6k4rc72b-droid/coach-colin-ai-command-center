/**
 * Unit tests for the peptide corpus and the evidence layer.
 *
 * The evidence arithmetic is the product, not an implementation detail: if a
 * compound with only animal studies can reach the confidence of one with
 * randomised human trials, the whole platform is a lie with good typography.
 * These tests pin that invariant down.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  GOALS, PEPTIDES, STACKS, SYSTEMS, allClaims, allStudies, claimStudies,
  corpusSize, findAny, findPeptide, findStack, pubmedUrl,
} from '../../public/astra/js/data/peptides.js';
import {
  BANDS, TIERS, band, describe, sampleWeight, scoreEvidence, tier, tierMix,
} from '../../public/astra/js/evidence.js';

test('the corpus is well formed', () => {
  assert.ok(PEPTIDES.length >= 10, 'the library should be worth browsing');
  const ids = new Set();
  const systemIds = new Set(SYSTEMS.map((system) => system.id));
  const goalIds = new Set(GOALS.map((goal) => goal.id));
  const tierIds = new Set(TIERS.map((entry) => entry.id));

  for (const peptide of PEPTIDES) {
    assert.ok(!ids.has(peptide.id), `duplicate compound id ${peptide.id}`);
    ids.add(peptide.id);
    assert.ok(peptide.name && peptide.full && peptide.klass && peptide.tagline, `${peptide.id} is missing identity`);
    assert.ok(peptide.summary.length > 120, `${peptide.id} has a stub summary`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(peptide.accent), `${peptide.id} needs a hex accent`);

    for (const system of peptide.systems) assert.ok(systemIds.has(system), `${peptide.id} names an unknown system: ${system}`);
    for (const goal of peptide.goals) assert.ok(goalIds.has(goal), `${peptide.id} names an unknown goal: ${goal}`);

    assert.ok(peptide.mechanisms.length >= 2, `${peptide.id} needs mechanisms`);
    for (const mechanism of peptide.mechanisms) {
      assert.ok(tierIds.has(mechanism.tier), `${peptide.id}/${mechanism.id} has an unknown tier`);
      assert.ok(mechanism.detail.length > 60, `${peptide.id}/${mechanism.id} is too thin`);
    }

    assert.ok(peptide.claims.length >= 2, `${peptide.id} needs claims`);
    for (const claim of peptide.claims) {
      assert.ok(tierIds.has(claim.tier), `${peptide.id}/${claim.id} has an unknown tier`);
      // Every cited study must actually exist on the compound, or the "Show me
      // the science" button opens onto nothing.
      for (const id of claim.studies || []) {
        assert.ok(peptide.studies.some((study) => study.id === id),
          `${peptide.id}/${claim.id} cites a missing study: ${id}`);
      }
    }

    assert.ok(peptide.studies.length >= 2, `${peptide.id} needs studies`);
    for (const study of peptide.studies) {
      assert.ok(tierIds.has(study.tier), `${study.id} has an unknown tier`);
      assert.ok(study.limitation.length > 40, `${study.id} needs a real limitation`);
      assert.ok(study.finding.length > 40, `${study.id} needs a real finding`);
      assert.ok(study.search, `${study.id} needs a literature query`);
    }

    assert.ok(peptide.uncertainties.length >= 3, `${peptide.id} needs uncertainties`);
    assert.ok(peptide.regulatory.headline && peptide.regulatory.detail && peptide.regulatory.sport,
      `${peptide.id} needs a full regulatory record`);
    assert.ok(peptide.timeline.length >= 3, `${peptide.id} needs a timeline`);
  }
});

test('reported dosing is always framed as context rather than guidance', () => {
  for (const peptide of PEPTIDES) {
    assert.ok(peptide.reported, `${peptide.id} has no reported-dosing record`);
    const note = peptide.reported.note.toLowerCase();
    assert.ok(
      /context only|not a recommendation|belongs with a (?:clinician|prescriber)|prescription medicine/.test(note),
      `${peptide.id} states a dose without disclaiming it: "${peptide.reported.note}"`,
    );
  }
});

test('study ids are unique across the whole corpus', () => {
  const seen = new Set();
  for (const study of allStudies()) {
    assert.ok(!seen.has(study.id), `duplicate study id ${study.id}`);
    seen.add(study.id);
  }
});

test('stacks reference real members and claim no combination evidence', () => {
  for (const stack of STACKS) {
    assert.ok(stack.members.length >= 2);
    for (const id of stack.members) assert.ok(findPeptide(id), `${stack.id} references a missing member: ${id}`);
    assert.match(stack.evidenceNote, /never been studied|no literature|untested/i,
      `${stack.id} should say plainly that the combination is unstudied`);
    assert.ok(stack.uncertainties.length >= 3);
  }
});

test('lookups resolve compounds and stacks alike', () => {
  assert.equal(findPeptide('bpc-157').name, 'BPC-157');
  assert.equal(findStack('klow').name, 'KLOW Stack');
  assert.equal(findAny('klow').id, 'klow');
  assert.equal(findAny('semaglutide').id, 'semaglutide');
  assert.equal(findPeptide('nope'), null);
});

test('the corpus counts what it says it counts', () => {
  const size = corpusSize();
  assert.equal(size.peptides, PEPTIDES.length);
  assert.equal(size.stacks, STACKS.length);
  assert.equal(size.studies, allStudies().length);
  assert.equal(size.claims, allClaims().length);
  assert.ok(size.studies >= 25, 'the library should be worth reading');
});

test('a source link goes to a real literature search', () => {
  const [study] = allStudies();
  const url = pubmedUrl(study);
  assert.ok(url.startsWith('https://pubmed.ncbi.nlm.nih.gov/?term='));
  assert.ok(decodeURIComponent(url).includes(study.search));
});

test('claims resolve to their studies', () => {
  const peptide = findPeptide('semaglutide');
  const claim = peptide.claims.find((entry) => entry.id === 'weight');
  const studies = claimStudies(peptide, claim);
  assert.equal(studies.length, 1);
  assert.equal(studies[0].id, 'sema-step1');
});

/* ------------------------------------------------------------- the tiers */

test('tiers are ordered and each is stricter than the one below', () => {
  for (let i = 1; i < TIERS.length; i += 1) {
    assert.ok(TIERS[i].rank > TIERS[i - 1].rank, 'ranks must ascend');
    assert.ok(TIERS[i].weight < TIERS[i - 1].weight, 'weights must descend');
    assert.ok(TIERS[i].ceiling < TIERS[i - 1].ceiling, 'ceilings must descend');
  }
  assert.equal(tier('no-such-tier').id, 'anecdotal', 'an unknown tier must fail to the weakest');
});

test('no quantity of weak evidence outranks one good trial', () => {
  const oneTrial = scoreEvidence([{ tier: 'human-rct', n: 1900, direction: 1, independent: true }]);
  const manyMice = scoreEvidence(Array.from({ length: 40 }, (_, i) => ({
    tier: 'animal', n: 60, direction: 1, independent: true, id: i,
  })));
  assert.ok(manyMice.score < oneTrial.score,
    `40 animal studies (${manyMice.score}) must not beat one RCT (${oneTrial.score})`);
  assert.ok(manyMice.score <= tier('animal').ceiling + 1e-9,
    'animal evidence must be capped at the animal ceiling');
});

test('the ceiling is a hard cap, not a soft one', () => {
  for (const entry of TIERS) {
    const piled = scoreEvidence(Array.from({ length: 60 }, (_, i) => ({
      tier: entry.id, n: 5000, direction: 1, independent: true, id: i,
    })));
    assert.ok(piled.score <= entry.ceiling + 1e-9,
      `${entry.id} reached ${piled.score}, above its ${entry.ceiling} ceiling`);
  }
});

test('an empty evidence base scores zero and says why', () => {
  const reading = scoreEvidence([]);
  assert.equal(reading.score, 0);
  assert.equal(reading.band.id, 'unsupported');
  assert.match(reading.reasons[0], /No studies/i);
});

test('conflicting results reduce confidence', () => {
  const agreeing = scoreEvidence([
    { tier: 'human-trial', n: 200, direction: 1, independent: true },
    { tier: 'human-trial', n: 200, direction: 1, independent: true },
  ]);
  const conflicting = scoreEvidence([
    { tier: 'human-trial', n: 200, direction: 1, independent: true },
    { tier: 'human-trial', n: 200, direction: -1, independent: true },
  ]);
  assert.ok(conflicting.score < agreeing.score, 'disagreement must cost confidence');
  assert.ok(conflicting.reasons.some((reason) => /conflict/i.test(reason)));
});

test('replication raises confidence', () => {
  const single = scoreEvidence([{ tier: 'human-trial', n: 300, direction: 1, independent: true }]);
  const replicated = scoreEvidence([
    { tier: 'human-trial', n: 300, direction: 1, independent: true },
    { tier: 'human-trial', n: 300, direction: 1, independent: true },
    { tier: 'human-trial', n: 300, direction: 1, independent: true },
  ]);
  assert.ok(replicated.score > single.score);
  assert.ok(replicated.reasons.some((reason) => /Replicated/i.test(reason)));
});

test('sample size counts, on a curve rather than linearly', () => {
  assert.ok(sampleWeight(2000) > sampleWeight(200));
  assert.ok(sampleWeight(2000) < sampleWeight(200) * 2, 'ten times the sample is not ten times the evidence');
  assert.ok(sampleWeight(0) > 0, 'an unstated sample still carries some weight');
});

test('a reading with no human data says so', () => {
  const reading = scoreEvidence([{ tier: 'animal', n: 40, direction: 1 }, { tier: 'invitro', direction: 1 }]);
  assert.ok(reading.reasons.some((reason) => /No human data/i.test(reason)));
});

test('bands are ordered and cover the whole range', () => {
  for (let i = 1; i < BANDS.length; i += 1) {
    assert.ok(BANDS[i].min < BANDS[i - 1].min, 'band thresholds must descend');
  }
  assert.equal(band(0).id, 'unsupported');
  assert.equal(band(1).id, 'established');
  assert.equal(band(0.5).id, 'emerging');
});

test('describe reads as a sentence', () => {
  const reading = scoreEvidence([{ tier: 'human-rct', n: 1900, direction: 1, independent: true }]);
  assert.match(describe(reading), /^[A-Z].*\d+%\./);
});

test('the tier mix is ordered strongest first', () => {
  const mix = tierMix([
    { tier: 'animal' }, { tier: 'human-rct' }, { tier: 'animal' }, { tier: 'invitro' },
  ]);
  assert.deepEqual(mix.map((item) => item.tier.id), ['human-rct', 'animal', 'invitro']);
  assert.equal(mix[1].count, 2);
});

test('every compound in the corpus scores inside its own ceiling', () => {
  for (const peptide of PEPTIDES) {
    const reading = scoreEvidence(peptide.studies);
    assert.ok(reading.score <= reading.best.ceiling + 1e-9,
      `${peptide.id} scored ${reading.score} above its ${reading.best.ceiling} ceiling`);
  }
});

test('semaglutide outranks every unapproved compound', () => {
  const approved = scoreEvidence(findPeptide('semaglutide').studies).score;
  for (const peptide of PEPTIDES) {
    if (peptide.regulatory.status === 'approved') continue;
    assert.ok(scoreEvidence(peptide.studies).score < approved,
      `${peptide.id} should not outrank an approved drug with outcome trials`);
  }
});

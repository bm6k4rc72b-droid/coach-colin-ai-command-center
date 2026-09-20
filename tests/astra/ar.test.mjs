/**
 * Unit tests for the AR bench's pure logic.
 *
 * The parts worth pinning down are the ones that decide what a reader can
 * actually see and read: which evidence becomes a panel, where panels hang in
 * space, which of them fade, and how many a given screen can hold before the
 * compound disappears behind its own citations.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  anchorFor, buildPanels, maxVisiblePanels, panelOpacity, stageRect, wrapText,
} from '../../public/astra/js/ar.js';
import { PEPTIDES, STACKS, findAny } from '../../public/astra/js/data/peptides.js';
import { entryReading } from '../../public/astra/js/engine.js';
import { tier } from '../../public/astra/js/evidence.js';

/* ---------------------------------------------------------------- panels */

test('every compound and stack produces a full set of panels', () => {
  for (const entry of [...PEPTIDES, ...STACKS]) {
    const panels = buildPanels(entry);
    assert.ok(panels.length >= 5, `${entry.id} produced only ${panels.length} panels`);
    const kinds = new Set(panels.map((panel) => panel.kind));
    assert.ok(kinds.has('evidence'), `${entry.id} is missing its evidence reading`);
    assert.ok(kinds.has('study'), `${entry.id} is missing its studies`);
    assert.ok(kinds.has('regulatory'), `${entry.id} is missing its regulatory status`);
    for (const panel of panels) {
      assert.ok(panel.title, `${entry.id}/${panel.id} has no title`);
      assert.ok(panel.lines.length >= 1, `${entry.id}/${panel.id} has no body`);
      assert.ok(/^#[0-9a-f]{6}$/i.test(panel.accent), `${entry.id}/${panel.id} has no accent`);
      assert.ok(Array.isArray(panel.anchor) && panel.anchor.length === 3);
    }
  }
  assert.deepEqual(buildPanels('nope'), []);
});

test('the evidence panel agrees with the dossier', () => {
  for (const entry of [...PEPTIDES, ...STACKS]) {
    const reading = entryReading(entry);
    const panel = buildPanels(entry).find((item) => item.kind === 'evidence');
    assert.equal(panel.title, reading.band.label, `${entry.id} shows a band the engine disagrees with`);
    assert.equal(panel.value, `${Math.round(reading.score * 100)}%`);
  }
});

test('every study panel carries its citation and a live link', () => {
  const panels = buildPanels('semaglutide').filter((panel) => panel.kind === 'study');
  assert.ok(panels.length >= 3);
  for (const panel of panels) {
    assert.ok(panel.url.startsWith('https://pubmed.ncbi.nlm.nih.gov/'), `${panel.id} has no literature link`);
    assert.match(panel.cite, /, \d{4}$/, `${panel.id} has no citation line`);
    // Design, population, finding and limitation all have to survive the trip.
    assert.equal(panel.lines.length, 4, `${panel.id} lost part of its record`);
    assert.match(panel.lines[1], /^Studied in: /);
    assert.match(panel.lines[3], /^Limitation: /);
  }
});

test('a panel is labelled with the tier it actually sits at', () => {
  for (const panel of buildPanels('bpc-157')) {
    if (!panel.tier) continue;
    assert.ok(panel.label.endsWith(tier(panel.tier).short),
      `${panel.id} is labelled "${panel.label}" for a ${panel.tier} record`);
  }
});

test('an unsupported claim says so on the panel itself', () => {
  const panel = buildPanels('bpc-157').find((item) => item.id === 'claim-systemic');
  assert.ok(panel, 'the marketing claim should become a panel');
  assert.equal(panel.tier, 'anecdotal');
  assert.ok(panel.lines.some((line) => /Nothing in the corpus supports this claim/.test(line)),
    'a claim with no studies must say so where it is read');
});

test('a stack panel set never implies combination evidence', () => {
  const panels = buildPanels('klow');
  const evidence = panels.find((panel) => panel.kind === 'evidence');
  assert.ok(entryReading('klow').score < 0.25);
  assert.equal(evidence.value, `${Math.round(entryReading('klow').score * 100)}%`);
  const regulatory = panels.find((panel) => panel.kind === 'regulatory');
  assert.match(regulatory.title, /strictest component/i);
});

/* --------------------------------------------------------------- anchors */

test('anchors spread around a ring at three heights', () => {
  const total = 9;
  const anchors = Array.from({ length: total }, (_, i) => anchorFor(i, total));
  const heights = new Set(anchors.map((anchor) => anchor[1]));
  assert.equal(heights.size, 3, 'panels should occupy three bands');
  // Consecutive panels must differ in height, or they stack.
  for (let i = 1; i < anchors.length; i += 1) {
    assert.notEqual(anchors[i][1], anchors[i - 1][1], `panels ${i - 1} and ${i} share a band`);
  }
  // Every anchor sits on the ring rather than at the origin.
  for (const anchor of anchors) {
    const radius = Math.hypot(anchor[0], anchor[2]);
    assert.ok(radius > 4 && radius < 5, `anchor radius ${radius} is off the ring`);
  }
});

test('anchor layout is deterministic', () => {
  assert.deepEqual(anchorFor(3, 10), anchorFor(3, 10));
  assert.notDeepEqual(anchorFor(3, 10), anchorFor(4, 10));
});

test('a single panel still gets a valid anchor', () => {
  const [x, y, z] = anchorFor(0, 1);
  assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
});

/* ----------------------------------------------------------------- fade */

test('panels fade with distance behind the compound', () => {
  const near = panelOpacity({ depth: 3.2, visible: true });
  const centre = panelOpacity({ depth: 7.4, visible: true });
  const far = panelOpacity({ depth: 11.6, visible: true });
  assert.ok(near > centre, 'the near side should be brighter than the centre');
  assert.ok(centre > far, 'the far side should be dimmer than the centre');
  assert.equal(far, 0, 'the back of the ring should be gone');
});

test('nothing behind the camera is drawn', () => {
  assert.equal(panelOpacity({ depth: 7.4, visible: false }), 0);
  assert.equal(panelOpacity({ depth: -3, visible: true }), 0);
});

test('a steeper falloff shows less at once', () => {
  const gentle = panelOpacity({ depth: 8.6, visible: true }, 7.4, 1.5);
  const steep = panelOpacity({ depth: 8.6, visible: true }, 7.4, 2.6);
  assert.ok(steep < gentle);
});

test('the fade follows the camera when it zooms', () => {
  // Pulling back must not black out every panel: the reference moves with it.
  const zoomedOut = panelOpacity({ depth: 14, visible: true }, 14);
  assert.ok(zoomedOut > 0.7, `panels vanished on zoom-out (${zoomedOut})`);
});

/* ---------------------------------------------------------------- stage */

test('a side panel takes the stage from the right', () => {
  const stage = stageRect({
    width: 1440,
    height: 900,
    panel: { left: 754, right: 1422, top: 62, bottom: 834, width: 668, height: 772 },
  });
  assert.equal(stage.left, 0);
  assert.equal(stage.right, 754);
  assert.equal(stage.cx, 377);
  assert.ok(stage.cy > stage.top && stage.cy < stage.bottom);
});

test('a bottom sheet takes the stage from below', () => {
  const stage = stageRect({
    width: 390,
    height: 844,
    panel: { left: 10, right: 380, top: 420, bottom: 780, width: 370, height: 360 },
  });
  assert.equal(stage.width, 390, 'a sheet should not narrow the stage');
  assert.equal(stage.bottom, 420);
  assert.ok(stage.top >= 58, 'the top bar should be excluded');
});

test('with no panel the stage is the whole viewport, less the chrome', () => {
  const stage = stageRect({ width: 1440, height: 900 });
  assert.equal(stage.left, 0);
  assert.equal(stage.right, 1440);
  assert.ok(stage.top > 0 && stage.bottom < 900);
});

test('the stage never collapses to nothing', () => {
  const stage = stageRect({
    width: 320,
    height: 200,
    panel: { left: 0, right: 320, top: 0, bottom: 200, width: 320, height: 200 },
  });
  assert.ok(stage.width >= 80 && stage.height >= 80);
});

/* --------------------------------------------------------------- budget */

test('a bigger stage shows more panels', () => {
  const desktop = maxVisiblePanels({ width: 754, height: 772 });
  const phone = maxVisiblePanels({ width: 390, height: 362 });
  assert.ok(desktop > phone, `desktop ${desktop} should beat phone ${phone}`);
  assert.equal(desktop, 6, 'a laptop stage should spend the full budget');
  assert.ok(phone >= 2 && phone <= 3, `a phone should show 2-3 panels, got ${phone}`);
});

test('the budget is bounded at both ends', () => {
  assert.ok(maxVisiblePanels({ width: 60, height: 60 }) >= 2, 'something must always be readable');
  assert.ok(maxVisiblePanels({ width: 4000, height: 4000 }) <= 6, 'a huge screen is still not a wall of text');
});

test('no compound offers more panels than a phone would ever show at once', () => {
  // Not a constraint on the corpus — a check that the budget is doing work.
  const phone = maxVisiblePanels({ width: 390, height: 362 });
  for (const entry of PEPTIDES) {
    assert.ok(buildPanels(entry).length > phone,
      `${entry.id} has too few panels for the rotation to reveal anything`);
  }
});

/* -------------------------------------------------------------- capture */

test('capture text wraps and truncates rather than overflowing', () => {
  const drawn = [];
  const ctx = {
    measureText: (text) => ({ width: text.length * 6 }),
    fillText: (text) => drawn.push(text),
  };
  wrapText(ctx, 'a short one', 0, 0, 200, 12, 2);
  assert.deepEqual(drawn, ['a short one']);

  drawn.length = 0;
  wrapText(ctx, 'this is a considerably longer title that will certainly need truncating somewhere', 0, 0, 120, 12, 2);
  assert.equal(drawn.length, 2, 'it must stop at the line budget');
  assert.ok(drawn[drawn.length - 1].endsWith('…'), 'truncation must be visible');
});

test('a panel set survives a compound with no claims', () => {
  const stack = findAny('klow');
  assert.equal(stack.claims, undefined, 'this test assumes a stack carries no claims');
  const panels = buildPanels(stack);
  assert.ok(panels.every((panel) => panel.kind !== 'claim'));
  assert.ok(panels.length >= 5);
});

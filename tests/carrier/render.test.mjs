/**
 * The frame: where things land, and whether the host would cover them.
 *
 * These are the assertions a screenshot cannot make precisely. A reel is played
 * inside another app's furniture, so "is the headline visible" is a question
 * about coordinates, and it is the question this engine exists to get right.
 *
 * @module tests/carrier/render
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { layoutFrame, wrapRuns } from '../../public/carrier/js/chrome.js';
import { renderFrame, drawScene } from '../../public/carrier/js/render.js';
import { buildTimeline } from '../../public/carrier/js/timeline.js';
import { CUT_SEC, parseScript, parseTitle } from '../../public/carrier/js/script.js';
import { WIFI_CSI } from '../../public/carrier/js/episodes/wifi-csi.js';
import { NIGHTOWL } from '../../public/carrier/js/theme.js';
import { stubContext, textBlob, texts } from './stub.mjs';

const SCRIPT = parseScript(WIFI_CSI);
const TIMELINE = buildTimeline(SCRIPT);

/**
 * Draw the episode at a moment and return the recording context.
 *
 * @param {number} t Seconds from the top.
 * @param {object} [options] Render options.
 * @returns {object} The stub context.
 */
function frameAt(t, options = {}) {
  const ctx = stubContext();
  renderFrame(ctx, SCRIPT, TIMELINE, t, options);
  return ctx;
}

test('nothing meaningful is drawn under the host app\'s own chrome', () => {
  const layout = layoutFrame({ size: SCRIPT.size, safeArea: SCRIPT.safeArea, titleLines: 2 });
  assert.ok(layout.kicker.y >= SCRIPT.safeArea.top, 'the kicker sits below the host header');
  assert.ok(layout.title.y >= SCRIPT.safeArea.top, 'the title sits below the host header');
  const bottomEdge = SCRIPT.size.h - SCRIPT.safeArea.bottom;
  assert.ok(layout.caption.y + layout.caption.h <= bottomEdge, 'the caption card clears the host footer');
  assert.ok(
    layout.progress.y + layout.progress.h <= layout.caption.y,
    'the progress strip sits above the caption card, not under the host footer',
  );
  assert.ok(layout.stats.y + layout.stats.h <= layout.progress.y, 'the stats sit above the progress');
  assert.ok(layout.panel.y + layout.panel.h <= layout.stats.y, 'the panel sits above the stats');
  assert.ok(
    layout.progress.y + layout.progress.h <= bottomEdge,
    'nothing the engine draws may fall inside the host footer band',
  );
});

test('a scene with no stats gives the space to the panel', () => {
  const withStats = layoutFrame({ size: SCRIPT.size, safeArea: SCRIPT.safeArea, hasStats: true });
  const without = layoutFrame({ size: SCRIPT.size, safeArea: SCRIPT.safeArea, hasStats: false });
  assert.ok(without.panel.h > withStats.panel.h);
});

test('the layout scales with the canvas rather than assuming 1080', () => {
  const half = layoutFrame({ size: { w: 540, h: 960 }, safeArea: { top: 150, bottom: 235 } });
  assert.equal(half.scale, 0.5);
  assert.ok(half.caption.h < 300);
  assert.ok(half.caption.y + half.caption.h <= 960 - 235);
});

test('every glyph drawn lands inside the canvas', () => {
  for (const t of [0, 6.9, 7.1, 20, 45, TIMELINE.total - 0.05]) {
    for (const call of texts(frameAt(t))) {
      assert.ok(call.x >= -2 && call.x <= SCRIPT.size.w, `x ${call.x} outside the frame at t=${t}`);
      assert.ok(call.y >= -2 && call.y <= SCRIPT.size.h, `y ${call.y} outside the frame at t=${t}`);
    }
  }
});

test('the caption types in and is complete by the end of its scene', () => {
  const scene = SCRIPT.scenes[0];
  const opening = textBlob(frameAt(0.05));
  const words = scene.caption.split(/\s+/);
  assert.ok(opening.includes(words[0]), 'the first word is on screen immediately');
  assert.ok(!opening.includes(words[words.length - 1]), 'the last word is not');

  const settled = textBlob(frameAt(scene.seconds - 0.1));
  for (const word of words) assert.ok(settled.includes(word), `"${word}" never landed`);
});

test('a cut draws both scenes, and only during the cut', () => {
  const cutAt = TIMELINE.cues[1].start;
  const during = textBlob(frameAt(cutAt + CUT_SEC / 2));
  assert.ok(during.includes(SCRIPT.scenes[0].kicker.toUpperCase()), 'the outgoing scene should still be there');
  assert.ok(during.includes(SCRIPT.scenes[1].kicker.toUpperCase()), 'the incoming scene should be there too');

  const after = textBlob(frameAt(cutAt + CUT_SEC + 0.2));
  assert.ok(!after.includes(SCRIPT.scenes[0].kicker.toUpperCase()), 'the dissolve must finish');
});

test('the title is drawn without its markup and wrapped to the frame', () => {
  const ctx = frameAt(SCRIPT.scenes[5].seconds / 2 + TIMELINE.cues[5].start);
  const blob = textBlob(ctx);
  assert.ok(blob.includes('Contain Your'), 'the plain half of the title');
  assert.ok(blob.includes('RF Boundary'), 'the accented half of the title');
  assert.ok(!blob.includes('[RF Boundary]'), 'the markup itself must never be drawn');
});

test('a title too long for one line wraps at a word, not mid-colour', () => {
  const ctx = stubContext();
  ctx.font = '52px mono';
  const lines = wrapRuns(ctx, parseTitle('They Do Not Need A Camera !To See The Room!'), 600);
  assert.ok(lines.length > 1);
  for (const line of lines) {
    assert.ok(!/^\s/.test(line[0].text), 'a line should not open on a space');
    assert.ok(!/\s$/.test(line[line.length - 1].text), 'a line should not end on a space');
  }
  const flattened = lines.flat().map((run) => run.text).join(' ');
  assert.ok(flattened.includes('To See The Room'), 'the accented phrase survives the wrap');
});

test('the safe-area guides are drawn only when the editor asks for them', () => {
  assert.ok(textBlob(frameAt(2, { guides: true })).includes('HOST CHROME'));
  assert.ok(!textBlob(frameAt(2, { guides: false })).includes('HOST CHROME'));
});

test('an empty episode renders a ground and nothing else, without throwing', () => {
  const empty = parseScript({ scenes: [] });
  const ctx = stubContext();
  const layout = renderFrame(ctx, empty, buildTimeline(empty), 0);
  assert.equal(layout, null);
  assert.ok(ctx.calls.some((call) => call.name === 'fillRect'), 'the ground is still painted');
});

test('a missing media slot draws the empty-slot panel instead of failing', () => {
  const ctx = stubContext();
  const scene = SCRIPT.scenes[0];
  drawScene(ctx, SCRIPT, scene, 1, { theme: NIGHTOWL, scale: 1, media: null });
  assert.ok(textBlob(ctx).includes('MEDIA SLOT'), 'an empty slot must announce itself');
});

test('a filled media slot is drawn, and the avatar comes from the script\'s slot', () => {
  const drawn = [];
  const media = {
    get: (slot) => ({ element: { slot }, width: 1920, height: 1080 }),
  };
  const ctx = stubContext();
  ctx.drawImage = (element) => drawn.push(element.slot);
  drawScene(ctx, SCRIPT, SCRIPT.scenes[0], 1, { theme: NIGHTOWL, scale: 1, media });
  assert.ok(drawn.includes('rfpose-clip'), 'the panel slot was never drawn');
  assert.ok(drawn.includes(SCRIPT.avatarSlot), 'the caption avatar was never drawn');
});

test('the same second always produces the same frame', () => {
  const once = frameAt(23.4);
  const twice = frameAt(23.4);
  assert.equal(JSON.stringify(once.calls), JSON.stringify(twice.calls));
});

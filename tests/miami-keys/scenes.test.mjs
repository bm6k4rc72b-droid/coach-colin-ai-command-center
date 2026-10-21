/**
 * The pacing of the Neon Keys film, checked without a browser.
 *
 * The brief fixes the running order and the words on screen, and the page
 * derives every scroll position from `layout()`. So the things worth pinning
 * down are: the order is the brief's order, neighbouring scenes overlap by
 * exactly the cross-fade (never a gap, which would flash black), each clip
 * finishes while its scene is fully on screen, and every scene has a picture.
 *
 * @module tests/miami-keys/scenes
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  SCENES, FLEET, FADE, MOBILE_SCALE, layout, sceneAt, clipProgress, copyWindow, price,
} from '../../public/miami-keys/js/scenes.js';
import { MEDIA } from '../../public/miami-keys/js/media.js';

const html = await readFile(new URL('../../public/miami-keys/index.html', import.meta.url), 'utf8');

test('scenes run in the order the brief fixes', () => {
  assert.deepEqual(SCENES.map((s) => s.id), [
    'hero', 'aventador-cockpit', 'aventador-spin',
    'gtb', 'gtb-cockpit', 'gtb-spin',
    'cullinan', 'cullinan-side', 'lambswool', 'starlight', 'cullinan-spin',
    'keys', 'final',
  ]);
});

test('the markup carries every scene, in the same order, with the brief\'s lines', () => {
  const ids = [...html.matchAll(/data-scene="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, SCENES.map((s) => s.id));
  const text = html.replace(/<br>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
  for (const line of [
    'The bull wakes up.', 'Flip the cover. Press start.', 'Spin the Aventador S',
    'Golden hour, door open.', 'The causeway is yours.', 'Spin the 296 GTB',
    'They open the other way.', 'Nothing else looks like it.', 'Lambswool underfoot.',
    'A sky of your own.', 'Spin the Cullinan', 'Four keys. Choose wisely.',
    'Pick a key. Miami’s waiting.',
  ]) {
    assert.ok(text.includes(line), `missing "${line}"`);
  }
  for (const spec of ['730', '2.9', '$1,200', '$1,100']) assert.ok(text.includes(spec), `missing ${spec}`);
});

for (const mobile of [false, true]) {
  test(`neighbours overlap by exactly one cross-fade (${mobile ? 'phone' : 'desktop'})`, () => {
    const { total, slots } = layout(SCENES, { mobile });
    assert.equal(slots[0].start, 0);
    for (let i = 1; i < slots.length; i += 1) {
      assert.ok(Math.abs(slots[i - 1].end - slots[i].start - FADE) < 1e-9, `scene ${i} overlap`);
      assert.ok(slots[i].end - slots[i].start >= FADE * 2, `scene ${i} too short to fade in and out`);
    }
    assert.equal(total, slots.at(-1).end);
  });
}

for (const mobile of [false, true]) {
  test(`every scene's words hold still long enough to read (${mobile ? 'phone' : 'desktop'})`, () => {
    const { slots } = layout(SCENES, { mobile });
    slots.forEach((slot, i) => {
      const w = copyWindow(slot, i === 0);
      assert.ok(w.enter >= slot.start && w.leave <= slot.end - FADE, `${SCENES[i].id} words outside its slot`);
      assert.ok(w.leave - w.settled >= 0.45, `${SCENES[i].id} holds only ${(w.leave - w.settled).toFixed(2)} vh`);
    });
  });
}

test('phones get a shorter film, not a different one', () => {
  const desk = layout(SCENES).total;
  const phone = layout(SCENES, { mobile: true }).total;
  assert.ok(phone < desk);
  assert.ok(phone > desk * MOBILE_SCALE * 0.8);
});

test('the incoming scene owns the cross-fade', () => {
  const { slots } = layout(SCENES);
  assert.equal(sceneAt(slots, 0), 0);
  assert.equal(sceneAt(slots, slots[1].start), 1);
  assert.equal(sceneAt(slots, slots[1].start - 0.01), 0);
  assert.equal(sceneAt(slots, 1e9), SCENES.length - 1);
});

test('a spin completes its 360° before its scene starts to leave', () => {
  const { slots } = layout(SCENES);
  SCENES.forEach((scene, i) => {
    const slot = slots[i];
    assert.equal(clipProgress(slot, slot.start, i === 0), 0);
    assert.equal(clipProgress(slot, slot.end - FADE, i === 0), 1);
    let prev = -1;
    for (let t = slot.start; t <= slot.end; t += 0.05) {
      const p = clipProgress(slot, t, i === 0);
      assert.ok(p >= prev && p >= 0 && p <= 1, `${scene.id} progress not monotonic at ${t}`);
      prev = p;
    }
  });
});

test('every scene with a picture has a poster, and every moving scene a clip', () => {
  for (const scene of SCENES) {
    if (!scene.media) continue;
    const entry = MEDIA[scene.media];
    assert.ok(entry, `${scene.id} has no media entry`);
    assert.match(entry.poster, /\.(png|webp|jpe?g)$/);
    assert.match(entry.video, /\.mp4$/);
    assert.ok(entry.alt, `${scene.id} has no alt text`);
  }
});

test('four keys, each with a key image, an accent and a price', () => {
  assert.equal(FLEET.length, 4);
  for (const car of FLEET) {
    assert.ok(MEDIA[car.key]?.poster, `${car.id} has no key image`);
    assert.match(car.accent, /^#[0-9a-f]{6}$/i);
    assert.ok(car.price > 0);
  }
  assert.equal(FLEET.find((c) => c.id === 'aventador').price, 1200);
  assert.equal(FLEET.find((c) => c.id === 'gtb').price, 1100);
});

test('prices read like a rate card', () => {
  assert.equal(price(1200), '$1,200');
  assert.equal(price(900), '$900');
  assert.equal(price(12345.4), '$12,345');
});

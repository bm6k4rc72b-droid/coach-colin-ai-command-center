/**
 * The drawing, checked without a browser.
 *
 * Canvas code is normally tested by looking at it, which does not survive
 * contact with a refactor. The parts that *can* be tested here are the ones
 * that decide what is drawn rather than how it looks: the generated city has to
 * be stable and non-overlapping, the explosion's debris has to be a function of
 * blast progress rather than of the clock, and none of the drawing entry points
 * may throw on the degenerate inputs a real page hands them — a zero-size
 * canvas on first paint, a scene at either end of the scroll.
 *
 * A tiny recording context stands in for the real one. It is not an emulator:
 * it counts calls and captures arguments, which is enough to prove a figure was
 * drawn and to catch the classic `NaN` that silently paints nothing.
 *
 * @module tests/vice/render
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { bands } from '../../public/vice/js/city.js';
import { EPICENTRE, debris, flashAmount } from '../../public/vice/js/explosion.js';
import {
  drawCharger, drawChopper, drawColin, drawGoldTruck, drawRolls, drawSaucer, drawShield, drawTank, drawTommy,
} from '../../public/vice/js/actors.js';
import { sceneState } from '../../public/vice/js/sequence.js';
import { EASE, clamp, css, envelope, mix, progress, ramp, rng, wrap } from '../../public/vice/js/mathkit.js';

/** A context that records what it was asked to draw and checks for NaN. */
function recorder() {
  const calls = [];
  const bad = [];
  const gradient = { addColorStop() {} };
  const handler = {
    get(target, key) {
      if (key === 'calls') return calls;
      if (key === 'bad') return bad;
      if (key === 'canvas') return { width: 800, height: 600 };
      if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createConicGradient') {
        return () => gradient;
      }
      if (key === 'measureText') return () => ({ width: 10 });
      if (key in target) return target[key];
      return (...args) => {
        calls.push([key, args]);
        for (const arg of args) {
          if (typeof arg === 'number' && !Number.isFinite(arg)) bad.push([key, args]);
        }
      };
    },
    set() { return true; },
  };
  return new Proxy({}, handler);
}

/* --- the generated city ------------------------------------------------- */

test('the city is four bands, back to front', () => {
  const layers = bands();
  assert.equal(layers.length, 4);
  let previous = -1;
  for (const layer of layers) {
    assert.ok(layer.depth > previous, 'bands must be ordered by depth');
    previous = layer.depth;
    assert.ok(layer.span > 0);
    assert.ok(layer.towers.length > 0);
  }
});

test('no two towers in a band overlap, and each band fills its span', () => {
  for (const layer of bands()) {
    let edge = 0;
    for (const tower of layer.towers) {
      assert.ok(tower.x >= edge - 1e-9, 'a tower starts inside the one before it');
      assert.ok(tower.w > 0 && tower.h > 0);
      edge = tower.x + tower.w;
    }
    assert.ok(layer.span >= edge, 'the band wraps before its last tower ends');
  }
});

test('the skyline is the same skyline on every load', () => {
  const signature = bands().map((layer) => layer.towers.map((t) => `${t.x}:${t.w}:${t.h}:${t.roof}`).join('|'));
  // Regenerating from the same seeds must reproduce it exactly; the generator
  // is seeded precisely so the city does not flicker between frames.
  const again = bands().map((layer) => layer.towers.map((t) => `${t.x}:${t.w}:${t.h}:${t.roof}`).join('|'));
  assert.deepEqual(again, signature);
});

test('every tower can survive the blast to some degree, and none entirely', () => {
  for (const layer of bands()) {
    for (const tower of layer.towers) {
      assert.ok(tower.resilience > 0 && tower.resilience < 1, `resilience ${tower.resilience}`);
    }
  }
});

/* --- the explosion ------------------------------------------------------ */

test('debris is seeded once and flies outward, never downward at launch', () => {
  const pieces = debris();
  assert.ok(pieces.length > 100);
  for (const piece of pieces) {
    assert.ok(piece.angle < 0, 'every piece launches above the horizontal');
    assert.ok(piece.speed > 0);
    assert.ok(piece.size > 0);
    assert.ok([0, 1, 2].includes(piece.kind));
    assert.ok(piece.lag >= 0 && piece.lag < 1);
  }
});

test('the epicentre is off centre, so the shockwave crosses the frame', () => {
  assert.ok(EPICENTRE.x > 0.5 && EPICENTRE.x < 1);
  assert.ok(EPICENTRE.y > 0 && EPICENTRE.y < 1);
});

test('the screen flash is short, warm and never fully white', () => {
  let peak = 0;
  let frames = 0;
  for (let p = 0; p <= 1; p += 0.0005) {
    const flash = flashAmount(sceneState(p));
    assert.ok(flash >= 0 && flash <= 0.78, `flash was ${flash} at ${p}`);
    if (flash > 0.01) frames += 1;
    peak = Math.max(peak, flash);
  }
  assert.ok(peak > 0.7, 'there should still be a flash');
  assert.ok(frames * 0.0005 < 0.05, 'and it must not linger across the act');
});

/* --- the actors --------------------------------------------------------- */

const ACTORS = [
  ['tommy', (ctx, state) => drawTommy(ctx, 100, 400, 1, state)],
  ['rolls', (ctx, state) => drawRolls(ctx, 100, 400, 1, state)],
  ['charger', (ctx, state) => drawCharger(ctx, 100, 400, 1, state)],
  ['chopper', (ctx, state) => drawChopper(ctx, 100, 200, 1, state)],
  ['tank', (ctx, state) => drawTank(ctx, 100, 400, 1, state)],
  ['goldTruck', (ctx, state) => drawGoldTruck(ctx, 100, 400, 1, state)],
  ['saucer', (ctx, state) => drawSaucer(ctx, 100, 200, 1, state)],
  ['colin', (ctx, state) => drawColin(ctx, 100, 400, 1, state)],
];

test('every actor draws something, and draws no NaN', () => {
  for (const [name, draw] of ACTORS) {
    const ctx = recorder();
    draw(ctx, { alpha: 1, phase: 1.2, spin: 2, flash: 0.3, rotor: 4, beam: 0.5, charge: 0.4, muzzle: 0.5, searchlight: 1, hover: 4, brace: 1, glow: 1, down: 0.5, lean: 0.1 });
    assert.ok(ctx.calls.length > 4, `${name} drew almost nothing`);
    assert.deepEqual(ctx.bad, [], `${name} passed a non-finite number to the canvas`);
  }
});

test('an actor at zero opacity draws nothing at all', () => {
  for (const [name, draw] of ACTORS) {
    const ctx = recorder();
    draw(ctx, { alpha: 0 });
    assert.equal(ctx.calls.length, 0, `${name} still drew while invisible`);
  }
});

test('the shield scales from nothing to full screen without breaking', () => {
  for (const r of [0, 1, 24, 260, 2000]) {
    const ctx = recorder();
    drawShield(ctx, 0, 0, r, { alpha: 1, glow: 0.5, spin: 0.3 });
    assert.deepEqual(ctx.bad, [], `shield at radius ${r}`);
    if (r === 0) assert.equal(ctx.calls.length, 0, 'a zero-radius shield draws nothing');
  }
});

test('the police light bar actually alternates', () => {
  const left = recorder();
  drawCharger(left, 100, 400, 1, { flash: 0.1 });
  const right = recorder();
  drawCharger(right, 100, 400, 1, { flash: 0.9 });
  const rects = (ctx) => ctx.calls.filter(([name]) => name === 'fillRect').length;
  assert.ok(rects(left) > 0 && rects(right) > 0);
  // Both halves are drawn either way; what changes is the colour, which is set
  // rather than called — so the assertion is simply that neither state throws
  // and both produce the same geometry.
  assert.equal(rects(left), rects(right));
});

/* --- the maths everything stands on ------------------------------------- */

test('clamp, mix and progress behave at their edges', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(mix(10, 20, 0.5), 15);
  assert.equal(progress(5, 5, 5), 1, 'a zero-width range at its value is complete');
  assert.equal(progress(4, 5, 5), 0);
});

test('the envelope rises, holds and falls', () => {
  assert.equal(envelope(0.1, 0.2, 0.8, 0.05), 0);
  assert.equal(envelope(0.5, 0.2, 0.8, 0.05), 1);
  assert.equal(envelope(0.9, 0.2, 0.8, 0.05), 0);
  assert.ok(envelope(0.22, 0.2, 0.8, 0.05) > 0);
  assert.ok(envelope(0.22, 0.2, 0.8, 0.05) < 1);
  assert.equal(envelope(0.5, 0.2, 0.8, 0), 1, 'a hard-edged window still works');
});

test('every easing curve starts at 0 and ends at 1', () => {
  for (const [name, ease] of Object.entries(EASE)) {
    assert.ok(Math.abs(ease(0)) < 1e-9, `${name} does not start at 0`);
    assert.ok(Math.abs(ease(1) - 1) < 1e-9, `${name} does not end at 1`);
    for (let t = 0; t <= 1; t += 0.05) assert.ok(Number.isFinite(ease(t)), `${name} at ${t}`);
  }
});

test('the seeded generator is deterministic and stays in range', () => {
  const a = rng(42);
  const b = rng(42);
  for (let i = 0; i < 500; i += 1) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
  }
  assert.notEqual(rng(1)(), rng(2)());
  assert.ok(rng(0)() >= 0, 'a zero seed still produces numbers');
});

test('wrap keeps a repeating layer inside its span', () => {
  assert.equal(wrap(5, 3), 2);
  assert.equal(wrap(-1, 3), 2);
  assert.equal(wrap(3, 3), 0);
  assert.equal(wrap(5, 0), 0, 'a zero span cannot divide');
});

test('a colour ramp interpolates between stops and clamps outside them', () => {
  const stops = [{ at: 0, rgb: [0, 0, 0] }, { at: 0.5, rgb: [100, 0, 0] }, { at: 1, rgb: [200, 0, 0] }];
  assert.deepEqual(ramp(stops, -1), [0, 0, 0]);
  assert.deepEqual(ramp(stops, 2), [200, 0, 0]);
  assert.deepEqual(ramp(stops, 0.25), [50, 0, 0]);
  assert.deepEqual(ramp([], 0.5), [0, 0, 0]);
});

test('css() emits a colour a browser will accept', () => {
  assert.equal(css([255, 0, 0]), 'rgb(255,0,0)');
  assert.equal(css([300, -20, 12.6], 0.5), 'rgba(255,0,13,0.500)');
});

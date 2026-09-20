/**
 * The film's timing.
 *
 * The brief for this page named three moments and the scroll positions they
 * had to happen at: the police on you at a quarter of the way down, the army
 * in the air at half, the detonation at three quarters. Those are not
 * decorative numbers — they are the spec. So most of what is asserted here is
 * not "does this function return a number" but "does the film still hit its
 * marks", which is the assertion that breaks the moment somebody nudges an act
 * boundary to make a paragraph fit.
 *
 * The rest is about reversibility. The whole production is a pure function of
 * scroll, which buys a property worth testing explicitly: scrubbing backwards
 * has to undo everything, with no state left behind at any position.
 *
 * @module tests/vice/sequence
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTS, actAt, actProgress, cameraShake, sceneState, shouldAnnounce, starCharge, wantedLevel,
} from '../../public/vice/js/sequence.js';

/** Walk the whole timeline at a fine step. */
function sweep(step = 0.002) {
  const frames = [];
  for (let p = 0; p <= 1.0000001; p += step) frames.push(sceneState(Math.min(p, 1)));
  return frames;
}

test('the acts tile the timeline with no gap and no overlap', () => {
  assert.equal(ACTS[0].from, 0);
  assert.equal(ACTS[ACTS.length - 1].to, 1);
  for (let i = 1; i < ACTS.length; i += 1) {
    assert.equal(ACTS[i].from, ACTS[i - 1].to, `${ACTS[i].id} does not start where ${ACTS[i - 1].id} ends`);
    assert.ok(ACTS[i].to > ACTS[i].from, `${ACTS[i].id} has no length`);
  }
});

test('every act id is unique and names a music cue', () => {
  const ids = new Set();
  for (const act of ACTS) {
    assert.ok(!ids.has(act.id), `duplicate act ${act.id}`);
    ids.add(act.id);
    assert.ok(act.cue, `${act.id} has no cue`);
    assert.ok(act.chapter && act.hud, `${act.id} is missing its HUD copy`);
  }
});

test('the police are on you at 25%', () => {
  const scene = sceneState(0.25);
  assert.equal(scene.act, 'chase');
  assert.ok(scene.police > 0.9, `police presence was ${scene.police}`);
  assert.ok(scene.rolls > 0.9, 'the car being chased should be on screen');
  assert.ok(scene.wanted >= 4, `wanted level was ${scene.wanted}`);
});

test('the army is in the air at 50%', () => {
  const scene = sceneState(0.5);
  assert.equal(scene.act, 'cavalry');
  assert.ok(scene.choppers > 0.1, `chopper presence was ${scene.choppers}`);
  assert.ok(sceneState(0.55).choppers > 0.9, 'the gunships should be fully in by mid-act');
  assert.ok(sceneState(0.55).tanks > 0.5, 'armour comes with them');
});

test('the detonation peaks at 75%', () => {
  const before = sceneState(0.74);
  const at = sceneState(0.75);
  const after = sceneState(0.78);
  assert.equal(at.act, 'detonation');
  assert.equal(before.blast, 0, 'nothing has gone off a point before the mark');
  assert.ok(at.blast > 0, 'the blast has started at the mark');
  assert.ok(after.blast > at.blast, 'and is still growing after it');
  assert.ok(at.saucer > 0.5, 'the saucer is overhead when it happens');
});

test('the shield arrives before the front does', () => {
  // The one ordering in the film that would be nonsense the other way round.
  const frames = sweep();
  const firstShield = frames.find((frame) => frame.shield > 0.01);
  const firstBlast = frames.find((frame) => frame.blast > 0.01);
  assert.ok(firstShield, 'the shield never arrives');
  assert.ok(firstBlast, 'the blast never happens');
  assert.ok(
    firstShield.p < firstBlast.p,
    `shield at ${firstShield.p} should precede the blast at ${firstBlast.p}`,
  );
  // And Tommy is down before the shockwave reaches him.
  const firstDown = frames.find((frame) => frame.tommyDown > 0.01);
  assert.ok(firstDown.p <= firstBlast.p);
});

test('wanted level climbs one star at a time and never skips', () => {
  let previous = wantedLevel(0);
  const seen = new Set([previous]);
  for (let p = 0; p <= 1.0000001; p += 0.0005) {
    const level = wantedLevel(Math.min(p, 1));
    assert.ok(
      level === previous || Math.abs(level - previous) === 1 || level === 0,
      `jumped from ${previous} to ${level} at ${p}`,
    );
    seen.add(level);
    previous = level;
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
});

test('the star currently charging is the one about to light', () => {
  for (let p = 0.2; p < 0.27; p += 0.002) {
    const charge = starCharge(p);
    assert.ok(charge >= 0 && charge < 1, `charge out of range at ${p}`);
  }
  assert.equal(starCharge(0.1), 0, 'nothing charges before the chase');
  assert.equal(starCharge(0.5), 0, 'nothing charges once it is pinned at five');
});

test('heat clears only once the city that was hunting you is gone', () => {
  assert.equal(wantedLevel(0.8), 5, 'still wanted while the blast is happening');
  assert.equal(wantedLevel(0.9), 0, 'cleared in the aftermath');
});

test('every scene field stays inside its range across the whole scroll', () => {
  const unit = [
    'tommyWalking', 'rolls', 'police', 'choppers', 'tanks', 'saucer', 'goldTruck',
    'blast', 'fireball', 'shock', 'embers', 'ruin', 'shield', 'shieldLock', 'tommyDown',
    'rain', 'sun', 'starCharge', 'actT',
  ];
  for (const scene of sweep()) {
    for (const key of unit) {
      assert.ok(
        scene[key] >= 0 && scene[key] <= 1,
        `${key} was ${scene[key]} at ${scene.p}`,
      );
    }
    assert.ok(scene.wanted >= 0 && scene.wanted <= 5);
    assert.ok(scene.shake >= 0 && scene.shake < 40, `shake was ${scene.shake} at ${scene.p}`);
    assert.ok(scene.speed >= 0, `speed went negative at ${scene.p}`);
    assert.ok(Number.isFinite(scene.skyTop[0]) && Number.isFinite(scene.skyLow[0]));
  }
});

test('the film is a pure function of scroll — the same position is the same frame', () => {
  // Sampled from an exact integer grid so the comparison is not really a test
  // of floating-point accumulation. The property under test is that scrolling
  // *down* to a position and scrolling back *up* to it produce the identical
  // frame, which is what makes the whole production reversible.
  const marks = Array.from({ length: 201 }, (unused, i) => i / 200);
  const down = new Map();
  for (const p of marks) down.set(p, JSON.stringify(sceneState(p)));
  for (const p of [...marks].reverse()) {
    assert.equal(JSON.stringify(sceneState(p)), down.get(p), `frame at ${p} differs on the way back up`);
  }
});

test('scrubbing above the blast un-explodes it', () => {
  assert.equal(sceneState(0.9).blast, 1);
  assert.equal(sceneState(0.6).blast, 0);
  assert.equal(sceneState(0.6).ruin, 0);
  assert.equal(sceneState(0.6).embers, 0);
});

test('out-of-range scroll is clamped rather than extrapolated', () => {
  assert.deepEqual(sceneState(-3), sceneState(0));
  assert.deepEqual(sceneState(12), sceneState(1));
});

test('act lookup and act progress agree at every boundary', () => {
  for (const act of ACTS) {
    assert.equal(actAt(act.from).id, act.id);
    assert.equal(actProgress(act.from), 0);
    const justBefore = actAt(act.to - 1e-6);
    assert.equal(justBefore.id, act.id, `${act.id} ended early`);
  }
});

test('the camera only shakes when something is shaking it', () => {
  assert.equal(cameraShake(0.05), 0, 'the arrival is calm');
  assert.equal(cameraShake(0.65), 0, 'the agent console is calm');
  assert.ok(cameraShake(0.25) > 1, 'the chase is not');
  assert.ok(cameraShake(0.55) > 1, 'the gunships are not');
  assert.ok(cameraShake(0.75) > 10, 'and the detonation is the loudest of them');
});

test('an act is announced once, on entry', () => {
  assert.ok(shouldAnnounce(null, 'arrival'));
  assert.ok(shouldAnnounce('arrival', 'brief'));
  assert.ok(!shouldAnnounce('brief', 'brief'));
  assert.ok(!shouldAnnounce('brief', ''));
});

test('the music cue changes with the act and never goes undefined', () => {
  for (const scene of sweep(0.005)) {
    assert.ok(['drift', 'chase', 'cavalry', 'blast', 'finale'].includes(scene.cue), scene.cue);
  }
});

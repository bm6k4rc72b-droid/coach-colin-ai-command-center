import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HEIGHT_M, STRIDE_RATIO, APPROACH, FOCAL_PX, strideLength, distanceAt,
  apparentHeight, gaitPhase, gaitPose, POSTURES, postureFor, operatorAt, rig,
} from '../../public/black-optic-6-site/js/operator.js';

test('stride is anthropometric, not invented', () => {
  assert.equal(strideLength(HEIGHT_M), HEIGHT_M * STRIDE_RATIO);
  assert.ok(strideLength(1.83) > 0.75 && strideLength(1.83) < 0.82);
});

test('the walk starts far and ends close, monotonically', () => {
  assert.ok(Math.abs(distanceAt(0) - APPROACH.startM) < 1e-9);
  assert.ok(Math.abs(distanceAt(1) - APPROACH.endM) < 1e-9);
  let previous = Infinity;
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const d = distanceAt(p);
    assert.ok(d < previous, `distance must fall at ${p}`);
    previous = d;
  }
});

test('apparent size grows at a constant rate, which is the whole point', () => {
  // Reciprocal distance is interpolated, so apparent height must be linear in
  // progress. If someone "simplifies" distanceAt to a plain lerp this fails.
  const steps = [0, 0.25, 0.5, 0.75, 1].map((p) => apparentHeight(distanceAt(p), 1080));
  const deltas = steps.slice(1).map((value, i) => value - steps[i]);
  const first = deltas[0];
  for (const delta of deltas) {
    assert.ok(Math.abs(delta - first) / first < 1e-6, 'growth per unit of scroll must be constant');
  }
});

test('apparent height follows the pinhole projection', () => {
  const h = apparentHeight(10, 1080, 1.8);
  assert.ok(Math.abs(h - (FOCAL_PX * 1.8) / 10) < 1e-9);
  // Halving the distance doubles the size.
  assert.ok(Math.abs(apparentHeight(5, 1080) / apparentHeight(10, 1080) - 2) < 1e-9);
  // A degenerate distance must not produce Infinity in a canvas call.
  assert.ok(Number.isFinite(apparentHeight(0, 1080)));
});

test('gait is driven by ground covered, so scrubbing back walks him back', () => {
  const stride = strideLength();
  const forward = gaitPhase(stride * 3);
  assert.ok(Math.abs(forward.steps - 3) < 1e-9);
  // One full cycle is two steps.
  assert.ok(Math.abs(gaitPhase(stride * 2).phase - gaitPhase(0).phase) < 1e-9);
  // Phase is always in range, including for negative nonsense.
  for (const covered of [-10, 0, 0.3, 77]) {
    const { phase } = gaitPhase(covered);
    assert.ok(phase >= 0 && phase < 1, `phase out of range for ${covered}`);
  }
});

test('the legs are in counterphase and the arms oppose the legs', () => {
  const pose = gaitPose(0.13);
  assert.ok(Math.abs(pose.left.hip + pose.right.hip) < 1e-9, 'hips must mirror');
  // Same-side arm opposes the opposite leg: left arm counters the right hip.
  assert.ok(Math.sign(pose.leftArm.shoulder) === -Math.sign(pose.right.hip));
});

test('knees flex in swing and stay near-straight in stance', () => {
  let maxStance = 0;
  let maxSwing = 0;
  for (let phase = 0; phase < 1; phase += 0.01) {
    const pose = gaitPose(phase);
    const a = phase * Math.PI * 2;
    const swinging = Math.sin(a - Math.PI / 2) > 0.5;
    if (swinging) maxSwing = Math.max(maxSwing, pose.left.knee);
    else maxStance = Math.max(maxStance, pose.left.knee);
  }
  assert.ok(maxSwing > 30, 'the swinging knee must genuinely bend');
  assert.ok(maxStance < maxSwing, 'the stance knee must stay straighter than the swing knee');
});

test('the body bobs twice per cycle and never below the floor', () => {
  const samples = [];
  for (let phase = 0; phase < 1; phase += 0.005) samples.push(gaitPose(phase).bob);
  assert.ok(Math.min(...samples) >= 0);
  // The cycle wraps, so the peak at phase 0 is only visible if the samples are
  // read as a ring rather than as a line.
  let peaks = 0;
  const n = samples.length;
  for (let i = 0; i < n; i += 1) {
    const before = samples[(i - 1 + n) % n];
    const after = samples[(i + 1) % n];
    if (samples[i] > before && samples[i] >= after) peaks += 1;
  }
  assert.equal(peaks, 2, 'a walk rises on each footfall — twice per two-step cycle');
});

test('posture swing scales the whole pose, so a carried prop calms the arms', () => {
  const full = gaitPose(0.2, { amplitude: 1 });
  const carried = gaitPose(0.2, { amplitude: 0.25 });
  assert.ok(Math.abs(carried.left.hip) < Math.abs(full.left.hip));
  assert.ok(Math.abs(carried.leftArm.shoulder) < Math.abs(full.leftArm.shoulder));
});

test('every scene has a posture and every posture has a real prop', () => {
  const props = new Set(['none', 'tablet', 'monocular', 'controller', 'watch', 'spotter', 'rifle-low']);
  for (const posture of POSTURES) {
    assert.ok(props.has(posture.prop), `unknown prop ${posture.prop}`);
    assert.ok(posture.swing > 0 && posture.swing <= 1);
    assert.ok(posture.note.length > 20, `${posture.id} needs a reason`);
  }
  assert.equal(postureFor('thermal').prop, 'monocular');
  assert.equal(postureFor('nonsense').id, 'arrival', 'unknown scenes fall back to empty hands');
});

test('the range posture is low ready — muzzle down, off the camera', () => {
  const range = postureFor('range');
  assert.equal(range.prop, 'rifle-low');
  assert.match(range.note, /low ready|Muzzle down/i);
});

test('operatorAt hands the renderer a complete, finite state', () => {
  for (const p of [0, 0.3, 0.77, 1]) {
    const state = operatorAt(p, { frameHeight: 900 });
    for (const key of ['distanceM', 'heightPx', 'footY', 'headY', 'haze', 'rim']) {
      assert.ok(Number.isFinite(state[key]), `${key} must be finite at ${p}`);
    }
    assert.ok(state.haze >= 0 && state.haze <= 1);
    assert.ok(state.rim >= 0 && state.rim <= 1);
    assert.ok(state.headY < state.footY, 'the head must be above the feet');
  }
});

test('he fades out of the haze as he closes, and picks up rim light', () => {
  assert.ok(operatorAt(0).haze > operatorAt(1).haze);
  assert.equal(operatorAt(1).haze, 0, 'at arrival there is no atmosphere left between him and the lens');
  assert.ok(operatorAt(1).rim > operatorAt(0).rim);
  assert.equal(operatorAt(0).rim, 0, 'sixty metres out he is nowhere near the practicals');
});

test('the rig uses canonical human proportions', () => {
  const skeleton = rig(gaitPose(0));
  // Femur and shin are near-equal and together make about half the body.
  const thigh = Math.hypot(skeleton.legL.knee.x - skeleton.legL.hip.x, skeleton.legL.knee.y - skeleton.legL.hip.y);
  const shin = Math.hypot(skeleton.legL.ankle.x - skeleton.legL.knee.x, skeleton.legL.ankle.y - skeleton.legL.knee.y);
  assert.ok(Math.abs(thigh - 0.25) < 0.02, 'femur ≈ 0.25 of standing height');
  assert.ok(Math.abs(shin - 0.24) < 0.02, 'shin ≈ 0.24 of standing height');
  assert.ok(skeleton.head.y > skeleton.neck.y);
  assert.ok(skeleton.pelvis.y > skeleton.legL.knee.y);
});

test('rig joints stay inside the unit figure, whatever the phase', () => {
  for (let phase = 0; phase < 1; phase += 0.02) {
    const skeleton = rig(gaitPose(phase));
    for (const chain of [skeleton.legL, skeleton.legR]) {
      for (const joint of Object.values(chain)) {
        assert.ok(Number.isFinite(joint.x) && Number.isFinite(joint.y));
        assert.ok(joint.y < 0.6, 'no leg joint belongs above the pelvis');
        assert.ok(Math.abs(joint.x) < 0.5, 'a leg that far out is a split, not a walk');
      }
    }
  }
});

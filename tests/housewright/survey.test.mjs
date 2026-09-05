/**
 * Unit tests for the survey chain: the pointing solver, the floor-plan
 * geometry and the massing extrusion.
 *
 * Everything under test is pure, so none of it needs a camera, a sensor or a
 * DOM. The numbers here are hand-checked trigonometry rather than snapshots —
 * a survey app whose maths is only tested against its own past output is not
 * tested at all.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

const mathkit = await import('../../public/housewright/js/mathkit.js');
const pose = await import('../../public/housewright/js/pose.js');
const plan = await import('../../public/housewright/js/plan.js');
const massing = await import('../../public/housewright/js/massing.js');

const D2R = Math.PI / 180;

/* --- units and formatting ----------------------------------------------- */

test('metres convert to the feet and inches a bid is written in', () => {
  assert.equal(mathkit.feetInches(3.7592), "12' 4\"");
  assert.equal(mathkit.feetInches(0.3048), "1' 0\"");
  // 2.4384 m is exactly eight feet, and must not print as 7' 12".
  assert.equal(mathkit.feetInches(2.4384), "8' 0\"");
});

test('angles wrap the short way round the compass', () => {
  assert.equal(mathkit.wrapDegrees(359), -1);
  assert.equal(mathkit.wrapDegrees(-181), 179);
  assert.equal(mathkit.wrapDegrees(180), 180);
});

test('money rounds to a band that does not overclaim precision', () => {
  assert.equal(mathkit.roundMoney(47318), 47000);
  assert.equal(mathkit.roundMoney(1234), 1200);
  assert.equal(mathkit.roundMoney(238000), 240000);
});

/* --- the pointing solver ------------------------------------------------ */

test('a phone lying flat looks straight down', () => {
  const ray = pose.pointingRay({ alpha: 0, beta: 0, gamma: 0 });
  assert.ok(Math.abs(ray.z + 1) < 1e-9, 'the ray points at the floor');
  assert.ok(Math.abs(pose.depression(ray) - 90) < 1e-6);
});

test('a phone held upright looks at the horizon', () => {
  const ray = pose.pointingRay({ alpha: 0, beta: 90, gamma: 0 });
  assert.ok(Math.abs(pose.depression(ray)) < 1e-6);
});

test('the floor hit is height over the tangent of the depression', () => {
  for (const [beta, height] of [[45, 1.5], [60, 1.45], [30, 1.6]]) {
    const ray = pose.pointingRay({ alpha: 0, beta, gamma: 0 });
    const hit = pose.floorHit(height, ray);
    const expected = height / Math.tan((90 - beta) * D2R);
    assert.ok(Math.abs(hit.distance - expected) < 1e-9, `beta ${beta}: ${hit.distance} vs ${expected}`);
  }
});

test('a grazing shot is refused rather than answered confidently', () => {
  // Two degrees below level: tan is tiny, so the distance would be enormous
  // and the error on it larger still.
  const ray = pose.pointingRay({ alpha: 0, beta: 88, gamma: 0 });
  assert.equal(pose.floorHit(1.45, ray), null);
  // And a ray pointing up never meets the floor at all.
  assert.equal(pose.floorHit(1.45, pose.pointingRay({ alpha: 0, beta: 110, gamma: 0 })), null);
});

test('aiming error costs more at a shallow angle than a steep one', () => {
  const steep = pose.floorHit(1.45, pose.pointingRay({ alpha: 0, beta: 30, gamma: 0 }));
  const shallow = pose.floorHit(1.45, pose.pointingRay({ alpha: 0, beta: 80, gamma: 0 }));
  assert.ok(shallow.spread > steep.spread * 5, 'the shallow shot is far noisier');
});

test('heading is measured from the survey reference, never from north', () => {
  // An indoor compass can sit thirty degrees off; relative headings are
  // unaffected because the offset cancels.
  assert.equal(pose.relativeHeading(100, 70), 30);
  assert.equal(pose.relativeHeading(10, 350), 20);
  assert.equal(pose.relativeHeading(350, 10), -20);
});

test('the screen angle rotates off-centre aim, and leaves the centre alone', () => {
  // At the centre of the frame there is nothing to rotate, so the reticle
  // shot is identical however the phone is held. This is why the reticle is
  // in the middle.
  const centred = (angle) => pose.floorHit(1.45, pose.pointingRay({ beta: 40, screenAngle: angle }));
  assert.ok(Math.abs(centred(0).distance - centred(90).distance) < 1e-12);

  // Off centre it must genuinely rotate: a square lens, a point at the right
  // edge, and a quarter turn of the screen puts that point where the top edge
  // was. Anything else means a landscape survey lands in the wrong place.
  const right = pose.screenRay({ u: 1, v: 0, fovX: 60, fovY: 60, screenAngle: 0 });
  const turned = pose.screenRay({ u: 1, v: 0, fovX: 60, fovY: 60, screenAngle: 90 });
  const top = pose.screenRay({ u: 0, v: -1, fovX: 60, fovY: 60, screenAngle: 0 });
  assert.ok(Math.abs(turned.x - top.x) < 1e-12 && Math.abs(turned.y - top.y) < 1e-12,
    'a quarter turn maps the right edge onto the top edge');
  // A 60° lens puts the right edge at x = 0.5 once normalised, and the turn
  // moves all of it onto the other axis.
  assert.ok(Math.abs(right.x - 0.5) < 1e-12 && Math.abs(turned.x) < 1e-12, 'and it is not a no-op');
});

test('calibration removes the error it was given', () => {
  const fixed = pose.calibrate(1.45, 3.0, 3.3);
  assert.ok(Math.abs(fixed.height - 1.595) < 1e-9);
  assert.ok(Math.abs(fixed.error - 0.1) < 1e-9);
  // A nonsense calibration leaves the height alone rather than zeroing it.
  assert.equal(pose.calibrate(1.45, 0, 3).height, 1.45);
});

test('height at a known distance reads a ceiling', () => {
  // Standing 3 m from a wall, aiming 30° up: the hit is 3·tan(30°) above the
  // hold height.
  const ray = pose.pointingRay({ alpha: 0, beta: 120, gamma: 0 });
  const h = pose.heightAtDistance(1.45, ray, 3);
  assert.ok(Math.abs(h - (1.45 + 3 * Math.tan(30 * D2R))) < 1e-9);
});

test('dwelling averages the shots and reports its own scatter', () => {
  const acc = pose.createAccumulator();
  assert.equal(acc.result(), null);
  acc.add({ x: 1.0, y: 2.0, range: 2.3 });
  acc.add({ x: 1.2, y: 2.0, range: 2.4 });
  acc.add({ x: 0.8, y: 2.0, range: 2.2 });
  const out = acc.result();
  assert.ok(Math.abs(out.x - 1.0) < 1e-9);
  assert.equal(out.samples, 3);
  assert.ok(out.scatter > 0.1 && out.scatter < 0.2, 'scatter reflects the spread');
});

/* --- the plan ----------------------------------------------------------- */

test('area and perimeter are measured, not assumed', () => {
  const rect = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
  assert.equal(plan.area(rect), 12);
  assert.equal(plan.perimeter(rect), 14);
  // An L-shape, to prove the shoelace is doing the work.
  const ell = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 3 }, { x: 0, y: 3 }];
  assert.equal(plan.area(ell), 10);
});

test('a nearly square room is squared up', () => {
  const noisy = [{ x: 0.03, y: -0.02 }, { x: 4.02, y: 0.09 }, { x: 3.94, y: 3.04 }, { x: -0.05, y: 2.97 }];
  const fitted = plan.regularise(noisy);
  assert.equal(fitted.snapped, 4, 'all four walls were within tolerance');
  const lengths = plan.walls(fitted.points).map((w) => w.length);
  // Opposite walls must now agree exactly; that is the whole point.
  assert.ok(Math.abs(lengths[0] - lengths[2]) < 1e-9);
  assert.ok(Math.abs(lengths[1] - lengths[3]) < 1e-9);
  assert.ok(fitted.shift < 0.1, 'no corner moved more than 10 cm');
});

test('a genuinely canted wall survives squaring', () => {
  // A room with one wall at 40° to the grid: squaring it would invent a
  // rectangle that is not there.
  const canted = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }];
  const fitted = plan.regularise(canted, { toleranceDeg: 12 });
  assert.ok(fitted.snapped < 4, 'the canted wall was left alone');
  const moved = Math.hypot(fitted.points[2].x - 3, fitted.points[2].y - 3);
  assert.ok(moved < 0.6, 'and its corner did not run away');
});

test('the dominant axis finds a rotated room', () => {
  const angle = 20 * D2R;
  const rotated = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]
    .map((p) => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) }));
  assert.ok(Math.abs(plan.dominantAxis(rotated) - 20) < 1e-6);
});

test('squaring a rotated room preserves its size and its angle', () => {
  const angle = 20 * D2R;
  const rotated = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]
    .map((p) => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) }));
  const fitted = plan.regularise(rotated);
  assert.ok(Math.abs(plan.area(fitted.points) - 12) < 1e-6, 'still twelve square metres');
});

test('a room reports the quantities a bid is priced from', () => {
  const room = plan.buildRoom({
    name: 'Great room',
    type: 'living',
    points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }],
    ceiling: 2.5,
  });
  assert.ok(Math.abs(room.area - 12) < 1e-9);
  assert.ok(Math.abs(room.areaSqft - 129.167) < 0.01);
  assert.ok(Math.abs(room.volume - 30) < 1e-9);
  // Wall area is the perimeter times the height, less what is cut out of it.
  assert.ok(Math.abs(room.wallArea - 35) < 1e-9);
});

test('openings are cut out of the wall area', () => {
  const base = plan.buildRoom({
    name: 'R', type: 'living', ceiling: 2.5,
    points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }],
  });
  const door = plan.makeOpening(base, 0, 2, 'door');
  const withDoor = plan.buildRoom({ ...base, openings: [door] });
  assert.ok(withDoor.wallArea < base.wallArea);
  assert.ok(Math.abs((base.wallArea - withDoor.wallArea) - door.width * door.height) < 1e-9);
});

test('an opening cannot hang off the end of its wall', () => {
  const room = plan.buildRoom({
    name: 'R', type: 'living', ceiling: 2.5,
    points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }],
  });
  const pushed = plan.makeOpening(room, 0, 99, 'door');
  assert.ok(pushed.along + pushed.width / 2 <= room.walls[0].length + 1e-9);
  const pulled = plan.makeOpening(room, 0, -99, 'door');
  assert.ok(pulled.along - pulled.width / 2 >= -1e-9);
});

test('a plan renders to SVG carrying its own dimensions', () => {
  const room = plan.buildRoom({
    name: 'Great room', type: 'living', ceiling: 2.5,
    points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }],
  });
  const svg = plan.toSvg(room);
  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>$/);
  assert.ok(svg.includes('4.00 m'), 'the long wall is dimensioned');
  assert.ok(svg.includes('13'), "and in feet — 4 m is 13'-1\"");
  assert.ok(svg.includes('planning grade'), 'the sheet carries its own caveat');
});

test('SVG escapes a room name that would otherwise break the document', () => {
  const room = plan.buildRoom({
    name: 'Ben & Jo\'s "suite" <main>', type: 'bedroom',
    points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }],
  });
  const svg = plan.toSvg(room);
  assert.ok(!svg.includes('<main>'), 'no raw markup survives');
  assert.ok(svg.includes('&amp;') && svg.includes('&lt;main&gt;'));
});

test('a survey summarises to the numbers the report reads', () => {
  const mk = (w, d, clg) => plan.buildRoom({
    name: 'R', type: 'living', ceiling: clg,
    points: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: 0, y: d }],
    openings: [{ wall: 0, along: 1, width: 1.2, height: 1.5, sill: 0.9, kind: 'window' }],
  });
  const total = plan.summarise([mk(4, 3, 2.4), mk(5, 4, 3.0)]);
  assert.equal(total.rooms, 2);
  assert.ok(Math.abs(total.area - 32) < 1e-9);
  // The mean ceiling is weighted by floor area, not by room count.
  assert.ok(Math.abs(total.meanCeiling - (2.4 * 12 + 3.0 * 20) / 32) < 1e-9);
  assert.ok(total.glazingRatio > 0 && total.glazingRatio < 0.2);
});

/* --- the massing model -------------------------------------------------- */

test('a room extrudes to a solid with a floor and one face per wall', () => {
  const room = plan.buildRoom({
    name: 'R', type: 'living', ceiling: 2.6,
    points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }],
  });
  const model = massing.extrude(room);
  const walls = model.faces.filter((f) => f.kind === 'wall');
  assert.equal(walls.length, 4);
  assert.equal(model.faces.filter((f) => f.kind === 'floor').length, 1);
  assert.ok(Math.abs(model.centre.z - 1.3) < 1e-9);
});

test('an opening becomes a hole, not a decal', () => {
  const room = plan.buildRoom({
    name: 'R', type: 'living', ceiling: 2.6,
    points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }],
  });
  room.openings = [
    { wall: 0, along: 2, width: 0.9, height: 2.03, sill: 0, kind: 'door' },
    { wall: 1, along: 1.5, width: 1.2, height: 1.4, sill: 0.9, kind: 'window' },
  ];
  const model = massing.extrude(room);
  assert.equal(model.faces.filter((f) => f.kind === 'void').length, 1, 'the door is a void');
  assert.equal(model.faces.filter((f) => f.kind === 'glass').length, 1, 'the window is glazed');
  // The pierced walls are split into panels either side, plus a header.
  assert.ok(model.faces.filter((f) => f.kind === 'wall').length > 4);
});

test('projection puts the model on screen and orders it back to front', () => {
  const room = plan.buildRoom({
    name: 'R', type: 'living', ceiling: 2.6,
    points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }],
  });
  const model = massing.extrude(room);
  const camera = massing.orbitCamera(model, { yaw: 35, pitch: 28 });
  const faces = massing.rasterOrder(model, camera, 800, 600);
  assert.ok(faces.length >= 5);
  for (let i = 1; i < faces.length; i += 1) {
    assert.ok(faces[i - 1].depth >= faces[i].depth, 'nearest is drawn last');
  }
  for (const face of faces) {
    for (const p of face.points) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    }
  }
});

test('the camera never degenerates by looking straight down', () => {
  const room = plan.buildRoom({
    name: 'R', type: 'living', ceiling: 2.6,
    points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }],
  });
  const model = massing.extrude(room);
  const camera = massing.orbitCamera(model, { pitch: 90 });
  const faces = massing.rasterOrder(model, camera, 800, 600);
  assert.ok(faces.length > 0, 'a plan view still renders');
  for (const face of faces) {
    for (const p of face.points) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCENES, scene, capability, resolve, citedIds, CAMERA_VARIANTS, THERMAL_VARIANTS,
  THERMAL_SOURCES, SATELLITE_VARIANTS, RESOLUTION_LADDER, DEVICE_HIGHLIGHTS, RANGE_FRAMING,
} from '../../public/black-optic-6-site/js/catalog.js';
import { CAPABILITIES, tally } from '../../public/black-optic-6/js/capability.js';
import { PALETTES } from '../../public/black-optic-6/js/thermal.js';
import { SATELLITES } from '../../public/black-optic-6/js/satellite.js';

test('every claim on the site traces to a row in the console ledger', () => {
  const known = new Set(CAPABILITIES.map((row) => row.id));
  for (const id of citedIds()) {
    assert.ok(known.has(id), `the site cites "${id}", which is not in the ledger`);
  }
});

test('a cited row is shown wearing the ledger state, never a softened one', () => {
  for (const id of citedIds()) {
    const ledger = CAPABILITIES.find((row) => row.id === id);
    const shown = resolve(id);
    assert.equal(shown.state, ledger.state, `${id} is displayed as ${shown.state} but the ledger says ${ledger.state}`);
    assert.equal(shown.verdict, ledger.verdict, `${id}'s verdict must be the ledger's words, not the site's`);
  }
});

test('capability() throws on a typo rather than rendering a blank card', () => {
  assert.throws(() => capability('not-a-row'), /no capability row/);
});

test('the film shows the unsound rows instead of hiding them', () => {
  const unsound = CAPABILITIES.filter((row) => row.state === 'UNSOUND').map((row) => row.id);
  const cited = new Set(citedIds());
  // Two rows are about the console's own internals rather than a sellable
  // feature, so they live in the console's ledger panel rather than the film.
  const internal = new Set(['canvas-taint', 'music-during-watch']);
  for (const id of unsound) {
    if (internal.has(id)) continue;
    assert.ok(cited.has(id), `${id} is unsound and must be named on the site, not quietly dropped`);
  }
});

test('the ledger act names every unsound capability it can', () => {
  const act = scene('ledger');
  for (const id of act.shows) {
    assert.equal(resolve(id).state, 'UNSOUND', `${id} is in the "rows that say no" act but is not unsound`);
  }
  assert.ok(act.shows.length >= 10, 'the honest act must not shrink quietly');
});

test('the tally on the title card is the real count', () => {
  const counts = tally();
  assert.equal(counts.LIVE + counts.LINK + counts.MODEL + counts.BLOCKED + counts.HARDWARE + counts.UNSOUND, CAPABILITIES.length);
  // The copy on the arrival card quotes these numbers; if they move, the copy must.
  const line = scene('arrival').line;
  for (const n of [CAPABILITIES.length, counts.LIVE, counts.LINK, counts.UNSOUND]) {
    assert.match(line, new RegExp(`\\b${n}\\b`), `the title card must quote ${n} and stay true as the ledger grows`);
  }
  assert.match(SCENES[0].kicker, /sensing platform/i);
});

test('every act is complete and distinctly graded', () => {
  const ids = new Set();
  for (const act of SCENES) {
    assert.ok(!ids.has(act.id), `duplicate act ${act.id}`);
    ids.add(act.id);
    assert.ok(act.title.length > 3, `${act.id} needs a title`);
    assert.ok(act.line.length > 60, `${act.id} needs a real line, not a placeholder`);
    assert.equal(act.tint.length, 3, `${act.id} needs a backdrop tint`);
    for (const channel of act.tint) assert.ok(channel >= 0 && channel <= 1);
    assert.ok(act.energy >= 0 && act.energy <= 1);
    assert.ok(act.weight > 0);
  }
  assert.equal(scene('nope'), null);
});

test('hardware lists are imported, not retyped', () => {
  assert.equal(THERMAL_VARIANTS.length, PALETTES.length);
  for (const palette of THERMAL_VARIANTS) {
    const source = PALETTES.find((p) => p.id === palette.id);
    assert.ok(source, `palette ${palette.id} is not one the renderer has`);
    assert.equal(palette.name, source.name);
    assert.ok(palette.use.length > 20, `${palette.id} must say what it is for`);
    assert.ok(palette.stops.length >= 2);
  }
  assert.equal(SATELLITE_VARIANTS.length, SATELLITES.length);
  for (const sat of SATELLITE_VARIANTS) {
    assert.ok(sat.nadirPixelM > 0 && sat.edgePixelM >= sat.nadirPixelM,
      `${sat.id}: a pixel at swath edge is always coarser than at nadir`);
  }
});

test('the thermal sources keep degrees out of anything that is not radiometric', () => {
  const radiometric = THERMAL_SOURCES.filter((source) => source.temperature);
  assert.equal(radiometric.length, 1, 'exactly one source may report degrees');
  assert.equal(radiometric[0].id, 'RADIOMETRIC');
  for (const source of THERMAL_SOURCES) {
    if (source.temperature) continue;
    assert.equal(source.unit, '', `${source.id} must carry no unit`);
  }
});

test('the resolution ladder always prices what it offers', () => {
  assert.ok(RESOLUTION_LADDER.length >= 4);
  for (const rung of RESOLUTION_LADDER) {
    assert.ok(rung.cost.length > 0, `${rung.tier} must say what it costs`);
    assert.ok(rung.resolution.length > 0);
    assert.ok(rung.revisit.length > 0);
  }
});

test('camera variants each name the route that makes them work', () => {
  assert.ok(CAMERA_VARIANTS.length >= 10);
  assert.ok(CAMERA_VARIANTS.some((v) => v.state === 'BLOCKED'), 'the cameras that cannot work must be listed too');
  const ids = new Set();
  for (const variant of CAMERA_VARIANTS) {
    assert.ok(!ids.has(variant.id), `duplicate camera variant ${variant.id}`);
    ids.add(variant.id);
    assert.ok(variant.route.length > 0, `${variant.id} must say how it reaches the console`);
    assert.ok(variant.note.length > 30, `${variant.id} needs a real note`);
    // BLOCKED is allowed and expected here: a cloud-only camera that never
    // exposes a stream is a camera people own, and saying so is the point.
    assert.ok(['LIVE', 'LINK', 'BLOCKED'].includes(variant.state), `${variant.id} has state ${variant.state}`);
  }
  // The Argus battery models are the awkward case; they must be present and honest.
  const battery = CAMERA_VARIANTS.find((v) => v.id === 'argus-argus-battery');
  assert.ok(battery, 'the battery Argus must be listed — it is the one everyone owns');
  assert.match(battery.route, /snapshot/i);
});

test('the highlighted devices are drones, watches and glasses, each ledger-backed', () => {
  const groups = DEVICE_HIGHLIGHTS.map((g) => g.group);
  assert.deepEqual(groups, ['Drones', 'Smart watches', 'Smart glasses']);
  for (const group of DEVICE_HIGHLIGHTS) {
    assert.ok(group.items.length >= 2, `${group.group} needs more than one entry`);
    for (const item of group.items) {
      const row = resolve(item.capability);
      assert.ok(row.name.length > 0);
      assert.ok(item.detail.length > 40, `${item.name} needs a real explanation`);
    }
  }
});

test('the glasses group is honest that no vendor opens the feed', () => {
  const glasses = DEVICE_HIGHLIGHTS.find((g) => g.group === 'Smart glasses');
  const feed = glasses.items.find((item) => item.capability === 'glasses-feed');
  assert.ok(feed, 'the live-feed row must be in the glasses group');
  assert.equal(resolve('glasses-feed').state, 'BLOCKED');
});

test('the Apple Watch row is shown blocked rather than omitted', () => {
  const watches = DEVICE_HIGHLIGHTS.find((g) => g.group === 'Smart watches');
  const apple = watches.items.find((item) => item.capability === 'apple-watch');
  assert.ok(apple);
  assert.equal(resolve('apple-watch').state, 'BLOCKED');
  // And a working alternative is offered in the same breath.
  assert.ok(watches.items.some((item) => resolve(item.capability).state === 'LINK'));
});

test('the range section says what it is and what it is not', () => {
  assert.ok(RANGE_FRAMING.is.length > 40);
  assert.match(RANGE_FRAMING.isNot, /not a targeting system/i);
  assert.equal(resolve(RANGE_FRAMING.capability).state, 'UNSOUND',
    'the turret row must still be unsound — this section does not quietly deliver it');
});

/**
 * Unit tests for the video wall.
 *
 * The panels render from the same feed items the Ops deck lists, so the
 * snapshot builder is the contract between the two and is pinned here. The
 * renderers themselves are exercised against a stub 2D context, which is
 * enough to catch a panel that throws or draws nothing.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DESK_SPEC, PANEL_SPECS, drawPanel, histogram, snapshot } from '../../public/nexus/js/panels.js';

/** A feed picture with one of everything the wall knows how to draw. */
const ITEMS = [
  { source: 'quakes', sourceLabel: 'Seismic', category: 'quake', title: 'Off Honshu', detail: 'M6.2 · depth 30 km', lat: 38.3, lon: 142.4, severity: 'high', at: Date.now() },
  { source: 'quakes', sourceLabel: 'Seismic', category: 'quake', title: 'Aegean Sea', detail: 'M3.8 · depth 12 km', lat: 37.9, lon: 26.5, severity: 'low', at: Date.now() },
  { source: 'aircraft', sourceLabel: 'Air traffic', category: 'aircraft', title: 'BAW117', detail: 'B789 · FL380 · 480 kt', lat: 51.4, lon: -0.4, severity: 'low', at: Date.now() },
  { source: 'aircraft', sourceLabel: 'Air traffic', category: 'aircraft', title: 'SIM101', detail: 'A320 · FL120 · 320 kt', lat: 40.6, lon: -73.7, severity: 'low', at: Date.now() },
  { source: 'launches', sourceLabel: 'Launches', category: 'launch', title: 'Falcon 9 · Starlink', detail: 'Go · Canaveral', lat: 28.5, lon: -80.5, severity: 'medium', at: Date.now() },
  { source: 'vulns', sourceLabel: 'Vulnerabilities', category: 'threat', title: 'CVE-2026-1234', detail: '82.1% exploitation in 30 days', lat: 10, lon: 20, severity: 'high', at: Date.now() },
];

/**
 * A canvas 2D context stub that records the calls a renderer makes.
 *
 * @param {number} width Canvas width.
 * @param {number} height Canvas height.
 * @returns {object} Stub context with a `calls` tally.
 */
function stubContext(width = 640, height = 400) {
  const calls = { fillRect: 0, arc: 0, stroke: 0, fillText: 0, fill: 0 };
  const noop = () => {};
  const gradient = { addColorStop: noop };
  return new Proxy({
    canvas: { width, height },
    calls,
    fillRect: () => { calls.fillRect += 1; },
    arc: () => { calls.arc += 1; },
    stroke: () => { calls.stroke += 1; },
    fill: () => { calls.fill += 1; },
    fillText: () => { calls.fillText += 1; },
    createLinearGradient: () => gradient,
    createConicGradient: () => gradient,
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    clearRect: noop,
    strokeRect: noop,
    translate: noop,
    scale: noop,
  }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return typeof prop === 'string' ? undefined : undefined;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}

test('histogram bins across the observed range, not a nominal one', () => {
  // A tightly clustered feed must still produce a readable shape.
  const bins = histogram([4.0, 4.1, 4.2, 4.3, 4.4, 4.5], 6);
  assert.equal(bins.reduce((a, b) => a + b, 0), 6);
  assert.ok(bins.filter((b) => b > 0).length >= 4, `too clustered: ${bins.join(',')}`);
  assert.deepEqual(histogram([], 5), [0, 0, 0, 0, 0]);
  // One sample is not a distribution; it stacks in the middle rather than
  // pinning to the left edge, which would read as "all low".
  assert.deepEqual(histogram([7], 3), [0, 1, 0]);
  assert.deepEqual(histogram([5, 5, 5], 5), [0, 0, 3, 0, 0]);
});

test('the snapshot exposes what each panel needs', () => {
  const data = snapshot(ITEMS, { time: 12, status: '4/6 LIVE', gauges: [{ label: 'x', value: 0.5, display: '50%' }] });

  assert.equal(data.status, '4/6 LIVE');
  assert.equal(data.time, 12);
  // Threat board takes the severe and the security feeds, nothing else.
  assert.ok(data.threats.length >= 2);
  assert.ok(data.threats.some((t) => t.title === 'CVE-2026-1234'));
  assert.ok(!data.threats.some((t) => t.title === 'Aegean Sea'), 'a routine quake is not a threat-board row');

  assert.equal(data.series.quakes.reduce((a, b) => a + b, 0), 2);
  assert.equal(data.series.altitudes.reduce((a, b) => a + b, 0), 2);
  assert.equal(data.markers.length, 6);
  assert.equal(data.contacts.length, 2);
  for (const contact of data.contacts) {
    assert.ok(contact.range > 0 && contact.range <= 1, `range out of bounds: ${contact.range}`);
  }
  assert.ok(data.log[0].stamp.match(/^\d\d:\d\d:\d\d$/));
  assert.ok(data.log[0].text.includes('SEISMIC'));
});

test('the snapshot survives an empty feed', () => {
  const data = snapshot([], {});
  assert.deepEqual(data.threats, []);
  assert.deepEqual(data.markers, []);
  assert.equal(data.log.length, 0);
  assert.equal(data.series.quakes.length, 12);
});

test('every panel draws something, at wall size and at desk size', () => {
  const data = snapshot(ITEMS, {
    time: 3,
    status: 'LIVE',
    gauges: [
      { label: 'feed integrity', value: 0.8, display: '80%' },
      { label: 'geomagnetic Kp', value: 0.4, display: '3.6' },
    ],
    agents: [{ name: 'Scholar', colour: '#5ad8ff' }, { name: 'Critic', colour: '#c9a0ff' }],
  });

  for (const spec of [...PANEL_SPECS, DESK_SPEC]) {
    for (const [w, h] of [[768, 448], [256, 160]]) {
      const ctx = stubContext(w, h);
      drawPanel(ctx, spec, data);
      const drew = ctx.calls.fillRect + ctx.calls.stroke + ctx.calls.fill + ctx.calls.fillText;
      assert.ok(drew > 5, `${spec.id} drew almost nothing at ${w}x${h} (${drew} ops)`);
    }
  }
});

test('panels tolerate a feed with no data at all', () => {
  const data = snapshot([], { time: 0 });
  for (const spec of [...PANEL_SPECS, DESK_SPEC]) {
    const ctx = stubContext();
    assert.doesNotThrow(() => drawPanel(ctx, spec, data), `${spec.id} threw on an empty feed`);
  }
});

test('the wall places the world map dead centre', () => {
  assert.equal(PANEL_SPECS.length, 9);
  assert.equal(PANEL_SPECS[4].id, 'world', 'the hero panel must sit behind the receptionist');
  assert.ok(PANEL_SPECS.some((p) => p.id === 'threat-map' && p.hostile));
});

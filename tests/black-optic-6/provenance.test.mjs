/**
 * Provenance: the rule that nothing unmeasured may raise an alarm.
 *
 * @module tests/black-optic-6/provenance
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ORDER, STATES, actionable, ageSeconds, format, reading, stateFor }
  from '../../public/black-optic-6/js/provenance.js';

test('an unknown state falls closed rather than open', () => {
  assert.equal(stateFor('nonsense').id, 'UNSOUND');
  assert.equal(stateFor(undefined).trustworthy, false);
});

test('only measured states may drive an alert', () => {
  for (const id of ['LIVE', 'LINK', 'MODEL']) {
    assert.equal(actionable(reading(id, 1)), true, `${id} should be actionable`);
  }
  for (const id of ['BLOCKED', 'HARDWARE', 'UNSOUND']) {
    assert.equal(actionable(reading(id, 1)), false, `${id} must never raise an alarm`);
  }
});

test('a reading with no value is never actionable, whatever its state', () => {
  assert.equal(actionable(reading('LIVE', null)), false);
  assert.equal(actionable(null), false);
});

test('a modelled number carries its error into the text', () => {
  assert.equal(format(reading('MODEL', 1.236, { unit: 'm/s', error: 0.15 }), 2), '1.24 ±0.15 m/s');
  assert.equal(format(reading('LIVE', 'person')), 'person');
  assert.equal(format(reading('BLOCKED', null)), '—');
});

test('every state has a tone, a meaning and a place in the order', () => {
  for (const [id, value] of Object.entries(STATES)) {
    assert.equal(value.id, id);
    assert.ok(value.tone && value.meaning && value.label);
    assert.ok(ORDER.includes(id), `${id} missing from the display order`);
  }
  assert.equal(ORDER.length, Object.keys(STATES).length);
});

test('age is reported only when a reading was timestamped', () => {
  const now = 1_700_000_000_000;
  assert.equal(ageSeconds(reading('LIVE', 1), now), null);
  assert.equal(ageSeconds(reading('LIVE', 1, { atMs: now - 4000 }), now), 4);
});

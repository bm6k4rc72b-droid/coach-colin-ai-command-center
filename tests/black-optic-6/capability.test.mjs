/**
 * The ledger: every specified capability is answered, and the refusals stay refused.
 *
 * @module tests/black-optic-6/capability
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { BOARDS, CAPABILITIES, forPanel, inState, tally }
  from '../../public/black-optic-6/js/capability.js';
import { STATES } from '../../public/black-optic-6/js/provenance.js';

test('every row is complete and uses a real state and a real board', () => {
  const seen = new Set();
  for (const row of CAPABILITIES) {
    assert.ok(row.id && !seen.has(row.id), `duplicate or missing id: ${row.id}`);
    seen.add(row.id);
    assert.ok(row.name, `${row.id} has no name`);
    assert.ok(STATES[row.state], `${row.id} has an unknown state ${row.state}`);
    assert.ok(BOARDS[row.board], `${row.id} cites an unknown board ${row.board}`);
    assert.ok(row.verdict.length > 40, `${row.id} needs a real verdict, not a label`);
  }
});

test('every board on the specification is represented', () => {
  const covered = new Set(CAPABILITIES.map((row) => row.board));
  for (const board of Object.keys(BOARDS)) {
    assert.ok(covered.has(board), `nothing answers the ${board} board`);
  }
});

test('anything that cannot be delivered explains what would change the answer', () => {
  for (const row of CAPABILITIES) {
    if (STATES[row.state].trustworthy) continue;
    assert.ok(row.path, `${row.id} says no without saying what would change it`);
  }
});

test('a capability that claims a panel is in a state that could have one', () => {
  for (const row of CAPABILITIES) {
    if (!row.panel) continue;
    assert.ok(
      STATES[row.state].trustworthy,
      `${row.id} claims the ${row.panel} deck delivers it while being ${row.state}`,
    );
  }
});

test('the refused capabilities are refused, and stay that way', () => {
  // These are the rows a future edit is most likely to quietly "enable".
  const mustRemainUnsound = [
    'intent', 'threat-score', 'concealed-object', 'load-estimate', 'gait-id',
    'through-wall-vitals', 'magnetic-firearm',
  ];
  for (const id of mustRemainUnsound) {
    const row = CAPABILITIES.find((entry) => entry.id === id);
    assert.ok(row, `${id} has been removed from the ledger rather than answered`);
    assert.equal(row.state, 'UNSOUND', `${id} must not be presented as deliverable`);
    assert.equal(row.panel, undefined, `${id} must not be wired to a deck`);
  }
});

test('gait is measured but never used to identify a person', () => {
  const measurement = CAPABILITIES.find((row) => row.id === 'gait-analysis');
  const identity = CAPABILITIES.find((row) => row.id === 'gait-id');
  assert.equal(measurement.state, 'LIVE');
  assert.equal(identity.state, 'UNSOUND');
  assert.match(measurement.verdict, /not whose body/i);
});

test('the tally covers every row and the panel index agrees with it', () => {
  const counts = tally();
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), CAPABILITIES.length);
  for (const [id, count] of Object.entries(counts)) assert.equal(inState(id).length, count);
  assert.ok(forPanel('optics').length >= 3);
  assert.equal(forPanel('nonexistent').length, 0);
});

test('enough of the specification actually ships to be worth having', () => {
  assert.ok(inState('LIVE').length >= 10, 'a console that delivers nothing is not a console');
});

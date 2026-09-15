/**
 * The ensemble: tuning, diatonic harmony, and the shape of a son.
 *
 * @module tests/black-optic-6/mariachi
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BEATS_PER_BAR, BEAT_SEC, barAccents, barPlan, Mariachi, MELODY,
  midiToHz, PROGRESSION, scaleStep, TONIC,
} from '../../public/black-optic-6/js/mariachi.js';

test('tuning is standard', () => {
  assert.equal(midiToHz(69), 440);
  assert.ok(Math.abs(midiToHz(81) - 880) < 1e-9, 'an octave up is double');
  assert.ok(Math.abs(midiToHz(74) - 587.33) < 0.01, 'D5');
});

test('harmony moves by scale degree, so thirds stay in the key', () => {
  // A5 down a diatonic third in D major is F#5 — a major third. A fixed
  // three-semitone drop would give F natural and sour the whole line.
  assert.equal(scaleStep(81, -2, TONIC), 78);
  assert.equal(scaleStep(78, -2, TONIC), 74, 'F#5 to D5, also major');
  assert.equal(scaleStep(74, -2, TONIC), 71, 'D5 to B4, a minor third — correct here');
  assert.equal(scaleStep(69, 0, TONIC), 69, 'no movement changes nothing');
});

test('every harmonised trumpet note lands in D major', () => {
  const inKey = new Set([2, 4, 6, 7, 9, 11, 1]);
  for (const [, , midi] of MELODY) {
    const harmony = scaleStep(midi, -2, TONIC);
    assert.ok(inKey.has(((harmony % 12) + 12) % 12), `${harmony} is outside the key`);
    assert.ok(harmony < midi, 'the second trumpet sits below the first');
    assert.ok(midi - harmony >= 3 && midi - harmony <= 4, 'a third is three or four semitones');
  }
});

test('the hemiola alternates, which is what makes it a son and not a waltz', () => {
  assert.deepEqual(barAccents(0), [0, 3], 'two groups of three');
  assert.deepEqual(barAccents(1), [0, 2, 4], 'three groups of two');
  assert.deepEqual(barAccents(2), barAccents(0), 'and it alternates');
});

test('a bar contains the whole ensemble', () => {
  const voices = new Set(barPlan(0).map((event) => event.voice));
  assert.ok(voices.has('guitarron'));
  assert.ok(voices.has('vihuela'));
  assert.ok(voices.has('violin'));
  assert.ok(voices.has('trumpet'), 'bar one carries the melody');
});

test('every event sits inside its bar and carries a usable level', () => {
  for (let bar = 0; bar < PROGRESSION.length * 2; bar += 1) {
    for (const event of barPlan(bar)) {
      assert.ok(event.beat >= 0 && event.beat < BEATS_PER_BAR, `beat ${event.beat} is outside the bar`);
      assert.ok(event.beats > 0, 'a note of no length is not a note');
      assert.ok(event.gain > 0 && event.gain <= 1);
      assert.ok(Number.isFinite(midiToHz(event.midi)));
    }
  }
});

test('the guitarrón plays the accents and the vihuela plays the gaps', () => {
  for (let bar = 0; bar < 4; bar += 1) {
    const accents = barAccents(bar);
    const plan = barPlan(bar);
    for (const event of plan.filter((entry) => entry.voice === 'guitarron')) {
      assert.ok(accents.includes(event.beat), 'the bass lands on the accent');
    }
    for (const event of plan.filter((entry) => entry.voice === 'vihuela')) {
      assert.ok(!accents.includes(event.beat), 'the mánico fills the offbeats, which is what pushes it');
    }
  }
});

test('the bass plays roots and fifths of the chord it is under', () => {
  for (let bar = 0; bar < PROGRESSION.length; bar += 1) {
    const chord = PROGRESSION[bar % PROGRESSION.length];
    const allowed = new Set([chord.root, chord.root - 12, chord.tones[2], chord.tones[2] - 12]);
    for (const event of barPlan(bar).filter((entry) => entry.voice === 'guitarron')) {
      assert.ok(allowed.has(event.midi), `${event.midi} is neither the root nor the fifth of ${chord.name}`);
    }
  }
});

test('the trumpets breathe rather than playing continuously', () => {
  const silentBars = [];
  let trumpetBeats = 0;
  for (let bar = 0; bar < PROGRESSION.length; bar += 1) {
    const line = barPlan(bar).filter((event) => event.voice === 'trumpet');
    if (!line.length) silentBars.push(bar);
    // Only the upper line is counted; the harmony doubles every note of it.
    trumpetBeats += line.reduce((sum, event) => sum + event.beats, 0) / 2;
  }
  assert.ok(silentBars.length >= 1, 'there must be a bar of breath in the phrase');
  const totalBeats = PROGRESSION.length * BEATS_PER_BAR;
  assert.ok(
    trumpetBeats < totalBeats * 0.8,
    `the trumpets sound for ${trumpetBeats} of ${totalBeats} beats — a line that never stops stops sounding like trumpets`,
  );
});

test('the progression resolves home and stays in three chords', () => {
  assert.equal(PROGRESSION[0].name, 'D', 'it opens on the tonic');
  assert.equal(PROGRESSION[PROGRESSION.length - 1].name, 'D', 'and it comes home');
  const names = new Set(PROGRESSION.map((chord) => chord.name));
  assert.deepEqual([...names].sort(), ['A', 'D', 'G'], 'tonic, subdominant, dominant');
  for (const chord of PROGRESSION) {
    assert.equal(chord.tones.length, 3, 'a triad');
    assert.equal(chord.tones[1] - chord.tones[0], 4, 'major third');
    assert.equal(chord.tones[2] - chord.tones[0], 7, 'perfect fifth');
  }
});

test('the tempo is a son, not a waltz or a march', () => {
  const dottedQuarterBpm = 60 / (3 * BEAT_SEC);
  assert.ok(dottedQuarterBpm > 100 && dottedQuarterBpm < 140, `${dottedQuarterBpm.toFixed(0)} bpm is outside the style`);
  assert.equal(BEATS_PER_BAR, 6, 'six eighths, because this is 6/8');
});

test('the ensemble reports whether it can play at all, and starts silent', () => {
  const band = new Mariachi();
  assert.equal(band.playing, false, 'a security console does not start making noise on its own');
  assert.equal(typeof Mariachi.supported(), 'boolean');
  band.setVolume(2);
  assert.equal(band.volume, 1, 'volume is clamped');
  band.setVolume(-1);
  assert.equal(band.volume, 0);
  band.stop();
  assert.equal(band.playing, false, 'stopping something already stopped is harmless');
});

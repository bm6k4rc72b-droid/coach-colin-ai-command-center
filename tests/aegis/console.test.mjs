/**
 * The response, the receptionist, and the voice.
 *
 * The escalation ladder is the part of this product a household actually
 * experiences, and it is the part nobody will ever exercise in testing: the
 * lines it speaks at the top are heard on the worst night of the year and
 * never on any other. So it is replayed here at a thousand times real speed,
 * every rung, including the ones that are supposed to be skipped.
 *
 * @module tests/aegis/console
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ASK_MS, CONFIRM_MS, Ladder, alertLinks, composeAlert } from '../../public/aegis/js/escalation.js';
import { parseRequest, respond, tour } from '../../public/aegis/js/vera.js';
import { clauses, contour, pickVoice, rankVoices, scoreVoice, buildCloudRequest } from '../../public/aegis/js/voice.js';
import { SCENARIOS } from '../../public/aegis/js/demo.js';
import { summarise, toCsv } from '../../public/aegis/js/ledger.js';

/**
 * Advance a ladder over a stretch of time, collecting everything it said.
 *
 * @param {Ladder} ladder The ladder.
 * @param {object} options How to drive it.
 * @param {number} options.fromMs Start.
 * @param {number} options.toMs End.
 * @param {number} options.belief The belief to hold.
 * @param {boolean} [options.recovered] Whether the subject is up.
 * @param {boolean} [options.contactable] Whether there are contacts.
 * @returns {{stages: string[], lines: string[], last: object}} What happened.
 */
function drive(ladder, options) {
  const stages = [];
  const lines = [];
  let last = null;
  for (let t = options.fromMs; t <= options.toMs; t += 250) {
    last = ladder.update({
      timeMs: t,
      belief: options.belief,
      recovered: options.recovered ?? false,
      contactable: options.contactable ?? true,
    });
    if (!stages.length || stages[stages.length - 1] !== last.stage) stages.push(last.stage);
    for (const line of last.lines) lines.push(line.text);
  }
  return { stages, lines, last };
}

test('the ladder asks before it counts down and counts down before it calls', () => {
  const ladder = new Ladder({ name: 'Margaret' });
  const run = drive(ladder, { fromMs: 0, toMs: ASK_MS + CONFIRM_MS + 4000, belief: 0.95 });
  assert.deepEqual(run.stages, ['asking', 'confirming', 'alerting']);
  assert.match(run.lines[0], /Margaret/, 'the first thing said should be their name');
  assert.match(run.lines[0], /I’m fine|I'm fine/, 'the first thing said must include how to stop it');
  assert.ok(
    run.lines.some((line) => /seconds/i.test(line)),
    'the countdown has to be audible, not just on screen',
  );
});

test('a high belief does not shorten the chance to answer', () => {
  const ladder = new Ladder({ name: 'Margaret' });
  drive(ladder, { fromMs: 0, toMs: ASK_MS - 1000, belief: 0.99 });
  assert.equal(ladder.stage, 'asking', 'certainty is not a reason to stop asking');
  const past = drive(ladder, { fromMs: ASK_MS - 750, toMs: ASK_MS + 1000, belief: 0.99 });
  assert.equal(past.last.stage, 'confirming');
});

test('saying you are fine stops it dead, and keeps it stopped', () => {
  const ladder = new Ladder({ name: 'Margaret' });
  drive(ladder, { fromMs: 0, toMs: 3000, belief: 0.95 });
  assert.equal(ladder.stage, 'asking');
  ladder.standDown(3000, 'said fine');
  assert.equal(ladder.stage, 'stood-down');
  // A ladder that re-climbs three seconds later is a ladder that gets switched
  // off by the household, which is worse than no ladder.
  const after = drive(ladder, { fromMs: 3250, toMs: 60000, belief: 0.99 });
  assert.deepEqual(after.stages, ['stood-down'], 'must stay stood down for the suppression window');
});

test('getting back up stands it down without anybody saying anything', () => {
  const ladder = new Ladder({ name: 'Margaret' });
  drive(ladder, { fromMs: 0, toMs: 4000, belief: 0.95 });
  const up = drive(ladder, { fromMs: 4250, toMs: 6000, belief: 0.95, recovered: true });
  assert.equal(up.last.stage, 'stood-down');
  assert.ok(up.lines.some((line) => /you’re up|you're up/i.test(line)));
});

test('asking for help skips the countdown entirely', () => {
  const ladder = new Ladder({ name: 'Margaret' });
  drive(ladder, { fromMs: 0, toMs: 2000, belief: 0.8 });
  ladder.callNow(2000, true);
  assert.equal(ladder.stage, 'alerting');
  const said = ladder.drain().map((line) => line.text).join(' ');
  assert.match(said, /calling for help now/i);
});

test('with nobody to call, the ladder says so rather than pretending', () => {
  const ladder = new Ladder({ name: 'Margaret' });
  const run = drive(ladder, {
    fromMs: 0,
    toMs: ASK_MS + CONFIRM_MS + 4000,
    belief: 0.95,
    contactable: false,
  });
  const said = run.lines.join(' ');
  assert.match(said, /Nobody is set up|can’t reach anybody|can't reach anybody/i);
  assert.ok(!/I’m calling for help now/.test(said), 'must not claim to be calling anybody');
});

test('the message to contacts distinguishes a watched fall from a discovery', () => {
  const watched = composeAlert({
    name: 'Margaret',
    where: 'front room',
    verdict: { belief: 0.95, agreeing: ['Camera', 'Carried phone'], reasons: ['on the floor for 12 s'] },
    vision: { transitObserved: true },
    downForMs: 12000,
  });
  assert.match(watched, /appears to have fallen/i);
  assert.match(watched, /watched the fall itself/i);
  assert.match(watched, /front room/);
  assert.match(watched, /not a medical device/i);

  const found = composeAlert({
    name: 'Margaret',
    verdict: { belief: 0.62, agreeing: ['Camera'], reasons: [] },
    vision: { transitObserved: false },
  });
  assert.match(found, /is on the floor/i);
  assert.match(found, /did NOT see the fall/);
});

test('contact links open a dialler rather than claiming to dial', () => {
  const links = alertLinks({ name: 'Ruth', phone: '+44 7700 900123' }, 'hello');
  assert.equal(links.call, 'tel:+447700900123');
  assert.match(links.text, /^sms:\+447700900123\?/);
  assert.match(links.mail, /^mailto:/);
  assert.equal(alertLinks({ name: 'Ruth', phone: '' }, 'hello').call, null);
});

test('Vera hears the two sentences that matter before anything else', () => {
  for (const said of ['I’m fine', 'im fine thanks', 'no problem, false alarm', 'I am okay']) {
    assert.equal(parseRequest(said).intent, 'fine', `"${said}" should stand it down`);
  }
  for (const said of ['help', 'help me please', 'I can’t get up', 'call someone', 'I’ve hurt my hip']) {
    assert.equal(parseRequest(said).intent, 'help', `"${said}" should escalate`);
  }
  // And the escalation must not be shadowed by a chattier pattern.
  assert.equal(parseRequest('Vera, help me, I can’t get up').intent, 'help');
});

test('Vera answers the questions a buyer and a regulator both ask', () => {
  const state = { subject: 'Margaret', live: { vision: true, inertial: false, acoustic: false }, contacts: 0 };
  assert.match(respond(parseRequest('is this private'), state).text, /nothing leaves this device/i);
  assert.match(respond(parseRequest('can you see the bathroom'), state).text, /bathroom/i);
  assert.match(respond(parseRequest('is she hurt'), state).text, /not a medical device/i);
  assert.match(respond(parseRequest('who would you call'), state).text, /Nobody is on the list/i);
  assert.match(respond(parseRequest('how do you work'), state).text, /descent/i);
});

test('Vera turns a request for a demonstration into the right scenario', () => {
  assert.equal(parseRequest('run the demo of a fall behind the sofa').arg, 'occluded');
  assert.equal(parseRequest('show me the shoelace scenario').arg, 'lace');
  assert.equal(respond(parseRequest('run a demo'), {}).action.kind, 'demo');
  assert.equal(respond(parseRequest('give me the guided tour'), {}).action.kind, 'tour');
  assert.equal(tour().length, SCENARIOS.length);
  // The negatives come first: the argument is that it stays quiet, not that it
  // can say yes.
  assert.equal(tour()[0].id, 'walk');
  assert.equal(SCENARIOS.slice(0, 5).every((s) => s.kind === 'negative'), true);
});

test('a line is spoken in clauses, and an urgent one slows down rather than speeding up', () => {
  const parts = clauses('Margaret. I saw that, and I want to make sure you are all right. Say I am fine.');
  assert.ok(parts.length >= 2, 'a long line should be broken up');

  const calm = contour('It is all right. Nothing is wrong here.', 'calm');
  const urgent = contour('It is all right. Nothing is wrong here.', 'urgent');
  assert.ok(urgent[0].rate < calm[0].rate, 'urgency should slow the delivery, not hurry it');
  assert.ok(urgent[0].pitch < calm[0].pitch, 'urgency should lower the pitch, not raise it');

  // Pitch declines across a sentence, and a question lifts at the end.
  const long = contour('The camera is open, the phone is reporting, and the room is quiet.', 'calm');
  assert.ok(long[long.length - 1].pitch < long[0].pitch, 'pitch should decline across a statement');
  const question = contour('Are you all right in there, Margaret?', 'concerned');
  assert.ok(
    question[question.length - 1].pitch > question[0].pitch,
    'a question should lift on its last clause',
  );
});

test('voice ranking prefers a natural voice over the platform default', () => {
  const voices = [
    { name: 'Albert', lang: 'en-US', voiceURI: 'albert', localService: true },
    { name: 'Samantha (Enhanced)', lang: 'en-US', voiceURI: 'sam', localService: true },
    { name: 'Eddy (English (UK))', lang: 'en-GB', voiceURI: 'eddy', localService: true },
    { name: 'Amelie', lang: 'fr-FR', voiceURI: 'amelie', localService: true },
    { name: 'Microsoft David', lang: 'en-US', voiceURI: 'david', localService: true },
  ];
  assert.equal(pickVoice(voices).voiceURI, 'sam');
  assert.equal(rankVoices(voices).length, 4, 'non-English voices are not offered');
  assert.ok(scoreVoice({ name: 'Samantha', lang: 'en-US' }) > scoreVoice({ name: 'Albert', lang: 'en-US' }));
  assert.equal(scoreVoice({ name: 'Amelie', lang: 'fr-FR' }), -1);
});

test('the cloud bridge is off unless it is fully configured', () => {
  assert.equal(buildCloudRequest({ provider: '', key: '', voice: '' }, 'hello'), null);
  assert.equal(buildCloudRequest({ provider: 'elevenlabs', key: 'k', voice: '' }, 'hello'), null);
  const request = buildCloudRequest({ provider: 'elevenlabs', key: 'k', voice: 'v1' }, 'hello');
  assert.match(request.url, /text-to-speech\/v1$/);
  assert.equal(request.init.headers['xi-api-key'], 'k');
  assert.match(request.init.body, /"text":"hello"/);
});

test('the ledger summarises itself the way somebody would read it out', () => {
  const night = new Date();
  night.setHours(3, 0, 0, 0);
  const entries = [
    { at: night.getTime(), kind: 'fall', outcome: 'got up', belief: 0.9, channels: ['Camera'], downMs: 9000, watched: true, note: '' },
    { at: Date.now(), kind: 'fall', outcome: 'contacts raised', belief: 0.96, channels: ['Camera', 'Carried phone'], downMs: 40000, watched: true, note: '' },
    { at: Date.now(), kind: 'rehearsal', outcome: 'started', belief: 0, channels: [], downMs: 0, watched: false, note: '' },
  ];
  const summary = summarise(entries);
  assert.equal(summary.falls, 2);
  assert.equal(summary.gotUp, 1);
  assert.equal(summary.nights, 1);
  assert.match(summary.text, /2 episodes recorded/);
  assert.match(summarise([]).text, /empty/i);

  const csv = toCsv(entries);
  assert.equal(csv.split('\n').length, 4, 'a header and one row per entry');
  assert.match(csv.split('\n')[0], /descent_watched/);
});

/**
 * Reolink Argus: what each model serves, and the canvas-taint wall.
 *
 * @module tests/black-optic-6/argus
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analysable, COST, diagnose, FAMILIES, go2rtcConfig, identifyModel, LOCAL_RELAY_PATH,
  localRelayAvailable, localRelayUrls, OUTCOMES, recommend, RELAYS, relayUrls,
  rtspUrl, snapshotUrl, RTSP_PORT,
} from '../../public/black-optic-6/js/argus.js';

test('battery Argus models are identified as battery, and serve no stream', () => {
  for (const model of ['Reolink Argus 3 Pro', 'Argus 4', 'Reolink Argus PT', 'Reolink Go PT']) {
    const family = identifyModel(model);
    assert.ok(family, `${model} should be recognised`);
    assert.equal(family.battery, true, `${model} is battery powered`);
    assert.ok(!family.serves.includes('rtsp'), `${model} must not be offered RTSP it cannot serve`);
  }
});

test('wired Reolink and the hub do serve RTSP', () => {
  assert.ok(identifyModel('Reolink RLC-810A').serves.includes('rtsp'));
  assert.equal(identifyModel('RLC-510A').battery, false);
  assert.ok(identifyModel('Reolink Home Hub').serves.includes('rtsp'));
  assert.ok(identifyModel('Hikvision DS-2CD').serves.includes('onvif'));
});

test('an unknown or empty model is not guessed at', () => {
  assert.equal(identifyModel('Some Other Camera'), null);
  assert.equal(identifyModel(''), null);
  assert.equal(identifyModel(undefined), null);
});

test('every family says what it serves and why', () => {
  for (const family of FAMILIES) {
    assert.ok(family.serves.length > 0, `${family.id} must serve something`);
    assert.ok(family.note.length > 50, `${family.id} needs a real explanation`);
  }
});

test('the RTSP URL is Reolink\'s own shape, with credentials escaped', () => {
  const url = rtspUrl({ host: '192.168.1.42', user: 'viewer', password: 'p@ss word', stream: 'sub' });
  assert.match(url, /^rtsp:\/\/viewer:p%40ss%20word@192\.168\.1\.42:554\/h264Preview_01_sub$/);
  assert.ok(rtspUrl({ host: 'cam' }).includes(`:${RTSP_PORT}/`), 'the default port is used when none is given');
  assert.match(rtspUrl({ host: 'cam', channel: 2 }), /h264Preview_03_/, 'channels are one-indexed in the path');
  assert.match(rtspUrl({ host: 'cam', codec: 'h265', stream: 'main' }), /h265Preview_01_main/);
  assert.ok(!rtspUrl({ host: 'cam' }).includes('@'), 'no credentials means no empty credential block');
});

test('the snapshot URL carries a cache-buster, or a stale frame is served forever', () => {
  const first = snapshotUrl({ host: 'cam' });
  const second = snapshotUrl({ host: 'cam' });
  assert.notEqual(first, second, 'without a changing nonce a proxy will hand back the same frame');
  const fixed = snapshotUrl({ host: 'cam', user: 'v', password: 'p', nonce: 'abc' });
  assert.match(fixed, /cmd=Snap&channel=0&rs=abc&user=v&password=p$/);
  assert.match(snapshotUrl({ host: 'cam', https: true }), /^https:/);
});

test('relay URLs are built for each relay, and refuse to be half-built', () => {
  for (const relay of RELAYS) {
    const urls = relayUrls(relay.id, 'http://nas.local:1984/', 'argus gate');
    assert.ok(urls.hls.startsWith('http://nas.local:1984/'), `${relay.id} should not double its slash`);
    assert.ok(urls.hls.includes('argus%20gate'), `${relay.id} must escape the stream name`);
    assert.ok(urls.webrtc.length > 0);
    assert.ok(relay.solves.length > 0);
  }
  assert.equal(relayUrls('nonexistent', 'http://x', 'y'), null);
  assert.equal(relayUrls('go2rtc', '', 'y'), null);
  assert.equal(relayUrls('go2rtc', 'http://x', ''), null);
});

test('go2rtc is the one that can reach a battery camera', () => {
  const go2rtc = RELAYS.find((relay) => relay.id === 'go2rtc');
  assert.ok(go2rtc.solves.some((line) => /battery/i.test(line)));
  const mediamtx = RELAYS.find((relay) => relay.id === 'mediamtx');
  assert.ok(!mediamtx.solves.some((line) => /battery/i.test(line)), 'MediaMTX cannot pull what serves no RTSP');
});

/* ------------------------------------------------------------ the real wall */

test('a cross-origin snapshot displays but cannot be measured', () => {
  const verdict = analysable({
    kind: 'snapshot',
    url: 'http://192.168.1.42/cgi-bin/api.cgi?cmd=Snap',
    pageOrigin: 'https://console.example',
  });
  assert.equal(verdict.display, true, 'it will appear on screen');
  assert.equal(verdict.analysable, false, 'and none of it can be measured');
  assert.match(verdict.reason, /taints the canvas/i);
});

test('a same-origin relay stream is measurable', () => {
  const verdict = analysable({ kind: 'hls', url: '/relay/argus.m3u8', pageOrigin: 'https://console.example' });
  assert.equal(verdict.analysable, true);
  assert.match(verdict.reason, /same origin/i);
});

test('a cross-origin relay is measurable only if it sends permission', () => {
  const without = analysable({ kind: 'hls', url: 'http://nas.local:1984/s.m3u8', pageOrigin: 'https://console.example' });
  assert.equal(without.analysable, false);
  const with_ = analysable({ kind: 'hls', url: 'http://nas.local:1984/s.m3u8', pageOrigin: 'https://console.example', cors: true });
  assert.equal(with_.analysable, true);
});

test('a camera on this device is always measurable, and a broken URL fails closed', () => {
  assert.equal(analysable({ kind: 'device' }).analysable, true);
  assert.equal(analysable({ kind: 'hls', url: 'not a url', pageOrigin: 'not an origin' }).analysable, false);
});

/* -------------------------------------------------------------- diagnosis */

test('mixed content is diagnosed before anything else, because nothing else can run', () => {
  const verdict = diagnose({ pageScheme: 'https:', targetScheme: 'http:', imageLoaded: false });
  assert.equal(verdict.outcome.id, OUTCOMES.mixed.id);
  assert.ok(verdict.next.some((line) => /http:\/\//.test(line)));
});

test('a picture that loads while the read fails is cross-origin, not a broken camera', () => {
  const verdict = diagnose({ imageLoaded: true, fetchSucceeded: false });
  assert.equal(verdict.outcome.id, 'cors');
  assert.match(verdict.outcome.headline, /reachable, but unreadable/i);
  assert.ok(verdict.next.some((line) => /go2rtc|relay/i.test(line)));
});

test('a rejected credential is told apart from a refused connection', () => {
  assert.equal(diagnose({ status: 401 }).outcome.id, 'auth');
  assert.equal(diagnose({ status: 403 }).outcome.id, 'auth');
  assert.equal(diagnose({ imageLoaded: false, elapsedMs: 40, timeoutMs: 4000 }).outcome.id, 'refused');
});

test('a timeout is told apart from a refusal, and names the sleeping-camera case', () => {
  const verdict = diagnose({ imageLoaded: false, elapsedMs: 4000, timeoutMs: 4000 });
  assert.equal(verdict.outcome.id, 'timeout');
  assert.ok(verdict.next.some((line) => /sleep/i.test(line)), 'a sleeping battery Argus is the common cause');
});

test('a successful read is the only outcome that reports everything working', () => {
  const verdict = diagnose({ imageLoaded: true, fetchSucceeded: true, status: 200 });
  assert.equal(verdict.outcome.id, 'ok');
  assert.ok(verdict.next.some((line) => /readable/i.test(line)));
});

test('every outcome carries advice', () => {
  const evidences = [
    { pageScheme: 'https:', targetScheme: 'http:' },
    { status: 401 },
    { imageLoaded: true, fetchSucceeded: true },
    { imageLoaded: true, fetchSucceeded: false },
    { imageLoaded: false, elapsedMs: 4000, timeoutMs: 4000 },
    { imageLoaded: false, elapsedMs: 10 },
  ];
  for (const evidence of evidences) {
    const verdict = diagnose(evidence);
    assert.ok(verdict.next.length > 0, `${verdict.outcome.id} must say what to do next`);
    assert.ok(verdict.outcome.detail.length > 30);
  }
});

test('a battery camera is told plainly that a relay is the only route', () => {
  const advice = recommend(identifyModel('Reolink Argus 3'));
  assert.equal(advice.route, 'relay');
  assert.match(advice.headline, /needs a relay/i);
  assert.ok(advice.steps.some((step) => /go2rtc/i.test(step)));
  assert.ok(advice.steps.some((step) => /Home Hub/i.test(step)), 'the hub is the other honest route');
});

test('a wired camera is told it still needs a relay, because browsers do not play RTSP', () => {
  const advice = recommend(identifyModel('RLC-810A'));
  assert.equal(advice.route, 'rtsp-relay');
  assert.match(advice.headline, /browsers do not play RTSP/i);
  assert.ok(advice.steps.some((step) => /viewer account/i.test(step)), 'not the admin login');
});

test('an unknown camera gets something to try rather than a shrug', () => {
  const advice = recommend(null);
  assert.equal(advice.route, 'unknown');
  assert.ok(advice.steps.length >= 2);
});

/* --------------------------------------------------- the free way through */

test('the same-origin relay path is measurable, which is the whole point of it', () => {
  const urls = localRelayUrls('argus-gate');
  assert.ok(urls.hls.startsWith(LOCAL_RELAY_PATH), 'it must go through the console\'s own proxy');
  const verdict = analysable({ kind: 'hls', url: urls.hls, pageOrigin: 'http://localhost:4173' });
  assert.equal(verdict.analysable, true, 'same origin means the frames can be read');
  assert.equal(localRelayUrls(''), null);
});

test('the relay proxy is offered where it exists and explained where it does not', () => {
  for (const origin of ['http://localhost:4173', 'http://127.0.0.1:4173', 'http://ranch.local:4173']) {
    assert.equal(localRelayAvailable(origin).available, true, `${origin} runs the console's own server`);
  }
  const hosted = localRelayAvailable('https://bm6k4rc72b-droid.github.io');
  assert.equal(hosted.available, false, 'a static host has no server to proxy with');
  assert.match(hosted.reason, /start\.sh/, 'and it must say what to do instead');
});

test('a wired camera gets a config with its RTSP source in it', () => {
  const yaml = go2rtcConfig({
    name: 'gate', host: '192.168.1.42', user: 'viewer', password: 'secret',
    family: identifyModel('RLC-810A'),
  });
  assert.match(yaml, /^streams:/m);
  assert.match(yaml, /gate: rtsp:\/\/viewer:secret@192\.168\.1\.42:554\/h264Preview_01_sub/);
  assert.match(yaml, /go2rtc/i);
});

test('a battery camera gets both routes, ordered, with the reliable one named', () => {
  const yaml = go2rtcConfig({
    name: 'gate', host: '192.168.1.42', user: 'viewer', password: 'secret',
    family: identifyModel('Argus 3 Pro'),
  });
  assert.match(yaml, /flv\?port=1935/, 'the HTTP-FLV attempt is worth making and costs nothing');
  assert.match(yaml, /Home Hub/, 'and the hub is the route that always works');
  assert.match(yaml, /always works/);
  assert.ok(
    yaml.indexOf('flv?port=1935') < yaml.indexOf('Home Hub'),
    'the free attempt should come before the one that costs money',
  );
});

test('the generated stream name is safe to paste into a config', () => {
  const yaml = go2rtcConfig({ name: 'Front Gate / North!', host: 'cam', family: null });
  assert.match(yaml, /front-gate---north-:/, 'spaces and punctuation would break the YAML key');
  assert.doesNotMatch(yaml, /\n\s+Front Gate/);
});

test('a config is produced even with nothing filled in, so it can be read before it is used', () => {
  const yaml = go2rtcConfig({});
  assert.match(yaml, /^streams:/m);
  assert.match(yaml, /PASSWORD/, 'the placeholder should be obviously a placeholder');
});

test('the cost of the whole chain is itemised, and the required parts are free', () => {
  assert.ok(COST.length >= 4);
  const required = COST.filter((row) => !/optional/i.test(row.cost) && !/optional/i.test(row.note));
  for (const row of required) {
    assert.match(row.cost, /free|not needed|already on/i, `${row.item} should not cost anything`);
  }
  assert.ok(COST.some((row) => /subscription/i.test(row.item)), 'the cloud subscription question must be answered');
  assert.ok(COST.some((row) => /Hub/i.test(row.item)), 'and the one optional purchase named');
});

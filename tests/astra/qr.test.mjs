/**
 * Unit tests for the QR encoder and the scanned-card deep link.
 *
 * A QR encoder is the kind of code that looks completely fine and produces
 * symbols that scan as nothing, so structural assertions are not enough here.
 * Every encoding test round-trips through `jsqr` — a real, independent decoder,
 * a devDependency used only by these tests, so the platform still ships with no
 * runtime dependencies. If the decoder cannot read it, neither can a phone.
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

import {
  capacity, codewords, penalty, qrMatrix, qrSvg, rsEncode, versionFor,
} from '../../public/astra/js/qr.js';
import { deepLink } from '../../public/astra/js/command.js';
import { PEPTIDES, STACKS } from '../../public/astra/js/data/peptides.js';

const require = createRequire(import.meta.url);
const jsQR = require('jsqr');

/** Deck ids the app registers, mirrored here so the link tests are honest. */
const DECKS = ['engine', 'graph', 'decoder', 'ar', 'compare', 'verify', 'studio', 'command', 'profile', 'settings'];

/**
 * Rasterise a symbol into the RGBA buffer a decoder expects.
 *
 * @param {{ modules: Uint8Array[], size: number }} symbol The symbol.
 * @param {number} [scale] Pixels per module.
 * @param {number} [quiet] Quiet-zone width in modules.
 * @returns {{ data: Uint8ClampedArray, width: number, height: number }} The image.
 */
function rasterise({ modules, size }, scale = 4, quiet = 4) {
  const width = (size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!modules[row][col]) continue;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const index = ((((row + quiet) * scale) + y) * width + (((col + quiet) * scale) + x)) * 4;
          data[index] = 0;
          data[index + 1] = 0;
          data[index + 2] = 0;
        }
      }
    }
  }
  return { data, width, height: width };
}

/**
 * Encode text and decode it again.
 *
 * @param {string} text The payload.
 * @returns {{ decoded: string|null, symbol: object }} What survived the trip.
 */
function roundTrip(text) {
  const symbol = qrMatrix(text);
  const image = rasterise(symbol);
  const result = jsQR(image.data, image.width, image.height);
  return { decoded: result ? result.data : null, symbol };
}

/* ------------------------------------------------------------- the codes */

test('a scanned card URL survives the round trip', () => {
  const url = 'https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/astra/?compound=bpc-157#ar';
  const { decoded, symbol } = roundTrip(url);
  assert.equal(decoded, url);
  assert.equal(symbol.size, symbol.version * 4 + 17);
});

test('every compound and stack produces a readable code', () => {
  const base = 'https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/astra/';
  for (const entry of [...PEPTIDES, ...STACKS]) {
    const url = `${base}?compound=${entry.id}#ar`;
    const { decoded } = roundTrip(url);
    assert.equal(decoded, url, `${entry.id} produced an unreadable code`);
  }
});

test('codes work for a local origin as well as a hosted one', () => {
  for (const url of [
    'http://localhost:4173/astra/?compound=kpv#ar',
    'http://192.168.1.44:4173/astra/?compound=ghk-cu#ar',
    'https://example.com/a/very/deep/path/astra/?compound=cjc-ipamorelin#ar',
  ]) {
    assert.equal(roundTrip(url).decoded, url, `${url} failed`);
  }
});

test('every version from 1 to 10 encodes and decodes', () => {
  // Walk the capacity boundaries, which is where a version is chosen and where
  // the character-count indicator changes width.
  for (let version = 1; version <= 10; version += 1) {
    const payload = 'A'.repeat(capacity(version));
    const { decoded, symbol } = roundTrip(payload);
    assert.equal(symbol.version, version, `${payload.length} bytes chose version ${symbol.version}`);
    assert.equal(decoded, payload, `version ${version} failed to decode`);
  }
});

test('the version 9 to 10 boundary is handled', () => {
  // Byte mode uses an 8-bit character count up to version 9 and 16 bits from
  // version 10. Getting that wrong yields a symbol that scans as garbage at
  // exactly one version, which is why it gets its own test.
  const nine = 'B'.repeat(capacity(9));
  const ten = 'B'.repeat(capacity(9) + 1);
  assert.equal(qrMatrix(nine).version, 9);
  assert.equal(qrMatrix(ten).version, 10);
  assert.equal(roundTrip(nine).decoded, nine);
  assert.equal(roundTrip(ten).decoded, ten);
});

test('non-ASCII payloads survive as UTF-8', () => {
  const text = 'https://example.com/?q=GHK-Cu · 63% — Human-supported';
  assert.equal(roundTrip(text).decoded, text);
});

test('a payload beyond version 10 is refused rather than silently truncated', () => {
  assert.throws(() => qrMatrix('x'.repeat(capacity(10) + 1)), RangeError);
});

test('capacities ascend and match the chosen version', () => {
  for (let version = 2; version <= 10; version += 1) {
    assert.ok(capacity(version) > capacity(version - 1), `version ${version} is not larger`);
  }
  assert.equal(versionFor(1), 1);
  assert.equal(versionFor(capacity(1)), 1);
  assert.equal(versionFor(capacity(1) + 1), 2);
  assert.throws(() => versionFor(capacity(10) + 1), RangeError);
});

/* ------------------------------------------------------------ internals */

test('Reed-Solomon produces the right number of codewords', () => {
  for (const degree of [10, 16, 18, 22, 24, 26]) {
    assert.equal(rsEncode([1, 2, 3, 4, 5], degree).length, degree);
  }
  // All-zero data still yields all-zero parity, which is the one hand-checkable
  // property of the encoder.
  assert.deepEqual(rsEncode([0, 0, 0], 10), new Array(10).fill(0));
});

test('the codeword stream fills the symbol exactly', () => {
  const totals = { 1: 26, 2: 44, 3: 70, 4: 100, 5: 134, 6: 172, 7: 196, 8: 242, 9: 292, 10: 346 };
  for (let version = 1; version <= 10; version += 1) {
    const stream = codewords('hello world', version);
    assert.equal(stream.length, totals[version], `version ${version} produced ${stream.length} codewords`);
    for (const byte of stream) assert.ok(byte >= 0 && byte <= 255);
  }
});

test('the mask is chosen by penalty, and the penalty is stable', () => {
  const symbol = qrMatrix('https://example.com/astra/?compound=kpv#ar');
  assert.ok(symbol.mask >= 0 && symbol.mask <= 7);
  const score = penalty(symbol.modules, symbol.size);
  assert.equal(score, penalty(symbol.modules, symbol.size), 'scoring must be deterministic');
  assert.ok(score >= 0);
});

test('the finder patterns are where a scanner looks for them', () => {
  const { modules, size } = qrMatrix('finder check');
  for (const [baseRow, baseCol] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    // A finder is a 7x7 ring with a 3x3 core: corners dark, the ring at
    // offset 1 light.
    assert.equal(modules[baseRow][baseCol], 1);
    assert.equal(modules[baseRow + 1][baseCol + 1], 0);
    assert.equal(modules[baseRow + 3][baseCol + 3], 1);
    assert.equal(modules[baseRow + 6][baseCol + 6], 1);
  }
  // The timing patterns alternate along row and column six.
  for (let i = 8; i < size - 8; i += 1) {
    assert.equal(modules[6][i], i % 2 === 0 ? 1 : 0, `timing row broken at ${i}`);
    assert.equal(modules[i][6], i % 2 === 0 ? 1 : 0, `timing column broken at ${i}`);
  }
  // The dark module is always set.
  assert.equal(modules[size - 8][8], 1);
});

test('encoding is deterministic', () => {
  const first = qrMatrix('same in, same out');
  const second = qrMatrix('same in, same out');
  assert.equal(first.mask, second.mask);
  assert.equal(first.version, second.version);
  for (let row = 0; row < first.size; row += 1) {
    assert.deepEqual([...first.modules[row]], [...second.modules[row]]);
  }
});

/* ----------------------------------------------------------------- SVG */

test('the SVG carries a quiet zone and one path', () => {
  const svg = qrSvg('https://example.com/astra/?compound=kpv#ar', { scale: 4, quiet: 4 });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.equal((svg.match(/<path /g) || []).length, 1, 'one path keeps it printable as a single object');

  const { size } = qrMatrix('https://example.com/astra/?compound=kpv#ar');
  const expected = (size + 8) * 4;
  assert.ok(svg.includes(`viewBox="0 0 ${expected} ${expected}"`), `expected a ${expected} viewBox`);
});

test('the SVG escapes nothing it should not, and stays valid for every compound', () => {
  for (const entry of [...PEPTIDES, ...STACKS]) {
    const svg = qrSvg(`https://example.com/astra/?compound=${entry.id}#ar`);
    assert.ok(svg.endsWith('</svg>'), `${entry.id} produced a truncated SVG`);
    assert.ok(!svg.includes('undefined'), `${entry.id} leaked an undefined`);
  }
});

/* ----------------------------------------------------------- deep links */

test('a scanned card resolves to its compound on the AR bench', () => {
  assert.deepEqual(
    deepLink({ hash: '#ar', search: '?compound=kpv', decks: DECKS }),
    { deck: 'ar', compound: 'kpv', unknown: null },
  );
});

test('a compound without a deck opens its dossier', () => {
  assert.deepEqual(
    deepLink({ hash: '', search: '?compound=ghk-cu', decks: DECKS }),
    { deck: 'engine', compound: 'ghk-cu', unknown: null },
  );
});

test('the short form works too', () => {
  assert.equal(deepLink({ hash: '#ar', search: '?c=tb-500', decks: DECKS }).compound, 'tb-500');
});

test('a compound the corpus does not know is refused, and reported', () => {
  // Silently showing a different compound than the card promised is the kind
  // of quiet dishonesty this platform exists to avoid, so the rejection is
  // reported rather than swallowed.
  const stale = deepLink({ hash: '', search: '?compound=dropped-compound', decks: DECKS });
  assert.equal(stale.compound, null);
  assert.equal(stale.deck, null);
  assert.equal(stale.unknown, 'dropped-compound');

  assert.equal(deepLink({ hash: '', search: '?compound=../../etc/passwd', decks: DECKS }).compound, null);
});

test('a stale card still honours the deck it asked for', () => {
  const link = deepLink({ hash: '#ar', search: '?compound=gone', decks: DECKS });
  assert.equal(link.deck, 'ar', 'a valid deck is a valid request regardless of the compound');
  assert.equal(link.compound, null);
  assert.equal(link.unknown, 'gone');
});

test('an unknown deck falls back rather than routing nowhere', () => {
  assert.deepEqual(
    deepLink({ hash: '#nonsense', search: '?compound=semax', decks: DECKS }),
    { deck: 'engine', compound: 'semax', unknown: null },
  );
  assert.deepEqual(deepLink({ hash: '#nonsense', search: '', decks: DECKS }),
    { deck: null, compound: null, unknown: null });
});

test('an ordinary visit deep-links to nothing', () => {
  assert.deepEqual(deepLink({ decks: DECKS }), { deck: null, compound: null, unknown: null });
  assert.deepEqual(deepLink({ hash: '', search: '?utm_source=instagram', decks: DECKS }),
    { deck: null, compound: null, unknown: null });
});

test('every compound in the corpus round-trips through a card link', () => {
  for (const entry of [...PEPTIDES, ...STACKS]) {
    const link = deepLink({ hash: '#ar', search: `?compound=${entry.id}`, decks: DECKS });
    assert.equal(link.compound, entry.id, `${entry.id} did not survive its own card`);
    assert.equal(link.deck, 'ar');
  }
});

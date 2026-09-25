/**
 * A QR encoder, in about four hundred lines and no dependencies.
 *
 * The platform prints a code per compound so somebody standing in front of a
 * card can reach that compound's AR bench in one scan. That code has to encode
 * the URL the platform is *actually* served from — which differs between a
 * laptop on localhost, GitHub Pages, and whatever domain this ends up on — so
 * the codes are generated in the browser at the moment they are shown rather
 * than baked into the repository as images. Baked images would hardcode one
 * origin and silently break everywhere else.
 *
 * Scope: byte mode, error-correction level M, versions 1 to 10. That covers
 * URLs up to 213 bytes, which is far more than any link here needs. Level M
 * recovers from roughly 15% damage, which is the usual choice for print: high
 * enough to survive a scuffed card, low enough to keep the modules large.
 *
 * The format and version information are computed with their BCH codes rather
 * than copied from tables, because a mistyped digit in a transcribed table
 * produces a code that looks perfect and scans as nothing.
 *
 * @module astra/qr
 */

/** Total data codewords and block structure per version, at ECC level M. */
const BLOCKS = {
  1: { ec: 10, groups: [[1, 16]] },
  2: { ec: 16, groups: [[1, 28]] },
  3: { ec: 26, groups: [[1, 44]] },
  4: { ec: 18, groups: [[2, 32]] },
  5: { ec: 24, groups: [[2, 43]] },
  6: { ec: 16, groups: [[4, 27]] },
  7: { ec: 18, groups: [[4, 31]] },
  8: { ec: 22, groups: [[2, 38], [2, 39]] },
  9: { ec: 22, groups: [[3, 36], [2, 37]] },
  10: { ec: 26, groups: [[4, 43], [1, 44]] },
};

/** Alignment pattern centres per version. */
const ALIGNMENT = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

/** Galois field exponent and logarithm tables over GF(256), poly 0x11d. */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

/**
 * Multiply two field elements.
 *
 * @param {number} a First element.
 * @param {number} b Second element.
 * @returns {number} The product.
 */
function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/**
 * The generator polynomial for a given number of error-correction codewords.
 *
 * @param {number} degree How many EC codewords.
 * @returns {number[]} Polynomial coefficients.
 */
function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/**
 * Reed-Solomon error-correction codewords for a block.
 *
 * @param {number[]} data The data codewords.
 * @param {number} degree How many EC codewords to produce.
 * @returns {number[]} The EC codewords.
 */
export function rsEncode(data, degree) {
  const generator = rsGenerator(degree);
  const remainder = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    for (let i = 0; i < generator.length - 1; i += 1) {
      remainder[i] ^= gfMul(generator[i + 1], factor);
    }
  }
  return remainder;
}

/**
 * A BCH check value, used for both the format and version information.
 *
 * @param {number} value The data bits.
 * @param {number} generator The generator polynomial.
 * @param {number} bits How many check bits.
 * @returns {number} The check value.
 */
function bch(value, generator, bits) {
  let result = value << bits;
  const generatorBits = generator.toString(2).length;
  while (result.toString(2).length >= generatorBits) {
    result ^= generator << (result.toString(2).length - generatorBits);
  }
  return result;
}

/**
 * How many bytes a version can carry in byte mode at level M.
 *
 * @param {number} version The version, 1 to 10.
 * @returns {number} Capacity in bytes.
 */
export function capacity(version) {
  const spec = BLOCKS[version];
  const dataCodewords = spec.groups.reduce((sum, [count, size]) => sum + count * size, 0);
  // Mode indicator is 4 bits; the character count is 8 bits up to version 9
  // and 16 bits from version 10. Getting that boundary wrong is the classic
  // way to produce a code that scans as garbage at exactly one version.
  const headerBits = 4 + (version >= 10 ? 16 : 8);
  return Math.floor((dataCodewords * 8 - headerBits) / 8);
}

/**
 * The smallest version that fits a payload.
 *
 * @param {number} length Payload length in bytes.
 * @returns {number} The version.
 * @throws {RangeError} When the payload exceeds version 10.
 */
export function versionFor(length) {
  for (let version = 1; version <= 10; version += 1) {
    if (length <= capacity(version)) return version;
  }
  throw new RangeError(`${length} bytes exceeds the version 10 capacity of ${capacity(10)}`);
}

/**
 * Encode text into the interleaved codeword stream for a version.
 *
 * @param {string} text The payload.
 * @param {number} version The version to encode for.
 * @returns {number[]} The final codewords, data and EC interleaved.
 */
export function codewords(text, version) {
  const bytes = [...new TextEncoder().encode(text)];
  const spec = BLOCKS[version];
  const dataCodewords = spec.groups.reduce((sum, [count, size]) => sum + count * size, 0);
  const countBits = version >= 10 ? 16 : 8;

  const bits = [];
  const push = (value, width) => {
    for (let i = width - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };

  push(0b0100, 4);
  push(bytes.length, countBits);
  for (const byte of bytes) push(byte, 8);

  // Terminator, then pad to a byte boundary, then alternate pad bytes.
  const total = dataCodewords * 8;
  for (let i = 0; i < 4 && bits.length < total; i += 1) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const pads = [0xec, 0x11];
  for (let i = 0; bits.length < total; i += 1) push(pads[i % 2], 8);

  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    data.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  }

  // Split into blocks, compute EC per block, then interleave both.
  const blocks = [];
  let offset = 0;
  for (const [count, size] of spec.groups) {
    for (let i = 0; i < count; i += 1) {
      const block = data.slice(offset, offset + size);
      offset += size;
      blocks.push({ data: block, ec: rsEncode(block, spec.ec) });
    }
  }

  const out = [];
  const longest = Math.max(...blocks.map((block) => block.data.length));
  for (let i = 0; i < longest; i += 1) {
    for (const block of blocks) if (i < block.data.length) out.push(block.data[i]);
  }
  for (let i = 0; i < spec.ec; i += 1) {
    for (const block of blocks) out.push(block.ec[i]);
  }
  return out;
}

/** The eight data mask predicates, indexed by mask number. */
const MASKS = [
  (row, col) => (row + col) % 2 === 0,
  (row) => row % 2 === 0,
  (row, col) => col % 3 === 0,
  (row, col) => (row + col) % 3 === 0,
  (row, col) => (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0,
  (row, col) => ((row * col) % 2) + ((row * col) % 3) === 0,
  (row, col) => (((row * col) % 2) + ((row * col) % 3)) % 2 === 0,
  (row, col) => (((row + col) % 2) + ((row * col) % 3)) % 2 === 0,
];

/**
 * Lay out a symbol: the fixed patterns, the format and version information,
 * and the data placed in its zigzag with one mask applied.
 *
 * @param {number} version The version.
 * @param {number[]} stream The interleaved codewords.
 * @param {number} mask Which mask to apply.
 * @returns {{ modules: Uint8Array[], size: number }} The symbol.
 */
function layout(version, stream, mask) {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Uint8Array(size));
  const reserved = Array.from({ length: size }, () => new Uint8Array(size));

  const set = (row, col, value) => {
    modules[row][col] = value ? 1 : 0;
    reserved[row][col] = 1;
  };

  // Finder patterns and their separators.
  for (const [baseRow, baseCol] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let row = -1; row <= 7; row += 1) {
      for (let col = -1; col <= 7; col += 1) {
        const r = baseRow + row;
        const c = baseCol + col;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const edge = row === 0 || row === 6 || col === 0 || col === 6;
        const core = row >= 2 && row <= 4 && col >= 2 && col <= 4;
        const inside = row >= 0 && row <= 6 && col >= 0 && col <= 6;
        set(r, c, inside && (edge || core));
      }
    }
  }

  // Timing patterns.
  for (let i = 8; i < size - 8; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  // Alignment patterns, skipping the three that would sit on a finder.
  const centres = ALIGNMENT[version];
  for (const row of centres) {
    for (const col of centres) {
      const onFinder = (row <= 8 && col <= 8)
        || (row <= 8 && col >= size - 9)
        || (row >= size - 9 && col <= 8);
      if (onFinder) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          set(row + dr, col + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }

  // The dark module, and the reserved format areas around the finders.
  set(size - 8, 8, 1);
  for (let i = 0; i < 9; i += 1) {
    if (!reserved[8][i]) set(8, i, 0);
    if (!reserved[i][8]) set(i, 8, 0);
  }
  for (let i = 0; i < 8; i += 1) {
    if (!reserved[8][size - 1 - i]) set(8, size - 1 - i, 0);
    if (!reserved[size - 1 - i][8]) set(size - 1 - i, 8, 0);
  }

  // Format information: level M is 0b00, followed by the mask.
  const formatBits = ((0b00 << 3) | mask);
  const format = (((formatBits << 10) | bch(formatBits, 0b10100110111, 10)) ^ 0b101010000010010);
  for (let i = 0; i < 15; i += 1) {
    const bit = (format >> i) & 1;
    // The format runs twice: once around the top-left finder, once split
    // between the other two.
    if (i < 6) set(8, i, bit);
    else if (i === 6) set(8, 7, bit);
    else if (i === 7) set(8, 8, bit);
    else if (i === 8) set(7, 8, bit);
    else set(14 - i, 8, bit);

    if (i < 8) set(8, size - 1 - i, bit);
    else set(size - 15 + i, 8, bit);
  }

  // Version information, for version 7 and above only.
  if (version >= 7) {
    const info = (version << 12) | bch(version, 0b1111100100101, 12);
    for (let i = 0; i < 18; i += 1) {
      const bit = (info >> i) & 1;
      const row = Math.floor(i / 3);
      const col = i % 3;
      set(size - 11 + col, row, bit);
      set(row, size - 11 + col, bit);
    }
  }

  // Data, in the zigzag from the bottom right, skipping the timing column.
  const bits = [];
  for (const byte of stream) {
    for (let i = 7; i >= 0; i -= 1) bits.push((byte >> i) & 1);
  }

  let index = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let col of [right, right - 1]) {
        if (reserved[row][col]) continue;
        const bit = index < bits.length ? bits[index] : 0;
        index += 1;
        modules[row][col] = MASKS[mask](row, col) ? bit ^ 1 : bit;
      }
    }
    upward = !upward;
  }

  return { modules, size };
}

/**
 * Score a symbol against the four penalty rules. Lower is better.
 *
 * @param {Uint8Array[]} modules The symbol.
 * @param {number} size Its side length.
 * @returns {number} The penalty.
 */
export function penalty(modules, size) {
  let score = 0;

  // Rule 1: runs of five or more of the same colour.
  for (let i = 0; i < size; i += 1) {
    for (const horizontal of [true, false]) {
      let run = 1;
      for (let j = 1; j < size; j += 1) {
        const previous = horizontal ? modules[i][j - 1] : modules[j - 1][i];
        const current = horizontal ? modules[i][j] : modules[j][i];
        if (current === previous) {
          run += 1;
        } else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
  }

  // Rule 2: any two-by-two block of one colour.
  for (let row = 0; row < size - 1; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
      const value = modules[row][col];
      if (value === modules[row][col + 1] && value === modules[row + 1][col]
        && value === modules[row + 1][col + 1]) score += 3;
    }
  }

  // Rule 3: the finder-like pattern, in either orientation.
  const patterns = [[1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]];
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j + 11 <= size; j += 1) {
      for (const pattern of patterns) {
        let row = true;
        let col = true;
        for (let k = 0; k < 11; k += 1) {
          if (modules[i][j + k] !== pattern[k]) row = false;
          if (modules[j + k][i] !== pattern[k]) col = false;
        }
        if (row) score += 40;
        if (col) score += 40;
      }
    }
  }

  // Rule 4: deviation from an even balance of dark and light.
  let dark = 0;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) dark += modules[row][col];
  }
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

/**
 * Encode text as a QR symbol, choosing the version and the best mask.
 *
 * @param {string} text The payload.
 * @returns {{ modules: Uint8Array[], size: number, version: number, mask: number }} The symbol.
 */
export function qrMatrix(text) {
  const length = new TextEncoder().encode(text).length;
  const version = versionFor(length);
  const stream = codewords(text, version);

  let best = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = layout(version, stream, mask);
    const score = penalty(candidate.modules, candidate.size);
    if (!best || score < best.score) best = { ...candidate, score, mask, version };
  }
  return best;
}

/**
 * Render a symbol as SVG.
 *
 * SVG rather than canvas because these are meant to be printed: it scales to
 * any card size without softening, and it survives a PDF export.
 *
 * @param {string} text The payload.
 * @param {object} [options] Options.
 * @param {number} [options.scale] Pixels per module.
 * @param {number} [options.quiet] Quiet-zone width in modules; four is the spec minimum.
 * @param {string} [options.dark] Dark module colour.
 * @param {string} [options.light] Background colour.
 * @returns {string} An SVG document.
 */
export function qrSvg(text, { scale = 4, quiet = 4, dark = '#000000', light = '#ffffff' } = {}) {
  const { modules, size } = qrMatrix(text);
  const total = (size + quiet * 2) * scale;

  // One path for every dark module beats one rect each: fewer nodes, and it
  // prints as a single object.
  let path = '';
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!modules[row][col]) continue;
      path += `M${(col + quiet) * scale} ${(row + quiet) * scale}h${scale}v${scale}h-${scale}z`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${total}" height="${total}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}

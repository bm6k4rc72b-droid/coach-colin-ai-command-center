/**
 * Chain of custody for the evidence vault: BLAKE3 on every second of video as
 * it is recorded, a hash chain linking them, and an IPFS content address for
 * each kept clip.
 *
 * - BLAKE3 (noble-hashes, audited, MIT) hashes each one-second recorder chunk
 *   the moment it arrives, before anyone could have touched it.
 * - Each chunk's record is chained: linkₖ = BLAKE3(canonical JSON of
 *   {prev: linkₖ₋₁, index, atMs, bytes, chunk: hashₖ, kind}). Change, drop or
 *   reorder one second and every later link changes, so a clip's final link,
 *   written down or texted out over the mesh, pins down the whole 60 seconds
 *   and everything recorded before it.
 * - A kept clip also gets a CIDv1 (raw codec 0x55, BLAKE3 multihash 0x1e,
 *   base32) — the same identifier IPFS uses, so the file can be pinned with
 *   Helia or Kubo and anyone can check it is byte-for-byte the one captured.
 *   (js-ipfs is retired; Helia is its successor.) Note: `ipfs add` chunks big
 *   files into a UnixFS DAG with SHA-256 by default and prints a different CID;
 *   add with `--raw-leaves --hash blake3` for a single block, or verify with
 *   the BLAKE3 digest directly.
 * - Answers from the vision-language model are recorded into the same chain,
 *   with the frame's hash, the exact prompt and the reply.
 *
 * @module black-optic-6/ai/evidence
 */

import { blake3 } from '../../vendor/noble/blake3.js';

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/** Lowercase hex of bytes. */
export function hex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += HEX[bytes[i]];
  return s;
}

/** Bytes of a hex string. */
export function unhex(h) {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** BLAKE3-256 of bytes or a UTF-8 string, as bytes. */
export function blake3Bytes(input) {
  return blake3(typeof input === 'string' ? new TextEncoder().encode(input) : input);
}

/** BLAKE3-256 as hex. */
export function blake3Hex(input) {
  return hex(blake3Bytes(input));
}

/** RFC 4648 base32, lowercase, unpadded (multibase prefix "b"). */
export function base32(bytes) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = ''; let bits = 0; let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

/** Unsigned varint (multiformats). */
export function uvarint(n) {
  const out = [];
  let v = n;
  while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v = Math.floor(v / 128); }
  out.push(v);
  return out;
}

export const CODEC_RAW = 0x55;
export const MULTIHASH_BLAKE3 = 0x1e;

/**
 * CIDv1 of raw bytes hashed with BLAKE3-256.
 *
 * @param {Uint8Array} digest 32-byte BLAKE3 digest.
 * @returns {string} e.g. "bafkr4i…"
 */
export function cidV1Blake3(digest) {
  if (digest.length !== 32) throw new Error('BLAKE3-256 digest must be 32 bytes');
  const bytes = Uint8Array.from([...uvarint(1), ...uvarint(CODEC_RAW), ...uvarint(MULTIHASH_BLAKE3), ...uvarint(32), ...digest]);
  return `b${base32(bytes)}`;
}

/** JSON with keys sorted at every level, so the same record always hashes the same. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The link that starts every chain: BLAKE3 of a fixed label. */
export const GENESIS = blake3Hex('black-optic-6 evidence chain v1');

/**
 * An append-only hash chain.
 */
export class EvidenceChain {
  constructor() {
    /** @type {object[]} */
    this.entries = [];
  }

  get head() {
    return this.entries.length ? this.entries[this.entries.length - 1].link : GENESIS;
  }

  /**
   * Append a record. `record` must be JSON-serialisable; `kind` says what it is.
   *
   * @returns {object} The stored entry, with index, prev and link.
   */
  append(kind, record) {
    const body = { ...record, kind, index: this.entries.length, prev: this.head };
    const entry = { ...body, link: blake3Hex(canonical(body)) };
    this.entries.push(entry);
    return entry;
  }

  /** Append a recorder chunk by its bytes. */
  appendChunk(bytes, atMs, extra = {}) {
    return this.append('chunk', { atMs, bytes: bytes.length, chunk: blake3Hex(bytes), ...extra });
  }

  /**
   * Check a chain end to end.
   *
   * @param {object[]} entries
   * @param {string} [prev=GENESIS] Link the first entry must point at (a trimmed chain
   *   starts from its first kept entry's own prev).
   * @param {number} [first=0] Index the first entry must carry.
   * @returns {{ok: boolean, brokenAt: number|null, reason: string}}
   */
  static verify(entries, prev = GENESIS, first = 0) {
    for (let i = 0; i < entries.length; i += 1) {
      const { link, ...body } = entries[i];
      const want = first + i;
      if (body.index !== want) return { ok: false, brokenAt: want, reason: `entry ${want} carries index ${body.index}` };
      if (body.prev !== prev) return { ok: false, brokenAt: want, reason: `entry ${want} does not point at entry ${want - 1}` };
      if (blake3Hex(canonical(body)) !== link) return { ok: false, brokenAt: want, reason: `entry ${want} was altered after it was hashed` };
      prev = link;
    }
    return { ok: true, brokenAt: null, reason: `${entries.length} entries verified` };
  }

  /**
   * The chain entries covering a time window (a kept clip's 30 s either side).
   */
  window(fromMs, toMs) {
    return this.entries.filter((e) => e.kind === 'chunk' && e.atMs >= fromMs && e.atMs <= toMs);
  }
}

/**
 * The manifest saved beside a kept clip.
 *
 * @param {Uint8Array} clipBytes The assembled clip.
 * @param {object[]} chunkEntries Chain entries for its seconds.
 * @param {object} meta {reason, atMs, mime}
 */
export function clipManifest(clipBytes, chunkEntries, meta) {
  const digest = blake3Bytes(clipBytes);
  return {
    format: 'black-optic-6/evidence-manifest@1',
    ...meta,
    bytes: clipBytes.length,
    blake3: hex(digest),
    cid: cidV1Blake3(digest),
    chain: {
      first: chunkEntries[0]?.index ?? null,
      last: chunkEntries[chunkEntries.length - 1]?.index ?? null,
      head: chunkEntries[chunkEntries.length - 1]?.link ?? null,
      seconds: chunkEntries.map((e) => ({ index: e.index, atMs: e.atMs, chunk: e.chunk, link: e.link })),
    },
    verify: 'b3sum the clip and compare with blake3; rebuild each link as BLAKE3(canonical JSON of the entry without "link").',
  };
}

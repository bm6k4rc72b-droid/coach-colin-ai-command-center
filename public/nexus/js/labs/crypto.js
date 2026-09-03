/**
 * Lab — The Crypto Bench.
 *
 * Hashing, encryption and encoding are three different things, and the
 * fastest way to internalise that is to run all three on the same string and
 * watch what each one does. Everything uses the platform's Web Crypto — real
 * SHA-256, real PBKDF2, real AES-GCM — because a toy implementation would
 * teach the wrong lesson about where the difficulty lives.
 *
 * @module nexus/labs/crypto
 */

import { el, fill } from '../dom.js';
import { breakCaesar, caesar, shannonEntropy, vigenere } from '../security.js';

/**
 * Render bytes as lowercase hex.
 *
 * @param {ArrayBuffer} buffer Bytes.
 * @returns {string} Hex string.
 */
function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * SHA-256 of a string.
 *
 * @param {string} text Input.
 * @returns {Promise<string>} Hex digest.
 */
export async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/**
 * Derive a key with PBKDF2 and report how long it took.
 *
 * The timing is the lesson: the same password, at 1,000 and at 600,000
 * iterations, is the difference between a database that cracks overnight and
 * one that does not.
 *
 * @param {string} password Password.
 * @param {string} salt Per-user salt.
 * @param {number} iterations Iteration count.
 * @returns {Promise<{ hexKey: string, ms: number }>} Derived key and duration.
 */
export async function derive(password, salt, iterations) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const started = performance.now();
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return { hexKey: hex(bits), ms: performance.now() - started };
}

/**
 * Encrypt with AES-GCM under a password-derived key.
 *
 * @param {string} plaintext Message.
 * @param {string} password Passphrase.
 * @returns {Promise<{ payload: string, iv: string }>} Base64 ciphertext and IV.
 */
export async function encrypt(plaintext, password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  return {
    payload: btoa(String.fromCharCode(...new Uint8Array(cipher))),
    iv: hex(iv),
    salt: hex(salt),
  };
}

/**
 * Mount the crypto bench.
 *
 * @param {HTMLElement} root Container.
 * @param {object} ctx Console services.
 * @returns {{ destroy: () => void }} Lab handle.
 */
export function mount(root, ctx) {
  const input = el('input.field', {
    type: 'text',
    value: 'meet me at the harbour at dawn',
    'aria-label': 'Message',
  });
  const output = el('div.crypto-out');
  const cipherText = el('div.cipher-panel');

  /** Recompute every panel from the current input. */
  const update = async () => {
    const value = input.value;
    const encoder = new TextEncoder();
    const digest = await sha256(value);
    const digestTweaked = await sha256(`${value} `);
    const b64 = btoa(unescape(encodeURIComponent(value)));

    fill(output, [
      el('div.crypto-row', {}, [
        el('span.k', { text: 'Encoding — base64' }),
        el('code.v', { text: b64 }),
        el('span.note', { text: 'Reversible by anyone. Not a security control, however often it is used as one.' }),
      ]),
      el('div.crypto-row', {}, [
        el('span.k', { text: 'Hash — SHA-256' }),
        el('code.v', { text: digest }),
        el('span.note', { text: 'One-way, fixed length, no key. Integrity — not confidentiality.' }),
      ]),
      el('div.crypto-row', {}, [
        el('span.k', { text: 'Same message, one extra space' }),
        el('code.v', { text: digestTweaked }),
        el('span.note', { text: 'The avalanche effect: a one-character change alters roughly half the output bits. That is what makes a hash useful for integrity.' }),
      ]),
      el('div.crypto-row', {}, [
        el('span.k', { text: 'Shannon entropy' }),
        el('code.v', { text: `${shannonEntropy(value).toFixed(2)} bits/char over ${new Set(value).size} distinct characters` }),
        el('span.note', { text: `Read it against the alphabet's ceiling, not against other strings: hex can carry at most 4 bits per character and the digest above reaches ${shannonEntropy(digest).toFixed(2)}, near its maximum. English prose reaches roughly ${shannonEntropy(value).toFixed(2)} of a possible 4.7 for lowercase-plus-space, and its real entropy is far lower still once you account for the fact that "q" is followed by "u". A short string sitting at its alphabet's ceiling is usually a key or a token — worth a second look in a log.` }),
      ]),
    ]);
    void encoder;
  };

  input.addEventListener('input', () => { update(); });

  const timingBox = el('div.timing');
  /** Run PBKDF2 at three iteration counts and show the wall-clock cost. */
  const runTiming = async () => {
    fill(timingBox, [el('p.dim', { text: 'Deriving…' })]);
    const rows = [];
    for (const iterations of [1000, 100000, 600000]) {
      // eslint-disable-next-line no-await-in-loop -- sequential timing is the point
      const { ms } = await derive(input.value || 'password', 'per-user-salt', iterations);
      const perSecond = Math.round(1000 / Math.max(0.01, ms));
      rows.push(el('div.timing-row', {}, [
        el('b', { text: iterations.toLocaleString() }),
        el('span', { text: `${ms.toFixed(1)} ms per guess` }),
        el('span.dim', { text: `≈ ${perSecond.toLocaleString()} guesses/sec on this device, single-threaded` }),
      ]));
    }
    rows.push(el('p.dim', {
      text: 'A GPU runs thousands of these in parallel — but the ratio holds. Raising the iteration count multiplies the attacker\'s cost as much as yours, and you only pay it once per login.',
    }));
    fill(timingBox, rows);
    ctx.progress?.recordLab('crypto', 60);
  };

  const encBox = el('div.enc-box');
  /** Encrypt the message and show the envelope. */
  const runEncrypt = async () => {
    const password = prompt('Passphrase for this message (it is not stored anywhere):');
    if (!password) return;
    const result = await encrypt(input.value, password);
    fill(encBox, [
      el('div.crypto-row', {}, [el('span.k', { text: 'AES-256-GCM ciphertext' }), el('code.v', { text: result.payload })]),
      el('div.crypto-row', {}, [el('span.k', { text: 'IV (public, never reused)' }), el('code.v', { text: result.iv })]),
      el('div.crypto-row', {}, [el('span.k', { text: 'Salt (public, per message)' }), el('code.v', { text: result.salt })]),
      el('p.dim', { text: 'GCM is authenticated: change one byte of that ciphertext and decryption fails loudly instead of returning subtly wrong plaintext. Unauthenticated modes let an attacker flip bits and change the message in predictable ways.' }),
    ]);
  };

  // Classical ciphers, where the attack is the lesson.
  const classicalInput = el('input.field', { type: 'text', value: 'the fleet sails at first light', 'aria-label': 'Plaintext' });
  const keyInput = el('input.field.short', { type: 'text', value: 'lantern', 'aria-label': 'Vigenère key' });
  const shiftInput = el('input.field.short', { type: 'number', value: '7', min: '1', max: '25', 'aria-label': 'Caesar shift' });

  /** Encipher, then break, the classical ciphers. */
  const runClassical = () => {
    const plain = classicalInput.value;
    const shift = Number(shiftInput.value) || 7;
    const caesarText = caesar(plain, shift);
    const vigenereText = vigenere(plain, keyInput.value);
    const cracked = breakCaesar(caesarText);
    if (cracked.shift === ((shift % 26) + 26) % 26) ctx.progress?.unlock('cryptographer');
    fill(cipherText, [
      el('div.crypto-row', {}, [el('span.k', { text: `Caesar +${shift}` }), el('code.v', { text: caesarText })]),
      el('div.crypto-row', {}, [el('span.k', { text: `Vigenère “${keyInput.value}”` }), el('code.v', { text: vigenereText })]),
      el('div.attack-result', {}, [
        el('h4', { text: 'Frequency analysis, run against the Caesar text' }),
        el('p', { text: `Recovered shift: ${cracked.shift}. Plaintext: “${cracked.plaintext}”` }),
        el('p.dim', { text: 'No key, no brute force worth the name — 25 candidates scored against English letter frequencies. This is why "we invented our own cipher" is a red flag: the strength has to survive the method being known.' }),
      ]),
    ]);
  };

  fill(root, [
    el('div.lab-head', {}, [el('h3', { text: 'The Crypto Bench' })]),
    el('p.dim', { text: 'One message, three treatments. Encoding changes representation. Hashing destroys information one way. Encryption hides it reversibly, with a key. Confusing them is the most common cryptographic mistake in ordinary software.' }),
    input,
    output,
    el('div.divider'),
    el('p.label', { text: 'Why the hashing algorithm decides what a breach costs' }),
    el('button.btn', { type: 'button', onclick: runTiming }, ['Time PBKDF2 on this device']),
    timingBox,
    el('div.divider'),
    el('p.label', { text: 'Authenticated encryption' }),
    el('button.btn', { type: 'button', onclick: runEncrypt }, ['Encrypt with AES-256-GCM']),
    encBox,
    el('div.divider'),
    el('p.label', { text: 'Classical ciphers, and breaking one' }),
    classicalInput,
    el('div.row', {}, [
      el('label.inline', {}, ['shift', shiftInput]),
      el('label.inline', {}, ['key', keyInput]),
      el('button.btn.primary', { type: 'button', onclick: runClassical }, ['Encipher and attack']),
    ]),
    cipherText,
  ]);

  update();
  runClassical();
  return { destroy: () => fill(root, []) };
}

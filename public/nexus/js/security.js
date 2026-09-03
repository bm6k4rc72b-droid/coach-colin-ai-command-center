/**
 * Security analysis primitives used by the training labs.
 *
 * Every function here is pure and offline: no network, no telemetry, nothing
 * leaves the device. They are the graded part of the curriculum — the labs
 * are thin UI over these — so they are unit-tested in `tests/nexus/`.
 *
 * @module nexus/security
 */

/** Character classes a password can draw from, with their alphabet sizes. */
const CLASSES = [
  { name: 'lowercase', test: /[a-z]/, size: 26 },
  { name: 'uppercase', test: /[A-Z]/, size: 26 },
  { name: 'digits', test: /[0-9]/, size: 10 },
  { name: 'symbols', test: /[^a-zA-Z0-9\s]/, size: 33 },
  { name: 'space', test: /\s/, size: 1 },
];

/**
 * The 40 most-abused base words in credential-stuffing lists, trimmed to what
 * is useful for teaching pattern recognition rather than for cracking.
 */
const COMMON_WORDS = [
  'password', 'passw0rd', 'welcome', 'admin', 'letmein', 'qwerty', 'monkey',
  'dragon', 'football', 'baseball', 'iloveyou', 'sunshine', 'princess',
  'superman', 'trustno1', 'master', 'shadow', 'ninja', 'summer', 'winter',
  'spring', 'autumn', 'january', 'august', 'september', 'october', 'november',
  'december', 'company', 'secret', 'login', 'starwars', 'pokemon', 'chocolate',
  'liverpool', 'arsenal', 'chelsea', 'manchester', 'google', 'facebook',
];

/** Attacker profiles, in password guesses per second. */
export const ATTACKERS = [
  { id: 'online', label: 'Online form, rate limited', rate: 10, note: 'Login page with lockouts. The slowest realistic attack.' },
  { id: 'leak-bcrypt', label: 'Leaked bcrypt hashes, 1 GPU', rate: 2e4, note: 'A stolen database hashed with bcrypt (cost 12) on one RTX-class GPU.' },
  { id: 'leak-sha256', label: 'Leaked SHA-256 hashes, 1 GPU', rate: 1e10, note: 'The same breach, hashed with a fast algorithm. This is why the algorithm matters.' },
  { id: 'farm', label: 'Rented GPU farm, unsalted MD5', rate: 1e13, note: 'A few hundred pounds of cloud time against legacy hashing.' },
];

/**
 * Estimate the search-space entropy of a password, in bits.
 *
 * This is the naive alphabet model, deliberately: it is what most strength
 * meters show, and the lab's point is to demonstrate where it lies to you.
 * `patternPenalty` is what corrects it.
 *
 * @param {string} password Candidate password.
 * @returns {number} Bits of entropy, 0 for empty input.
 */
export function rawEntropyBits(password) {
  if (!password) return 0;
  let alphabet = 0;
  for (const cls of CLASSES) if (cls.test.test(password)) alphabet += cls.size;
  if (!alphabet) return 0;
  return password.length * Math.log2(alphabet);
}

/**
 * Detect the structural shortcuts that make a password far weaker than its
 * length suggests.
 *
 * @param {string} password Candidate password.
 * @returns {Array<{ id: string, label: string, bits: number }>} Findings, each
 *   with the entropy in bits it removes.
 */
export function patternPenalty(password) {
  const found = [];
  const lower = password.toLowerCase();
  const deleet = lower.replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/@/g, 'a').replace(/\$/g, 's');

  for (const word of COMMON_WORDS) {
    if (deleet.includes(word)) {
      found.push({
        id: 'common-word',
        label: `Contains the list word “${word}” (leetspeak does not hide it — crackers de-leet first)`,
        bits: Math.min(22, word.length * 3.4),
      });
      break;
    }
  }
  if (/^[A-Z][a-z]+\d{1,4}[!?.]?$/.test(password)) {
    found.push({ id: 'capital-word-digits', label: 'Capital, word, digits, punctuation — the single most common human pattern', bits: 12 });
  }
  if (/(19|20)\d{2}/.test(password)) {
    found.push({ id: 'year', label: 'Contains a four-digit year (only ~120 plausible values)', bits: 9 });
  }
  if (/(.)\1{2,}/.test(password)) {
    found.push({ id: 'repeat', label: 'Three or more repeated characters', bits: 6 });
  }
  const sequences = ['abcdefghijklmnopqrstuvwxyz', '01234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  for (const seq of sequences) {
    for (let i = 0; i + 4 <= seq.length; i += 1) {
      const run = seq.slice(i, i + 4);
      if (lower.includes(run) || lower.includes([...run].reverse().join(''))) {
        found.push({ id: 'sequence', label: `Keyboard or alphabet run (“${run}”)`, bits: 10 });
        i = seq.length;
        break;
      }
    }
    if (found.some((f) => f.id === 'sequence')) break;
  }
  if (/^\d+$/.test(password)) {
    found.push({ id: 'digits-only', label: 'Digits only — a PIN, whatever its length', bits: 4 });
  }
  return found;
}

/**
 * Score a password: effective entropy after penalties, plus crack times.
 *
 * @param {string} password Candidate password.
 * @returns {{ raw: number, effective: number, findings: object[], verdict: string,
 *   times: Array<{ id: string, label: string, seconds: number, human: string, note: string }> }}
 *   Full assessment.
 */
export function assessPassword(password) {
  const raw = rawEntropyBits(password);
  const findings = patternPenalty(password);
  const penalty = findings.reduce((sum, f) => sum + f.bits, 0);
  const effective = Math.max(password ? 1 : 0, raw - penalty);
  const times = ATTACKERS.map((a) => {
    // Expected work is half the keyspace.
    const seconds = (2 ** effective / 2) / a.rate;
    return { id: a.id, label: a.label, seconds, human: humanDuration(seconds), note: a.note };
  });
  let verdict = 'critical';
  if (effective >= 90) verdict = 'excellent';
  else if (effective >= 70) verdict = 'strong';
  else if (effective >= 50) verdict = 'fair';
  else if (effective >= 32) verdict = 'weak';
  return { raw, effective, findings, verdict, times };
}

/**
 * Render a duration in seconds as something a human can reason about.
 *
 * @param {number} seconds Duration.
 * @returns {string} e.g. "3 hours", "instantly", "14 billion years".
 */
export function humanDuration(seconds) {
  if (!Number.isFinite(seconds)) return 'beyond estimate';
  if (seconds < 1) return 'instantly';
  const units = [
    ['second', 60], ['minute', 60], ['hour', 24], ['day', 365.25], ['year', Infinity],
  ];
  let value = seconds;
  for (const [name, step] of units) {
    if (value < step) {
      const n = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
      return `${formatBig(n)} ${name}${n === 1 ? '' : 's'}`;
    }
    value /= step;
  }
  return `${formatBig(Math.round(value))} years`;
}

/**
 * Format a number with words for the big magnitudes.
 *
 * @param {number} n Value.
 * @returns {string} Readable number.
 */
export function formatBig(n) {
  if (n < 1e3) return String(n);
  // Past a quadrillion the words stop helping; scientific notation is clearer
  // than "51 billion trillion".
  if (n >= 1e15) return `${n.toExponential(2).replace('e+', ' x 10^')}`;
  const scales = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];
  for (const [size, name] of scales) {
    if (n >= size) {
      const v = n / size;
      return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10} ${name}`;
    }
  }
  return String(Math.round(n));
}

/** Link shorteners commonly used to hide a destination. */
const SHORTENERS = ['bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at'];

/** Brand names most often impersonated in credential phishing. */
const IMPERSONATED = ['paypal', 'apple', 'icloud', 'microsoft', 'office365', 'netflix', 'amazon', 'google', 'facebook', 'instagram', 'hmrc', 'dhl', 'fedex', 'usps', 'coinbase', 'binance', 'chase', 'barclays', 'natwest', 'santander', 'wellsfargo', 'linkedin', 'dropbox', 'docusign'];

/** Top-level domains disproportionately represented in abuse reporting. */
const RISKY_TLDS = ['zip', 'mov', 'top', 'xyz', 'gq', 'cf', 'tk', 'ml', 'work', 'click', 'link', 'country', 'kim', 'rest'];

/**
 * Analyse a URL for the signals that distinguish phishing from the real
 * thing. Used by the QR scanner and the phishing lab.
 *
 * The scoring is intentionally explainable: every point comes from a named
 * signal the learner can see, because "trust the score" is the wrong lesson.
 *
 * @param {string} input A URL, or anything that might be one.
 * @returns {{ url: string, host: string, score: number, level: string,
 *   signals: Array<{ id: string, weight: number, text: string }> }} Assessment.
 */
export function analyzeUrl(input) {
  const raw = String(input || '').trim();
  const signals = [];
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `http://${raw}`);
  } catch {
    return { url: raw, host: '', score: 0, level: 'unparsed', signals: [{ id: 'unparsed', weight: 0, text: 'Not a URL — nothing to check.' }] };
  }
  const host = url.hostname.toLowerCase();
  const labels = host.split('.');
  const tld = labels.at(-1) || '';
  const registrable = labels.slice(-2).join('.');

  if (url.protocol === 'http:') {
    signals.push({ id: 'no-tls', weight: 12, text: 'Plain HTTP — the page and anything typed into it travel unencrypted.' });
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    signals.push({ id: 'ip-host', weight: 28, text: 'The host is a bare IP address. Legitimate brands use names.' });
  }
  if (host.includes('xn--')) {
    signals.push({ id: 'punycode', weight: 34, text: 'Punycode in the hostname — non-Latin characters that can imitate ASCII (аpple vs apple).' });
  }
  if (url.username || url.password) {
    signals.push({ id: 'userinfo', weight: 30, text: 'Credentials embedded before an “@” — everything left of it is decoration, the real host is what follows.' });
  }
  if (SHORTENERS.includes(registrable)) {
    signals.push({ id: 'shortener', weight: 16, text: `Link shortener (${registrable}) — the destination is hidden until you land on it.` });
  }
  if (RISKY_TLDS.includes(tld)) {
    signals.push({ id: 'tld', weight: 14, text: `.${tld} is over-represented in abuse data${tld === 'zip' || tld === 'mov' ? ' and looks like a file extension' : ''}.` });
  }
  if (labels.length >= 5) {
    signals.push({ id: 'depth', weight: 12, text: `${labels.length} dot-separated labels — deep subdomain chains are used to push the real domain out of a phone's address bar.` });
  }
  for (const brand of IMPERSONATED) {
    const inSub = labels.slice(0, -2).join('.').includes(brand);
    const inRegistrable = registrable.includes(brand);
    if (inSub && !inRegistrable) {
      signals.push({ id: 'brand-in-subdomain', weight: 32, text: `“${brand}” appears in the subdomain but the actual domain is ${registrable}. The domain is the only part that means anything.` });
      break;
    }
    if (!inRegistrable && host.includes(brand.replace('o', '0'))) {
      signals.push({ id: 'brand-typo', weight: 26, text: `Character-swapped lookalike of “${brand}”.` });
      break;
    }
  }
  if (/-(login|verify|secure|account|update|support|billing|wallet)-?/.test(host)) {
    signals.push({ id: 'urgency-host', weight: 18, text: 'Action words hyphenated into the hostname — a pattern of credential-harvesting kits, not of banks.' });
  }
  if (/\.(exe|scr|apk|msi|dmg|jar|bat|vbs|ps1|zip|iso)$/i.test(url.pathname)) {
    signals.push({ id: 'binary', weight: 24, text: 'The link ends in an executable or archive.' });
  }
  if (url.pathname.length > 60 || url.search.length > 120) {
    signals.push({ id: 'long-path', weight: 6, text: 'Unusually long path or query — often an encoded payload or a tracking identifier.' });
  }
  if (!signals.length) {
    signals.push({ id: 'clean', weight: 0, text: 'No structural red flags. That is not proof it is safe — a compromised legitimate site looks exactly like this.' });
  }

  const score = Math.min(100, signals.reduce((sum, s) => sum + s.weight, 0));
  const level = score >= 55 ? 'hostile' : score >= 28 ? 'suspicious' : score > 0 ? 'caution' : 'clean';
  return { url: url.href, host, score, level, signals };
}

/**
 * The indicator vocabulary the phishing lab grades against.
 *
 * @type {Array<{ id: string, label: string, hint: string }>}
 */
export const PHISH_INDICATORS = [
  { id: 'domain', label: 'Sender / link domain mismatch', hint: 'Does the visible name match the actual domain?' },
  { id: 'urgency', label: 'Manufactured urgency', hint: 'Deadlines, threats of suspension, "within 24 hours".' },
  { id: 'credential', label: 'Asks for credentials or codes', hint: 'Nobody legitimate asks for a one-time code.' },
  { id: 'attachment', label: 'Unexpected attachment or file', hint: 'Invoices, resumes, .zip, .html attachments.' },
  { id: 'authority', label: 'Impersonated authority', hint: 'CEO, IT support, HMRC, a bank.' },
  { id: 'payment', label: 'Payment or bank-detail change', hint: 'The single most expensive fraud pattern.' },
  { id: 'reply-to', label: 'Reply-To differs from From', hint: 'Answers go somewhere else entirely.' },
  { id: 'generic', label: 'Generic or wrong greeting', hint: '"Dear customer", or your email address as your name.' },
];

/**
 * Grade one phishing-triage answer.
 *
 * Calling a real phish safe is the costly error, so the scoring is asymmetric:
 * a missed phish loses more than a false alarm.
 *
 * @param {{ phish: boolean, indicators: string[] }} sample The sample's truth.
 * @param {{ phish: boolean, indicators: string[] }} answer The learner's answer.
 * @returns {{ correct: boolean, points: number, missed: string[], wrong: string[], severity: string }}
 *   Grading result.
 */
export function gradePhishing(sample, answer) {
  const correct = sample.phish === answer.phish;
  const truth = new Set(sample.indicators);
  const given = new Set(answer.indicators || []);
  const missed = [...truth].filter((i) => !given.has(i));
  const wrong = [...given].filter((i) => !truth.has(i));
  let points = 0;
  if (correct) {
    points = 40 + Math.round((truth.size ? ([...truth].filter((i) => given.has(i)).length / truth.size) : 1) * 40)
      - wrong.length * 5;
  } else {
    points = sample.phish ? -25 : -10;
  }
  const severity = correct ? 'ok' : sample.phish ? 'critical' : 'noisy';
  return { correct, points: Math.max(-25, points), missed, wrong, severity };
}

/** Instruction-override phrasings that mark a prompt-injection attempt. */
const INJECTION_PATTERNS = [
  { id: 'override', re: /\b(ignore|disregard|forget|override)\b[^.]{0,40}\b(previous|prior|above|earlier|all)\b[^.]{0,20}\b(instruction|prompt|rule|direction|context)/i, weight: 40, text: 'Direct instruction override' },
  { id: 'role', re: /\byou are now\b|\bact as\b[^.]{0,30}\b(dan|developer mode|unrestricted|jailbroken)\b|\bnew (system )?(prompt|persona|role)\b/i, weight: 30, text: 'Role reassignment' },
  { id: 'exfil', re: /\b(system prompt|initial instructions|your (instructions|rules|prompt)|api[_ ]?key|secret|credential|\.env)\b[^.]{0,40}\b(reveal|print|show|repeat|output|send|post|email|leak)\b|\b(reveal|print|show|repeat|output|send|post|email|leak)\b[^.]{0,40}\b(system prompt|initial instructions|your (instructions|rules|prompt)|api[_ ]?key|secret|credential|\.env)\b/i, weight: 45, text: 'Attempted secret or system-prompt exfiltration' },
  { id: 'tool-abuse', re: /\b(call|invoke|use|run)\b[^.]{0,30}\b(tool|function|shell|exec|fetch|http|curl|transfer|payment|delete)\b/i, weight: 22, text: 'Unsolicited tool invocation' },
  { id: 'encoding', re: /base64|rot13|%[0-9a-f]{2}%[0-9a-f]{2}|\\u00[0-9a-f]{2}/i, weight: 18, text: 'Encoded payload — obfuscation to slip past a filter' },
  { id: 'delimiter', re: /(<\/?(system|assistant|user|instructions?)>|\[\/?INST\]|###\s*(system|instruction)|```system)/i, weight: 28, text: 'Forged conversation delimiters' },
  { id: 'urgency', re: /\b(urgent|immediately|do not tell|without (asking|confirming|telling)|silently|do not mention)\b/i, weight: 16, text: 'Instructed concealment from the operator' },
];

/**
 * Score untrusted text for prompt-injection signals.
 *
 * This is the detector the injection range grades against, and it is honest
 * about its own limits: pattern matching catches clumsy attacks and misses
 * clever ones, which is the lesson the lab is built to teach.
 *
 * @param {string} text Untrusted content — a retrieved page, an email, a tool result.
 * @returns {{ score: number, level: string, hits: Array<{ id: string, text: string, weight: number }> }}
 *   Detection result.
 */
export function detectInjection(text) {
  const value = String(text || '');
  const hits = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.re.test(value)) hits.push({ id: pattern.id, text: pattern.text, weight: pattern.weight });
  }
  const score = Math.min(100, hits.reduce((s, h) => s + h.weight, 0));
  const level = score >= 60 ? 'blocked' : score >= 30 ? 'flagged' : score > 0 ? 'noted' : 'clean';
  return { score, level, hits };
}

/**
 * Shannon entropy of a string, in bits per character.
 *
 * Used by the crypto bench to show why "looks random" and "is random" differ,
 * and why high-entropy strings in logs are worth a second look.
 *
 * @param {string} text Input.
 * @returns {number} Bits per character.
 */
export function shannonEntropy(text) {
  if (!text) return 0;
  const counts = new Map();
  for (const ch of text) counts.set(ch, (counts.get(ch) || 0) + 1);
  let bits = 0;
  for (const n of counts.values()) {
    const p = n / text.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/**
 * Caesar shift a string, leaving non-letters alone.
 *
 * @param {string} text Input.
 * @param {number} shift Shift amount.
 * @returns {string} Shifted text.
 */
export function caesar(text, shift) {
  const s = ((shift % 26) + 26) % 26;
  return String(text).replace(/[a-z]/gi, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + s) % 26) + base);
  });
}

/**
 * Vigenère encipher or decipher.
 *
 * @param {string} text Input.
 * @param {string} key Keyword.
 * @param {boolean} [decode] Decipher instead of encipher.
 * @returns {string} Result.
 */
export function vigenere(text, key, decode = false) {
  const k = String(key).replace(/[^a-z]/gi, '').toLowerCase();
  if (!k) return text;
  let i = 0;
  return String(text).replace(/[a-z]/gi, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    const shift = k.charCodeAt(i % k.length) - 97;
    i += 1;
    const delta = decode ? 26 - shift : shift;
    return String.fromCharCode(((ch.charCodeAt(0) - base + delta) % 26) + base);
  });
}

/**
 * Break a Caesar cipher by English letter-frequency correlation.
 *
 * @param {string} text Ciphertext.
 * @returns {{ shift: number, plaintext: string, confidence: number }} Best candidate.
 */
export function breakCaesar(text) {
  // Relative frequency of a-z in English prose.
  const english = [8.17, 1.49, 2.78, 4.25, 12.70, 2.23, 2.02, 6.09, 6.97, 0.15, 0.77, 4.03, 2.41,
    6.75, 7.51, 1.93, 0.10, 5.99, 6.33, 9.06, 2.76, 0.98, 2.36, 0.15, 1.97, 0.07];
  let best = { shift: 0, score: -Infinity };
  for (let shift = 0; shift < 26; shift += 1) {
    const candidate = caesar(text, -shift).toLowerCase();
    const counts = new Array(26).fill(0);
    let total = 0;
    for (const ch of candidate) {
      const i = ch.charCodeAt(0) - 97;
      if (i >= 0 && i < 26) { counts[i] += 1; total += 1; }
    }
    if (!total) continue;
    let score = 0;
    for (let i = 0; i < 26; i += 1) score += (counts[i] / total) * english[i];
    if (score > best.score) best = { shift, score };
  }
  return {
    shift: best.shift,
    plaintext: caesar(text, -best.shift),
    confidence: Math.min(1, Math.max(0, (best.score - 3.2) / 3.0)),
  };
}

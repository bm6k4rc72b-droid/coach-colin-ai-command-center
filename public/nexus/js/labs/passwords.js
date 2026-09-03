/**
 * Lab — The Password Forge.
 *
 * Type a candidate and watch its effective strength collapse under the
 * patterns humans actually use, then see how long it survives against four
 * attacker profiles. The generator on the other side builds passphrases from
 * real randomness (`crypto.getRandomValues`), never `Math.random`.
 *
 * Nothing typed here is transmitted, stored or logged.
 *
 * @module nexus/labs/passwords
 */

import { el, fill } from '../dom.js';
import { assessPassword, humanDuration, shannonEntropy } from '../security.js';

/**
 * A small, deliberately concrete word list. Short lists are weaker per word,
 * which the lab states outright rather than hiding.
 */
const WORDS = [
  'alder', 'amber', 'anchor', 'anvil', 'apron', 'arbour', 'ashen', 'aspen', 'aurora', 'avalanche',
  'awning', 'bailey', 'ballast', 'bamboo', 'banner', 'barley', 'barrow', 'basalt', 'bastion', 'bayou',
  'beacon', 'bellows', 'birch', 'bison', 'blizzard', 'bluff', 'bobbin', 'bolster', 'boreal', 'bracken',
  'bramble', 'brier', 'brindle', 'bristle', 'bronze', 'buckle', 'burrow', 'cadence', 'cairn', 'calico',
  'canopy', 'canyon', 'caravan', 'cardinal', 'cascade', 'cavern', 'cedar', 'cellar', 'chalice', 'chapel',
  'chart', 'chestnut', 'chimney', 'cinder', 'cinnamon', 'cistern', 'citadel', 'clatter', 'clover',
  'cobalt', 'cobble', 'compass', 'condor', 'conduit', 'copper', 'coral', 'cornice', 'cottage', 'covey',
  'crag', 'crescent', 'crevice', 'crocus', 'crossing', 'crown', 'crucible', 'cygnet', 'cypress',
  'dahlia', 'damson', 'dapple', 'dawn', 'delta', 'derrick', 'dial', 'dingle', 'dolmen', 'dormer',
  'dovecote', 'dovetail', 'downland', 'dragoon', 'dredge', 'drift', 'drizzle', 'drover', 'dunes',
  'dusk', 'eagle', 'earthen', 'eddy', 'elder', 'elmwood', 'ember', 'emblem', 'endive', 'ensign',
  'equinox', 'escarp', 'estuary', 'ewe', 'falcon', 'fallow', 'fanfare', 'farthing', 'fathom', 'fennel',
  'fern', 'ferry', 'fettle', 'fiddle', 'filament', 'firth', 'flagon', 'flax', 'fleece', 'flint',
  'florin', 'foghorn', 'forge', 'fossil', 'foxglove', 'frost', 'fulmar', 'furrow', 'gable', 'gale',
  'gallery', 'gambit', 'gannet', 'garland', 'gauntlet', 'gazelle', 'gilt', 'girder', 'glacier', 'glade',
  'gorse', 'gosling', 'granary', 'granite', 'grebe', 'griffin', 'grotto', 'grove', 'gudgeon', 'gully',
  'gypsum', 'hackle', 'halyard', 'hamlet', 'harbour', 'harrow', 'hawthorn', 'hazel', 'headland',
  'hearth', 'heather', 'hedgerow', 'helm', 'hemlock', 'heron', 'hickory', 'hinge', 'hoar', 'hoist',
  'hollow', 'holly', 'honeycomb', 'hornbeam', 'hostel', 'hummock', 'husk', 'ibex', 'icicle', 'indigo',
  'inlet', 'iris', 'ironwood', 'ivy', 'jackdaw', 'jasmine', 'jetty', 'juniper', 'kelp', 'kestrel',
  'keystone', 'kiln', 'kingfisher', 'knapsack', 'knoll', 'lagoon', 'lantern', 'lapwing', 'larch',
  'lattice', 'lavender', 'leaf', 'league', 'ledger', 'lentil', 'levee', 'lichen', 'limestone', 'linnet',
  'lodestar', 'loft', 'lupin', 'lyre', 'magpie', 'mantle', 'marsh', 'meridian', 'mistral', 'nettle',
  'nimbus', 'noctule', 'orchard', 'otter', 'oxbow', 'peregrine', 'plume', 'pylon', 'quarry', 'quartz',
  'quill', 'reef', 'ridge', 'sable', 'saffron', 'starling', 'talon', 'thistle', 'trawler', 'tundra',
  'umber', 'undertow', 'vellum', 'verge', 'vinyl', 'wharf', 'willow', 'yarrow', 'yew', 'zenith',
  'zephyr',
];

/**
 * Draw an unbiased integer below `max` from the platform CSPRNG.
 *
 * Rejection sampling, because modulo on a random byte is biased — the same
 * mistake that has weakened real key generators.
 *
 * @param {number} max Exclusive upper bound (<= 256).
 * @returns {number} Uniform integer in [0, max).
 */
function randomBelow(max) {
  const limit = Math.floor(256 / max) * max;
  const buf = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

/**
 * Generate a passphrase and report its true entropy.
 *
 * @param {number} words How many words.
 * @returns {{ phrase: string, bits: number }} The phrase and its entropy.
 */
export function makePassphrase(words = 4) {
  const picked = [];
  for (let i = 0; i < words; i += 1) picked.push(WORDS[randomBelow(WORDS.length)]);
  const capIndex = randomBelow(words);
  picked[capIndex] = picked[capIndex].toUpperCase();
  const digits = String(randomBelow(90) + 10);
  const phrase = `${picked.join('-')}-${digits}`;
  // Entropy is decided by the process, not by the resulting characters.
  const bits = words * Math.log2(WORDS.length) + Math.log2(words) + Math.log2(90);
  return { phrase, bits };
}

/**
 * Mount the password lab.
 *
 * @param {HTMLElement} root Container.
 * @param {object} ctx Console services.
 * @returns {{ destroy: () => void }} Lab handle.
 */
export function mount(root, ctx) {
  const input = el('input.field', {
    type: 'text',
    placeholder: 'type a candidate — it never leaves this device',
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    'aria-label': 'Candidate password',
  });
  const meter = el('div.meter', {}, [el('span.meter-fill')]);
  const readout = el('div.readout');
  const table = el('div.attackers');
  const findings = el('div.findings');

  /** Re-score on every keystroke. */
  const update = () => {
    const value = input.value;
    const report = assessPassword(value);
    const fillBar = meter.querySelector('.meter-fill');
    fillBar.style.width = `${Math.min(100, (report.effective / 128) * 100)}%`;
    fillBar.className = `meter-fill v-${report.verdict}`;

    fill(readout, [
      el('div.stat', {}, [el('b', { text: value ? report.raw.toFixed(0) : '0' }), el('span', { text: 'naive bits' })]),
      el('div.stat', {}, [el('b', { text: value ? report.effective.toFixed(0) : '0' }), el('span', { text: 'effective bits' })]),
      el('div.stat', {}, [el('b', { text: value ? shannonEntropy(value).toFixed(1) : '0' }), el('span', { text: 'bits / char' })]),
      el('div.stat', {}, [el('b', { class: `v-${report.verdict}`, text: value ? report.verdict : '—' }), el('span', { text: 'verdict' })]),
    ]);

    fill(table, report.times.map((t) => el('div.attacker', {}, [
      el('div.attacker-name', {}, [el('b', { text: t.label }), el('span.dim', { text: t.note })]),
      el('div.attacker-time', { class: t.seconds < 86400 ? 'bad' : t.seconds < 3.15e9 ? 'mid' : 'good', text: value ? t.human : '—' }),
    ])));

    fill(findings, report.findings.length
      ? [el('p.label', { text: 'What a cracker exploits here' }),
        ...report.findings.map((f) => el('div.finding', {}, [
          el('span.finding-bits', { text: `−${f.bits.toFixed(0)} bits` }),
          el('span', { text: f.label }),
        ]))]
      : value ? [el('p.dim', { text: 'No structural patterns found. Length and unpredictability are doing the work, which is what you want.' })] : []);

    if (report.effective >= 100) ctx.progress?.unlock('locksmith');
  };

  input.addEventListener('input', update);

  const generated = el('div.generated');
  /**
   * Produce and display a passphrase.
   *
   * @param {number} words Word count.
   */
  const generate = (words) => {
    const { phrase, bits } = makePassphrase(words);
    input.value = phrase;
    update();
    fill(generated, [
      el('code.phrase', { text: phrase }),
      el('p.dim', {
        text: `${words} words from a ${WORDS.length}-word list, one capitalised at random, plus a two-digit tail: ${bits.toFixed(0)} bits of real entropy. That figure assumes the attacker knows the list, the length and the format — it is the entropy of the choice, not of the characters. Below about 60 bits, a stolen fast-hashed database is crackable; above 80 it is not worth anyone's time.`,
      }),
      el('button.btn', {
        type: 'button',
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(phrase);
            ctx.toast?.('Passphrase copied. Put it in a password manager, not in a note.');
          } catch {
            ctx.toast?.('Clipboard blocked — select and copy it by hand.');
          }
        },
      }, ['Copy']),
    ]);
    ctx.progress?.recordLab('passwords', Math.round(bits));
  };

  fill(root, [
    el('div.lab-head', {}, [el('h3', { text: 'The Password Forge' })]),
    el('p.dim', { text: 'Strength is not a property of a password. It is a property of a password and the attacker who wants it. Type something you have used before and watch the four columns disagree.' }),
    input,
    meter,
    readout,
    findings,
    el('p.label', { text: 'Time to crack, by attacker' }),
    table,
    el('div.divider'),
    el('p.label', { text: 'Forge a real one' }),
    el('div.row', {}, [5, 7, 9].map((n) => {
      const bits = n * Math.log2(WORDS.length) + Math.log2(n) + Math.log2(90);
      return el(`button.btn${n === 7 ? '.primary' : ''}`, {
        type: 'button',
        onclick: () => generate(n),
      }, [`${n} words · ${bits.toFixed(0)} bits`]);
    })),
    generated,
    el('p.dim.small', {
      text: `Generated with crypto.getRandomValues and rejection sampling, so the draw is unbiased — Math.random would look identical and be predictable, and that difference has broken real systems. A full Diceware list of 7,776 words carries 12.9 bits per word against this list's ${Math.log2(WORDS.length).toFixed(0)}; the trade is memorability for length.`,
    }),
  ]);

  update();
  return { destroy: () => fill(root, []) };
}

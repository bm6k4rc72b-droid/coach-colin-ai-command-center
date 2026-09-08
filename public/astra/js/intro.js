/**
 * The entrance: a scroll-linked descent into the facility.
 *
 * Six chapters. The reader scrolls, the camera in the lab behind the text flies
 * between waypoints, layered cards parallax at different rates, and the compound
 * showcase reveals one card at a time. Device tilt adds a second parallax axis
 * on top of the scroll one, so on a phone the whole page has depth you can look
 * around inside.
 *
 * Three implementation decisions worth knowing:
 *
 * - **Scroll drives everything through one number.** Each chapter reports its
 *   own progress in [0, 1]; every transform is a function of that. There is no
 *   animation state to fall out of sync with the scroll position, which is what
 *   makes fast scrolling and scrubbing back up feel solid rather than laggy.
 * - **Reveals are one-way.** Once a card has been seen it stays revealed.
 *   Re-hiding content on scroll-up is the single most common way scroll
 *   animation becomes annoying to actually read.
 * - **Reduced motion is honoured completely.** Not damped — off. Everything
 *   renders in its final state and the page becomes an ordinary document.
 *
 * @module astra/intro
 */

import { PEPTIDES, STACKS, corpusSize } from './data/peptides.js';
import { entryReading } from './engine.js';
import { el, fill, pct } from './dom.js';
import { clamp, smoothstep } from './mathkit.js';
import { prefersReducedMotion } from './sensors.js';

/**
 * The chapters, in order.
 *
 * Each names the lab waypoint it flies to and the score's mood, so the room and
 * the music move with the text rather than after it.
 */
export const CHAPTERS = [
  {
    id: 'gate',
    kicker: 'Peptide Intelligence Engine',
    title: 'SEARCH · COMPARE · VERIFY · UNDERSTAND',
    body: 'A research facility for peptide science. Every claim carries its evidence tier. Every tier opens into its sources. Nothing here tells you what to take.',
    waypoint: 'intro',
    mood: 'intro',
  },
  {
    id: 'problem',
    kicker: '01 — The problem',
    title: 'The confidence is real. The evidence often is not.',
    body: 'Most peptide marketing is built on animal studies described as though they were trials in people. That is not usually a lie — it is a missing sentence. This platform puts the sentence back.',
    waypoint: 'engine',
    mood: 'engine',
  },
  {
    id: 'tiers',
    kicker: '02 — The instrument',
    title: 'Seven tiers, each with a hard ceiling.',
    body: 'A randomised human trial can reach 96% confidence. An animal study caps at 45%, no matter how many of them exist. That ceiling is enforced in code, which is why the meter cannot be talked upward.',
    waypoint: 'decoder',
    mood: 'decoder',
  },
  {
    id: 'showcase',
    kicker: '03 — The library',
    title: 'The compounds, graded.',
    body: 'Ten compounds and two stacks, each with mechanisms, claims, studies, uncertainties and regulatory status. Scroll the rail; open anything.',
    waypoint: 'compound',
    mood: 'graph',
  },
  {
    id: 'graph',
    kicker: '04 — The map',
    title: 'The whole field, as one structure.',
    body: 'Compounds connect to mechanisms, mechanisms to body systems, everything to the studies underneath. Fly through it and the shape of the evidence becomes obvious.',
    waypoint: 'graph',
    mood: 'graph',
  },
  {
    id: 'enter',
    kicker: '05 — Clearance',
    title: 'Enter the facility.',
    body: 'Ask the engine anything. Decode a paper. Check a claim before you publish it. Everything runs on this device.',
    waypoint: 'engine',
    mood: 'command',
  },
];

/**
 * Build a compound card for the showcase.
 *
 * The card layout mirrors the reference art: name, class line, key claims with
 * their tiers, an evidence meter where the marketing would put a dosage, and
 * the compound's own accent colour running through all of it.
 *
 * @param {object} entry A peptide or stack record.
 * @param {(id: string) => void} onOpen Called when the card is activated.
 * @returns {HTMLElement} The card.
 */
export function showcaseCard(entry, onOpen) {
  const isStack = Boolean(entry.members);
  // A stack's reading comes through the engine so the card cannot show a
  // combination as better supported than its weakest component.
  const reading = entryReading(entry);
  const studies = isStack ? [] : entry.studies;

  const claims = (entry.claims || []).slice(0, 4);
  const body = claims.length
    ? claims.map((claim) => el('li.claim', {}, [
      el('span.dot', { style: { background: entry.accent } }),
      el('span.claim-text', { text: claim.text }),
      el('span.claim-tier', { 'data-tier': claim.tier, text: claim.tier.replace('human-', '').replace('-', ' ') }),
    ]))
    : (entry.members || []).map((id) => {
      const member = PEPTIDES.find((peptide) => peptide.id === id);
      return el('li.claim', {}, [
        el('span.dot', { style: { background: member?.accent || entry.accent } }),
        el('span.claim-text', { text: member?.name || id }),
        el('span.claim-tier', { text: 'component' }),
      ]);
    });

  return el('article.vial-card', {
    style: { '--accent': entry.accent, '--accent-deep': entry.accent2 || entry.accent },
    tabindex: '0',
    role: 'button',
    'aria-label': `Open the ${entry.name} dossier`,
    onclick: () => onOpen(entry.id),
    onkeydown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onOpen(entry.id);
      }
    },
  }, [
    el('div.vial-glow', { 'aria-hidden': 'true' }),
    el('header.vial-head', {}, [
      el('h3', { text: entry.name }),
      el('p.vial-class', { text: entry.klass }),
    ]),
    el('div.vial-figure', { 'aria-hidden': 'true' }, [
      el('div.vial-body', {}, [el('div.vial-fill'), el('div.vial-shine')]),
      el('div.vial-cap'),
    ]),
    el('ul.vial-claims', {}, body),
    el('div.vial-meter', {}, [
      el('div.meter-head', {}, [
        el('span', { text: 'EVIDENCE' }),
        el('span.meter-value', { text: pct(reading.score) }),
      ]),
      el('div.meter-track', {}, [el('div.meter-fill', { style: { width: pct(reading.score) } })]),
      el('p.meter-band', { text: reading.band.label }),
    ]),
    el('footer.vial-foot', {}, [
      el('span', { text: isStack ? `${entry.members.length} components · 0 combination studies` : `${studies.length} studies · ${reading.best.short}` }),
      el('span.vial-open', { text: 'OPEN →' }),
    ]),
  ]);
}

/**
 * The intro controller.
 */
export class Intro {
  /**
   * @param {object} options Wiring.
   * @param {HTMLElement} options.root The scrolling container.
   * @param {object} options.lab The lab renderer.
   * @param {object} options.score The audio score.
   * @param {(id: string) => void} options.onOpen Open a compound dossier.
   * @param {() => void} options.onEnter Leave the intro for the console.
   */
  constructor({ root, lab, score, onOpen, onEnter }) {
    this.root = root;
    this.lab = lab;
    this.score = score;
    this.onOpen = onOpen;
    this.onEnter = onEnter;
    this.reduced = prefersReducedMotion();
    this.active = null;
    this.chapters = [];
    this.ticking = false;
    this.progress = 0;
  }

  /**
   * Build the DOM and start listening.
   *
   * @returns {HTMLElement} The intro root.
   */
  mount() {
    const size = corpusSize();
    const sections = CHAPTERS.map((chapter) => this.#chapter(chapter, size));
    fill(this.root, [
      el('div.intro-rail', { 'aria-hidden': 'true' }, [
        el('div.rail-line'),
        el('div.rail-progress'),
        ...CHAPTERS.map((chapter, index) => el('span.rail-dot', { 'data-chapter': chapter.id, title: chapter.kicker, style: { top: `${(index / (CHAPTERS.length - 1)) * 100}%` } })),
      ]),
      ...sections,
    ]);

    this.railProgress = this.root.querySelector('.rail-progress');
    this.railDots = [...this.root.querySelectorAll('.rail-dot')];
    this.chapters = CHAPTERS.map((chapter) => ({
      ...chapter,
      node: this.root.querySelector(`[data-chapter-id="${chapter.id}"]`),
    }));

    this.#observe();
    this.onScroll = () => {
      if (this.ticking) return;
      this.ticking = true;
      requestAnimationFrame(() => {
        this.ticking = false;
        this.#update();
      });
    };
    this.root.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onScroll, { passive: true });
    this.#update();
    return this.root;
  }

  /**
   * Build one chapter.
   *
   * @param {object} chapter The chapter definition.
   * @param {object} size Corpus totals.
   * @returns {HTMLElement} The section.
   */
  #chapter(chapter, size) {
    const inner = [
      el('p.kicker', { text: chapter.kicker }),
      el('h2.chapter-title', { text: chapter.title }),
      el('p.chapter-body', { text: chapter.body }),
    ];

    if (chapter.id === 'gate') {
      inner.push(el('div.gate-stats', {}, [
        stat(String(size.peptides + size.stacks), 'compounds & stacks'),
        stat(String(size.studies), 'catalogued studies'),
        stat(String(size.claims), 'graded claims'),
        stat('7', 'evidence tiers'),
      ]));
      inner.push(el('p.scroll-hint', { text: 'Scroll to descend' }));
    }

    if (chapter.id === 'tiers') {
      inner.push(el('div.tier-ladder', {}, TIER_ROWS.map((row, index) => el('div.tier-row', {
        style: { '--tier-accent': row.accent, '--delay': `${index * 60}ms` },
      }, [
        el('span.tier-name', { text: row.label }),
        el('div.tier-bar', {}, [el('div.tier-bar-fill', { style: { width: `${row.ceiling}%`, background: row.accent } })]),
        el('span.tier-cap', { text: `${row.ceiling}%` }),
      ]))));
    }

    if (chapter.id === 'showcase') {
      const cards = [...PEPTIDES, ...STACKS].map((entry) => showcaseCard(entry, this.onOpen));
      inner.push(el('div.showcase', {}, cards));
    }

    if (chapter.id === 'graph') {
      inner.push(el('div.graph-legend', {}, [
        legend('#7fe6ff', 'Body system'),
        legend('#c08bff', 'Mechanism'),
        legend('#2fe08a', 'Human RCT'),
        legend('#f2b53b', 'Animal study'),
      ]));
    }

    if (chapter.id === 'enter') {
      inner.push(el('div.enter-actions', {}, [
        el('button.btn.primary.xl', { type: 'button', onclick: () => this.onEnter() }, ['Enter the facility']),
        el('p.fine', { text: 'Educational research platform. No diagnosis, no dosing, no protocols. Uses speech, camera, motion and location only when you ask, and only on this device.' }),
      ]));
    }

    return el('section.chapter', {
      'data-chapter-id': chapter.id,
      'data-waypoint': chapter.waypoint,
      'data-mood': chapter.mood,
    }, [
      el('div.chapter-inner', {}, inner),
    ]);
  }

  /** Reveal chapters and cards as they arrive, once each. */
  #observe() {
    if (!('IntersectionObserver' in window)) {
      for (const node of this.root.querySelectorAll('.chapter, .vial-card, .tier-row')) node.classList.add('revealed');
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('revealed');
        // One-way: a card that has been read stays read.
        observer.unobserve(entry.target);
        if (entry.target.classList.contains('vial-card')) this.score?.cue('move');
      }
    }, { root: this.root, threshold: 0.22, rootMargin: '0px 0px -8% 0px' });

    for (const node of this.root.querySelectorAll('.chapter, .vial-card, .tier-row')) {
      if (this.reduced) node.classList.add('revealed');
      else observer.observe(node);
    }
    this.observer = observer;
  }

  /** Recompute everything scroll drives. */
  #update() {
    const scrollTop = this.root.scrollTop;
    const height = this.root.clientHeight;
    const total = Math.max(1, this.root.scrollHeight - height);
    this.progress = clamp(scrollTop / total, 0, 1);
    if (this.railProgress) this.railProgress.style.transform = `scaleY(${this.progress})`;

    let active = this.chapters[0];
    for (const chapter of this.chapters) {
      if (!chapter.node) continue;
      const top = chapter.node.offsetTop - scrollTop;
      const local = clamp(1 - Math.abs(top - height * 0.28) / (height * 0.9), 0, 1);
      chapter.node.style.setProperty('--local', local.toFixed(3));
      if (!this.reduced) {
        // Layered parallax: the text drifts more slowly than the page.
        const drift = smoothstep(-height, height, top) - 0.5;
        chapter.node.style.setProperty('--drift', (drift * 42).toFixed(2));
      }
      if (top < height * 0.55 && top > -chapter.node.offsetHeight * 0.7) active = chapter;
    }

    if (active && active.id !== this.active) {
      this.active = active.id;
      this.lab?.goTo(active.waypoint);
      // The entrance's copy runs down the left, so the subject is pushed right
      // — but only on a wide screen, where there is room for both.
      this.lab?.setFraming(window.innerWidth > 900 ? -5.5 : 0);
      this.score?.setMood(active.mood);
      for (const dot of this.railDots) dot.classList.toggle('on', dot.dataset.chapter === active.id);
      this.root.dispatchEvent(new CustomEvent('chapter', { detail: { id: active.id }, bubbles: true }));
    }
  }

  /** Stop listening and release observers. */
  destroy() {
    this.root.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onScroll);
    this.observer?.disconnect();
  }
}

/** The ladder rendered in the tiers chapter, mirroring `evidence.js`. */
const TIER_ROWS = [
  { label: 'Human RCT', ceiling: 96, accent: '#2fe08a' },
  { label: 'Human trial', ceiling: 78, accent: '#5fd8ff' },
  { label: 'Observational', ceiling: 62, accent: '#8fb4ff' },
  { label: 'Animal model', ceiling: 45, accent: '#f2b53b' },
  { label: 'In vitro', ceiling: 34, accent: '#c08bff' },
  { label: 'Mechanism', ceiling: 24, accent: '#ff9d5c' },
  { label: 'Anecdote', ceiling: 12, accent: '#ff5c7a' },
];

/**
 * A statistic block.
 *
 * @param {string} value The number.
 * @param {string} label What it counts.
 * @returns {HTMLElement} The block.
 */
function stat(value, label) {
  return el('div.stat', {}, [el('span.stat-value', { text: value }), el('span.stat-label', { text: label })]);
}

/**
 * A legend swatch.
 *
 * @param {string} color The colour.
 * @param {string} label The meaning.
 * @returns {HTMLElement} The swatch.
 */
function legend(color, label) {
  return el('span.legend', {}, [el('i', { style: { background: color } }), label]);
}

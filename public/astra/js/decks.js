/**
 * The decks.
 *
 * One function per deck, each handed the same context object and returning the
 * panel body. Nothing here holds state of its own: the app owns the state, the
 * decks render it, and a deck re-renders by being called again. That keeps the
 * whole UI layer inspectable — every screen in the facility is a pure function
 * of the corpus plus the reader's record.
 *
 * @module astra/decks
 */

import { GOALS, PEPTIDES, STACKS, SYSTEMS, corpusSize, findAny, pubmedUrl } from './data/peptides.js';
import { BANDS, TIERS, describe, effectiveTier, relevanceNote, scoreEvidence, tier } from './evidence.js';
import { SECTIONS, corpusVerdict, dossier, entryReading, rankForGoals, search } from './engine.js';
import { analyseClaim, complianceCheck, compliantRewrite, factCheck } from './claims.js';
import { comparable, compare } from './compare.js';
import { decode, headline as decodeHeadline } from './decoder.js';
import { SIM_CONTROLS, convene, simulate } from './reviewers.js';
import { FORMATS, generatePackage, recommendNext, toMarkdown, variants } from './studio.js';
import { arrivalProfile, executiveDashboard, proposeCampaign } from './command.js';
import { UNLOCKS, summary as progressSummary } from './progress.js';
import { ago, copyText, download, el, fill, pct, richText } from './dom.js';
import { buildPanels } from './ar.js';
import {
  BANDS as BF_BANDS, FIELDS, LEVERS, METHODS, bandsTouched, changeThreshold,
  clearRecord, composition, estimate, loadRecord, method, saveRecord, trend,
} from './bodyfat.js';
import { qrSvg } from './qr.js';

/* ------------------------------------------------------------------ shared */

/**
 * An evidence meter.
 *
 * @param {object} reading A reading from `scoreEvidence`.
 * @param {object} [options] Options.
 * @returns {HTMLElement} The meter.
 */
export function meter(reading, { compact = false } = {}) {
  return el('div.evidence-meter', { style: { '--band': reading.band.accent } }, [
    el('div.meter-head', {}, [
      el('span.meter-label', { text: reading.band.label }),
      el('span.meter-value', { text: pct(reading.score) }),
    ]),
    el('div.meter-track', {}, [el('div.meter-fill', { style: { width: pct(reading.score) } })]),
    compact ? null : el('p.meter-gloss', { text: reading.band.gloss }),
    compact ? null : el('ul.meter-reasons', {}, reading.reasons.map((reason) => el('li', { text: reason }))),
  ]);
}

/**
 * A tier chip.
 *
 * @param {string} id Tier id.
 * @returns {HTMLElement} The chip.
 */
export function tierChip(id) {
  const info = tier(id);
  return el('span.tier-chip', { style: { '--tier': info.accent }, title: `${info.definition} ${info.caveat}` }, [info.short]);
}

/**
 * A study card, with the source link that makes "Show me the science" real.
 *
 * @param {object} study The study.
 * @param {object} ctx App context.
 * @returns {HTMLElement} The card.
 */
export function studyCard(study, ctx) {
  // A study counted below its design says so on its own card. The adjustment is
  // part of the argument, not something to bury in the arithmetic.
  const note = relevanceNote(study);
  return el('article.study', { 'data-demoted': note ? 'yes' : null }, [
    el('header.study-head', {}, [
      el('div.study-tiers', {}, [
        tierChip(study.tier),
        note ? el('span.demote-arrow', { 'aria-hidden': 'true', text: '→' }) : null,
        note ? tierChip(effectiveTier(study).tier.id) : null,
      ].filter(Boolean)),
      el('h4', { text: study.title }),
      el('p.study-meta', { text: `${study.journal} · ${study.year} · ${study.design}${study.n ? ` · n=${study.n}` : ''}` }),
    ]),
    el('p.study-pop', {}, [el('b', { text: 'Studied in: ' }), study.population]),
    el('p.study-find', {}, [el('b', { text: 'Found: ' }), study.finding]),
    el('p.study-limit', {}, [el('b', { text: 'Limitation: ' }), study.limitation]),
    note ? el('p.study-demote', { text: note }) : null,
    el('a.source-link', {
      href: study.url || pubmedUrl(study),
      target: '_blank',
      rel: 'noopener noreferrer',
      onclick: () => ctx.award('pubmed-open', { study: study.id }),
    }, ['Open the literature →']),
  ].filter(Boolean));
}

/**
 * A tabbed container.
 *
 * @param {Array<{ id: string, label: string, render: () => HTMLElement }>} tabs The tabs.
 * @param {string} active Active tab id.
 * @param {(id: string) => void} onSelect Selection handler.
 * @returns {HTMLElement} The container.
 */
function tabs(tabList, active, onSelect) {
  const current = tabList.find((tab) => tab.id === active) || tabList[0];
  return el('div.tabbed', {}, [
    el('nav.tabs', { role: 'tablist' }, tabList.map((tab) => el('button.tab', {
      type: 'button',
      role: 'tab',
      'aria-selected': tab.id === current.id ? 'true' : 'false',
      class: tab.id === current.id ? 'on' : '',
      onclick: () => onSelect(tab.id),
    }, [tab.label]))),
    el('div.tab-body', { role: 'tabpanel' }, [current.render()]),
  ]);
}

/**
 * A labelled section heading with a number, matching the dossier's format.
 *
 * @param {string} number The section number.
 * @param {string} title The title.
 * @returns {HTMLElement} The heading.
 */
function sectionHead(number, title) {
  return el('h3.section-head', {}, [el('span.section-n', { text: number }), title]);
}

/* --------------------------------------------------------- 01 · the engine */

/**
 * The Peptide Intelligence Engine.
 *
 * @param {object} ctx App context.
 * @returns {HTMLElement} The deck.
 */
export function renderEngine(ctx) {
  const state = ctx.deckState.engine || (ctx.deckState.engine = { query: '', subject: null, section: null, asked: [] });
  const root = el('div.deck.engine');

  const input = el('input.engine-input', {
    type: 'text',
    value: state.query,
    placeholder: 'Explain the current research surrounding…',
    'aria-label': 'Ask the Peptide Intelligence Engine',
  });

  const results = el('div.engine-results');
  const dossierHost = el('div.dossier-host');

  /**
   * Run a query.
   *
   * @param {string} value The query.
   */
  const run = (value) => {
    state.query = value;
    ctx.telemetry.push('ask', { topic: value.slice(0, 60), goals: ctx.goalsIn(value) });
    const answer = ctx.answer(value);
    fill(results, [
      el('div.answer', {}, [
        el('div.answer-head', {}, [
          el('span.answer-badge', { text: answer.via === 'model' ? 'ASTRA · model' : 'ASTRA · corpus' }),
          answer.reading ? el('span.answer-band', { style: { '--band': answer.reading.band.accent }, text: describe(answer.reading) }) : null,
        ]),
        richText(answer.text),
        answer.sources.length ? el('div.answer-sources', {}, [
          el('span.sources-label', { text: 'Sources' }),
          ...answer.sources.map((source) => el('a.chip', source.url
            ? { href: source.url, target: '_blank', rel: 'noopener noreferrer', onclick: () => ctx.award('pubmed-open', { study: source.id }) }
            : { href: '#', onclick: (event) => { event.preventDefault(); open(source.peptide); } }, [source.title])),
        ]) : null,
        el('div.follow-ups', {}, answer.followUps.map((question) => el('button.chip.ghost', {
          type: 'button', onclick: () => { input.value = question; run(question); },
        }, [question]))),
      ]),
    ]);
    if (answer.subject) open(answer.subject.id);
  };

  /**
   * Open a compound dossier.
   *
   * @param {string} id Compound id.
   */
  const open = (id) => {
    const entry = findAny(id);
    if (!entry) return;
    state.subject = id;
    ctx.telemetry.push('dossier', { peptide: id });
    ctx.award('dossier-open', { peptide: id });
    ctx.lab?.setCompound(id, entry.accent);
    ctx.lab?.goTo('compound');
    ctx.score?.setMood('engine');
    fill(dossierHost, [renderDossier(entry, ctx, () => open(id))]);
    dossierHost.scrollIntoView({ behavior: ctx.reducedMotion ? 'auto' : 'smooth', block: 'start' });
  };

  ctx.openCompound = open;

  const form = el('form.engine-form', {
    onsubmit: (event) => { event.preventDefault(); if (input.value.trim()) run(input.value.trim()); },
  }, [
    input,
    el('button.btn.primary', { type: 'submit' }, ['Analyse']),
  ]);

  root.append(
    el('div.engine-hero', {}, [
      el('p.kicker', { text: 'Peptide Intelligence Engine' }),
      el('h2', { text: 'Search · Compare · Verify · Understand' }),
      form,
      el('div.engine-suggestions', {}, [
        'Explain the current research surrounding BPC-157',
        'What has human evidence for recovery?',
        'Is tesamorelin approved?',
        'How do you grade evidence?',
      ].map((question) => el('button.chip.ghost', {
        type: 'button', onclick: () => { input.value = question; run(question); },
      }, [question]))),
    ]),
    results,
    el('div.library', {}, [
      sectionHead('◈', 'The library'),
      el('div.library-grid', {}, [...PEPTIDES, ...STACKS].map((entry) => {
        const reading = entryReading(entry);
        return el('button.library-card', {
          type: 'button',
          style: { '--accent': entry.accent },
          onclick: () => open(entry.id),
        }, [
          el('span.lib-name', { text: entry.name }),
          el('span.lib-class', { text: entry.klass }),
          el('span.lib-band', { style: { '--band': reading.band.accent }, text: `${reading.band.label} · ${pct(reading.score)}` }),
        ]);
      })),
    ]),
    dossierHost,
  );

  if (state.subject) open(state.subject);
  return root;
}

/**
 * The eight-section dossier.
 *
 * @param {object} entry A compound or stack.
 * @param {object} ctx App context.
 * @param {Function} rerender Re-render callback.
 * @returns {HTMLElement} The dossier.
 */
export function renderDossier(entry, ctx, rerender) {
  const report = dossier(entry);
  const root = el('article.dossier', { style: { '--accent': entry.accent } });

  root.append(
    el('header.dossier-head', {}, [
      el('p.kicker', { text: entry.klass }),
      el('h2', { text: entry.name }),
      el('p.tagline', { text: entry.tagline }),
      meter(report.reading),
      el('div.dossier-actions', {}, [
        el('button.btn.ghost', { type: 'button', onclick: () => ctx.go('compare', { left: entry.id }) }, ['Compare →']),
        el('button.btn.ghost', { type: 'button', onclick: () => ctx.go('compare', { left: entry.id, tab: 'debate' }) }, ['Debate room →']),
        el('button.btn.ghost', { type: 'button', onclick: () => ctx.go('graph', { focus: `peptide:${entry.id}` }) }, ['Show on the map →']),
      ]),
    ]),
  );

  for (const section of SECTIONS) {
    const data = report.sections[section.id];
    if (!data) continue;
    const body = [el('p.section-body', { text: data.body })];

    if (section.id === 'what' && data.facts) {
      body.push(el('dl.facts', {}, data.facts.flatMap(([term, value]) => [
        el('dt', { text: term }), el('dd', { text: value }),
      ])));
      // Claims, each expandable into its sources. This is the "Show me the
      // science" button, and it is on every claim rather than on some of them.
      if (report.claims?.length) {
        body.push(el('div.claims', {}, report.claims.map((claim) => renderClaim(claim, entry, ctx))));
      }
    }

    if (section.id === 'mechanism' && data.items?.length) {
      body.push(el('div.mechanisms', {}, data.items.map((item) => el('div.mechanism', {}, [
        el('div.mech-head', {}, [tierChip(item.tier), el('h4', { text: item.title })]),
        el('p', { text: item.detail }),
      ]))));
    }

    if ((section.id === 'human' || section.id === 'preclinical' || section.id === 'sources') && data.studies?.length) {
      body.push(el('div.studies', {}, data.studies.map((study) => studyCard(study, ctx))));
    }

    if (section.id === 'active') {
      body.push(renderTimeline(entry, ctx));
    }

    if (section.id === 'uncertainties' && data.items?.length) {
      body.push(el('ul.uncertainties', {}, data.items.map((item) => el('li', { text: item }))));
    }

    if (section.id === 'regulatory') {
      body.push(el('div.regulatory', { 'data-status': data.status }, [
        el('p', { text: data.detail }),
        el('p.sport', {}, [el('b', { text: 'In sport: ' }), data.sport]),
        data.reported ? el('div.reported', {}, [
          el('h4', { text: 'Reported dosing — context, not guidance' }),
          el('p', { text: `${data.reported.route}. ${data.reported.range}.` }),
          el('p.reported-note', { text: data.reported.note }),
        ]) : null,
      ]));
    }

    root.append(el('section.dossier-section', { 'data-section': section.id }, [
      sectionHead(section.n, section.title),
      ...body.filter(Boolean),
    ]));
  }

  return root;
}

/**
 * One claim with its expandable evidence.
 *
 * @param {object} claim The claim, as prepared by the engine.
 * @param {object} entry Its compound.
 * @param {object} ctx App context.
 * @returns {HTMLElement} The claim block.
 */
function renderClaim(claim, entry, ctx) {
  const body = el('div.claim-evidence', { hidden: true });
  let built = false;

  const toggle = el('button.btn.science', { type: 'button' }, ['Show me the science']);
  toggle.addEventListener('click', () => {
    if (!built) {
      built = true;
      fill(body, [
        meter(claim.reading, { compact: true }),
        claim.note ? el('p.claim-note', { text: claim.note }) : null,
        claim.studies.length
          ? el('div.studies', {}, claim.studies.map((study) => studyCard(study, ctx)))
          : el('p.claim-empty', { text: 'No study in the corpus supports this claim. That is the finding.' }),
      ].filter(Boolean));
    }
    const opening = body.hidden;
    body.hidden = !opening;
    toggle.textContent = opening ? 'Hide the science' : 'Show me the science';
    if (opening) {
      ctx.award('sources-expand', { claim: claim.id, peptide: entry.id });
      if (claim.tier === 'anecdotal' || claim.direction === -1) ctx.award('contradiction-found', { claim: claim.id });
      ctx.score?.cue('open');
    }
  });

  return el('div.claim-block', { 'data-tier': claim.tier }, [
    el('div.claim-head', {}, [tierChip(claim.tier), el('h4', { text: claim.text })]),
    toggle,
    body,
  ]);
}

/**
 * The research timeline for a compound.
 *
 * @param {object} entry The compound.
 * @param {object} ctx App context.
 * @returns {HTMLElement} The timeline.
 */
export function renderTimeline(entry, ctx) {
  const events = entry.timeline || [];
  if (!events.length) return el('p.section-body', { text: 'No timeline is catalogued for this stack; see its components.' });
  const first = events[0].year;
  const last = events[events.length - 1].year;
  const span = Math.max(1, last - first);
  ctx.award('timeline-view', { peptide: entry.id });
  return el('div.timeline', {}, [
    el('div.timeline-line'),
    ...events.map((event) => el('div.timeline-event', {
      'data-kind': event.kind,
      style: { '--at': `${((event.year - first) / span) * 100}%` },
    }, [
      el('span.tl-year', { text: String(event.year) }),
      el('span.tl-dot'),
      el('div.tl-body', {}, [
        el('h5', { text: event.label }),
        el('p', { text: event.detail }),
      ]),
    ])),
  ]);
}

/* ------------------------------------------------------------ 02 · the map */

/**
 * The knowledge graph deck.
 *
 * @param {object} ctx App context.
 * @returns {HTMLElement} The deck.
 */
export function renderGraph(ctx) {
  const state = ctx.deckState.graph || (ctx.deckState.graph = { selected: null });
  const graph = ctx.graph();
  ctx.lab?.setGraph(graph);
  ctx.lab?.goTo('graph');
  ctx.award('graph-explore', {});

  const detail = el('div.graph-detail');

  /**
   * Select a node.
   *
   * @param {string} id Node id.
   */
  const select = (id) => {
    state.selected = id;
    const { node, neighbours } = ctx.neighbourhood(graph, id);
    if (!node) return;
    ctx.lab?.setFocus([node.x, node.y, node.z]);
    ctx.score?.cue('move');
    fill(detail, [
      el('h3', { text: node.label }),
      el('p.node-kind', { text: `${node.kind} · ${neighbours.length} connections` }),
      node.kind === 'peptide' || node.kind === 'stack'
        ? el('button.btn.primary', { type: 'button', onclick: () => ctx.go('engine', { subject: node.ref }) }, ['Open the dossier →'])
        : null,
      el('div.neighbours', {}, neighbours.slice(0, 14).map((item) => el('button.chip', {
        type: 'button',
        style: { '--accent': item.node.accent },
        onclick: () => select(item.node.id),
      }, [`${item.node.label}`]))),
    ].filter(Boolean));
  };

  const kinds = [
    ['peptide', 'Compounds'], ['stack', 'Stacks'], ['system', 'Body systems'],
    ['mechanism', 'Mechanisms'], ['study', 'Studies'],
  ];

  const root = el('div.deck.graph', {}, [
    el('div.deck-head', {}, [
      el('p.kicker', { text: 'Peptide Knowledge Graph' }),
      el('h2', { text: `${graph.nodes.length} nodes, ${graph.edges.length} connections` }),
      el('p.deck-lede', { text: 'Compounds connect to their mechanisms, mechanisms to body systems, and everything to the studies underneath. Drag the room behind this panel to fly through it.' }),
    ]),
    el('div.graph-lists', {}, kinds.map(([kind, label]) => el('div.graph-list', {}, [
      el('h4', { text: label }),
      el('div.chips', {}, graph.nodes.filter((node) => node.kind === kind).slice(0, 24).map((node) => el('button.chip', {
        type: 'button',
        style: { '--accent': node.accent },
        onclick: () => select(node.id),
      }, [node.short || node.label]))),
    ]))),
    detail,
  ]);

  if (state.selected) select(state.selected);
  else select(`peptide:${PEPTIDES[0].id}`);
  return root;
}

/* -------------------------------------------------------- 03 · the decoder */

/**
 * The Research Paper Decoder.
 *
 * @param {object} ctx App context.
 * @returns {HTMLElement} The deck.
 */
export function renderDecoder(ctx) {
  const state = ctx.deckState.decoder || (ctx.deckState.decoder = { text: '', report: null });
  const output = el('div.decoder-output');

  const area = el('textarea.decoder-input', {
    rows: '9',
    placeholder: 'Paste an abstract — ideally with the methods and results sentences, since that is where the design and the numbers live.',
    'aria-label': 'Paste a research abstract',
  });
  area.value = state.text;

  /** Decode whatever is in the box. */
  const run = () => {
    state.text = area.value;
    const report = decode(area.value);
    state.report = report;
    if (!report.ok) {
      fill(output, [el('p.warn', { text: report.reason })]);
      return;
    }
    ctx.award('paper-decode', {});
    ctx.score?.cue('open');
    fill(output, [
      el('div.decode-summary', { style: { '--tier': report.tier.accent } }, [
        el('span.tier-chip', { style: { '--tier': report.tier.accent }, text: report.tier.short }),
        el('p.decode-headline', { text: decodeHeadline(report) }),
      ]),
      block('01 — What was studied', [el('p', { text: report.whatWasStudied })]),
      block('02 — Who or what was studied', [
        el('p', { text: report.population.label }),
        report.population.detail ? el('p.quiet', { text: `In the text: “${report.population.detail}”` }) : null,
        el('p.quiet', { text: report.sample.n ? `Sample size detected: ${report.sample.n}${report.sample.mentions.length > 1 ? ` (other figures in the text: ${report.sample.mentions.slice(1).join(', ')})` : ''}` : 'No sample size stated in the text supplied.' }),
      ]),
      block('03 — What was actually found', [
        ...report.whatWasFound.map((line) => el('p', { text: line })),
        report.stats.hasStats
          ? el('p.quiet', { text: `Statistics reported: ${[...report.stats.pValues, ...report.stats.intervals].join(' · ')}` })
          : el('p.warn', { text: 'No p-values or confidence intervals appear in the text supplied.' }),
      ]),
      block('04 — Limitations', [
        report.limitations.length
          ? el('ul', {}, report.limitations.map((line) => el('li', { text: line })))
          : el('p.quiet', { text: 'The authors stated no limitation in this text.' }),
        el('h5', { text: 'Inferred from the design' }),
        el('ul', {}, report.inferredLimitations.map((line) => el('li', { text: line }))),
      ]),
      block('05 — What this does not prove', [
        el('ul.not-proven', {}, report.doesNotProve.map((line) => el('li', { text: line }))),
      ]),
      block('06 — How firmly it is written', [
        el('p', { text: report.hedge.verdict }),
        el('p.quiet', { text: `${report.hedge.hedges} hedging phrases, ${report.hedge.strong} strong-claim phrases, across ${report.words} words.` }),
      ]),
      el('div.decode-actions', {}, [
        el('button.btn.primary', {
          type: 'button',
          onclick: () => ctx.go('studio', { report, peptide: ctx.subjectFor(area.value) }),
        }, ['Turn this into 30 pieces of content →']),
        el('button.btn.ghost', { type: 'button', onclick: () => ctx.go('compare', { tab: 'simulator', n: report.sample.n || 60 }) }, ['Test this design in the simulator →']),
      ]),
    ]);
  };

  const root = el('div.deck.decoder', {}, [
    el('div.deck-head', {}, [
      el('p.kicker', { text: 'Research Paper Decoder' }),
      el('h2', { text: 'Paste a study. Get the five answers that matter.' }),
      el('p.deck-lede', { text: 'What was studied, in whom, what was found, what limits it, and what it does not prove. Runs entirely on this device — nothing you paste is uploaded.' }),
    ]),
    area,
    el('div.decoder-actions', {}, [
      el('button.btn.primary', { type: 'button', onclick: run }, ['Decode']),
      el('button.btn.ghost', {
        type: 'button',
        onclick: () => { area.value = SAMPLE_ABSTRACT; run(); },
      }, ['Use a sample abstract']),
    ]),
    output,
  ]);

  if (state.report) run();
  return root;
}

/** A sample abstract, so the decoder can be tried without hunting for one. */
const SAMPLE_ABSTRACT = `We investigated whether a synthetic pentadecapeptide accelerates tendon-to-bone healing. Male Wistar rats (n=48) underwent Achilles tendon transection and were randomly allocated to treatment or vehicle for 14 days. Biomechanical testing showed greater load to failure in treated animals compared with controls (p<0.05), and histological scoring indicated increased collagen organisation. Expression of VEGF was higher in the treated group. These findings suggest the peptide may promote tendon healing, although further study is warranted and the model does not reproduce the degenerative tendinopathy seen in patients.`;

/**
 * A titled block.
 *
 * @param {string} title The heading.
 * @param {Array<Node|null>} children Contents.
 * @returns {HTMLElement} The block.
 */
function block(title, children) {
  return el('section.block', {}, [el('h4', { text: title }), ...children.filter(Boolean)]);
}

/* ------------------------------------------------------------ 04 · the lab */

/**
 * The Lab: comparison, debate room, and study simulator.
 *
 * @param {object} ctx App context.
 * @returns {HTMLElement} The deck.
 */
export function renderCompare(ctx) {
  const state = ctx.deckState.compare || (ctx.deckState.compare = {
    tab: 'compare', left: 'bpc-157', right: 'semaglutide', sim: Object.fromEntries(SIM_CONTROLS.map((c) => [c.id, c.value])),
  });
  const rerender = () => ctx.render();

  return el('div.deck.lab', {}, [
    el('div.deck-head', {}, [
      el('p.kicker', { text: 'The Lab' }),
      el('h2', { text: 'Compare, argue, and test the design.' }),
    ]),
    tabs([
      { id: 'compare', label: 'Comparison Lab', render: () => comparisonPanel(ctx, state, rerender) },
      { id: 'debate', label: 'Debate Room', render: () => debatePanel(ctx, state, rerender) },
      { id: 'simulator', label: 'Study Simulator', render: () => simulatorPanel(ctx, state, rerender) },
    ], state.tab, (id) => { state.tab = id; ctx.score?.cue('move'); rerender(); }),
  ]);
}

/**
 * The side-by-side comparison.
 *
 * @param {object} ctx App context.
 * @param {object} state Deck state.
 * @param {Function} rerender Re-render.
 * @returns {HTMLElement} The panel.
 */
function comparisonPanel(ctx, state, rerender) {
  const options = comparable();
  const result = compare(state.left, state.right);

  const picker = (side) => el('select.picker', {
    'aria-label': `${side} compound`,
    onchange: (event) => { state[side] = event.target.value; ctx.award('compare-run', {}); rerender(); },
  }, options.map((option) => el('option', {
    value: option.id, selected: state[side] === option.id ? true : null, text: option.name,
  })));

  if (!result) {
    return el('div.compare', {}, [
      el('div.compare-pickers', {}, [picker('left'), el('span.vs', { text: 'vs' }), picker('right')]),
      el('p.warn', { text: 'Pick two different compounds.' }),
    ]);
  }

  return el('div.compare', {}, [
    el('div.compare-pickers', {}, [picker('left'), el('span.vs', { text: 'vs' }), picker('right')]),
    el('div.compare-heads', {}, [result.left, result.right].map((column) => el('div.compare-head', {
      style: { '--accent': column.entry.accent },
    }, [
      el('h3', { text: column.entry.name }),
      meter(column.reading, { compact: true }),
      el('div.mix', {}, column.mix.map((item) => el('span.mix-chip', {
        style: { '--tier': item.tier.accent },
        title: item.tier.definition,
        text: `${item.count}× ${item.tier.short}`,
      }))),
    ]))),
    el('table.compare-table', {}, [
      el('tbody', {}, result.axes.map((axis) => el('tr', {}, [
        el('th', { scope: 'row', text: axis.label }),
        el('td', { text: axis.left }),
        el('td', { text: axis.right }),
      ]))),
    ]),
    el('div.verdict', {}, [
      el('h4', { text: result.verdict.headline }),
      el('p', { text: result.verdict.body }),
      el('p.caution', { text: result.verdict.caution }),
    ]),
  ]);
}

/**
 * The debate room.
 *
 * @param {object} ctx App context.
 * @param {object} state Deck state.
 * @param {Function} rerender Re-render.
 * @returns {HTMLElement} The panel.
 */
function debatePanel(ctx, state, rerender) {
  const debate = convene(state.left);
  ctx.award('debate-run', { peptide: state.left });
  const options = comparable();

  return el('div.debate', {}, [
    el('select.picker', {
      'aria-label': 'Compound under review',
      onchange: (event) => { state.left = event.target.value; rerender(); },
    }, options.map((option) => el('option', { value: option.id, selected: state.left === option.id ? true : null, text: option.name }))),
    el('p.deck-lede', { text: 'Four reviewers, four priorities, one corpus. Read the disagreements rather than the verdict — where they split, the split names the study that would settle it.' }),
    el('div.opinions', {}, debate.opinions.map((opinion) => el('article.opinion', {
      style: { '--accent': opinion.reviewer.accent },
    }, [
      el('header', {}, [
        el('h4', { text: opinion.reviewer.name }),
        el('span.position', { text: opinion.position }),
        el('p.focus', { text: opinion.reviewer.focus }),
      ]),
      el('p', { text: opinion.body }),
    ]))),
    el('div.consensus', {}, [
      el('h4', { text: 'Consensus report' }),
      el('p.consensus-verdict', { text: debate.consensus.verdict }),
      el('p', { text: debate.consensus.body }),
      el('h5', { text: 'Agreed' }),
      el('ul', {}, debate.consensus.agreed.map((line) => el('li', { text: line }))),
      el('h5', { text: 'Disputed' }),
      el('ul', {}, debate.consensus.disputed.map((line) => el('li', { text: line }))),
    ]),
  ]);
}

/**
 * The study-design simulator.
 *
 * @param {object} ctx App context.
 * @param {object} state Deck state.
 * @param {Function} rerender Re-render.
 * @returns {HTMLElement} The panel.
 */
function simulatorPanel(ctx, state, rerender) {
  const result = simulate(state.sim);
  const output = el('div.sim-output');

  /** Redraw only the results, so dragging a slider stays smooth. */
  const refresh = () => {
    const next = simulate(state.sim);
    fill(output, [
      el('div.sim-readouts', {}, [
        readout('Power', pct(next.power), 'Chance of detecting the effect if it is real.'),
        readout('False-positive risk', pct(next.falsePositiveRisk), 'Chance a positive result here is wrong.'),
        readout('Smallest visible effect', next.detectable.toFixed(2), "Cohen's d. Anything smaller is invisible to this design."),
        readout('Evidence tier', next.tier.short, next.tier.definition),
      ]),
      el('div.sim-verdict', { 'data-level': next.verdict.level }, [el('p', { text: next.verdict.text })]),
      el('ul.sim-notes', {}, next.notes.map((note) => el('li', { text: note }))),
    ]);
  };

  const controls = SIM_CONTROLS.map((control) => {
    if (control.kind === 'toggle') {
      return el('label.sim-toggle', {}, [
        el('input', {
          type: 'checkbox',
          checked: state.sim[control.id] ? true : null,
          onchange: (event) => { state.sim[control.id] = event.target.checked; refresh(); },
        }),
        el('span', { text: control.label }),
      ]);
    }
    const value = el('span.sim-value', { text: `${state.sim[control.id]}${control.unit}` });
    return el('label.sim-slider', {}, [
      el('span.sim-label', {}, [control.label, value]),
      el('input', {
        type: 'range', min: control.min, max: control.max, step: control.step, value: state.sim[control.id],
        oninput: (event) => {
          state.sim[control.id] = Number(event.target.value);
          value.textContent = `${state.sim[control.id]}${control.unit}`;
          refresh();
        },
      }),
    ]);
  });

  ctx.award('simulator-run', {});
  const panel = el('div.simulator', {}, [
    el('p.deck-lede', { text: 'This does not simulate taking anything. It simulates designing a study — move the sample size, the blinding and the prior plausibility, and watch what the same observed result is then worth.' }),
    el('div.sim-controls', {}, controls),
    output,
  ]);
  refresh();
  return panel;
}

/**
 * A simulator readout tile.
 *
 * @param {string} label The label.
 * @param {string} value The value.
 * @param {string} note The explanation.
 * @returns {HTMLElement} The tile.
 */
function readout(label, value, note) {
  return el('div.readout', {}, [
    el('span.readout-label', { text: label }),
    el('span.readout-value', { text: value }),
    el('span.readout-note', { text: note }),
  ]);
}

/* --------------------------------------------------------- 05 · verify */

/**
 * Myth detector, fact checker and compliance guardian.
 *
 * @param {object} ctx App context.
 * @returns {HTMLElement} The deck.
 */
export function renderVerify(ctx) {
  const state = ctx.deckState.verify || (ctx.deckState.verify = { tab: 'myth', text: '' });
  const rerender = () => ctx.render();

  return el('div.deck.verify', {}, [
    el('div.deck-head', {}, [
      el('p.kicker', { text: 'Verification' }),
      el('h2', { text: 'Check it before you believe it. Check it before you publish it.' }),
    ]),
    tabs([
      { id: 'myth', label: 'Myth Detector', render: () => claimPanel(ctx, state, 'myth') },
      { id: 'check', label: 'Social Fact Checker', render: () => claimPanel(ctx, state, 'check') },
      { id: 'guardian', label: 'Compliance Guardian', render: () => claimPanel(ctx, state, 'guardian') },
    ], state.tab, (id) => { state.tab = id; ctx.score?.cue('move'); rerender(); }),
  ]);
}

/**
 * The shared claim-analysis panel, in one of three modes.
 *
 * @param {object} ctx App context.
 * @param {object} state Deck state.
 * @param {'myth'|'check'|'guardian'} mode Which view.
 * @returns {HTMLElement} The panel.
 */
function claimPanel(ctx, state, mode) {
  const output = el('div.claim-output');
  const area = el('textarea.claim-input', {
    rows: '4',
    placeholder: mode === 'guardian'
      ? 'Paste the ad, caption or email you are about to publish.'
      : 'Paste the claim you saw — a caption, a comment, a Reel voiceover.',
    'aria-label': 'Claim to analyse',
  });
  area.value = state.text;

  /** Analyse whatever is in the box. */
  const run = () => {
    state.text = area.value;
    if (mode === 'guardian') {
      const report = complianceCheck(area.value);
      ctx.telemetry.push('compliance', { severity: report.severity });
      ctx.award('compliance-check', {});
      fill(output, [
        el('div.guard-verdict', { 'data-severity': report.severity }, [
          el('h4', { text: report.verdict }),
          el('p.quiet', { text: `Language safety score: ${pct(report.score)}. This is a drafting aid, not legal advice.` }),
        ]),
        report.findings.length ? el('div.findings', {}, report.findings.map((finding) => el('article.finding', { 'data-severity': finding.severity }, [
          el('header', {}, [el('span.sev', { text: finding.severity }), el('h5', { text: finding.label })]),
          el('p.phrase', { text: `“${finding.phrase}”` }),
          el('p', { text: finding.why }),
          el('p.fix', {}, [el('b', { text: 'Instead: ' }), finding.fix]),
        ]))) : el('p.quiet', { text: 'No patterns fired. Attach the evidence tier before publishing anyway.' }),
        el('div.rewrite', {}, [
          el('h5', { text: 'Compliant draft' }),
          el('pre', { text: compliantRewrite(area.value, analyseClaim(area.value)) }),
          el('button.btn.ghost', {
            type: 'button',
            onclick: async () => {
              const ok = await copyText(compliantRewrite(area.value, analyseClaim(area.value)));
              ctx.toast(ok ? 'Draft copied.' : 'Could not reach the clipboard.');
            },
          }, ['Copy draft']),
        ]),
      ]);
      return;
    }

    const analysis = mode === 'check' ? factCheck(area.value) : analyseClaim(area.value);
    if (!analysis.ok) {
      fill(output, [el('p.warn', { text: analysis.reason })]);
      return;
    }
    ctx.telemetry.push('claim-check', { level: analysis.verdict.level });
    ctx.award('claim-check', {});
    if (['contradicted', 'overstated', 'unsupported'].includes(analysis.verdict.level)) ctx.award('contradiction-found', {});
    ctx.score?.cue(analysis.verdict.level === 'supported' ? 'open' : 'alert');

    fill(output, [
      mode === 'check' ? el('div.decision', { 'data-decision': analysis.decision.split(' ')[0] }, [
        el('h3', { text: analysis.decision }),
        el('p', { text: analysis.reason }),
      ]) : null,
      el('div.chain', {}, [
        chainStep('Claim', analysis.text),
        chainStep('Compound', analysis.subject ? analysis.subject.name : 'None identified in the corpus'),
        chainStep('Evidence', analysis.supporting.length
          ? analysis.supporting.map((item) => `${item.claim.text} — ${item.tierInfo.label}`).join(' · ')
          : 'Nothing in the corpus supports this'),
        chainStep('Contradicting evidence', analysis.contradicting.length
          ? analysis.contradicting.map((item) => item.claim?.text || item.study?.title).join(' · ')
          : 'None catalogued'),
        chainStep('Confidence', describe(analysis.reading)),
        chainStep('Source', analysis.subject ? `${analysis.subject.studies?.length || 0} studies in the dossier` : '—'),
      ]),
      el('div.verdict', { 'data-level': analysis.verdict.level }, [
        el('h4', { text: analysis.verdict.headline }),
        el('p', { text: analysis.verdict.body }),
      ]),
      analysis.compliance.findings.length ? el('div.guard-inline', {}, [
        el('h5', { text: 'Language the guardian flags' }),
        el('ul', {}, analysis.compliance.findings.map((finding) => el('li', { text: `${finding.label}: “${finding.phrase}” — ${finding.fix}` }))),
      ]) : null,
      analysis.subject ? el('button.btn.ghost', {
        type: 'button', onclick: () => ctx.go('engine', { subject: analysis.subject.id }),
      }, [`Open the ${analysis.subject.name} dossier →`]) : null,
      mode === 'check' ? el('div.rewrite', {}, [
        el('h5', { text: 'Publishable rewrite' }),
        el('pre', { text: analysis.rewrite }),
      ]) : null,
    ].filter(Boolean));
  };

  const samples = {
    myth: 'BPC-157 heals any injury in days — it is clinically proven and completely safe.',
    check: 'New research shows GHK-Cu reverses ageing at the gene level.',
    guardian: 'Our peptide protocol cures inflammation. FDA-approved quality, guaranteed results, 500mcg daily. Limited stock.',
  };

  return el('div.claim-panel', {}, [
    el('p.deck-lede', {
      text: mode === 'guardian'
        ? 'Runs your copy against the language patterns regulators treat as drug claims, and rewrites it so the same point survives.'
        : mode === 'check'
          ? 'Before you publish: does the library support this, and is the wording publishable?'
          : 'Claim → evidence → contradicting evidence → confidence → source. The whole chain, every time.',
    }),
    area,
    el('div.claim-actions', {}, [
      el('button.btn.primary', { type: 'button', onclick: run }, ['Analyse']),
      el('button.btn.ghost', { type: 'button', onclick: () => { area.value = samples[mode]; run(); } }, ['Try an example']),
    ]),
    output,
  ]);
}

/**
 * One step of the evidence chain.
 *
 * @param {string} label Step label.
 * @param {string} value Step value.
 * @returns {HTMLElement} The step.
 */
function chainStep(label, value) {
  return el('div.chain-step', {}, [
    el('span.chain-label', { text: label }),
    el('span.chain-value', { text: value }),
  ]);
}

/* --------------------------------------------------------- 06 · the studio */

/**
 * The Content Studio and A/B laboratory.
 *
 * @param {object} ctx App context.
 * @returns {HTMLElement} The deck.
 */
export function renderStudio(ctx) {
  const state = ctx.deckState.studio || (ctx.deckState.studio = { peptide: 'bpc-157', report: null, pack: null, results: {} });
  const output = el('div.studio-output');

  /** Generate the package. */
  const run = () => {
    const peptide = findAny(state.peptide);
    const pack = generatePackage({ report: state.report, peptide });
    state.pack = pack;
    ctx.award('campaign-generate', {});
    ctx.score?.cue('reward');
    fill(output, [
      el('div.pack-head', {}, [
        el('h3', { text: `${pack.assets.length} assets generated` }),
        el('p', { text: `Evidence level: ${pack.facts.tierInfo.label}. Every asset carries the tier and the disclosure. ${pack.blocked} blocked, ${pack.warnings} flagged by the guardian.` }),
        el('button.btn.ghost', {
          type: 'button',
          onclick: () => download(`astra-content-${state.peptide}.md`, toMarkdown(pack)),
        }, ['Download as Markdown']),
      ]),
      ...FORMATS.map((format) => {
        const items = pack.assets.filter((asset) => asset.format === format.id);
        if (!items.length) return null;
        return el('section.pack-group', {}, [
          el('h4', {}, [el('span.fmt-icon', { text: format.icon }), format.label, el('span.count', { text: String(items.length) })]),
          el('div.pack-items', {}, items.map((asset) => el('article.asset', { 'data-severity': asset.compliance.severity }, [
            el('h5', { text: asset.title }),
            asset.body ? el('pre', { text: asset.body }) : null,
            asset.compliance.severity !== 'clear'
              ? el('p.asset-flag', { text: asset.compliance.verdict })
              : null,
            el('button.btn.ghost.sm', {
              type: 'button',
              onclick: async () => {
                const ok = await copyText(`${asset.title}\n\n${asset.body}\n\n${asset.disclosure}`);
                ctx.toast(ok ? 'Copied.' : 'Could not reach the clipboard.');
              },
            }, ['Copy']),
          ].filter(Boolean)))),
        ]);
      }).filter(Boolean),
      abLab(ctx, state, pack),
    ]);
  };

  const root = el('div.deck.studio', {}, [
    el('div.deck-head', {}, [
      el('p.kicker', { text: 'Content Studio' }),
      el('h2', { text: 'One paper. Thirty pieces. All governed.' }),
      el('p.deck-lede', { text: 'Every generated asset passes back through the compliance guardian before you see it, so the studio cannot hand you a caption the fact checker would block.' }),
    ]),
    el('div.studio-controls', {}, [
      el('label', {}, ['Compound', el('select.picker', {
        onchange: (event) => { state.peptide = event.target.value; },
      }, comparable().map((option) => el('option', { value: option.id, selected: state.peptide === option.id ? true : null, text: option.name })))]),
      el('button.btn.primary', { type: 'button', onclick: run }, ['⚡ Generate package']),
      state.report ? el('span.chip', { text: `Using decoded paper: ${state.report.design.label}` }) : el('span.chip.ghost', { text: 'No decoded paper attached — decode one for a sharper package' }),
    ]),
    output,
  ]);

  if (state.pack) run();
  return root;
}

/**
 * The A/B laboratory.
 *
 * @param {object} ctx App context.
 * @param {object} state Deck state.
 * @param {object} pack The generated package.
 * @returns {HTMLElement} The panel.
 */
function abLab(ctx, state, pack) {
  const list = variants(pack.facts);
  const recommendation = el('p.ab-reco');

  /** Recompute the recommendation from whatever has been entered. */
  const refresh = () => {
    const results = list.map((variant) => ({
      id: variant.angle,
      impressions: Number(state.results[`${variant.id}-i`] || 0),
      conversions: Number(state.results[`${variant.id}-c`] || 0),
    }));
    recommendation.textContent = recommendNext(results).note;
  };

  const rows = list.map((variant) => el('tr', {}, [
    el('td', {}, [el('b', { text: variant.angle }), el('p.quiet', { text: variant.line }), el('p.quiet', { text: variant.thesis })]),
    el('td', {}, [el('input.num', {
      type: 'number', min: '0', placeholder: 'impressions', value: state.results[`${variant.id}-i`] || '',
      oninput: (event) => { state.results[`${variant.id}-i`] = event.target.value; refresh(); },
    })]),
    el('td', {}, [el('input.num', {
      type: 'number', min: '0', placeholder: 'conversions', value: state.results[`${variant.id}-c`] || '',
      oninput: (event) => { state.results[`${variant.id}-c`] = event.target.value; refresh(); },
    })]),
  ]));

  const panel = el('section.ab-lab', {}, [
    el('h4', { text: 'A/B laboratory' }),
    el('p.quiet', { text: 'Five angles on the same evidence. Enter what each one did and the lab recommends what to test next — weighting for sample size, so a 2-of-4 variant never beats a 180-of-1000 one.' }),
    el('table.ab-table', {}, [el('tbody', {}, rows)]),
    recommendation,
  ]);
  refresh();
  return panel;
}

/* -------------------------------------------------------- 07 · the command */

/**
 * The Autonomous Marketing Command Centre.
 *
 * @param {object} ctx App context.
 * @returns {HTMLElement} The deck.
 */
export function renderCommand(ctx) {
  const state = ctx.deckState.command || (ctx.deckState.command = { campaign: null, radar: null });
  const dashboard = executiveDashboard(ctx.telemetry, ctx.progress);
  const radarHost = el('div.radar-host');
  const campaignHost = el('div.campaign-host');

  /** Sweep the radar. */
  const sweep = async () => {
    fill(radarHost, [el('p.quiet', { text: 'Sweeping Europe PMC…' })]);
    const result = await ctx.radar.sweep({ limit: 5 });
    state.radar = result;
    ctx.award('radar-read', {});
    fill(radarHost, [
      el('div.radar-status', { 'data-status': result.status }, [
        el('span', { text: result.status.toUpperCase() }),
        el('span.quiet', { text: result.at ? `swept ${ago(result.at)}` : 'never swept' }),
      ]),
      result.items.length
        ? el('div.radar-items', {}, result.items.slice(0, 14).map((item) => el('a.radar-item', {
          href: item.url, target: '_blank', rel: 'noopener noreferrer',
          onclick: () => ctx.award('pubmed-open', { study: item.id }),
        }, [
          tierChip(item.tier),
          el('span.radar-title', { text: item.title }),
          el('span.radar-meta', { text: `${item.peptideName} · ${item.journal}${item.year ? ` · ${item.year}` : ''}` }),
        ])))
        : el('p.warn', { text: 'No results reached this device. The radar reads Europe PMC directly from your browser, so a blocked network or an offline device shows nothing rather than something stale.' }),
      el('p.quiet', { text: 'Tier labels here are inferred from the title, not read from the paper. Decode anything you intend to cite.' }),
    ]);
  };

  /** Propose a campaign. */
  const propose = () => {
    const campaign = proposeCampaign(dashboard);
    state.campaign = campaign;
    ctx.score?.cue('reward');
    fill(campaignHost, [
      el('article.campaign', {}, [
        el('p.kicker', { text: 'Campaign opportunity detected' }),
        el('h3', { text: campaign.title }),
        el('p', { text: campaign.opportunity }),
        el('div.campaign-grid', {}, [
          el('div', {}, [
            el('h5', { text: `${campaign.days}-day plan` }),
            el('ol.beats', {}, campaign.beats.map((beat) => el('li', {}, [
              el('b', { text: `Day ${beat.day} · ${beat.format}` }),
              el('p', { text: beat.brief }),
            ]))),
          ]),
          el('div', {}, [
            el('h5', { text: 'Deliverables' }),
            el('ul', {}, campaign.deliverables.map((item) => el('li', { text: item }))),
            el('h5', { text: 'Guardrails' }),
            el('ul.guardrails', {}, campaign.guardrails.map((item) => el('li', { text: item }))),
          ]),
        ]),
        el('div.approval', {}, [
          el('p', { text: campaign.approval.note }),
          el('div.approval-actions', {}, [
            el('button.btn.primary', {
              type: 'button',
              onclick: () => {
                ctx.toast('Approved. Opening the studio to build the assets.');
                ctx.go('studio', { peptide: campaign.anchor?.id || 'bpc-157' });
              },
            }, ['Approve and build drafts']),
            el('button.btn.ghost', { type: 'button', onclick: () => fill(campaignHost, []) }, ['Reject']),
          ]),
        ]),
      ]),
    ]);
  };

  const arrival = arrivalProfile({ referrer: document.referrer, search: location.search });

  const root = el('div.deck.command', {}, [
    el('div.deck-head', {}, [
      el('p.kicker', { text: 'Command Centre · private' }),
      el('h2', { text: 'What is being asked, what the library can answer, and what to do about it.' }),
      el('p.deck-lede', { text: 'Every number here comes from events stored on this device. Nothing is uploaded, and nothing publishes itself.' }),
    ]),
    el('div.kpis', {}, [
      kpi(String(dashboard.counts.asks), 'questions asked'),
      kpi(String(dashboard.counts.dossiers), 'dossiers opened'),
      kpi(String(dashboard.counts.checks), 'claims checked'),
      kpi(String(dashboard.counts.blocked), 'copy blocked'),
      kpi(pct(dashboard.verdict.humanShare), 'of studies are human'),
      kpi(String(dashboard.size.studies), 'studies catalogued'),
    ]),
    el('section.attention', {}, [
      el('h4', { text: 'Needs attention' }),
      ...dashboard.attention.map((item) => el('div.attention-item', { 'data-level': item.level }, [
        el('h5', { text: item.title }),
        el('p', { text: item.body }),
      ])),
    ]),
    el('section.demand', {}, [
      el('h4', { text: 'Demand versus evidence' }),
      el('p.quiet', { text: 'Where readers ask most and the library is weakest. That gap is the campaign.' }),
      el('div.demand-rows', {}, dashboard.demand.slice(0, 6).map((item) => el('div.demand-row', {}, [
        el('span.demand-label', { text: item.goal.label }),
        el('div.demand-bar', {}, [
          el('div.demand-asked', { style: { width: pct(Math.min(1, item.asked / 8)) } }),
          el('div.demand-strength', { style: { width: pct(item.strength) } }),
        ]),
        el('span.demand-meta', { text: `${item.asked} asked · ${pct(item.strength)} evidence` }),
      ]))),
    ]),
    el('section.arrival', {}, [
      el('h4', { text: 'This visitor' }),
      el('p', {}, [el('b', { text: `${arrival.label}. ` }), arrival.note]),
      el('p.quiet', { text: 'Arrival changes emphasis and ordering only. The same evidence, tiers and caveats reach every visitor — a page that softens its caveats for the audience most likely to buy is the exact failure this platform exists to avoid.' }),
    ]),
    el('section.radar', {}, [
      el('h4', { text: 'AI Research Radar' }),
      el('button.btn.ghost', { type: 'button', onclick: sweep }, ['Sweep for new literature']),
      radarHost,
    ]),
    el('section.generate', {}, [
      el('button.btn.primary.xl', { type: 'button', onclick: propose }, ['⚡ Generate campaign']),
      campaignHost,
    ]),
  ]);

  if (state.radar) {
    fill(radarHost, [el('p.quiet', { text: `Last sweep ${ago(state.radar.at)} — ${state.radar.items.length} records.` })]);
  }
  if (state.campaign) propose();
  return root;
}

/**
 * A dashboard tile.
 *
 * @param {string} value The number.
 * @param {string} label What it counts.
 * @returns {HTMLElement} The tile.
 */
function kpi(value, label) {
  return el('div.kpi', {}, [el('span.kpi-value', { text: value }), el('span.kpi-label', { text: label })]);
}

/* -------------------------------------------------------- 08 · the profile */

/**
 * The personalised education dashboard and the reader's record.
 *
 * @param {object} ctx App context.
 * @returns {HTMLElement} The deck.
 */
export function renderProfile(ctx) {
  const record = progressSummary(ctx.progress);
  const goals = ctx.progress.goals || [];
  const ranked = rankForGoals(goals);

  /**
   * Toggle an interest.
   *
   * @param {string} id Goal id.
   */
  const toggleGoal = (id) => {
    const next = new Set(ctx.progress.goals || []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    ctx.progress.goals = [...next];
    ctx.saveProgress();
    ctx.render();
  };

  return el('div.deck.profile', {}, [
    el('div.deck-head', {}, [
      el('p.kicker', { text: `${record.rank.clearance} · ${record.rank.name}` }),
      el('h2', { text: 'Your record' }),
      el('p.deck-lede', { text: record.rank.blurb }),
    ]),
    el('div.rank-panel', {}, [
      el('div.rank-bar', {}, [el('div.rank-fill', { style: { width: pct(record.rank.progress) } })]),
      el('div.rank-meta', {}, [
        el('span', { text: `${record.xp} XP` }),
        record.rank.next ? el('span', { text: `${record.rank.toNext} to ${record.rank.next.name}` }) : el('span', { text: 'Maximum clearance' }),
      ]),
      el('div.streaks', {}, [
        kpi(String(record.streak), 'day streak'),
        kpi(String(record.best), 'best streak'),
        kpi(`${record.drops}/${record.dropTotal}`, 'findings unlocked'),
        kpi(String(record.actions), 'research actions'),
      ]),
      el('p.quiet', { text: 'Every point here is earned by an act of research literacy — opening sources, decoding papers, finding what contradicts a claim. Nothing is awarded for time on site.' }),
    ]),
    el('section.interests', {}, [
      el('h4', { text: 'What are you trying to understand?' }),
      el('p.quiet', { text: 'The whole platform reorders around this.' }),
      el('div.chips', {}, GOALS.map((goal) => el('button.chip', {
        type: 'button',
        class: goals.includes(goal.id) ? 'on' : '',
        title: goal.blurb,
        onclick: () => toggleGoal(goal.id),
      }, [goal.label]))),
    ]),
    ranked.length ? el('section.for-you', {}, [
      el('h4', { text: 'Organised around your interests' }),
      el('div.library-grid', {}, ranked.slice(0, 6).map(({ entry, reading }) => el('button.library-card', {
        type: 'button', style: { '--accent': entry.accent }, onclick: () => ctx.go('engine', { subject: entry.id }),
      }, [
        el('span.lib-name', { text: entry.name }),
        el('span.lib-class', { text: entry.tagline }),
        el('span.lib-band', { style: { '--band': reading.band.accent }, text: `${reading.band.label} · ${pct(reading.score)}` }),
      ]))),
    ]) : null,
    el('section.unlocks', {}, [
      el('h4', { text: 'Clearance' }),
      el('div.unlock-grid', {}, UNLOCKS.map((unlock) => el('div.unlock', {
        'data-open': record.rank.level >= unlock.at ? 'yes' : 'no',
      }, [
        el('span.unlock-name', { text: unlock.label }),
        el('span.unlock-blurb', { text: unlock.blurb }),
        el('span.unlock-at', { text: record.rank.level >= unlock.at ? 'OPEN' : `LEVEL ${unlock.at}` }),
      ]))),
    ]),
    ctx.progress.log.length ? el('section.log', {}, [
      el('h4', { text: 'Recent activity' }),
      el('ul.log-list', {}, ctx.progress.log.slice(0, 12).map((entry) => el('li', {}, [
        el('span.log-xp', { text: `+${entry.xp}` }),
        el('span.log-label', { text: entry.label }),
        el('span.log-when', { text: ago(entry.at) }),
      ]))),
    ]) : null,
  ].filter(Boolean));
}

/**
 * The base URL a scanned card should open.
 *
 * Taken from wherever the platform is actually being served, so the printed
 * codes are correct on localhost, on GitHub Pages, and on any domain this ends
 * up on. Baking a URL into the repository would produce codes that work in
 * exactly one deployment and fail silently everywhere else.
 *
 * @returns {string} The base URL, without a trailing `index.html`.
 */
export function sheetBase() {
  const path = location.pathname.replace(/index\.html$/, '');
  return `${location.origin}${path}`;
}

/**
 * The URL a compound's card should carry.
 *
 * @param {string} id Compound id.
 * @param {string} [base] Base URL.
 * @returns {string} The deep link.
 */
export function cardUrl(id, base = sheetBase()) {
  return `${base}?compound=${encodeURIComponent(id)}#ar`;
}

/**
 * Build the printable QR sheet: one code per compound.
 *
 * @param {object} ctx App context.
 */
export function openQrSheet(ctx) {
  const host = document.getElementById('qr-sheet');
  const base = sheetBase();

  const cards = comparable().map((option) => {
    const entry = findAny(option.id);
    const url = cardUrl(option.id, base);
    const reading = entryReading(entry);
    return el('article.qr-card', { style: { '--accent': entry.accent } }, [
      el('div.qr-code', { html: qrSvg(url, { scale: 4, quiet: 3 }) }),
      el('div.qr-meta', {}, [
        el('h4', { text: entry.name }),
        el('p.qr-class', { text: entry.klass }),
        el('p.qr-band', { style: { '--band': reading.band.accent }, text: `${reading.band.label} · ${pct(reading.score)}` }),
        el('p.qr-url', { text: url }),
      ]),
    ]);
  });

  fill(host, [
    el('header.qr-head', {}, [
      el('div', {}, [
        el('h2', { text: 'ASTRA — scan to open the AR bench' }),
        el('p.quiet', { text: `Each code opens that compound on ${base} with the camera bench ready. Print at any size; the codes are vector. Point a phone camera at one — no app needed.` }),
      ]),
      el('div.qr-actions', {}, [
        el('button.btn.primary', { type: 'button', onclick: () => window.print() }, ['Print']),
        el('button.btn.ghost', {
          type: 'button',
          onclick: () => { host.hidden = true; document.body.classList.remove('sheet-open'); },
        }, ['Close']),
      ]),
    ]),
    el('div.qr-grid', {}, cards),
    el('p.qr-foot', { text: 'Educational research platform. Not medical advice. No diagnosis, no dosing, no treatment plans.' }),
  ]);

  host.hidden = false;
  document.body.classList.add('sheet-open');
  ctx.award('graph-explore', {});
}

/* --------------------------------------------------------------- 09 · AR */

/**
 * The Augmented Reality bench.
 *
 * The compound stands in your room, turning, with its evidence orbiting it.
 * The deck panel itself is the control surface and the reading position: the
 * scene lives behind it, full-bleed, so the controls never cover the object.
 *
 * @param {object} ctx App context.
 * @returns {HTMLElement} The deck.
 */
export function renderAR(ctx) {
  const state = ctx.deckState.ar || (ctx.deckState.ar = { compound: 'bpc-157', focus: null, camera: false });
  const detail = el('div.ar-detail');

  /**
   * Show one panel's full contents in the reading sheet.
   *
   * @param {object} panel The panel that was opened.
   */
  const focus = (panel) => {
    state.focus = panel.id;
    ctx.award(panel.kind === 'study' ? 'study-open' : 'sources-expand', { peptide: state.compound });
    ctx.score?.cue('open');
    fill(detail, [
      el('div.ar-detail-head', { style: { '--accent': panel.accent } }, [
        el('span.ar-panel-label', { text: panel.label }),
        el('h4', { text: panel.title }),
      ]),
      ...panel.lines.map((line) => el('p', { text: line })),
      panel.url ? el('a.source-link', {
        href: panel.url,
        target: '_blank',
        rel: 'noopener noreferrer',
        onclick: () => ctx.award('pubmed-open', { study: panel.id }),
      }, ['Open the literature →']) : null,
      el('button.btn.ghost.sm', { type: 'button', onclick: () => fill(detail, []) }, ['Close']),
    ].filter(Boolean));
  };

  ctx.arFocus = focus;

  /**
   * Switch the compound on the plinth.
   *
   * @param {string} id Compound id.
   */
  const show = (id) => {
    state.compound = id;
    ctx.ar?.setCompound(id);
    ctx.award('dossier-open', { peptide: id });
    ctx.telemetry.push('dossier', { peptide: id });
    fill(detail, []);
    ctx.render();
  };

  const entry = findAny(state.compound);
  const reading = entryReading(entry);
  const panels = buildPanels(entry);

  const root = el('div.deck.ar', {}, [
    el('div.deck-head', {}, [
      el('p.kicker', { text: 'Augmented Reality bench' }),
      el('h2', { text: `${entry.name} — in your room` }),
      el('p.deck-lede', { text: 'Turn the compound with a drag, a tilt, or let it rotate. Every panel orbiting it is a claim, a study or a regulatory fact from the dossier — tap one to read it in full, with its citation.' }),
    ]),
    el('div.ar-controls', {}, [
      el('button.btn.primary', {
        type: 'button',
        onclick: async () => {
          const started = await ctx.ar.startCamera();
          state.camera = started;
          ctx.toast(started
            ? 'Camera on. Nothing is recorded or uploaded.'
            : 'No camera available, or access was declined — the studio backdrop stays.');
          ctx.render();
        },
      }, [state.camera ? '⊙ Camera on' : '⊙ Use camera']),
      state.camera ? el('button.btn.ghost', {
        type: 'button', onclick: async () => { await ctx.ar.flipCamera(); ctx.toast('Camera flipped.'); },
      }, ['⇄ Flip']) : null,
      state.camera ? el('button.btn.ghost', {
        type: 'button', onclick: () => { ctx.ar.stopCamera(); state.camera = false; ctx.render(); },
      }, ['Stop camera']) : null,
      el('button.btn.ghost', {
        type: 'button',
        onclick: async () => {
          const on = await ctx.ar.enableGyro();
          ctx.toast(on ? 'Tilt to turn the compound.' : 'Motion access was not granted — drag to turn it instead.');
        },
      }, ['◈ Tilt to turn']),
      el('label.switch', {}, [
        el('input', {
          type: 'checkbox',
          checked: ctx.ar?.lab.ar.autoSpin ? true : null,
          onchange: (event) => ctx.ar.setAutoSpin(event.target.checked),
        }),
        el('span', { text: 'Auto-rotate' }),
      ]),
    ].filter(Boolean)),
    el('div.ar-zoom', {}, [
      el('label.sim-slider', {}, [
        el('span.sim-label', {}, ['Distance', el('span.sim-value', { text: 'zoom' })]),
        el('input', {
          type: 'range', min: '3.4', max: '16', step: '0.2', value: String(ctx.ar?.lab.ar.distance ?? 7.4),
          oninput: (event) => ctx.ar.lab.setARDistance(Number(event.target.value)),
        }),
      ]),
    ]),
    el('div.ar-meter', { style: { '--band': reading.band.accent } }, [
      el('span.meter-label', { text: reading.band.label }),
      el('span.meter-value', { text: pct(reading.score) }),
      el('span.quiet', { text: `${panels.length} data panels orbiting · best design ${reading.best.label}` }),
    ]),
    detail,
    el('div.ar-picker', {}, [
      el('h4', { text: 'On the plinth' }),
      el('div.chips', {}, comparable().map((option) => el('button.chip', {
        type: 'button',
        class: option.id === state.compound ? 'on' : '',
        onclick: () => show(option.id),
      }, [option.name]))),
    ]),
    el('div.ar-actions', {}, [
      el('button.btn.primary', {
        type: 'button',
        onclick: async () => {
          const url = await ctx.ar.capture();
          if (!url) {
            ctx.toast('Nothing rendered yet — give the scene a moment.');
            return;
          }
          const anchor = el('a', { href: url, download: `astra-${state.compound}-ar.png` });
          document.body.append(anchor);
          anchor.click();
          anchor.remove();
          ctx.score?.cue('reward');
          ctx.toast('Captured, with the citation band baked in.');
        },
      }, ['⧉ Capture card']),
      el('button.btn.ghost', {
        type: 'button', onclick: () => ctx.go('engine', { subject: state.compound }),
      }, ['Open the full dossier →']),
      el('button.btn.ghost', {
        type: 'button', onclick: () => openQrSheet(ctx),
      }, ['⊞ Printable QR sheet']),
    ]),
    el('p.fine', { text: 'Camera frames are read on this device and discarded — nothing is recorded, uploaded or stored. The captured card carries the compound, its evidence level and the disclosure.' }),
  ]);

  return root;
}

/* ------------------------------------------------------- 09 · the settings */

/**
 * Settings: the model connection, the sensors, and the switches that turn the
 * persuasion mechanics off.
 *
 * @param {object} ctx App context.
 * @returns {HTMLElement} The deck.
 */
export function renderSettings(ctx) {
  const settings = ctx.readSettings();
  const size = corpusSize();

  const provider = el('select.picker', {
    onchange: (event) => ctx.writeSettings({ provider: event.target.value }),
  }, [['anthropic', 'Anthropic'], ['openai', 'OpenAI']].map(([value, label]) => el('option', {
    value, selected: settings.provider === value ? true : null, text: label,
  })));

  const key = el('input.picker', {
    type: 'password', value: settings.key, placeholder: 'sk-…', autocomplete: 'off',
    oninput: (event) => ctx.writeSettings({ key: event.target.value.trim() }),
  });

  const model = el('input.picker', {
    type: 'text', value: settings.model, placeholder: 'claude-opus-5',
    oninput: (event) => ctx.writeSettings({ model: event.target.value.trim() }),
  });

  return el('div.deck.settings', {}, [
    el('div.deck-head', {}, [
      el('p.kicker', { text: 'Settings' }),
      el('h2', { text: 'Your device, your rules.' }),
    ]),
    el('section.setting', {}, [
      el('h4', { text: 'Language model (optional)' }),
      el('p.quiet', { text: 'Without a key ASTRA answers from the corpus with citations — that is the default and it works offline. With a key, the same graded evidence goes to a model and the prose improves. The evidence tier never comes from the model.' }),
      el('label', {}, ['Provider', provider]),
      el('label', {}, ['API key', key]),
      el('label', {}, ['Model', model]),
      el('p.quiet', { text: 'The key is stored in this browser only. Calling a model API directly from a browser exposes the key to anything running on this page — use a restricted key, or leave this empty.' }),
    ]),
    el('section.setting', {}, [
      el('h4', { text: 'Motion and camera' }),
      el('div.setting-actions', {}, [
        el('button.btn.ghost', { type: 'button', onclick: () => ctx.enableMotion() }, ['Enable tilt parallax']),
        el('button.btn.ghost', { type: 'button', onclick: () => ctx.toggleLens() }, ['Toggle camera lens']),
      ]),
      el('p.quiet', { text: 'Tilt parallaxes the facility on a phone; the camera scans a label or QR code and reads the room light. Frames are processed on this device and discarded — nothing is recorded or uploaded.' }),
    ]),
    el('section.setting', {}, [
      el('h4', { text: 'Progression' }),
      el('label.switch', {}, [
        el('input', {
          type: 'checkbox', checked: ctx.progress.calm ? true : null,
          onchange: (event) => { ctx.progress.calm = event.target.checked; ctx.saveProgress(); ctx.toast(event.target.checked ? 'Calm mode on. Streaks and drops are off.' : 'Progression on.'); },
        }),
        el('span', { text: 'Calm mode — keep the record, drop the streak pressure and the reward drops' }),
      ]),
      el('p.quiet', { text: 'The progression system is built out of mechanics that genuinely drive return visits. It is switched off here rather than buried, because a persuasion system nobody can turn off is a dark pattern regardless of intent.' }),
      el('button.btn.ghost', {
        type: 'button',
        onclick: () => { ctx.resetProgress(); ctx.toast('Record cleared.'); ctx.render(); },
      }, ['Erase my record']),
    ]),
    el('section.setting', {}, [
      el('h4', { text: 'Sound' }),
      el('label.switch', {}, [
        el('input', {
          type: 'checkbox', checked: ctx.muted ? null : true,
          onchange: (event) => ctx.setMuted(!event.target.checked),
        }),
        el('span', { text: 'Facility score' }),
      ]),
    ]),
    el('section.setting', {}, [
      el('h4', { text: 'About this corpus' }),
      el('p', { text: `${size.peptides} compounds, ${size.stacks} stacks, ${size.studies} studies, ${size.claims} graded claims, ${size.mechanisms} mechanisms.` }),
      el('p.quiet', { text: 'Citations are curated and stored as live literature searches rather than fixed links. Verify every one against the source before reusing it in published material. This platform is educational: it does not diagnose, prescribe, or produce dosing or treatment plans.' }),
      el('div.tier-key', {}, TIERS.map((entry) => el('div.tier-key-row', { style: { '--tier': entry.accent } }, [
        el('span.tier-chip', { style: { '--tier': entry.accent }, text: entry.short }),
        el('div', {}, [el('b', { text: entry.label }), el('p.quiet', { text: `${entry.definition} ${entry.caveat}` })]),
      ]))),
    ]),
  ]);
}

/** Re-exported so the app can render bands without a second import. */
export { BANDS, SYSTEMS, corpusVerdict, search };

/* ------------------------------------------------- 11 · body composition */

/**
 * The Body Composition bench.
 *
 * The deck that most wanted to become a body scanner, and deliberately did
 * not. It collects measurements, runs four published equations, and shows the
 * reader how far apart those equations land on their own body — which is the
 * only honest way to present a field body-fat estimate, and happens to teach
 * the platform's central lesson better than any compound in the library.
 *
 * @param {object} ctx App context.
 * @returns {HTMLElement} The deck.
 */
export function renderBodyfat(ctx) {
  const state = ctx.deckState.bodyfat || (ctx.deckState.bodyfat = {
    record: loadRecord(),
    tab: 'measure',
    camera: false,
    quality: null,
  });
  const { record } = state;
  const measures = record.measures;

  /**
   * Store a measurement and re-read the body.
   *
   * @param {string} key Field id.
   * @param {string} raw The raw input value.
   */
  const set = (key, raw) => {
    const value = raw === '' ? undefined : Number(raw);
    if (value === undefined) delete measures[key];
    else measures[key] = value;
    saveRecord(record);
    ctx.render();
  };

  const result = estimate(measures);
  const usable = result.readings.filter((reading) => reading.ready);

  /** The measurement form. */
  const measureTab = () => el('div.bf-measure', {}, [
    el('div.bf-sex', {}, [
      el('span.bf-sex-label', { text: 'Equations differ by sex' }),
      ...['male', 'female'].map((sex) => el('button.chip', {
        type: 'button',
        class: measures.sex === sex ? 'on' : '',
        onclick: () => { measures.sex = sex; saveRecord(record); ctx.render(); },
      }, [sex === 'male' ? 'Male equations' : 'Female equations'])),
    ]),
    el('p.quiet.bf-sex-note', { text: 'Every equation here was fitted separately on male and female samples, so this selects which published coefficients apply. It is a property of the equations, not a judgement about you.' }),

    el('div.bf-fields', {}, FIELDS.map((field) => el('label.bf-field', {}, [
      el('span.bf-field-label', {}, [field.label, el('span.bf-unit', { text: field.unit })]),
      el('input', {
        type: 'number',
        inputmode: 'decimal',
        min: String(field.min),
        max: String(field.max),
        step: String(field.step),
        value: Number.isFinite(measures[field.id]) ? String(measures[field.id]) : '',
        placeholder: '—',
        onchange: (event) => set(field.id, event.target.value),
      }),
      field.hint ? el('span.bf-hint', { text: field.hint }) : null,
    ].filter(Boolean)))),

    result.problems.length ? el('div.bf-problems', {}, [
      el('h5', { text: 'These will not be estimated from' }),
      el('ul', {}, result.problems.map((problem) => el('li', { text: `${problem.label} ${problem.message}.` }))),
    ]) : null,

    el('div.bf-methods', {}, result.readings.map((reading) => methodRow(reading, ctx))),

    el('p.bf-privacy', { text: 'These measurements are stored in this browser and nowhere else. There is no account and no server to send them to.' }),
    record.log.length || Object.keys(measures).length > 1 ? el('button.btn.ghost.sm', {
      type: 'button',
      onclick: () => {
        state.record = clearRecord();
        ctx.toast('Measurements and log erased from this device.');
        ctx.render();
      },
    }, ['Erase everything stored here']) : null,
  ].filter(Boolean));

  /** The reading, with its band and everything it cannot tell you. */
  const readingTab = () => {
    if (!result.pooled) {
      return el('div.bf-empty', {}, [
        el('p', { text: 'No equation has what it needs yet. The shortest route to a reading is height and waist, which runs Relative Fat Mass on its own; adding neck and weight brings in two more and lets them disagree with each other, which is the useful part.' }),
        el('button.btn.primary', { type: 'button', onclick: () => { state.tab = 'measure'; ctx.render(); } }, ['Take measurements']),
      ]);
    }
    const { pooled } = result;
    const touched = bandsTouched(pooled, measures.sex);
    const split = composition(pooled.percent, measures.weight);
    const confidencePct = Math.round(result.confidence * 100);

    return el('div.bf-reading', {}, [
      el('div.bf-headline', { style: { '--band': result.confidence > 0.6 ? 'var(--good)' : result.confidence > 0.35 ? 'var(--warn)' : 'var(--bad)' } }, [
        el('span.bf-range', { text: `${pooled.low.toFixed(1)}–${pooled.high.toFixed(1)}%` }),
        el('span.bf-range-label', { text: 'body fat — the whole range this reading supports' }),
        el('span.bf-point', { text: `Central estimate ${pooled.percent.toFixed(1)}%, from ${pooled.methods} ${pooled.methods === 1 ? 'equation' : 'equations'}` }),
      ]),

      el('div.bf-tiles', {}, [
        bfTile(`${confidencePct}%`, 'Confidence', result.confidence > 0.6
          ? 'The equations broadly agree.'
          : result.confidence > 0.35
            ? 'The equations disagree enough to matter.'
            : 'The equations disagree badly. Treat the figure as a rough bracket only.'),
        bfTile(`${result.spread.toFixed(1)} pts`, 'Spread between methods',
          'Highest minus lowest, measuring the same body on the same day.'),
        split ? bfTile(`${split.fat.toFixed(1)} kg`, 'Fat mass at the central estimate',
          `${split.lean.toFixed(1)} kg is everything else — muscle, bone, organs and water together.`) : null,
        split ? bfTile(`±${(measures.weight * pooled.margin / 100).toFixed(1)} kg`, 'What the error bar is worth',
          'The same error, expressed as kilograms of fat mass.') : null,
      ].filter(Boolean)),

      el('div.bf-bandstrip', {}, [
        el('h5', { text: 'Where that range sits in the population' }),
        el('div.bf-ladder', {}, BF_BANDS[measures.sex === 'female' ? 'female' : 'male'].map((entry) => el('div.bf-band', {
          class: touched.includes(entry) ? 'touched' : '',
          title: entry.note,
        }, [
          el('span.bf-band-label', { text: entry.label }),
          el('span.bf-band-range', { text: entry.max === Infinity ? 'above' : `to ${entry.max}%` }),
        ]))),
        touched.length > 1
          ? el('p.bf-verdict.warn', { text: `This reading's error bar covers ${touched.length} of these bands at once — ${touched.map((entry) => entry.label.toLowerCase()).join(', ')}. Naming one of them as "your" category would be claiming precision the measurement does not have.` })
          : el('p.bf-verdict', { text: `This reading sits inside a single band, ${touched[0].label.toLowerCase()}, across its whole error bar. That is unusual, and it is the only circumstance in which naming a category is honest.` }),
        el('p.quiet', { text: 'These ranges are fitness-industry descriptive conventions drawn from population distributions. They are not health thresholds, not targets, and no trial has shown that moving between two of them changes an outcome by itself.' }),
      ]),

      el('div.bf-cannot', {}, [
        el('h5', { text: 'What this reading cannot tell you' }),
        el('ul', {}, [
          'Where the fat is. Visceral and subcutaneous fat carry very different associations with metabolic outcomes, and no tape measure or equation here separates them. That needs imaging.',
          'How much muscle you have. Everything that is not fat is reported as one lump — muscle, bone, organs and water together — because a two-compartment model has no way to divide it.',
          'Whether the number is healthy. Body fat percentage is a description, not a diagnosis, and its relationship to any outcome is confounded by fitness, distribution, age and a dozen other things.',
          'What to do about it. That is a conversation with a clinician who can examine you, not an output of four regression equations.',
        ].map((line) => el('li', { text: line }))),
      ]),

      el('div.bf-methods', {}, usable.map((reading) => methodRow(reading, ctx))),
    ]);
  };

  /** The camera: framing and comparability, and nothing more. */
  const cameraTab = () => el('div.bf-camera', {}, [
    el('div.bf-camera-note', {}, [
      el('h5', { text: 'What the camera is doing here' }),
      el('p', { text: 'It is not estimating your body fat. No published, validated equation turns a photograph into a body-fat percentage, so this deck does not pretend to have one — a number produced that way would be exactly the confident-looking invention the rest of this facility exists to argue against.' }),
      el('p', { text: 'What a photograph is genuinely good for is being comparable to the last one. The thing that most often destroys that comparability is lighting: a lamp moved two metres changes apparent definition more than a month of training does. So the camera measures the light, and tells you whether this shot can be compared to the next one.' }),
    ]),
    el('div.bf-camera-controls', {}, [
      el('button.btn.primary', {
        type: 'button',
        onclick: async () => {
          const started = await ctx.startBodyLens();
          state.camera = started;
          ctx.toast(started
            ? 'Camera on. Frames are read on this device and never uploaded.'
            : 'No camera available, or access was declined.');
          if (started) ctx.pollFrameQuality((quality) => {
            state.quality = quality;
            const host = document.querySelector('.bf-quality');
            if (host) fill(host, qualityReadout(quality));
          });
          ctx.render();
        },
      }, [state.camera ? '⊙ Camera on' : '⊙ Use camera']),
      state.camera ? el('button.btn.ghost', {
        type: 'button',
        onclick: () => { ctx.stopBodyLens(); state.camera = false; state.quality = null; ctx.render(); },
      }, ['Stop camera']) : null,
    ].filter(Boolean)),
    el('div.bf-quality', {}, qualityReadout(state.quality)),
    el('div.bf-guide', {}, [
      el('h5', { text: 'Making two photographs comparable' }),
      el('ul', {}, [
        'Same room, same time of day, same lamp, same distance from the wall. Mark where your feet go.',
        'Even light from the front. Side light sculpts shadow that reads as definition and is not.',
        'Same posture, arms in the same place, at the end of a normal breath out — not held in, not pushed out.',
        'Same phone, same height, same zoom. A phone held lower makes a torso look different, and it is a large effect.',
      ].map((line) => el('li', { text: line }))),
      el('p.quiet', { text: 'Photographs taken this way are the most sensitive progress record available outside a lab, because they record fat distribution — which no percentage does — and your eye is good at spotting change in a repeated frame. They are also not a measurement, and they do not belong in the log above.' }),
    ]),
  ].filter(Boolean));

  /** The log, and whether anything in it is a real change. */
  const trackTab = () => {
    const history = trend(record.log);
    // The method to log is chosen on repeatability, not accuracy — a log
    // exists to detect change, and change is governed by `tem`. And if the
    // log already runs on one method, that one continues: switching methods
    // mid-series destroys exactly the comparison this tab is for, which is
    // the module's own argument turned into a default.
    const established = record.log.length
      ? usable.find((reading) => reading.method.id === record.log[record.log.length - 1].methodId)
      : null;
    const best = established || usable.slice().sort((a, b) => a.method.tem - b.method.tem)[0];
    return el('div.bf-track', {}, [
      best ? el('div.bf-log-add', {}, [
        el('p', { text: established
          ? `Log today's reading from ${best.method.name}, at ${best.percent.toFixed(1)}% — the method this log already runs on. Keeping to it is what makes the series comparable.`
          : `Log today's reading from ${best.method.name}, at ${best.percent.toFixed(1)}% — the most repeatable method your current measurements can feed, which is the one that can see the smallest real change. It is not the most accurate one, and for tracking that is the right trade.` }),
        el('button.btn.primary', {
          type: 'button',
          onclick: () => {
            record.log.push({
              at: Date.now(),
              percent: best.percent,
              methodId: best.method.id,
              weight: measures.weight,
            });
            saveRecord(record);
            ctx.award('bodyfat-log', {});
            ctx.toast('Logged on this device.');
            ctx.render();
          },
        }, ['Log this reading']),
      ]) : el('p.quiet', { text: 'Nothing to log yet — no equation has the measurements it needs.' }),

      history ? el('div.bf-trend', { class: history.real ? 'real' : 'noise' }, [
        el('span.bf-trend-value', { text: `${history.change > 0 ? '+' : ''}${history.change.toFixed(1)} pts` }),
        el('span.bf-trend-span', { text: `across ${history.span} days and ${history.count} readings` }),
        el('p.bf-trend-verdict', { text: history.reason }),
        el('p.quiet', { text: history.sameMethod
          ? 'A change within one method is judged against its repeatability, not its accuracy — the part of the error that comes from the equation not fitting your particular body is the same on both days and cancels when you subtract. That only holds while the method, the tape and the person holding it stay the same.'
          : 'Two different methods carry two different systematic errors, and neither cancels. That is why the threshold above is so much larger.' }),
      ]) : null,

      record.log.length ? el('ul.bf-log', {}, record.log.slice().sort((a, b) => b.at - a.at).map((entry) => el('li.bf-log-row', {}, [
        el('span.bf-log-value', { text: `${entry.percent.toFixed(1)}%` }),
        el('span.bf-log-method', { text: method(entry.methodId)?.short || entry.methodId }),
        el('span.bf-log-when', { text: ago(entry.at) }),
        entry.weight ? el('span.bf-log-weight', { text: `${entry.weight} kg` }) : null,
      ].filter(Boolean)))) : null,

      el('div.bf-thresholds', {}, [
        el('h5', { text: 'What each method can and cannot detect' }),
        el('table.bf-table', {}, [
          el('thead', {}, [el('tr', {}, [
            el('th', { text: 'Method' }),
            el('th', { text: 'How wrong the figure probably is' }),
            el('th', { text: 'Smallest change it can see' }),
          ])]),
          el('tbody', {}, METHODS.map((entry) => el('tr', {}, [
            el('td', { text: entry.short }),
            el('td', { text: `±${entry.see.toFixed(1)} pts` }),
            el('td', { text: `${changeThreshold(entry).toFixed(1)} pts` }),
          ]))),
        ]),
        el('p.quiet', { text: 'The two columns answer different questions, and the gap between them is the single most misunderstood thing about field body-composition measurement. A method can be four points wrong about where you are and still reliably see a two-point move — as long as it is wrong in the same direction every time, which it is.' }),
      ]),
    ].filter(Boolean));
  };

  /** What the literature says moves this, cited and tiered. */
  const leversTab = () => el('div.bf-levers', {}, [
    el('p.deck-lede', { text: 'What the published literature reports about changing body composition, graded the same way every other claim in this facility is graded. These are findings in populations. None of them is a plan, and none of them knows anything about you.' }),
    ...LEVERS.map((lever) => el('article.bf-lever', { style: { '--tier': tier(lever.tier).accent } }, [
      el('header.bf-lever-head', {}, [
        tierChip(lever.tier),
        el('h4', { text: lever.title }),
      ]),
      el('p', { text: lever.finding }),
      el('p.bf-lever-caveat', {}, [el('b', { text: 'Caveat: ' }), lever.caveat]),
      el('div.bf-lever-links', {}, [
        lever.compound ? el('button.btn.ghost.sm', {
          type: 'button',
          onclick: () => ctx.go('engine', { subject: lever.compound }),
        }, [`Read ${findAny(lever.compound).name}'s full record →`]) : null,
        el('a.source-link', {
          href: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(lever.search)}`,
          target: '_blank',
          rel: 'noopener noreferrer',
          onclick: () => ctx.award('pubmed-open', { study: `bf-${lever.id}` }),
        }, ['Search the literature →']),
      ].filter(Boolean)),
    ])),
    el('p.bf-boundary', { text: 'This deck describes methods and reports findings. It does not tell you what your body fat should be, whether to change it, or how — including with any compound in this library. Those are questions for a clinician who can examine you, and they are deliberately outside what this platform will do.' }),
  ]);

  return el('div.deck.bodyfat', {}, [
    el('div.deck-head', {}, [
      el('p.kicker', { text: 'Body composition bench' }),
      el('h2', { text: 'Measure it, and measure the error too' }),
      el('p.deck-lede', { text: 'Four published equations, run on measurements you take, each reporting the error its own validation study found. They will disagree with each other by several points on the same body — that disagreement is the most useful thing on this screen, and it is the reason a single confident body-fat number is almost always a lie.' }),
    ]),
    tabs([
      { id: 'measure', label: 'Measure', render: measureTab },
      { id: 'reading', label: 'Reading', render: readingTab },
      { id: 'camera', label: 'Camera', render: cameraTab },
      { id: 'track', label: 'Track', render: trackTab },
      { id: 'levers', label: 'What moves it', render: leversTab },
    ], state.tab, (id) => { state.tab = id; ctx.render(); }),
  ]);
}

/**
 * One method's row: its reading, its error, and what it cannot see.
 *
 * @param {object} reading A reading from `estimate`.
 * @param {object} ctx App context.
 * @returns {HTMLElement} The row.
 */
function methodRow(reading, ctx) {
  const entry = reading.method;
  return el('article.bf-method', {
    class: reading.ready ? 'ready' : 'idle',
    style: { '--tier': tier(entry.tier).accent },
  }, [
    el('header.bf-method-head', {}, [
      tierChip(entry.tier),
      el('h4', { text: entry.name }),
      reading.ready
        ? el('span.bf-method-value', { text: `${reading.low.toFixed(1)}–${reading.high.toFixed(1)}%` })
        : el('span.bf-method-value.idle', { text: reading.outOfRange ? 'out of range' : 'needs more' }),
    ]),
    el('p.bf-method-blurb', { text: entry.blurb }),
    reading.ready
      ? el('p.bf-method-point', { text: `Central estimate ${reading.percent.toFixed(1)}%, with the ±${entry.see.toFixed(1)}-point standard error its validation study reported.` })
      : el('p.bf-method-missing', { text: reading.outOfRange
        ? 'The measurements push this equation outside the bodies it was fitted on, where it returns a number that means nothing. It is withheld rather than shown.'
        : `Needs ${reading.missing.join(', ')}.` }),
    el('details.bf-method-limits', {}, [
      el('summary', { text: 'What this method cannot see' }),
      el('ul', {}, entry.limits.map((limit) => el('li', { text: limit }))),
      el('p.bf-method-source', {}, [el('b', { text: 'Source: ' }), entry.source]),
      el('a.source-link', {
        href: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(entry.search)}`,
        target: '_blank',
        rel: 'noopener noreferrer',
        onclick: () => ctx.award('pubmed-open', { study: `bf-${entry.id}` }),
      }, ['Find the validation study →']),
    ]),
  ]);
}

/**
 * A single figure with a label and a line of explanation.
 *
 * @param {string} value The figure.
 * @param {string} label What it is.
 * @param {string} note Why it matters.
 * @returns {HTMLElement} The tile.
 */
function bfTile(value, label, note) {
  return el('div.bf-tile', {}, [
    el('span.bf-tile-value', { text: value }),
    el('span.bf-tile-label', { text: label }),
    el('span.bf-tile-note', { text: note }),
  ]);
}

/**
 * The camera's verdict on the current frame.
 *
 * @param {object|null} quality A reading from `frameQuality`.
 * @returns {Array<Node>} The readout.
 */
function qualityReadout(quality) {
  if (!quality) return [el('p.quiet', { text: 'No frame yet. Start the camera to read the light.' })];
  return [
    el('div.bf-quality-row', { class: quality.ok ? 'ok' : 'poor' }, [
      el('span.bf-quality-verdict', { text: quality.ok ? 'Comparable' : 'Not comparable' }),
      el('span.bf-quality-nums', { text: `light ${Math.round(quality.luminance * 100)}% · contrast ${Math.round(quality.contrast * 100)}% · evenness ${Math.round(quality.evenness * 100)}%` }),
    ]),
    ...quality.notes.map((note) => el('p.bf-quality-note', { text: note })),
  ];
}

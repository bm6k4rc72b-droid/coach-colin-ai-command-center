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

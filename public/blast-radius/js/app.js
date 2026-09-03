/**
 * Application shell.
 *
 * Owns the state, derives every analysis from it, and hands the result to a
 * view. The rule the whole app follows is that this file computes nothing about
 * security: it calls the engines, caches the expensive ones, and renders. That
 * separation is why the numbers on screen are the same numbers the test suite
 * asserts against.
 *
 * Everything is recomputed from scratch on each change rather than patched in
 * place. The full pipeline — graph derivation, architecture review, corpus
 * benchmark, 60,000 simulated years — lands well inside a frame budget for an
 * estate this size, and immutability is worth more here than the milliseconds.
 *
 * @module blast-radius/app
 */

import { CONTROLS, ESTATE, applyControls, applySpecControls } from './estate.js';
import { blastRadius, buildGraph, can, crownRoutes, rankControls } from './graph.js';
import { SUPPORT_COPILOT, composeKillChain, reviewArchitecture } from './aisec.js';
import {
  CORPUS, DEFENSES, analyze, benchmark, simulateDefenses, sweepThresholds,
} from './injection.js';
import { RULES, runDetections, scoreDetections } from './detect.js';
import { ATTACKS, WINDOW_DAYS, WINDOW_START, generateStream } from './telemetry.js';
import { CONTROL_EFFECTS, SCENARIOS } from './scenarios.js';
import {
  aggregate, applyEffects, exceedanceCurve, formatMoney, rankByRoi, simulate,
} from './fair.js';
import { DECISIONS, INCIDENTS, PROOF_MAP, THREAT_MODELS } from './portfolio.js';
import * as views from './views.js';

/** Simulated years per scenario in the headline model. */
const ITERATIONS = 20_000;

/** Fewer years for the control ranking, which runs one model per control. */
const ROI_ITERATIONS = 6_000;

/** Seed for every simulation, so a screenshot and a report agree. */
const SEED = 20260101;

const VIEWS = [
  ['overview', 'Overview', views.overview],
  ['identity', 'Identity', views.identity],
  ['ai', 'AI security', views.aiSecurity],
  ['detections', 'Detections', views.detections],
  ['risk', 'Risk', views.risk],
  ['portfolio', 'Portfolio', views.portfolio],
];

/** Mutable application state. */
const state = {
  view: 'overview',
  controls: new Set(),
  defenses: new Set(['def-detector']),
  source: 'agent-support',
  threshold: 45,
  probe: {
    principal: 'role-agent-tools',
    action: 'secretsmanager:GetSecretValue',
    resource: ESTATE.secrets[0].arn,
  },
  labText: CORPUS.find((sample) => sample.id === 'mal-02').text,
};

/**
 * Results that do not depend on the control selection, computed once.
 *
 * The telemetry stream and its detections are fixed history: turning a control
 * on today does not un-happen last fortnight's alerts, and pretending otherwise
 * would be the kind of demo that falls apart under a question.
 */
const fixed = (() => {
  const events = generateStream();
  const alerts = runDetections(events, RULES, { learnUntil: WINDOW_START + (5 * 86_400_000) });
  const detection = scoreDetections(alerts, events, RULES);
  const baselineRisk = aggregate(SCENARIOS, ITERATIONS, SEED);
  return {
    events,
    baselineCrownRoutes: crownRoutes(ESTATE).count,
    alerts,
    detection,
    baselineRisk,
    baselineCurve: exceedanceCurve(baselineRisk.losses),
    scenarioRuns: SCENARIOS.map((scenario) => simulate(scenario, ITERATIONS, SEED)),
    roi: rankByRoi(SCENARIOS, CONTROLS, CONTROL_EFFECTS, ROI_ITERATIONS, SEED),
    sweep: sweepThresholds(),
  };
})();

/**
 * Derive everything the current view needs.
 *
 * @returns {object} Derived analysis, freshly computed.
 */
function derive() {
  const controlIds = [...state.controls];
  const estate = applyControls(ESTATE, controlIds);
  const edges = buildGraph(estate);
  const spec = applySpecControls(SUPPORT_COPILOT, controlIds);
  const activeEffects = CONTROL_EFFECTS.filter((effect) => state.controls.has(effect.control));
  const residualScenarios = SCENARIOS.map((scenario) => applyEffects(scenario, activeEffects));
  const residualRisk = aggregate(residualScenarios, ITERATIONS, SEED);
  const selectedControls = CONTROLS.filter((control) => state.controls.has(control.id));
  const topThree = fixed.roi.slice(0, 3);

  return {
    estate,
    edges,
    spec,
    radius: blastRadius(estate, state.source, edges),
    controlRanking: rankControls(edges),
    crownRoutes: crownRoutes(estate, edges),
    decision: can(estate, state.probe.principal, state.probe.action, state.probe.resource),
    review: reviewArchitecture(spec),
    chain: composeKillChain(estate, spec, state.labText),
    analysis: analyze(state.labText, state.threshold),
    benchmark: benchmark(state.threshold),
    sweep: fixed.sweep,
    defense: simulateDefenses([...state.defenses], state.threshold),
    defenses: DEFENSES,
    samples: [
      CORPUS.find((sample) => sample.id === 'mal-02'),
      CORPUS.find((sample) => sample.id === 'mal-03'),
      CORPUS.find((sample) => sample.id === 'mal-13'),
      CORPUS.find((sample) => sample.id === 'ben-01'),
      CORPUS.find((sample) => sample.id === 'ben-13'),
    ],
    notableSamples: ['mal-13', 'mal-14', 'ben-13'].map((id) => CORPUS.find((sample) => sample.id === id)),
    detection: fixed.detection,
    alerts: fixed.alerts,
    rules: RULES,
    attacks: ATTACKS,
    window: { start: WINDOW_START, end: WINDOW_START + (WINDOW_DAYS * 86_400_000) },
    portfolioRisk: fixed.baselineRisk,
    residualRisk,
    curve: fixed.baselineCurve,
    residualCurve: exceedanceCurve(residualRisk.losses),
    roi: fixed.roi,
    scenarioRuns: fixed.scenarioRuns,
    scenarios: SCENARIOS,
    controlSpend: selectedControls.reduce((sum, control) => sum + control.annualCost, 0),
    recommendedSpend: topThree.reduce((sum, entry) => sum + entry.cost, 0),
    recommendedResidual: aggregate(
      SCENARIOS.map((scenario) => applyEffects(
        scenario,
        CONTROL_EFFECTS.filter((effect) => topThree.some((entry) => entry.id === effect.control)),
      )),
      ROI_ITERATIONS,
      SEED,
    ).mean,
    decisions: DECISIONS,
    threatModels: THREAT_MODELS,
    incidents: INCIDENTS,
    proofMap: PROOF_MAP,
  };
}

/**
 * Render the control rail.
 *
 * The rail is present on every view because the controls are the argument: the
 * point of the console is that one budget moves cloud policy and agent design
 * together, and both halves of the screen react.
 *
 * @param {object} derived Derived analysis.
 * @returns {HTMLElement} The rail.
 */
function renderRail(derived) {
  const { h } = views;
  const baselineRoutes = fixed.baselineCrownRoutes;
  const group = (scope, title) => h('div.rail-group', {}, [
    h('h3', { text: title }),
    ...CONTROLS.filter((control) => control.scope === scope).map((control) => h('label.rail-control', {
      dataset: { on: String(state.controls.has(control.id)) },
    }, [
      h('input', {
        type: 'checkbox',
        checked: state.controls.has(control.id),
        dataset: { action: 'toggle-control', control: control.id },
      }),
      h('span.rail-name', { text: control.name }),
      h('span.mono.rail-cost', { text: formatMoney(control.annualCost) }),
      h('span.rail-why', { text: control.rationale }),
    ])),
  ]);

  return h('aside.rail', {}, [
    h('header.rail-head', {}, [
      h('h2', { text: 'Controls' }),
      h('p.note', { text: 'One budget. Some of these rewrite cloud policy, some rewrite the agent, two do both. Everything on screen recomputes.' }),
    ]),
    h('div.rail-stats', {}, [
      h('p', {}, [
        h('span.mono', { text: `${derived.crownRoutes.count}/${baselineRoutes}` }),
        ' identities can escalate to crown-jewel data',
      ]),
      h('p', {}, [h('span.mono', { text: String(derived.edges.length) }), ' escalation edges in the graph']),
      h('p', {}, [h('span.mono', { text: formatMoney(derived.controlSpend) }), ' annual spend selected']),
      h('p', {}, [h('span.mono', { text: formatMoney(derived.residualRisk.mean) }), ' residual annual loss']),
    ]),
    group('identity', 'Cloud identity'),
    group('ai', 'AI system'),
    h('div.rail-actions', {}, [
      h('button.button', { type: 'button', dataset: { action: 'harden-all' }, text: 'Enable all' }),
      h('button.button.button--ghost', { type: 'button', dataset: { action: 'reset-controls' }, text: 'Reset' }),
    ]),
  ]);
}

/**
 * Render the whole page for the current state.
 */
function render() {
  const derived = derive();
  const nav = document.getElementById('nav');
  nav.replaceChildren(...VIEWS.map(([id, label]) => views.h('button.nav-item', {
    type: 'button',
    dataset: { action: 'set-view', view: id, active: String(state.view === id) },
    text: label,
  })));

  const main = document.getElementById('view');
  const renderer = VIEWS.find(([id]) => id === state.view)?.[2] ?? views.overview;
  main.replaceChildren(renderer(state, derived));
  main.scrollTop = 0;

  document.getElementById('rail').replaceChildren(renderRail(derived));
  document.title = `Blast Radius — ${VIEWS.find(([id]) => id === state.view)?.[1] ?? ''}`;
}

/**
 * Navigate to a view, keeping the location hash in step.
 *
 * @param {string} view View id.
 */
function go(view) {
  state.view = VIEWS.some(([id]) => id === view) ? view : 'overview';
  if (window.location.hash !== `#${state.view}`) window.location.hash = state.view;
  render();
}

/**
 * Wire up delegated event handling.
 *
 * One listener per event type on the document, dispatching on `data-action`,
 * so a re-render never has to re-attach anything.
 */
function wire() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    if (action === 'set-view') go(target.dataset.view);
    if (action === 'toggle-control') {
      const id = target.dataset.control;
      if (state.controls.has(id)) state.controls.delete(id);
      else state.controls.add(id);
      render();
    }
    if (action === 'toggle-defense') {
      const id = target.dataset.defense;
      if (state.defenses.has(id)) state.defenses.delete(id);
      else state.defenses.add(id);
      render();
    }
    if (action === 'harden-all') {
      for (const control of CONTROLS) state.controls.add(control.id);
      render();
    }
    if (action === 'reset-controls') {
      state.controls.clear();
      render();
    }
    if (action === 'load-sample') {
      const sample = CORPUS.find((candidate) => candidate.id === target.dataset.sample);
      if (sample) {
        state.labText = sample.text;
        if (state.view !== 'ai') go('ai');
        else render();
      }
    }
    if (action === 'toggle-rail') {
      document.body.classList.toggle('rail-open');
    }
  });

  document.addEventListener('input', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    if (action === 'lab-input') {
      state.labText = target.value;
      queueRender();
    }
    if (action === 'set-threshold') {
      state.threshold = Number(target.value);
      queueRender();
    }
    if (action === 'set-probe-action') {
      state.probe.action = target.value.trim();
      queueRender();
    }
  });

  document.addEventListener('change', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    if (action === 'set-source') { state.source = target.value; render(); }
    if (action === 'set-probe-principal') { state.probe.principal = target.value; render(); }
    if (action === 'set-probe-resource') { state.probe.resource = target.value; render(); }
  });

  window.addEventListener('hashchange', () => go(window.location.hash.slice(1)));
}

let pending = 0;

/**
 * Coalesce renders triggered by typing or dragging into one per frame.
 *
 * Re-rendering also rebuilds the focused control, so focus and selection are
 * restored afterwards — without that, typing in the lab loses the caret on the
 * first keystroke.
 */
function queueRender() {
  if (pending) return;
  pending = requestAnimationFrame(() => {
    pending = 0;
    const active = document.activeElement;
    const id = active?.id;
    const selection = active && 'selectionStart' in active ? active.selectionStart : null;
    render();
    if (!id) return;
    const restored = document.getElementById(id);
    if (!restored) return;
    restored.focus({ preventScroll: true });
    if (selection !== null && 'setSelectionRange' in restored) {
      try { restored.setSelectionRange(selection, selection); } catch { /* range not applicable */ }
    }
  });
}

wire();
go(window.location.hash.slice(1) || 'overview');

if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is a bonus, not a requirement */ });
}

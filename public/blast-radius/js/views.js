/**
 * View renderers.
 *
 * Each function takes the current state and the derived analysis and returns a
 * detached DOM fragment. Nothing here computes security results — every number
 * on screen comes from one of the engine modules, so the interface can be
 * rewritten without touching an answer, and the answers can be verified in a
 * test without touching the interface.
 *
 * @module blast-radius/views
 */

import * as charts from './charts.js';
import { formatMoney } from './fair.js';
import { formatDuration } from './detect.js';
import { explainPath, nameOf } from './graph.js';

/**
 * Build an element.
 *
 * @param {string} tag Tag name, optionally with a `#id` and `.class` suffixes,
 *   in CSS shorthand: `select#probeResource`, `div.card.card--scenario`.
 * @param {Record<string, unknown>|null} [attrs] Attributes; `dataset` and
 *   `html` are treated specially.
 * @param {Array<Node|string|null|false>} [children] Children.
 * @returns {HTMLElement} The element.
 */
export function h(tag, attrs = null, children = []) {
  const [, name, id, classes] = /^([a-z0-9-]+)(?:#([\w-]+))?((?:\.[\w-]+)*)$/i.exec(tag) ?? [];
  const node = document.createElement(name ?? tag);
  if (id) node.id = id;
  if (classes) node.className = classes.slice(1).split('.').join(' ');
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'class') node.className = `${node.className} ${value}`.trim();
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'value') node.value = value;
    else if (key === 'checked') node.checked = Boolean(value);
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/**
 * A labelled statistic.
 *
 * @param {string} label Caption.
 * @param {string} value Primary number.
 * @param {string} [detail] Supporting line.
 * @param {string} [tone] `hot`, `warm`, `cool` or omitted.
 * @returns {HTMLElement} The tile.
 */
function stat(label, value, detail, tone) {
  return h('div.stat', { dataset: { tone: tone ?? 'neutral' } }, [
    h('p.stat-label', { text: label }),
    h('p.stat-value', { text: value }),
    detail ? h('p.stat-detail', { text: detail }) : null,
  ]);
}

/**
 * A titled section with optional standfirst.
 *
 * @param {string} title Section heading.
 * @param {string|null} standfirst Explanatory line beneath it.
 * @param {Array<Node|null|false>} children Body content.
 * @returns {HTMLElement} The section.
 */
function panel(title, standfirst, children) {
  return h('section.panel', {}, [
    h('header.panel-head', {}, [
      h('h2', { text: title }),
      standfirst ? h('p.standfirst', { text: standfirst }) : null,
    ]),
    ...children,
  ]);
}

/**
 * Render the overview.
 *
 * @param {object} state UI state.
 * @param {object} derived Derived analysis.
 * @returns {DocumentFragment} The view.
 */
export function overview(state, derived) {
  const fragment = document.createDocumentFragment();
  const { estate, edges, radius, review, chain, portfolioRisk, detection } = derived;
  const crownPaths = radius.impact.filter((item) => item.classification === 'crown').length;

  fragment.append(h('section.hero', {}, [
    h('p.eyebrow', { text: 'Cloud identity architecture · AI system security' }),
    h('h1', { text: 'Blast Radius' }),
    h('p.lede', { text: 'An LLM agent is not a new thing to secure. It is a new kind of principal — one that reads attacker-controlled text all day, holds credentials, and calls APIs on behalf of somebody it cannot authenticate. This console analyses one estate from both ends: what the identities can reach, and what the agent can be talked into doing with them.' }),
    h('p.lede.lede--muted', { text: `${estate.name}: ${estate.summary}` }),
  ]));

  fragment.append(h('div.stat-grid', {}, [
    stat('Escalation edges', String(edges.length), 'Ways one identity becomes another', edges.length > 30 ? 'hot' : 'warm'),
    stat('Crown-jewel exposure', String(crownPaths), 'Crown-jewel resources reachable from the agent', crownPaths > 0 ? 'hot' : 'cool'),
    stat('AI exposure score', `${review.score}`, `${review.findings.length} architecture findings`, review.score > 60 ? 'hot' : review.score > 30 ? 'warm' : 'cool'),
    stat('Annualised loss', formatMoney(portfolioRisk.mean), `p95 ${formatMoney(portfolioRisk.p95)} · seeded, reproducible`, 'warm'),
    stat('Time to first signal', formatDuration(detection.attacks[0]?.mttdMs ?? null), `A rule fires on the first attack event · ${detection.alerts} alerts in 14 days`, 'cool'),
    stat('Chain feasibility', `${Math.round(chain.feasibility * 100)}%`, 'Injection to crown-jewel data, end to end', chain.feasibility > 0.3 ? 'hot' : 'cool'),
  ]));

  fragment.append(panel(
    'The chain this estate allows',
    'Composed from the identity graph and the agent architecture — not written by hand. Every step below was derived by asking the policy engine a question.',
    [
      h('ol.chain', {}, chain.steps.map((step) => h('li.chain-step', { dataset: { stage: step.stage.toLowerCase() } }, [
        h('span.chain-stage', { text: step.stage }),
        h('div', {}, [
          h('p.chain-actor', { text: step.actor }),
          h('p.chain-detail', { text: step.detail }),
        ]),
      ]))),
      h('p.note', { text: chain.objective
        ? `Objective reached: ${chain.objective.resource}. Toggle a control in the rail to watch the chain change.`
        : 'No crown-jewel objective is reachable under the current control set.' }),
    ],
  ));

  fragment.append(panel('What each view is for', null, [
    h('div.card-grid', {}, [
      ['Identity', 'Evaluate any call against the real policy chain, then let the graph find the escalation paths nobody designed.'],
      ['AI security', 'Review the agent architecture by trust boundary, and measure the injection detector on a corpus with its false positives kept in.'],
      ['Detections', 'Rules scored against labelled telemetry: coverage, precision, and time to first signal.'],
      ['Risk', 'Monte Carlo loss model and a control ranking by return, so a $4k policy fix can be compared to a $90k approval queue.'],
      ['Portfolio', 'Decision records, threat models and incident write-ups — including what did not work.'],
    ].map(([title, text]) => h('article.card', {}, [h('h3', { text: title }), h('p', { text })]))),
  ]));

  return fragment;
}

/**
 * Render the identity view.
 *
 * @param {object} state UI state.
 * @param {object} derived Derived analysis.
 * @returns {DocumentFragment} The view.
 */
export function identity(state, derived) {
  const fragment = document.createDocumentFragment();
  const { estate, edges, radius, decision } = derived;
  const reachable = new Set(radius.reached.map((item) => item.id));

  fragment.append(panel(
    'Blast radius',
    'Assume this principal is compromised. The graph answers two questions: which identities does it become, and what can those identities then do to the things that matter?',
    [
      h('div.controls-inline', {}, [
        h('label', { for: 'sourcePrincipal', text: 'Compromised principal' }),
        h('select#sourcePrincipal', { dataset: { action: 'set-source' } },
          estate.principals.map((principal) => h('option', {
            value: principal.id,
            selected: principal.id === state.source,
            text: `${principal.name} · ${principal.kind}`,
          }))),
      ]),
      h('div.stat-row', {}, [
        stat('Severity', String(radius.score), 'Weighted by data classification and reach', radius.score > 60 ? 'hot' : radius.score > 25 ? 'warm' : 'cool'),
        stat('Identities reached', String(radius.reached.length), `of ${estate.principals.length} principals`),
        stat('Resources exposed', String(radius.impact.length), `${radius.impact.filter((item) => item.classification === 'crown').length} crown-jewel`),
      ]),
      h('div.scroll-x', {}, [charts.identityGraph({
        nodes: estate.principals,
        edges,
        source: state.source,
        reachable,
        path: radius.worstPath,
      })]),
      radius.worstPath.length > 0
        ? h('div.callout', {}, [
          h('h3', { text: 'Cheapest route to crown-jewel data' }),
          h('ol.path', {}, explainPath(estate, radius.worstPath).map((line) => h('li', { text: line.replace(/^\d+\.\s*/, '') }))),
        ])
        : h('p.note', { text: 'No route from this principal to crown-jewel data under the current control set.' }),
    ],
  ));

  fragment.append(panel(
    'What it reaches',
    'Each row is a resource the compromised principal can act on, directly or through the identities it can become.',
    [
      h('table.grid', {}, [
        h('thead', {}, [h('tr', {}, ['Resource', 'Class', 'Via identity', 'Actions', 'Hops'].map((label) => h('th', { text: label })))]),
        h('tbody', {}, radius.impact.map((item) => h('tr', {}, [
          h('td', { text: item.resource }),
          h('td', {}, [h('span.tag', { dataset: { tone: item.classification }, text: item.classification })]),
          h('td', { text: item.viaName }),
          h('td.mono', { text: item.actions.join(', ') }),
          h('td.mono', { text: String(item.hops) }),
        ]))),
      ]),
    ],
  ));

  fragment.append(panel(
    'Explain a decision',
    'The same engine the graph uses, exposed directly. Deny precedence, permissions boundaries, organizational guardrails and cross-account agreement all run in order, and the chain below is what actually decided the answer.',
    [
      h('div.controls-inline', {}, [
        h('select#probePrincipal', { dataset: { action: 'set-probe-principal' } },
          estate.principals.map((principal) => h('option', { value: principal.id, selected: principal.id === state.probe.principal, text: principal.name }))),
        h('input#probeAction', { value: state.probe.action, dataset: { action: 'set-probe-action' }, 'aria-label': 'Action', spellcheck: 'false' }),
        h('select#probeResource', { dataset: { action: 'set-probe-resource' } },
          [...estate.resources, ...estate.secrets, ...estate.compute].map((resource) => h('option', {
            value: resource.arn, selected: resource.arn === state.probe.resource, text: resource.name,
          }))),
      ]),
      h('div.verdict', { dataset: { allowed: String(decision.allowed) } }, [
        h('p.verdict-word', { text: decision.allowed ? 'ALLOWED' : 'DENIED' }),
        h('p.verdict-reason', { text: decision.reason }),
      ]),
      h('ol.chain-steps', {}, decision.chain.map((step) => h('li', { dataset: { outcome: step.outcome } }, [
        h('span.step-stage', { text: step.stage }),
        h('span.step-detail', { text: step.detail }),
        step.policy ? h('span.step-policy.mono', { text: `${step.policy}${step.sid ? ` · ${step.sid}` : ''}` }) : null,
      ]))),
    ],
  ));

  fragment.append(panel(
    'Techniques found in this estate',
    'Grouped by the control that removes them. The count is what disappears from the graph when that control is applied — the first slide of any remediation conversation that gets funded.',
    [
      h('div.card-grid', {}, derived.controlRanking.map((entry) => h('article.card', {}, [
        h('h3', { text: entry.technique }),
        h('p.metric', { text: `${entry.removes} edge${entry.removes === 1 ? '' : 's'}` }),
        h('p', { text: entry.control }),
      ]))),
    ],
  ));

  return fragment;
}

/**
 * Render the AI security view.
 *
 * @param {object} state UI state.
 * @param {object} derived Derived analysis.
 * @returns {DocumentFragment} The view.
 */
export function aiSecurity(state, derived) {
  const fragment = document.createDocumentFragment();
  const { spec, review, chain, analysis, benchmark, sweep, defense, estate } = derived;

  fragment.append(panel(
    'Architecture review',
    `${spec.name} — reviewed by trust boundary rather than by component, because a component list produces a checklist and a boundary list produces an argument.`,
    [
      h('div.stat-row', {}, [
        stat('Exposure', String(review.score), `${review.findings.length} findings`, review.score > 60 ? 'hot' : review.score > 30 ? 'warm' : 'cool'),
        stat('Untrusted inputs', String(spec.inputs.filter((input) => !input.trusted).length), `of ${spec.inputs.length} context sources`),
        stat('Unattended write tools', String(spec.tools.filter((tool) => tool.writes && !tool.approval).length), `of ${spec.tools.length} tools`),
      ]),
      h('div.findings', {}, review.findings.map((finding) => h('article.finding', { dataset: { severity: String(finding.severity) } }, [
        h('header', {}, [
          h('span.sev', { text: `S${finding.severity}` }),
          h('h3', { text: finding.name }),
          h('span.surface', { text: finding.surface }),
        ]),
        h('p', { text: finding.description }),
        h('p.evidence', { text: finding.evidence }),
        h('p.control', { text: `Control: ${finding.control}` }),
      ]))),
      review.findings.length === 0 ? h('p.note', { text: 'No findings under the current control set.' }) : null,
    ],
  ));

  fragment.append(panel(
    'Injection lab',
    'Paste anything a model would read — a ticket, an email, a retrieved document. The score is a weighted feature model, so every point of it can be explained and argued with.',
    [
      h('div.lab', {}, [
        h('textarea#labInput', {
          rows: '7', spellcheck: 'false', dataset: { action: 'lab-input' },
          'aria-label': 'Untrusted content to score',
        }, [state.labText]),
        h('div.lab-side', {}, [
          h('div.score', { dataset: { verdict: analysis.verdict.replace(/\s+/g, '-') } }, [
            h('p.score-value', { text: String(analysis.score) }),
            h('p.score-verdict', { text: analysis.verdict }),
          ]),
          h('p.note', { text: analysis.summary }),
          h('div.chips', {}, derived.samples.map((sample) => h('button.chip', {
            type: 'button',
            dataset: { action: 'load-sample', sample: sample.id },
            text: `${sample.id} · ${sample.channel}`,
          }))),
        ]),
      ]),
      analysis.hits.length > 0
        ? h('ul.features', {}, analysis.hits.map((hit) => h('li', {}, [
          h('span.feature-label', { text: hit.label }),
          h('span.feature-weight.mono', { text: `+${hit.weight}` }),
          hit.excerpt ? h('code', { text: hit.excerpt }) : null,
          h('p.feature-why', { text: hit.why }),
        ])))
        : h('p.note', { text: 'No features fired.' }),
      analysis.combinations.length > 0
        ? h('ul.combos', {}, analysis.combinations.map((combo) => h('li', {}, [
          h('span.mono', { text: `+${combo.bonus}` }),
          ` ${combo.why}`,
        ])))
        : null,
    ],
  ));

  fragment.append(panel(
    'How good is that detector, actually',
    'Scored on a labelled corpus that keeps its hard cases: angry customers, password questions, base64 in logs, and one genuine operator instruction that is textually indistinguishable from an attack.',
    [
      h('div.stat-row', {}, [
        stat('Precision', benchmark.precision.toFixed(2), `${benchmark.falsePositives} false positive${benchmark.falsePositives === 1 ? '' : 's'}`),
        stat('Recall', benchmark.recall.toFixed(2), `${benchmark.falseNegatives} missed`),
        stat('F1', benchmark.f1.toFixed(2), `threshold ${state.threshold}`),
        stat('Corpus', String(benchmark.rows.length), 'samples, hand-labelled'),
      ]),
      h('div.controls-inline', {}, [
        h('label', { for: 'thresholdRange', text: 'Flagging threshold' }),
        h('input#thresholdRange', {
          type: 'range', min: '10', max: '90', step: '5', value: String(state.threshold),
          dataset: { action: 'set-threshold' },
        }),
        h('span.mono', { text: String(state.threshold) }),
      ]),
      h('div.scroll-x', {}, [charts.operatingCurve(sweep, state.threshold)]),
      h('p.legend', {}, [
        h('span.key.key--precision', { text: 'precision' }),
        h('span.key.key--recall', { text: 'recall' }),
        ' — moving the threshold trades angry customers held for review against attacks that get through. That trade belongs to whoever owns the support queue, which is why it is a slider and not a constant.',
      ]),
      h('table.grid', {}, [
        h('thead', {}, [h('tr', {}, ['Sample', 'Label', 'Score', 'Outcome', 'Channel'].map((label) => h('th', { text: label })))]),
        h('tbody', {}, benchmark.rows.map((row) => h('tr', { dataset: { outcome: row.outcome.replace(/\s+/g, '-') } }, [
          h('td.mono', {}, [h('button.linkish', { type: 'button', dataset: { action: 'load-sample', sample: row.sample.id }, text: row.sample.id })]),
          h('td', { text: row.sample.label }),
          h('td.mono', { text: String(row.score) }),
          h('td', { text: row.outcome }),
          h('td', { text: row.sample.channel }),
        ]))),
      ]),
      h('div.callout', {}, [
        h('h3', { text: 'The three that matter' }),
        h('ul', {}, derived.notableSamples.map((sample) => h('li', {}, [
          h('strong', { text: `${sample.id}: ` }), sample.note ?? '',
        ]))),
      ]),
    ],
  ));

  fragment.append(panel(
    'Defence simulator',
    'Which corpus attacks survive the controls currently switched on. Detection contributes only what the benchmark says it contributes.',
    [
      h('div.stat-row', {}, [
        stat('Residual attacks', `${Math.round(defense.residual * 100)}%`, `${defense.surviving.length} of ${defense.surviving.length + defense.stopped.length} still land`, defense.residual > 0.3 ? 'hot' : defense.residual > 0 ? 'warm' : 'cool'),
        stat('Annual spend', formatMoney(defense.spend), 'across selected defences'),
        stat('Stopped durably', String(defense.stopped.filter((item) => item.durable).length), 'by architecture, not by recognition'),
      ]),
      h('ul.defense-list', {}, derived.defenses.map((item) => h('li', {}, [
        h('label', {}, [
          h('input', {
            type: 'checkbox', checked: state.defenses.has(item.id),
            dataset: { action: 'toggle-defense', defense: item.id },
          }),
          h('span.defense-name', { text: item.name }),
          h('span.mono.defense-cost', { text: formatMoney(item.cost) }),
        ]),
        h('p.note', { text: item.note }),
      ]))),
      defense.surviving.length > 0
        ? h('div.callout.callout--warn', {}, [
          h('h3', { text: 'Still lands' }),
          h('ul', {}, defense.surviving.map((item) => h('li', {}, [
            h('strong', { text: `${item.sample.id}: ` }), `${item.sample.text.slice(0, 90)}… — ${item.reason}`,
          ]))),
        ])
        : h('p.note', { text: 'Every corpus attack is stopped by the current selection. That is a statement about this corpus, not about the next payload.' }),
    ],
  ));

  fragment.append(panel(
    'Kill chain',
    'Where the AI half meets the identity half. Each breakpoint below is a place a control severs the chain, earliest first.',
    [
      h('ol.chain', {}, chain.steps.map((step) => h('li.chain-step', { dataset: { stage: step.stage.toLowerCase() } }, [
        h('span.chain-stage', { text: step.stage }),
        h('div', {}, [h('p.chain-actor', { text: step.actor }), h('p.chain-detail', { text: step.detail })]),
      ]))),
      h('div.callout', {}, [
        h('h3', { text: 'Where it breaks' }),
        h('ol', {}, chain.breakpoints.map((point) => h('li', { text: point }))),
        chain.breakpoints.length === 0 ? h('p', { text: 'The chain is severed under the current control set.' }) : null,
      ]),
      h('p.note', { text: `Objective: ${chain.objective ? `${chain.objective.resource} via ${chain.objective.viaName}` : 'unreachable'} · principal ${nameOf(estate, spec.principal)}` }),
    ],
  ));

  return fragment;
}

/**
 * Render the detections view.
 *
 * @param {object} state UI state.
 * @param {object} derived Derived analysis.
 * @returns {DocumentFragment} The view.
 */
export function detections(state, derived) {
  const fragment = document.createDocumentFragment();
  const { detection, alerts, rules, attacks, window } = derived;

  fragment.append(panel(
    'Scorecard',
    'Fourteen days of synthetic telemetry for this estate, with two labelled attacks threaded through it — the same two the identity graph says are available. Rules written from an estate’s own paths beat a bought rule pack, which was written for somebody else’s architecture.',
    [
      h('div.stat-row', {}, [
        stat('Alerts', String(detection.alerts), 'after deduplication'),
        stat('Precision', detection.precision.toFixed(2), `${detection.falsePositives} false positive${detection.falsePositives === 1 ? '' : 's'}`),
        stat('Noise', detection.noisePerDay.toFixed(2), 'false positives per day', detection.noisePerDay > 1 ? 'hot' : 'cool'),
        stat('Attacks caught', `${detection.attacks.filter((item) => item.detected).length}/${detection.attacks.length}`, 'labelled chains'),
      ]),
      h('div.scroll-x', {}, [charts.alertTimeline(alerts, window.start, window.end)]),
      h('p.legend', {}, [
        h('span.key.key--attack', { text: 'true positive' }),
        h('span.key.key--noise', { text: 'false positive' }),
        ' — time to signal is machine time, from the first attack event to the first alert. It excludes triage, which in the incident write-up was the expensive part.',
      ]),
      h('table.grid', {}, [
        h('thead', {}, [h('tr', {}, ['Attack', 'Detected', 'Time to signal', 'Step coverage', 'By rules'].map((label) => h('th', { text: label })))]),
        h('tbody', {}, detection.attacks.map((item) => {
          const meta = attacks.find((candidate) => candidate.id === item.id);
          return h('tr', {}, [
            h('td', { text: meta?.name ?? item.id }),
            h('td', { text: item.detected ? 'yes' : 'no' }),
            h('td.mono', { text: formatDuration(item.mttdMs) }),
            h('td.mono', { text: `${Math.round(item.coverage * 100)}%` }),
            h('td.mono', { text: item.byRule.join(', ') || '—' }),
          ]);
        })),
      ]),
    ],
  ));

  fragment.append(panel(
    'Alerts raised',
    'Deduplicated: repeats inside a thirty-minute window collapse into the alert that came first, keeping their events. Without that, this incident arrives as forty pages and the fortieth is the one nobody reads.',
    [
      h('table.grid', {}, [
        h('thead', {}, [h('tr', {}, ['Time', 'Rule', 'Severity', 'Detail', 'Verdict'].map((label) => h('th', { text: label })))]),
        h('tbody', {}, alerts.map((alert) => {
          const truePositive = alert.events.some((event) => event.attack);
          return h('tr', { dataset: { verdict: truePositive ? 'tp' : 'fp' } }, [
            h('td.mono', { text: new Date(alert.ts).toISOString().slice(5, 16).replace('T', ' ') }),
            h('td', { text: alert.name }),
            h('td', {}, [h('span.tag', { dataset: { tone: alert.severity }, text: alert.severity })]),
            h('td', { text: `${alert.detail}${alert.repeats > 0 ? ` (+${alert.repeats} repeats)` : ''}` }),
            h('td', { text: truePositive ? 'true positive' : 'false positive' }),
          ]);
        })),
      ]),
    ],
  ));

  fragment.append(panel(
    'The rules',
    'Each carries the false-positive note its author owed the on-call engineer. A rule that fired zero times is not necessarily wrong — it may be covering a path this estate has not yet seen walked.',
    [
      h('div.rule-list', {}, rules.map((rule) => {
        const score = detection.rules.find((entry) => entry.id === rule.id);
        return h('article.rule', {}, [
          h('header', {}, [
            h('span.tag', { dataset: { tone: rule.severity }, text: rule.severity }),
            h('h3', { text: rule.name }),
            h('span.mono.rule-kind', { text: rule.kind }),
          ]),
          h('p', { text: rule.rationale }),
          h('p.evidence', { text: `False positives: ${rule.falsePositives}` }),
          h('p.control', { text: `Response: ${rule.response}` }),
          h('p.mono.rule-score', { text: `fired ${score?.fired ?? 0} · ${score?.truePositives ?? 0} true · ${score?.falsePositives ?? 0} false · ${rule.tactic}` }),
        ]);
      })),
    ],
  ));

  return fragment;
}

/**
 * Render the risk view.
 *
 * @param {object} state UI state.
 * @param {object} derived Derived analysis.
 * @returns {DocumentFragment} The view.
 */
export function risk(state, derived) {
  const fragment = document.createDocumentFragment();
  const { portfolioRisk, residualRisk, curve, residualCurve, roi, scenarioRuns, scenarios } = derived;

  fragment.append(panel(
    'Loss exceedance',
    'The probability that a year’s losses exceed each amount. A control earns its money by pulling the curve left; the residual line is the current control selection.',
    [
      h('div.stat-row', {}, [
        stat('Annualised loss', formatMoney(portfolioRisk.mean), 'expected across all scenarios', 'hot'),
        stat('With controls', formatMoney(residualRisk.mean), `${Math.round((1 - (residualRisk.mean / Math.max(1, portfolioRisk.mean))) * 100)}% reduction`, 'cool'),
        stat('1-in-20 year', formatMoney(portfolioRisk.p95), `with controls ${formatMoney(residualRisk.p95)}`, 'warm'),
        stat('Control spend', formatMoney(derived.controlSpend), 'annual, for the current selection'),
      ]),
      h('div.scroll-x', {}, [charts.exceedanceChart(curve, residualCurve, { formatMoney })]),
      h('p.legend', {}, [
        h('span.key.key--baseline', { text: 'today' }),
        h('span.key.key--residual', { text: 'with selected controls' }),
        ' — 20,000 simulated years per scenario, seeded so the number in a report is reproducible by whoever reads it. The loss axis is truncated at the 99.5th percentile; the tail runs further right.',
      ]),
    ],
  ));

  fragment.append(panel(
    'Where to spend next',
    'Ranked by expected loss reduced per unit of spend. The ranking is the durable output: estimates move, but the order rarely does.',
    [
      h('table.grid', {}, [
        h('thead', {}, [h('tr', {}, ['Control', 'Annual cost', 'Loss reduced', 'Tail reduced', 'Return'].map((label) => h('th', { text: label })))]),
        h('tbody', {}, roi.map((entry) => h('tr', { dataset: { active: String(state.controls.has(entry.id)) } }, [
          h('td', {}, [
            h('label.inline-check', {}, [
              h('input', { type: 'checkbox', checked: state.controls.has(entry.id), dataset: { action: 'toggle-control', control: entry.id } }),
              h('span', { text: entry.name }),
            ]),
          ]),
          h('td.mono', { text: formatMoney(entry.cost) }),
          h('td.mono', { text: formatMoney(entry.reduction) }),
          h('td.mono', { text: formatMoney(entry.tailReduction) }),
          h('td.mono', { text: `${entry.roi.toFixed(0)}×` }),
        ]))),
      ]),
      h('p.note', { text: 'Return is expected annual loss reduced divided by annual cost. A figure above 1 means the control is cheaper than the losses it prevents, in expectation — which is a floor, not a business case, because it ignores the tail the board is actually insuring against.' }),
    ],
  ));

  fragment.append(panel(
    'Scenarios',
    'Three, chosen because the identity graph says these are the paths that exist. Each carries its basis, so the estimates can be argued with rather than believed.',
    [
      h('div.card-grid', {}, scenarios.map((scenario) => {
        const run = scenarioRuns.find((entry) => entry.id === scenario.id);
        return h('article.card.card--scenario', {}, [
          h('h3', { text: scenario.name }),
          h('p', { text: scenario.narrative }),
          h('p.metric', { text: `${formatMoney(run.mean)} / year · p95 ${formatMoney(run.p95)}` }),
          h('p.note', { text: `Loss event in ${Math.round(run.probabilityOfAnyLoss * 100)}% of simulated years.` }),
          h('details', {}, [
            h('summary', { text: 'Basis for these numbers' }),
            h('ul', {}, (scenario.basis ?? []).map((line) => h('li', { text: line }))),
          ]),
        ]);
      })),
    ],
  ));

  fragment.append(panel(
    'Board brief',
    'One page. The exposure, the decision being asked for, and the cost of doing nothing.',
    [
      h('div.brief', {}, [
        h('p', {}, [
          h('strong', { text: 'Exposure. ' }),
          `Three modelled scenarios carry an expected ${formatMoney(portfolioRisk.mean)} a year, with a one-in-twenty year at ${formatMoney(portfolioRisk.p95)}. The largest single contributor is the customer support agent, whose tool credentials can reach the cardholder vault through two ordinary-looking permission grants that nobody approved together.`,
        ]),
        h('p', {}, [
          h('strong', { text: 'Decision. ' }),
          `${formatMoney(derived.recommendedSpend)} a year of controls removes roughly ${Math.round((1 - (derived.recommendedResidual / Math.max(1, portfolioRisk.mean))) * 100)}% of that expectation. The three highest-return items cost ${formatMoney(roi.slice(0, 3).reduce((sum, entry) => sum + entry.cost, 0))} between them and are policy changes, not products.`,
        ]),
        h('p', {}, [
          h('strong', { text: 'Cost of delay. ' }),
          `Each quarter without the top three carries roughly ${formatMoney((portfolioRisk.mean - derived.recommendedResidual) / 4)} of accrued expected loss, and the agent scenario is the one with a live attack path today — a near miss on the pipeline was already reported by an outsider rather than found by us.`,
        ]),
        h('p', {}, [
          h('strong', { text: 'What we are not asking for. ' }),
          'An inline AI filtering product was evaluated at $140k a year and declined. Reproducing its evaluation on our own corpus put it in the same range as a heuristic we can read, and the money removes the escalation path outright instead.',
        ]),
        h('p.note', { text: 'Every figure above is reproducible: seeded simulation, published inputs, and the assumptions most likely to be wrong are named in each scenario’s basis.' }),
      ]),
    ],
  ));

  return fragment;
}

/**
 * Render the portfolio view.
 *
 * @param {object} state UI state.
 * @param {object} derived Derived analysis.
 * @returns {DocumentFragment} The view.
 */
export function portfolio(state, derived) {
  const fragment = document.createDocumentFragment();
  const { decisions, threatModels, incidents, proofMap } = derived;

  fragment.append(panel(
    'Architecture decision records',
    'Including the ones that were argued down. A register with no rejected decisions is a register nobody was allowed to disagree with.',
    [
      h('div.adr-list', {}, decisions.map((record) => h('article.adr', { dataset: { status: record.status } }, [
        h('header', {}, [
          h('span.mono.adr-id', { text: record.id }),
          h('h3', { text: record.title }),
          h('span.tag', { dataset: { tone: record.status }, text: record.status }),
          h('span.mono.adr-date', { text: record.date }),
        ]),
        h('p.adr-context', { text: record.context }),
        h('p.adr-decision', {}, [h('strong', { text: 'Decision. ' }), record.decision]),
        h('details', {}, [
          h('summary', { text: 'Consequences and alternatives' }),
          h('ul', {}, record.consequences.map((line) => h('li', { text: line }))),
          h('p.note', { text: 'Alternatives considered:' }),
          h('ul', {}, record.alternatives.map((line) => h('li', { text: line }))),
          record.evidence ? h('p.evidence', { text: `Demonstrated in: ${record.evidence}` }) : null,
        ]),
      ]))),
    ],
  ));

  fragment.append(panel(
    'Threat models',
    'Written per trust boundary. A component list produces a checklist; a boundary list produces an argument about what is trusted where.',
    [
      h('div.tm-list', {}, threatModels.map((model) => h('article.tm', {}, [
        h('header', {}, [h('span.mono', { text: model.id }), h('h3', { text: model.system })]),
        h('p', { text: model.scope }),
        h('p.note', { text: 'Assumptions:' }),
        h('ul', {}, model.assumptions.map((line) => h('li', { text: line }))),
        h('table.grid', {}, [
          h('thead', {}, [h('tr', {}, ['Boundary', 'What crosses it', 'Threats', 'Control'].map((label) => h('th', { text: label })))]),
          h('tbody', {}, model.boundaries.map((boundary) => h('tr', {}, [
            h('td', { text: boundary.boundary }),
            h('td', { text: boundary.crosses }),
            h('td', {}, [h('ul.tight', {}, boundary.threats.map((threat) => h('li', { text: threat })))]),
            h('td', { text: boundary.control }),
          ]))),
        ]),
        h('p.evidence', { text: model.outcome }),
      ]))),
    ],
  ));

  fragment.append(panel(
    'Incident write-ups',
    'Both include what did not work. A write-up without that section is a press release.',
    [
      h('div.incident-list', {}, incidents.map((incident) => h('article.incident', {}, [
        h('header', {}, [
          h('span.mono', { text: incident.id }),
          h('h3', { text: incident.title }),
          h('span.mono.adr-date', { text: incident.date }),
        ]),
        h('p', { text: incident.summary }),
        h('ol.timeline', {}, incident.timeline.map((entry) => h('li', {}, [
          h('span.mono.timeline-at', { text: entry.at }),
          h('span', { text: entry.event }),
        ]))),
        h('p.impact', {}, [h('strong', { text: 'Business impact. ' }), incident.impact]),
        h('details', {}, [
          h('summary', { text: 'What worked, what did not, what changed' }),
          h('p.note', { text: 'Worked:' }),
          h('ul', {}, incident.whatWorked.map((line) => h('li', { text: line }))),
          h('p.note', { text: 'Did not:' }),
          h('ul', {}, incident.whatDidNot.map((line) => h('li', { text: line }))),
          h('p.note', { text: 'Changed:' }),
          h('ul', {}, incident.changes.map((line) => h('li', { text: line }))),
        ]),
      ]))),
    ],
  ));

  fragment.append(panel(
    'Proof map',
    'Each claim, and the thing in this console that backs it. A claim with no runnable artefact behind it is a line on a CV.',
    [
      h('table.grid', {}, [
        h('thead', {}, [h('tr', {}, ['Claim', 'Artefact', 'Where'].map((label) => h('th', { text: label })))]),
        h('tbody', {}, proofMap.map((row) => h('tr', {}, [
          h('td', { text: row.claim }),
          h('td', { text: row.artefact }),
          h('td.mono', { text: row.where }),
        ]))),
      ]),
    ],
  ));

  return fragment;
}

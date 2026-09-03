/**
 * Lab — The Agent Loop Builder.
 *
 * Assemble a loop from stages, run it against three tasks, and watch it
 * converge or fail. The simulator is rule-based and legible: each stage has
 * preconditions, and a loop missing observation, or missing a bound, fails in
 * exactly the way the lessons describe rather than in a way the lab invents.
 *
 * @module nexus/labs/agentloop
 */

import { el, fill } from '../dom.js';

/** The stages available to the builder. */
export const STAGES = [
  { id: 'perceive', name: 'Perceive', note: 'Read the goal and the current state.' },
  { id: 'plan', name: 'Plan', note: 'Decompose into steps before acting.' },
  { id: 'act', name: 'Act', note: 'Call a tool.' },
  { id: 'observe', name: 'Observe', note: 'Read the result of the action.' },
  { id: 'critic', name: 'Critique', note: 'Check the output against the goal.' },
  { id: 'bound', name: 'Bound', note: 'Enforce a step, time and spend limit.' },
  { id: 'approve', name: 'Human checkpoint', note: 'Pause before anything irreversible.' },
  { id: 'answer', name: 'Answer', note: 'Return the result and stop.' },
];

/** Tasks the assembled loop is run against. */
const TASKS = [
  {
    id: 'lookup',
    name: 'Look up one fact',
    needs: ['act', 'answer'],
    irreversible: false,
    note: 'A single retrieval. Even a bare act-then-answer loop completes it.',
  },
  {
    id: 'research',
    name: 'Research across sources, where step two changes the plan',
    needs: ['act', 'observe', 'answer'],
    irreversible: false,
    note: 'Without observation the loop cannot adapt when a source turns out to be empty.',
  },
  {
    id: 'refund',
    name: 'Issue a refund to a customer',
    needs: ['act', 'observe', 'approve', 'answer'],
    irreversible: true,
    note: 'Money moves. A loop without a checkpoint will act on a misreading with no way back.',
  },
];

/**
 * Run one assembled loop against the task set.
 *
 * @param {string[]} stages Ordered stage ids.
 * @returns {{ results: Array<object>, converged: boolean, score: number }} Outcome.
 */
export function evaluate(stages) {
  const has = (id) => stages.includes(id);
  const results = TASKS.map((task) => {
    const missing = task.needs.filter((need) => !has(need));
    const failures = [];
    if (missing.length) {
      for (const need of missing) {
        const stage = STAGES.find((s) => s.id === need);
        failures.push(`No ${stage.name.toLowerCase()} stage — ${
          need === 'observe' ? 'the loop acts blind and cannot recover from a failed step'
            : need === 'approve' ? 'an irreversible action runs with no human in the way'
              : need === 'answer' ? 'the loop never terminates with a result'
                : 'the loop can never take an action'}.`);
      }
    }
    if (has('act') && has('observe') && !has('bound')) {
      failures.push('No bound — a loop that observes can also loop forever. Step, time and spend limits are not optional.');
    }
    if (has('plan') && !has('observe')) {
      failures.push('Plans with no observation go stale: steps three onward are fiction the moment step two surprises you.');
    }
    if (has('answer') && stages.indexOf('answer') !== stages.length - 1) {
      failures.push('Answer is not the last stage — everything after it is unreachable.');
    }
    if (has('act') && has('observe') && stages.indexOf('observe') < stages.indexOf('act')) {
      failures.push('Observe runs before act, so it reads the state from before the action.');
    }
    return { task, ok: failures.length === 0, failures };
  });

  const passed = results.filter((r) => r.ok).length;
  return {
    results,
    converged: passed === TASKS.length,
    score: Math.round((passed / TASKS.length) * 100),
  };
}

/**
 * Mount the loop builder.
 *
 * @param {HTMLElement} root Container.
 * @param {object} ctx Console services.
 * @returns {{ destroy: () => void }} Lab handle.
 */
export function mount(root, ctx) {
  /** @type {string[]} */
  let chosen = ['perceive', 'act', 'answer'];
  const palette = el('div.chips');
  const pipeline = el('div.pipeline');
  const output = el('div.loop-out');

  /** Redraw the builder and its verdict. */
  const render = () => {
    fill(palette, STAGES.map((stage) => el('button.chip', {
      type: 'button',
      class: chosen.includes(stage.id) ? 'on' : '',
      title: stage.note,
      onclick: () => {
        chosen = chosen.includes(stage.id)
          ? chosen.filter((id) => id !== stage.id)
          : [...chosen, stage.id];
        render();
      },
    }, [stage.name])));

    fill(pipeline, chosen.length
      ? chosen.flatMap((id, i) => {
        const stage = STAGES.find((s) => s.id === id);
        const node = el('div.node', {}, [
          el('b', { text: stage.name }),
          el('span', { text: stage.note }),
          el('div.node-tools', {}, [
            el('button.mini', { type: 'button', title: 'move earlier', onclick: () => { if (i > 0) { [chosen[i - 1], chosen[i]] = [chosen[i], chosen[i - 1]]; render(); } } }, ['←']),
            el('button.mini', { type: 'button', title: 'move later', onclick: () => { if (i < chosen.length - 1) { [chosen[i + 1], chosen[i]] = [chosen[i], chosen[i + 1]]; render(); } } }, ['→']),
          ]),
        ]);
        return i < chosen.length - 1 ? [node, el('div.arrow', { text: '→' })] : [node];
      })
      : [el('p.dim', { text: 'Add stages from above to build a loop.' })]);

    const verdict = evaluate(chosen);
    fill(output, [
      el('div.loop-score', { class: verdict.converged ? 'good' : 'bad' }, [
        el('b', { text: `${verdict.score}%` }),
        el('span', { text: verdict.converged ? 'Converges on every task' : 'Fails at least one task' }),
      ]),
      ...verdict.results.map((r) => el('div.loop-task', { class: r.ok ? 'ok' : 'fail' }, [
        el('h4', { text: `${r.ok ? 'PASS' : 'FAIL'} · ${r.task.name}` }),
        el('p.dim', { text: r.task.note }),
        ...r.failures.map((f) => el('p.failure', { text: f })),
      ])),
    ]);

    if (verdict.converged) {
      ctx.progress?.unlock('architect');
      ctx.progress?.recordLab('agentloop', 100);
    }
  };

  fill(root, [
    el('div.lab-head', {}, [el('h3', { text: 'The Agent Loop Builder' })]),
    el('p.dim', { text: 'Build a loop, then watch it meet three tasks of increasing consequence. The failures below are the ones from the lessons — a loop that cannot observe, a loop with no bound, a loop that moves money with nobody watching.' }),
    el('p.label', { text: 'Stages' }),
    palette,
    el('p.label', { text: 'Your loop — arrows reorder' }),
    pipeline,
    output,
  ]);

  render();
  return { destroy: () => fill(root, []) };
}

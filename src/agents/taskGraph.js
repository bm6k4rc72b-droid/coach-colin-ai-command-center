/**
 * Task graph — the pure state machine behind an agent run.
 *
 * Everything here is plain data plus pure functions on purpose: the
 * orchestrator (which does network I/O and wall-clock scheduling) is hard to
 * test, so all of the decisions it makes — what may run next, what a failure
 * cascades into, when a run is finished — live in this module instead, where
 * they are covered by `taskGraph.test.mjs` without a browser or an API key.
 *
 * A run is a DAG of tasks. Each task names the agent that owns it and the
 * tasks it depends on. A task becomes runnable only once every dependency has
 * SUCCEEDED, which is why `blocked` is a distinct terminal-ish state from
 * `failed`: a task nobody can ever run is not itself a failure, and reporting
 * it as one makes a single upstream error look like a dozen.
 */

/** Task lifecycle states. */
export const TASK_STATES = Object.freeze([
  'queued',
  'running',
  'done',
  'failed',
  'blocked',
  'cancelled',
]);

/** States a task can no longer leave. */
export const TERMINAL_TASK_STATES = Object.freeze(['done', 'failed', 'blocked', 'cancelled']);

/** Run-level lifecycle states. */
export const RUN_STATES = Object.freeze(['idle', 'planning', 'running', 'done', 'failed', 'cancelled']);

const MAX_TASKS = 40;
const MAX_LABEL = 160;

/** Whether a task state can still change. */
export function isTerminal(state) {
  return TERMINAL_TASK_STATES.includes(state);
}

function cleanText(value, limit = MAX_LABEL) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

/**
 * Turn a raw (LLM-authored, therefore untrusted) plan into a valid task DAG.
 *
 * The planner is a language model, so this function assumes nothing: ids may
 * collide or be missing, dependencies may point at tasks that do not exist or
 * form cycles, and the agent name may not be on the roster. Every one of those
 * is repaired rather than thrown, because a run that drops one malformed edge
 * is far more useful than a run that refuses to start. Repairs are reported in
 * `warnings` so the console can show what was changed instead of silently
 * diverging from what the planner asked for.
 *
 * @param {object} rawPlan - Parsed planner output, expected `{ tasks: [...] }`.
 * @param {object} options
 * @param {string[]} options.agentIds - Roster ids a task may be assigned to.
 * @param {string} [options.fallbackAgentId] - Agent used when one is unknown.
 * @returns {{tasks: object[], warnings: string[]}}
 */
export function normalizePlan(rawPlan, { agentIds = [], fallbackAgentId = 'generalist' } = {}) {
  const warnings = [];
  const known = new Set(agentIds);
  const incoming = Array.isArray(rawPlan?.tasks) ? rawPlan.tasks : [];
  if (!incoming.length) {
    return { tasks: [], warnings: ['Planner returned no tasks'] };
  }

  if (incoming.length > MAX_TASKS) {
    warnings.push(`Plan truncated from ${incoming.length} to ${MAX_TASKS} tasks`);
  }

  const seen = new Set();
  const tasks = [];
  for (const [index, raw] of incoming.slice(0, MAX_TASKS).entries()) {
    let id = cleanText(raw?.id, 64).replace(/\s+/g, '-');
    if (!id || seen.has(id)) {
      const replacement = `t${index + 1}`;
      if (id && seen.has(id)) warnings.push(`Duplicate task id "${id}" renamed to "${replacement}"`);
      id = seen.has(replacement) ? `t${index + 1}-${tasks.length}` : replacement;
    }
    seen.add(id);

    let agentId = cleanText(raw?.agent ?? raw?.agentId, 64);
    if (!known.has(agentId)) {
      if (agentId) warnings.push(`Unknown agent "${agentId}" on task "${id}" — reassigned to ${fallbackAgentId}`);
      agentId = fallbackAgentId;
    }

    tasks.push({
      id,
      agentId,
      title: cleanText(raw?.title) || `Task ${index + 1}`,
      // The instruction is the actual prompt handed to the worker agent, so it
      // gets a far larger budget than the display label.
      instruction: cleanText(raw?.instruction ?? raw?.prompt ?? raw?.title, 4000),
      dependsOn: Array.isArray(raw?.dependsOn) ? raw.dependsOn.map((d) => cleanText(d, 64).replace(/\s+/g, '-')) : [],
      state: 'queued',
      attempts: 0,
      output: null,
      error: null,
      toolCalls: [],
      startedAt: null,
      endedAt: null,
    });
  }

  // Drop edges pointing at tasks that never made it into the plan.
  const ids = new Set(tasks.map((t) => t.id));
  for (const task of tasks) {
    const kept = task.dependsOn.filter((dep) => {
      if (dep === task.id) {
        warnings.push(`Task "${task.id}" depended on itself — edge dropped`);
        return false;
      }
      if (!ids.has(dep)) {
        warnings.push(`Task "${task.id}" depended on unknown task "${dep}" — edge dropped`);
        return false;
      }
      return true;
    });
    task.dependsOn = [...new Set(kept)];
  }

  for (const edge of breakCycles(tasks)) {
    warnings.push(`Cyclic dependency ${edge.from} → ${edge.to} — edge dropped`);
  }

  return { tasks, warnings };
}

/**
 * Remove back-edges until the graph is acyclic, returning what was cut.
 *
 * A cycle would deadlock the scheduler outright (no task in the cycle ever
 * becomes ready, so the run would sit at 0 runnable tasks forever while still
 * reporting itself incomplete). Cutting the edge degrades ordering; keeping it
 * would hang the run, so cutting always wins.
 *
 * @param {object[]} tasks - Tasks, mutated in place.
 * @returns {{from: string, to: string}[]} Dropped edges.
 */
export function breakCycles(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const state = new Map(tasks.map((t) => [t.id, 'white']));
  const dropped = [];

  const visit = (id) => {
    state.set(id, 'grey');
    const task = byId.get(id);
    for (const dep of [...task.dependsOn]) {
      const depState = state.get(dep);
      if (depState === 'grey') {
        // `dep` is an ancestor of `id` on the current stack: this edge closes
        // the loop, so it is the one to cut.
        task.dependsOn = task.dependsOn.filter((d) => d !== dep);
        dropped.push({ from: id, to: dep });
      } else if (depState === 'white') {
        visit(dep);
      }
    }
    state.set(id, 'black');
  };

  for (const task of tasks) {
    if (state.get(task.id) === 'white') visit(task.id);
  }
  return dropped;
}

/**
 * Create a run from a normalized task list.
 *
 * @param {object} options
 * @param {string} options.goal - The operator's original request.
 * @param {object[]} options.tasks - Tasks from `normalizePlan`.
 * @param {string} [options.id] - Run id; generated when absent.
 * @returns {object} Run record.
 */
export function createRun({ goal, tasks = [], id = null, warnings = [] } = {}) {
  return {
    id: id || `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    goal: cleanText(goal, 2000),
    tasks: tasks.map((t) => ({ ...t })),
    state: tasks.length ? 'running' : 'idle',
    warnings: [...warnings],
    artifacts: [],
    startedAt: Date.now(),
    endedAt: null,
  };
}

/** Find a task by id. */
export function getTask(run, id) {
  return run.tasks.find((t) => t.id === id) || null;
}

/**
 * Tasks eligible to start right now: queued, with every dependency done.
 *
 * @param {object} run
 * @param {number} [limit] - Cap on returned tasks (the scheduler's free slots).
 * @returns {object[]}
 */
export function readyTasks(run, limit = Infinity) {
  const byId = new Map(run.tasks.map((t) => [t.id, t]));
  const ready = run.tasks.filter((task) => {
    if (task.state !== 'queued') return false;
    return task.dependsOn.every((dep) => byId.get(dep)?.state === 'done');
  });
  return Number.isFinite(limit) ? ready.slice(0, Math.max(0, limit)) : ready;
}

/** Mark a task as started. Returns the task, or null when it was not queued. */
export function startTask(run, id, { now = Date.now() } = {}) {
  const task = getTask(run, id);
  if (!task || task.state !== 'queued') return null;
  task.state = 'running';
  task.attempts += 1;
  task.startedAt = now;
  if (run.state === 'idle') run.state = 'running';
  return task;
}

/**
 * Record the outcome of a task and cascade it through the graph.
 *
 * A `failed` task blocks everything downstream of it (transitively) — see the
 * module note on why that is `blocked` rather than `failed`.
 *
 * @param {object} run
 * @param {string} id
 * @param {object} outcome
 * @param {'done'|'failed'} outcome.status
 * @param {*} [outcome.output] - Result text/data handed to dependents.
 * @param {string} [outcome.error]
 * @returns {{task: object, blocked: string[]}|null}
 */
export function completeTask(run, id, { status, output = null, error = null, now = Date.now() } = {}) {
  const task = getTask(run, id);
  if (!task || isTerminal(task.state)) return null;
  task.state = status === 'done' ? 'done' : 'failed';
  task.output = output;
  task.error = task.state === 'failed' ? cleanText(error, 1000) || 'Task failed' : null;
  task.endedAt = now;

  const blocked = task.state === 'failed' ? blockDependents(run, task.id) : [];
  syncRunState(run, now);
  return { task, blocked };
}

/**
 * Block every task transitively downstream of a failed task.
 *
 * @param {object} run
 * @param {string} failedId
 * @returns {string[]} Ids newly moved to `blocked`.
 */
export function blockDependents(run, failedId) {
  const blocked = [];
  // Repeat to a fixed point: blocking a task can block its own dependents, and
  // the task list is in planner order, not topological order.
  let changed = true;
  const dead = new Set([failedId]);
  while (changed) {
    changed = false;
    for (const task of run.tasks) {
      if (isTerminal(task.state) || task.state === 'running') continue;
      if (!task.dependsOn.some((dep) => dead.has(dep))) continue;
      task.state = 'blocked';
      task.error = `Blocked — upstream task "${task.dependsOn.find((dep) => dead.has(dep))}" did not complete`;
      task.endedAt = Date.now();
      dead.add(task.id);
      blocked.push(task.id);
      changed = true;
    }
  }
  return blocked;
}

/** Send a queued/running task to `cancelled` and block its dependents. */
export function cancelRun(run, { now = Date.now() } = {}) {
  for (const task of run.tasks) {
    if (!isTerminal(task.state)) {
      task.state = 'cancelled';
      task.endedAt = now;
    }
  }
  run.state = 'cancelled';
  run.endedAt = now;
  return run;
}

/** Whether every task has reached a terminal state. */
export function isRunComplete(run) {
  return run.tasks.every((task) => isTerminal(task.state));
}

/**
 * Recompute the run-level state from its tasks.
 *
 * A run is `failed` only when NOTHING succeeded; a run where some tasks
 * delivered and others did not is `done` with visible per-task errors, because
 * partial output is still output and calling the whole run a failure hides it.
 */
export function syncRunState(run, now = Date.now()) {
  if (run.state === 'cancelled') return run;
  if (!isRunComplete(run)) {
    run.state = 'running';
    return run;
  }
  const done = run.tasks.filter((t) => t.state === 'done').length;
  run.state = done > 0 ? 'done' : 'failed';
  run.endedAt = now;
  return run;
}

/** Progress counters for the console header and the orbital view. */
export function runProgress(run) {
  const counts = { queued: 0, running: 0, done: 0, failed: 0, blocked: 0, cancelled: 0 };
  for (const task of run.tasks) counts[task.state] = (counts[task.state] || 0) + 1;
  const total = run.tasks.length;
  const settled = counts.done + counts.failed + counts.blocked + counts.cancelled;
  return {
    ...counts,
    total,
    settled,
    pct: total ? Math.round((settled / total) * 100) : 0,
  };
}

/**
 * Context handed to a task: the outputs of everything it depends on.
 *
 * Dependencies are the only upstream state a worker sees — a task does NOT get
 * the whole run's output. That keeps prompts bounded on wide graphs and makes
 * a task's inputs exactly what the plan said they were.
 *
 * @param {object} run
 * @param {string} id
 * @returns {{taskId: string, title: string, output: *}[]}
 */
export function dependencyContext(run, id) {
  const task = getTask(run, id);
  if (!task) return [];
  return task.dependsOn
    .map((dep) => getTask(run, dep))
    .filter((dep) => dep && dep.state === 'done')
    .map((dep) => ({ taskId: dep.id, title: dep.title, output: dep.output }));
}

/**
 * Depth of each task from the roots, for laying the graph out in rings.
 *
 * @param {object[]} tasks
 * @returns {Map<string, number>}
 */
export function taskDepths(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const depths = new Map();
  const resolve = (id, stack = new Set()) => {
    if (depths.has(id)) return depths.get(id);
    const task = byId.get(id);
    if (!task || !task.dependsOn.length || stack.has(id)) {
      depths.set(id, 0);
      return 0;
    }
    stack.add(id);
    const depth = 1 + Math.max(...task.dependsOn.map((dep) => resolve(dep, stack)));
    stack.delete(id);
    depths.set(id, depth);
    return depth;
  };
  for (const task of tasks) resolve(task.id);
  return depths;
}

/**
 * Orchestrator — plans a goal into a task DAG, then runs it.
 *
 * Shape of a run:
 *   1. PLAN    — one planner turn decomposes the goal into tasks with owners
 *                and dependencies (`normalizePlan` repairs whatever comes back).
 *   2. EXECUTE — a scheduler pumps ready tasks into worker loops, respecting
 *                per-agent concurrency. Each worker runs its own tool loop.
 *   3. REPORT  — the summarizer folds the leaf outputs into one answer.
 *
 * All graph decisions are delegated to `taskGraph.js` so they stay testable;
 * this module owns only the I/O and the scheduling pump. Events go out through
 * a listener so the console and the orbital view can render a run live without
 * this module knowing anything about the DOM.
 */

import {
  createRun,
  readyTasks,
  startTask,
  completeTask,
  cancelRun,
  isRunComplete,
  dependencyContext,
  runProgress,
  syncRunState,
  normalizePlan,
} from './taskGraph.js';
import { resolveRoster, getAgent, agentToolNames, describeRoster, FALLBACK_AGENT_ID } from './agentRoster.js';
import { agentChat, parsePlanJson, AgentChatError } from './llmClient.js';
import { createToolBus, serializeToolResult, ALL_TOOL_NAMES } from './toolBus.js';

/** Hard stop on tool calls within a single task, so a loop cannot run forever. */
const MAX_TOOL_STEPS = 8;
/** Attempts per task, including the first. */
const MAX_TASK_ATTEMPTS = 2;
/** Ceiling on tasks running at once across all agents. */
const GLOBAL_CONCURRENCY = 4;

const PLANNER_SYSTEM = `You are the Orchestrator of an autonomous agent swarm running inside God's Eye View, a real-time geospatial intelligence console.

Decompose the operator's goal into the SMALLEST set of concrete tasks that fully achieves it. Then assign each task to the agent best suited to it.

Rules:
- Prefer FEWER, larger tasks. Three good tasks beat ten trivial ones. Never exceed 12.
- A task is one unit of work with an observable result, written as an instruction to the agent doing it.
- Use dependsOn ONLY for a real data dependency (task B needs A's output). Independent tasks must NOT depend on each other — they run in parallel, and a false dependency serializes the run for nothing.
- Anything about a place, map, layer, or spatial question goes to geo-analyst. Live camera feeds, cockpit views and following a moving thing go to recon.
- If the goal needs a written deliverable, end with a writer task. If it needs several findings combined, end with a summarizer task depending on them.
- Do not add a review/critic task unless the goal asks for quality control or the stakes clearly warrant it.
- If the goal is a single simple question, emit exactly ONE task.

Reply with ONLY a JSON object:
{"tasks":[{"id":"t1","agent":"researcher","title":"short label","instruction":"full instruction for the agent","dependsOn":[]}]}`;

/**
 * Create an orchestrator bound to the app's live systems.
 *
 * @param {object} options
 * @param {Function|null} options.runGevAction - The GEV action runner, when the globe is up.
 * @param {object[]} [options.customAgents] - Operator-defined agents.
 * @param {Function} [options.onEvent] - Receives every run event.
 * @param {Function} [options.fetchImpl] - Injected for tests.
 * @param {string} [options.model]
 */
export function createOrchestrator({
  runGevAction = null,
  customAgents = [],
  onEvent = () => {},
  fetchImpl = null,
  apiBase = '/api',
  model = '',
  plannerModel = '',
} = {}) {
  let roster = resolveRoster(customAgents);
  let activeRun = null;
  let abortController = null;

  const emit = (type, payload = {}) => {
    try {
      onEvent({ type, at: Date.now(), ...payload });
    } catch {
      // A listener that throws must not take the run down with it.
    }
  };

  const bus = createToolBus({
    runGevAction,
    apiBase,
    fetchImpl,
    onArtifact: (artifact) => {
      if (activeRun) activeRun.artifacts.push(artifact);
      emit('artifact', { artifact });
    },
    onFinding: (finding) => emit('finding', { finding }),
  });

  /** Ask the planner for a task DAG. */
  async function plan(goal, { signal }) {
    emit('phase', { phase: 'planning', goal });
    const { content } = await agentChat({
      messages: [
        { role: 'system', content: `${PLANNER_SYSTEM}\n\nAgents available:\n${describeRoster(roster)}` },
        { role: 'user', content: goal },
      ],
      responseFormat: { type: 'json_object' },
      model: plannerModel || model,
      signal,
      fetchImpl,
      apiBase,
    });

    const parsed = parsePlanJson(content);
    if (!parsed.ok) {
      // A planner that returns prose instead of JSON should not kill the run:
      // fall back to a single generalist task carrying the original goal,
      // which is the honest minimum interpretation of what was asked.
      emit('warning', { message: `${parsed.error} — falling back to a single task` });
      return {
        tasks: normalizePlan(
          { tasks: [{ id: 't1', agent: FALLBACK_AGENT_ID, title: 'Complete the request', instruction: goal }] },
          { agentIds: roster.map((a) => a.id) },
        ).tasks,
        warnings: [parsed.error],
      };
    }

    const { tasks, warnings } = normalizePlan(parsed.plan, {
      agentIds: roster.map((a) => a.id),
      fallbackAgentId: FALLBACK_AGENT_ID,
    });
    return { tasks, warnings };
  }

  /**
   * Run one task to completion: a bounded tool loop against its agent.
   *
   * @returns {Promise<{status: 'done'|'failed', output: string, error: string|null}>}
   */
  async function runTask(run, task, { signal }) {
    const agent = getAgent(roster, task.agentId);
    const deps = dependencyContext(run, task.id);

    const messages = [
      { role: 'system', content: agent.system },
      {
        role: 'user',
        content: buildTaskPrompt({ goal: run.goal, task, deps }),
      },
    ];

    let steps = 0;
    while (steps <= MAX_TOOL_STEPS) {
      if (signal?.aborted) throw new DOMException('Run cancelled', 'AbortError');

      const turn = await agentChat({
        messages,
        tools: agentToolNames(agent),
        model,
        signal,
        fetchImpl,
        apiBase,
      });

      if (!turn.toolCalls.length) {
        const output = turn.content.trim();
        if (!output) return { status: 'failed', output: '', error: 'Agent returned an empty response' };
        return { status: 'done', output, error: null };
      }

      // Keep the assistant turn (with its tool calls) in history — providers
      // reject a tool result whose originating call is not in the transcript.
      messages.push({
        role: 'assistant',
        content: turn.content || null,
        tool_calls: turn.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.args) },
        })),
      });

      for (const call of turn.toolCalls) {
        steps += 1;
        emit('tool', { runId: run.id, taskId: task.id, agentId: agent.id, tool: call.name, args: call.args });

        const result = call.parseError
          ? { ok: false, error: call.parseError }
          : await bus(agent, call, { taskId: task.id, signal });

        task.toolCalls.push({ name: call.name, ok: result?.ok !== false, at: Date.now() });
        emit('tool-result', {
          runId: run.id,
          taskId: task.id,
          agentId: agent.id,
          tool: call.name,
          ok: result?.ok !== false,
        });

        messages.push({ role: 'tool', tool_call_id: call.id, content: serializeToolResult(result) });
      }

      if (steps > MAX_TOOL_STEPS) {
        // Out of tool budget: give the model one final, tool-free turn so the
        // work it already did becomes an answer instead of being discarded.
        messages.push({
          role: 'user',
          content: 'Tool budget exhausted. Give your final answer now from what you already have, and state what you could not verify.',
        });
        const last = await agentChat({ messages, tools: [], model, signal, fetchImpl, apiBase });
        const output = last.content.trim();
        return output
          ? { status: 'done', output, error: null }
          : { status: 'failed', output: '', error: 'Agent exhausted its tool budget without producing an answer' };
      }
    }

    return { status: 'failed', output: '', error: 'Agent exceeded its step budget' };
  }

  /** Run a task with retry on transient failures. */
  async function runTaskWithRetry(run, task, { signal }) {
    let lastError = 'Task failed';
    for (let attempt = 1; attempt <= MAX_TASK_ATTEMPTS; attempt += 1) {
      try {
        return await runTask(run, task, { signal });
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        lastError = String(error?.message || error);
        const retryable = error instanceof AgentChatError ? error.retryable : true;
        if (!retryable || attempt === MAX_TASK_ATTEMPTS) break;
        emit('warning', { message: `Task "${task.id}" attempt ${attempt} failed (${lastError}) — retrying` });
        await sleep(600 * attempt, signal);
      }
    }
    return { status: 'failed', output: '', error: lastError };
  }

  /**
   * The scheduling pump.
   *
   * Loops until every task is terminal. Each pass fills free slots with ready
   * tasks, then waits for at least one in-flight task to settle before looking
   * again — a task finishing is the only thing that can make another ready, so
   * there is nothing to poll for and no timer involved.
   */
  async function execute(run, { signal }) {
    emit('phase', { phase: 'running', runId: run.id });
    const inFlight = new Map();
    const perAgent = new Map();

    const capacityFor = (agentId) => {
      const agent = getAgent(roster, agentId);
      const used = perAgent.get(agentId) || 0;
      return Math.max(0, (agent?.maxConcurrent ?? 2) - used);
    };

    while (!isRunComplete(run)) {
      if (signal?.aborted) throw new DOMException('Run cancelled', 'AbortError');

      const freeSlots = GLOBAL_CONCURRENCY - inFlight.size;
      if (freeSlots > 0) {
        for (const candidate of readyTasks(run)) {
          if (inFlight.size >= GLOBAL_CONCURRENCY) break;
          if (capacityFor(candidate.agentId) <= 0) continue;

          const task = startTask(run, candidate.id);
          if (!task) continue;
          perAgent.set(task.agentId, (perAgent.get(task.agentId) || 0) + 1);
          emit('task-start', { runId: run.id, task: snapshotTask(task) });

          const promise = runTaskWithRetry(run, task, { signal })
            .then((outcome) => ({ id: task.id, outcome }))
            .catch((error) => {
              if (error?.name === 'AbortError') throw error;
              return { id: task.id, outcome: { status: 'failed', output: '', error: String(error?.message || error) } };
            });
          inFlight.set(task.id, promise);
        }
      }

      if (!inFlight.size) {
        // Nothing running and nothing ready: everything left is unreachable
        // behind a failure. Settling them here is what turns a stalled graph
        // into a finished run.
        const stalled = run.tasks.filter((t) => t.state === 'queued');
        for (const task of stalled) {
          completeTask(run, task.id, { status: 'failed', error: 'Never became runnable — an upstream task did not complete' });
          emit('task-end', { runId: run.id, task: snapshotTask(task) });
        }
        break;
      }

      const settled = await Promise.race(inFlight.values());
      inFlight.delete(settled.id);
      const finished = run.tasks.find((t) => t.id === settled.id);
      perAgent.set(finished.agentId, Math.max(0, (perAgent.get(finished.agentId) || 1) - 1));

      const { blocked = [] } = completeTask(run, settled.id, settled.outcome) || {};
      emit('task-end', { runId: run.id, task: snapshotTask(finished), progress: runProgress(run) });
      for (const id of blocked) {
        emit('task-end', { runId: run.id, task: snapshotTask(run.tasks.find((t) => t.id === id)) });
      }
    }

    syncRunState(run);
    return run;
  }

  /**
   * Fold the run's outputs into one answer.
   *
   * Only LEAF outputs are summarized — a task whose output was already consumed
   * by a downstream task is represented by that downstream result, and
   * including both makes the briefing say everything twice.
   */
  async function report(run, { signal }) {
    const done = run.tasks.filter((t) => t.state === 'done');
    if (!done.length) return '';
    if (done.length === 1) return done[0].output;

    const consumed = new Set(run.tasks.flatMap((t) => (t.state === 'done' ? [] : t.dependsOn)));
    for (const task of run.tasks) {
      if (task.state === 'done') for (const dep of task.dependsOn) consumed.add(dep);
    }
    const leaves = done.filter((t) => !consumed.has(t.id));
    const source = leaves.length ? leaves : done;

    emit('phase', { phase: 'reporting', runId: run.id });
    const failed = run.tasks.filter((t) => t.state === 'failed' || t.state === 'blocked');
    const summarizer = getAgent(roster, 'summarizer');

    try {
      const { content } = await agentChat({
        messages: [
          { role: 'system', content: summarizer.system },
          {
            role: 'user',
            content: [
              `ORIGINAL GOAL:\n${run.goal}`,
              '',
              'COMPLETED WORK:',
              ...source.map((t) => `\n### ${t.title} (${t.agentId})\n${t.output}`),
              failed.length ? `\nDID NOT COMPLETE:\n${failed.map((t) => `- ${t.title}: ${t.error}`).join('\n')}` : '',
            ].join('\n'),
          },
        ],
        model,
        signal,
        fetchImpl,
        apiBase,
      });
      return content.trim();
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      // The work is done; only the fold failed. Return the raw outputs rather
      // than losing a completed run to a summarizer hiccup.
      emit('warning', { message: `Summary failed (${error.message}) — showing raw task output` });
      return source.map((t) => `### ${t.title}\n${t.output}`).join('\n\n');
    }
  }

  return {
    get roster() {
      return roster;
    },
    setCustomAgents(agents) {
      roster = resolveRoster(agents);
      emit('roster', { roster });
    },
    get run() {
      return activeRun;
    },
    isBusy: () => Boolean(activeRun && !['done', 'failed', 'cancelled'].includes(activeRun.state)),

    /**
     * Plan and execute a goal end to end.
     *
     * @param {string} goal
     * @returns {Promise<{run: object, summary: string}>}
     */
    async start(goal) {
      const text = String(goal || '').trim();
      if (!text) throw new Error('Give the swarm a goal first');
      if (activeRun && !['done', 'failed', 'cancelled'].includes(activeRun.state)) {
        throw new Error('A run is already in flight — stop it first');
      }

      abortController = new AbortController();
      const signal = abortController.signal;

      try {
        const { tasks, warnings } = await plan(text, { signal });
        activeRun = createRun({ goal: text, tasks, warnings });
        emit('run-start', { run: snapshotRun(activeRun) });
        for (const warning of warnings) emit('warning', { message: warning });

        if (!tasks.length) {
          activeRun.state = 'failed';
          emit('run-end', { run: snapshotRun(activeRun), summary: '' });
          return { run: activeRun, summary: 'The planner produced no tasks.' };
        }

        await execute(activeRun, { signal });
        const summary = await report(activeRun, { signal });
        activeRun.summary = summary;
        emit('run-end', { run: snapshotRun(activeRun), summary });
        return { run: activeRun, summary };
      } catch (error) {
        if (error?.name === 'AbortError') {
          if (activeRun) {
            cancelRun(activeRun);
            emit('run-end', { run: snapshotRun(activeRun), summary: '', cancelled: true });
          }
          return { run: activeRun, summary: '' };
        }
        if (activeRun) {
          activeRun.state = 'failed';
          emit('run-end', { run: snapshotRun(activeRun), summary: '', error: String(error?.message || error) });
        }
        emit('error', { message: String(error?.message || error) });
        throw error;
      } finally {
        abortController = null;
      }
    },

    /** Cancel the in-flight run. */
    stop() {
      abortController?.abort();
      if (activeRun && !['done', 'failed', 'cancelled'].includes(activeRun.state)) {
        cancelRun(activeRun);
        emit('run-end', { run: snapshotRun(activeRun), summary: '', cancelled: true });
      }
    },
  };
}

/** The prompt a worker agent sees for its task. */
export function buildTaskPrompt({ goal, task, deps = [] }) {
  const lines = [
    `OVERALL GOAL (context only — do not try to do all of it):\n${goal}`,
    '',
    `YOUR TASK:\n${task.instruction}`,
  ];
  if (deps.length) {
    lines.push('', 'OUTPUT FROM THE TASKS YOU DEPEND ON:');
    for (const dep of deps) {
      lines.push(`\n--- ${dep.title} ---\n${typeof dep.output === 'string' ? dep.output : JSON.stringify(dep.output)}`);
    }
  }
  lines.push(
    '',
    'Complete only YOUR task. When you are finished, reply with the result itself — not a description of what you did.',
  );
  return lines.join('\n');
}

function snapshotTask(task) {
  if (!task) return null;
  const { id, agentId, title, state, error, attempts, dependsOn } = task;
  return { id, agentId, title, state, error, attempts, dependsOn: [...dependsOn] };
}

function snapshotRun(run) {
  return {
    id: run.id,
    goal: run.goal,
    state: run.state,
    tasks: run.tasks.map(snapshotTask),
    progress: runProgress(run),
  };
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Run cancelled', 'AbortError'));
    }, { once: true });
  });
}

export { ALL_TOOL_NAMES };

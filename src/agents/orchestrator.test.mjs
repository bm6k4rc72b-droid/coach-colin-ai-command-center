import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrchestrator, buildTaskPrompt } from './orchestrator.js';
import { parsePlanJson, normalizeToolCall } from './llmClient.js';

/**
 * A scripted stand-in for the agent proxy.
 *
 * `handler` receives the parsed request body and returns the response body, so
 * a test can drive a whole multi-agent run — planner turn, worker turns, tool
 * calls and the summary — with no network and no API key.
 */
function fakeProxy(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = String(url);
    const body = init?.body ? JSON.parse(init.body) : {};
    calls.push({ path, body });
    const result = await handler(path, body, calls.length);
    const status = result?.__status || 200;
    const payload = { ...result };
    delete payload.__status;
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { fetchImpl, calls };
}

const jsonPlan = (tasks) => ({ content: JSON.stringify({ tasks }), tool_calls: [] });
const reply = (text) => ({ content: text, tool_calls: [] });

/** Route a request by whether it is the planner turn, a worker turn, or the summary. */
function scriptRun({ plan, workers, summary = 'FINAL SUMMARY' }) {
  let planned = false;
  return fakeProxy((path, body) => {
    if (path.endsWith('/agent-chat')) {
      if (!planned) {
        planned = true;
        return jsonPlan(plan);
      }
      const user = body.messages.find((m) => m.role === 'user')?.content || '';
      // The summary turn is the one carrying the original goal header.
      if (user.startsWith('ORIGINAL GOAL:')) return reply(summary);
      for (const [match, response] of Object.entries(workers)) {
        if (user.includes(match)) {
          return typeof response === 'function' ? response(body) : reply(response);
        }
      }
      return reply('unmatched worker turn');
    }
    return { results: [] };
  });
}

test('a goal is planned, executed in dependency order, and summarized', async () => {
  const order = [];
  const { fetchImpl } = scriptRun({
    plan: [
      { id: 'r1', agent: 'researcher', title: 'Research', instruction: 'RESEARCH_STEP' },
      { id: 'w1', agent: 'writer', title: 'Write', instruction: 'WRITE_STEP', dependsOn: ['r1'] },
    ],
    workers: {
      RESEARCH_STEP: () => {
        order.push('research');
        return reply('found three things');
      },
      WRITE_STEP: (body) => {
        order.push('write');
        const user = body.messages.find((m) => m.role === 'user').content;
        // The writer must actually receive the researcher's output.
        assert.match(user, /found three things/);
        return reply('the finished piece');
      },
    },
  });

  const orchestrator = createOrchestrator({ fetchImpl });
  const { run, summary } = await orchestrator.start('write me something');

  assert.deepEqual(order, ['research', 'write']);
  assert.equal(run.state, 'done');
  assert.equal(summary, 'FINAL SUMMARY');
  assert.deepEqual(run.tasks.map((t) => t.state), ['done', 'done']);
});

test('independent tasks run concurrently rather than being serialized', async () => {
  let inFlight = 0;
  let peak = 0;
  const { fetchImpl } = scriptRun({
    plan: [
      { id: 'a', agent: 'researcher', title: 'A', instruction: 'TASK_A' },
      { id: 'b', agent: 'researcher', title: 'B', instruction: 'TASK_B' },
      { id: 'c', agent: 'researcher', title: 'C', instruction: 'TASK_C' },
    ],
    workers: {
      TASK_: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 10));
        inFlight -= 1;
        return reply('done');
      },
    },
  });

  const orchestrator = createOrchestrator({ fetchImpl });
  const { run } = await orchestrator.start('three independent things');
  assert.equal(run.tasks.filter((t) => t.state === 'done').length, 3);
  assert.ok(peak > 1, `expected parallel execution, peak concurrency was ${peak}`);
});

test('an agent capped at one task never runs two at once', async () => {
  let inFlight = 0;
  let peak = 0;
  const { fetchImpl } = scriptRun({
    plan: [
      { id: 'a', agent: 'geo-analyst', title: 'A', instruction: 'GEO_A' },
      { id: 'b', agent: 'geo-analyst', title: 'B', instruction: 'GEO_B' },
    ],
    workers: {
      GEO_: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 10));
        inFlight -= 1;
        return reply('flown');
      },
    },
  });

  const orchestrator = createOrchestrator({ fetchImpl });
  await orchestrator.start('two map jobs');
  // Two flights at once would fight over the single camera.
  assert.equal(peak, 1, `geo-analyst ran ${peak} tasks concurrently`);
});

test('a worker tool call is executed and its result fed back to the model', async () => {
  const gevCalls = [];
  let turn = 0;
  const { fetchImpl } = scriptRun({
    plan: [{ id: 'g1', agent: 'geo-analyst', title: 'Fly', instruction: 'FLY_STEP' }],
    workers: {
      FLY_STEP: (body) => {
        turn += 1;
        if (turn === 1) {
          return {
            content: '',
            tool_calls: [{
              id: 'call_1',
              type: 'function',
              function: { name: 'fly_to_location', arguments: JSON.stringify({ query: 'Kyoto' }) },
            }],
          };
        }
        // Second turn must see the tool result in the transcript.
        const toolMsg = body.messages.find((m) => m.role === 'tool');
        assert.ok(toolMsg, 'tool result must be sent back to the model');
        assert.match(toolMsg.content, /Kyoto/);
        return reply('Arrived over Kyoto');
      },
    },
  });

  const orchestrator = createOrchestrator({
    fetchImpl,
    runGevAction: async (name, args) => {
      gevCalls.push([name, args]);
      return { ok: true, action: name, arrived: args.query };
    },
  });

  const { run } = await orchestrator.start('fly to Kyoto');
  assert.deepEqual(gevCalls, [['fly_to_location', { query: 'Kyoto' }]]);
  assert.equal(run.tasks[0].state, 'done');
  assert.equal(run.tasks[0].toolCalls.length, 1);
});

test('one failed task blocks its dependents but does not sink the run', async () => {
  const { fetchImpl } = scriptRun({
    plan: [
      { id: 'a', agent: 'researcher', title: 'Fails', instruction: 'FAIL_STEP' },
      { id: 'b', agent: 'writer', title: 'Downstream', instruction: 'DOWNSTREAM', dependsOn: ['a'] },
      { id: 'c', agent: 'researcher', title: 'Independent', instruction: 'INDEPENDENT' },
    ],
    workers: {
      FAIL_STEP: () => ({ __status: 400, error: 'model refused' }),
      DOWNSTREAM: () => reply('should never run'),
      INDEPENDENT: () => reply('independent result'),
    },
  });

  const orchestrator = createOrchestrator({ fetchImpl });
  const { run } = await orchestrator.start('mixed outcome');

  const byId = Object.fromEntries(run.tasks.map((t) => [t.id, t]));
  assert.equal(byId.a.state, 'failed');
  assert.equal(byId.b.state, 'blocked');
  // The unrelated branch still delivers.
  assert.equal(byId.c.state, 'done');
  assert.equal(run.state, 'done');
});

test('a non-JSON planner response degrades to a single task instead of failing', async () => {
  let planned = false;
  const { fetchImpl } = fakeProxy((path, body) => {
    if (!planned) {
      planned = true;
      return reply('Sure! I would start by researching the topic…');
    }
    const user = body.messages.find((m) => m.role === 'user')?.content || '';
    if (user.startsWith('ORIGINAL GOAL:')) return reply('summary');
    return reply('handled it anyway');
  });

  const orchestrator = createOrchestrator({ fetchImpl });
  const { run } = await orchestrator.start('do the thing');

  assert.equal(run.tasks.length, 1);
  assert.equal(run.tasks[0].state, 'done');
  // The fallback task must carry the operator's actual goal.
  assert.match(run.tasks[0].instruction, /do the thing/);
  assert.ok(run.warnings.length > 0);
});

test('a transient proxy failure is retried; a hard rejection is not', async () => {
  let attempts = 0;
  const { fetchImpl } = scriptRun({
    plan: [{ id: 'a', agent: 'researcher', title: 'Flaky', instruction: 'FLAKY' }],
    workers: {
      FLAKY: () => {
        attempts += 1;
        // 503 is retryable; the retry succeeds.
        if (attempts === 1) return { __status: 503, error: 'upstream busy' };
        return reply('worked on the retry');
      },
    },
  });

  const orchestrator = createOrchestrator({ fetchImpl });
  const { run } = await orchestrator.start('flaky job');
  assert.equal(attempts, 2);
  assert.equal(run.tasks[0].state, 'done');
});

test('a run emits the events the console and orbit render from', async () => {
  const events = [];
  const { fetchImpl } = scriptRun({
    plan: [{ id: 'a', agent: 'researcher', title: 'Only', instruction: 'ONLY' }],
    workers: { ONLY: () => reply('result') },
  });

  const orchestrator = createOrchestrator({ fetchImpl, onEvent: (e) => events.push(e.type) });
  await orchestrator.start('anything');

  for (const expected of ['phase', 'run-start', 'task-start', 'task-end', 'run-end']) {
    assert.ok(events.includes(expected), `missing "${expected}" event; got ${events.join(', ')}`);
  }
});

test('a listener that throws does not take the run down', async () => {
  const { fetchImpl } = scriptRun({
    plan: [{ id: 'a', agent: 'researcher', title: 'Only', instruction: 'ONLY' }],
    workers: { ONLY: () => reply('result') },
  });
  const orchestrator = createOrchestrator({
    fetchImpl,
    onEvent: () => { throw new Error('bad listener'); },
  });
  const { run } = await orchestrator.start('anything');
  assert.equal(run.state, 'done');
});

test('artifacts written by an agent are collected on the run', async () => {
  let turn = 0;
  const { fetchImpl } = scriptRun({
    plan: [{ id: 'w', agent: 'writer', title: 'Write', instruction: 'WRITE' }],
    workers: {
      WRITE: () => {
        turn += 1;
        if (turn === 1) {
          return {
            content: '',
            tool_calls: [{
              id: 'c1',
              type: 'function',
              function: {
                name: 'write_artifact',
                arguments: JSON.stringify({ title: 'Brief', content: '# Heading\nBody' }),
              },
            }],
          };
        }
        return reply('wrote the brief');
      },
    },
  });

  const orchestrator = createOrchestrator({ fetchImpl });
  const { run } = await orchestrator.start('write a brief');
  assert.equal(run.artifacts.length, 1);
  assert.equal(run.artifacts[0].title, 'Brief');
  assert.match(run.artifacts[0].content, /Heading/);
});

test('a second run is refused while one is in flight', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { fetchImpl } = scriptRun({
    plan: [{ id: 'a', agent: 'researcher', title: 'Slow', instruction: 'SLOW' }],
    workers: { SLOW: async () => { await gate; return reply('done'); } },
  });

  const orchestrator = createOrchestrator({ fetchImpl });
  const first = orchestrator.start('first goal');
  // Let the planner turn settle so the run is genuinely in flight.
  await new Promise((r) => setTimeout(r, 20));
  await assert.rejects(() => orchestrator.start('second goal'), /already in flight/);
  release();
  await first;
});

test('an empty goal is refused before any model call', async () => {
  const { fetchImpl, calls } = fakeProxy(() => reply('should not happen'));
  const orchestrator = createOrchestrator({ fetchImpl });
  await assert.rejects(() => orchestrator.start('   '), /goal/);
  assert.equal(calls.length, 0);
});

test('parsePlanJson tolerates a fenced JSON block', () => {
  const fenced = '```json\n{"tasks":[{"id":"t1"}]}\n```';
  const parsed = parsePlanJson(fenced);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.plan.tasks[0].id, 't1');
});

test('malformed tool arguments become a readable error, not an exception', () => {
  const call = normalizeToolCall({
    id: 'x',
    function: { name: 'fly_to_location', arguments: '{query: Paris' },
  });
  assert.equal(call.name, 'fly_to_location');
  assert.deepEqual(call.args, {});
  assert.match(call.parseError, /not valid JSON/);
});

test('a task prompt carries the goal, the task, and only its dependencies', () => {
  const prompt = buildTaskPrompt({
    goal: 'THE GOAL',
    task: { instruction: 'THE TASK' },
    deps: [{ title: 'Upstream', output: 'UPSTREAM OUTPUT' }],
  });
  assert.match(prompt, /THE GOAL/);
  assert.match(prompt, /THE TASK/);
  assert.match(prompt, /UPSTREAM OUTPUT/);
  // The worker must be told not to attempt the whole goal.
  assert.match(prompt, /do not try to do all of it/i);
});

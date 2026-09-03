import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePlan,
  breakCycles,
  createRun,
  readyTasks,
  startTask,
  completeTask,
  isRunComplete,
  runProgress,
  dependencyContext,
  syncRunState,
  cancelRun,
  taskDepths,
} from './taskGraph.js';

const AGENTS = ['generalist', 'researcher', 'writer', 'geo-analyst'];

function plan(tasks) {
  return normalizePlan({ tasks }, { agentIds: AGENTS, fallbackAgentId: 'generalist' });
}

test('normalizePlan repairs a malformed plan instead of rejecting it', () => {
  const { tasks, warnings } = plan([
    { id: 't1', agent: 'researcher', title: 'Look it up', instruction: 'Search' },
    { id: 't1', agent: 'nope', title: 'Duplicate id and unknown agent' },
    { id: 't3', agent: 'writer', title: 'Write', dependsOn: ['t1', 'ghost', 't3'] },
  ]);

  assert.equal(tasks.length, 3);
  // Duplicate id renamed rather than dropped — the work survives.
  assert.deepEqual(tasks.map((t) => t.id), ['t1', 't2', 't3']);
  // Unknown agent falls back rather than failing the plan.
  assert.equal(tasks[1].agentId, 'generalist');
  // Dangling and self edges dropped, real edge kept.
  assert.deepEqual(tasks[2].dependsOn, ['t1']);

  assert.ok(warnings.some((w) => w.includes('Duplicate task id')));
  assert.ok(warnings.some((w) => w.includes('unknown agent') || w.includes('Unknown agent')));
  assert.ok(warnings.some((w) => w.includes('unknown task "ghost"')));
  assert.ok(warnings.some((w) => w.includes('depended on itself')));
});

test('normalizePlan reports an empty plan rather than inventing tasks', () => {
  const { tasks, warnings } = plan([]);
  assert.deepEqual(tasks, []);
  assert.deepEqual(warnings, ['Planner returned no tasks']);
});

test('breakCycles leaves the graph acyclic so the scheduler cannot deadlock', () => {
  const tasks = [
    { id: 'a', dependsOn: ['c'] },
    { id: 'b', dependsOn: ['a'] },
    { id: 'c', dependsOn: ['b'] },
  ];
  const dropped = breakCycles(tasks);
  assert.equal(dropped.length, 1);

  // Proof of acyclicity: a topological sweep must consume every task.
  const done = new Set();
  for (let pass = 0; pass < tasks.length; pass += 1) {
    for (const task of tasks) {
      if (!done.has(task.id) && task.dependsOn.every((d) => done.has(d))) done.add(task.id);
    }
  }
  assert.equal(done.size, 3);
});

test('a task is ready only once every dependency has SUCCEEDED', () => {
  const { tasks } = plan([
    { id: 'a', agent: 'researcher', title: 'A' },
    { id: 'b', agent: 'researcher', title: 'B' },
    { id: 'c', agent: 'writer', title: 'C', dependsOn: ['a', 'b'] },
  ]);
  const run = createRun({ goal: 'test', tasks });

  assert.deepEqual(readyTasks(run).map((t) => t.id), ['a', 'b']);

  startTask(run, 'a');
  completeTask(run, 'a', { status: 'done', output: 'A output' });
  // b is still queued, so c must not be runnable.
  assert.deepEqual(readyTasks(run).map((t) => t.id), ['b']);

  startTask(run, 'b');
  completeTask(run, 'b', { status: 'done', output: 'B output' });
  assert.deepEqual(readyTasks(run).map((t) => t.id), ['c']);
});

test('readyTasks honours the scheduler slot limit', () => {
  const { tasks } = plan([
    { id: 'a', agent: 'researcher', title: 'A' },
    { id: 'b', agent: 'researcher', title: 'B' },
    { id: 'c', agent: 'researcher', title: 'C' },
  ]);
  const run = createRun({ goal: 'test', tasks });
  assert.equal(readyTasks(run, 2).length, 2);
  assert.equal(readyTasks(run, 0).length, 0);
});

test('a failure blocks its dependents transitively and does not mark them failed', () => {
  const { tasks } = plan([
    { id: 'a', agent: 'researcher', title: 'A' },
    { id: 'b', agent: 'writer', title: 'B', dependsOn: ['a'] },
    { id: 'c', agent: 'writer', title: 'C', dependsOn: ['b'] },
    { id: 'd', agent: 'researcher', title: 'D' },
  ]);
  const run = createRun({ goal: 'test', tasks });

  startTask(run, 'a');
  const { blocked } = completeTask(run, 'a', { status: 'failed', error: 'network down' });

  assert.deepEqual(blocked.sort(), ['b', 'c']);
  // Blocked is distinct from failed: one upstream error must not read as three.
  assert.equal(run.tasks.find((t) => t.id === 'b').state, 'blocked');
  assert.equal(run.tasks.find((t) => t.id === 'c').state, 'blocked');
  // An independent branch is untouched.
  assert.equal(run.tasks.find((t) => t.id === 'd').state, 'queued');
  assert.equal(runProgress(run).failed, 1);
  assert.equal(runProgress(run).blocked, 2);
});

test('a run with any success is done, not failed', () => {
  const { tasks } = plan([
    { id: 'a', agent: 'researcher', title: 'A' },
    { id: 'b', agent: 'researcher', title: 'B' },
  ]);
  const run = createRun({ goal: 'test', tasks });
  startTask(run, 'a');
  completeTask(run, 'a', { status: 'done', output: 'ok' });
  startTask(run, 'b');
  completeTask(run, 'b', { status: 'failed', error: 'boom' });

  assert.ok(isRunComplete(run));
  // Partial output is still output — reporting the whole run as failed hides it.
  assert.equal(run.state, 'done');
});

test('a run where everything failed is failed', () => {
  const { tasks } = plan([{ id: 'a', agent: 'researcher', title: 'A' }]);
  const run = createRun({ goal: 'test', tasks });
  startTask(run, 'a');
  completeTask(run, 'a', { status: 'failed', error: 'boom' });
  assert.equal(run.state, 'failed');
});

test('a task only sees the output of what it depends on', () => {
  const { tasks } = plan([
    { id: 'a', agent: 'researcher', title: 'A' },
    { id: 'b', agent: 'researcher', title: 'B' },
    { id: 'c', agent: 'writer', title: 'C', dependsOn: ['a'] },
  ]);
  const run = createRun({ goal: 'test', tasks });
  startTask(run, 'a');
  completeTask(run, 'a', { status: 'done', output: 'A output' });
  startTask(run, 'b');
  completeTask(run, 'b', { status: 'done', output: 'B output' });

  const context = dependencyContext(run, 'c');
  assert.equal(context.length, 1);
  assert.equal(context[0].taskId, 'a');
  assert.equal(context[0].output, 'A output');
});

test('startTask refuses a task that is not queued, so no task runs twice', () => {
  const { tasks } = plan([{ id: 'a', agent: 'researcher', title: 'A' }]);
  const run = createRun({ goal: 'test', tasks });
  assert.ok(startTask(run, 'a'));
  assert.equal(startTask(run, 'a'), null);
  assert.equal(run.tasks[0].attempts, 1);
});

test('completeTask ignores a task that already settled', () => {
  const { tasks } = plan([{ id: 'a', agent: 'researcher', title: 'A' }]);
  const run = createRun({ goal: 'test', tasks });
  startTask(run, 'a');
  completeTask(run, 'a', { status: 'done', output: 'first' });
  assert.equal(completeTask(run, 'a', { status: 'failed', error: 'late' }), null);
  assert.equal(run.tasks[0].output, 'first');
});

test('cancelRun settles everything still in flight', () => {
  const { tasks } = plan([
    { id: 'a', agent: 'researcher', title: 'A' },
    { id: 'b', agent: 'writer', title: 'B', dependsOn: ['a'] },
  ]);
  const run = createRun({ goal: 'test', tasks });
  startTask(run, 'a');
  cancelRun(run);
  assert.equal(run.state, 'cancelled');
  assert.ok(isRunComplete(run));
  // A cancelled run must not be re-derived into done/failed by a later sync.
  syncRunState(run);
  assert.equal(run.state, 'cancelled');
});

test('taskDepths ranks tasks by distance from the roots', () => {
  const { tasks } = plan([
    { id: 'a', agent: 'researcher', title: 'A' },
    { id: 'b', agent: 'researcher', title: 'B', dependsOn: ['a'] },
    { id: 'c', agent: 'writer', title: 'C', dependsOn: ['a', 'b'] },
  ]);
  const depths = taskDepths(tasks);
  assert.equal(depths.get('a'), 0);
  assert.equal(depths.get('b'), 1);
  assert.equal(depths.get('c'), 2);
});

test('plans are capped so a runaway planner cannot spawn unbounded work', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ id: `t${i}`, agent: 'researcher', title: `T${i}` }));
  const { tasks, warnings } = plan(many);
  assert.equal(tasks.length, 40);
  assert.ok(warnings.some((w) => w.includes('truncated')));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToolBus, checkToolGrant, ALL_TOOL_NAMES, GEV_TOOL_NAMES, isGevTool } from './toolBus.js';
import { BUILTIN_AGENTS, getAgent, resolveRoster, validateCustomAgent, agentToolNames } from './agentRoster.js';

const roster = resolveRoster();
const researcher = getAgent(roster, 'researcher');
const geo = getAgent(roster, 'geo-analyst');
const writer = getAgent(roster, 'writer');

test('the allowlist is enforced, not merely advertised', async () => {
  let flew = false;
  const bus = createToolBus({ runGevAction: async () => { flew = true; return { ok: true }; } });

  // The Writer has no globe grant; a hallucinated call must not move the camera.
  const result = await bus(writer, { name: 'fly_to_location', args: { query: 'Paris' } }, {});
  assert.equal(result.ok, false);
  assert.equal(result.refused, true);
  assert.equal(flew, false, 'an ungranted tool must never reach the action runner');
  // The refusal names what the agent CAN do, so the model can recover.
  assert.match(result.error, /not granted/);
});

test('a refusal is returned as a result, never thrown', async () => {
  const bus = createToolBus({});
  const result = await bus(writer, { name: 'no_such_tool', args: {} }, {});
  assert.equal(result.ok, false);
  assert.match(result.error, /No such tool/);
});

test('a granted globe tool reaches the action runner with its arguments', async () => {
  const calls = [];
  const bus = createToolBus({
    runGevAction: async (name, args) => {
      calls.push([name, args]);
      return { ok: true, action: name };
    },
  });
  const result = await bus(geo, { name: 'fly_to_location', args: { query: 'Reykjavik' } }, {});
  assert.deepEqual(calls, [['fly_to_location', { query: 'Reykjavik' }]]);
  assert.equal(result.ok, true);
});

test('globe tools degrade honestly when the map is not up', async () => {
  const bus = createToolBus({ runGevAction: null });
  const result = await bus(geo, { name: 'zoom_to_globe', args: {} }, {});
  assert.equal(result.ok, false);
  assert.match(result.error, /not ready/);
});

test('a throwing action runner becomes a readable tool error, not a crash', async () => {
  const bus = createToolBus({
    runGevAction: async () => { throw new Error('Unknown data layer: banana'); },
  });
  const result = await bus(geo, { name: 'set_layer_visibility', args: { layerId: 'banana' } }, {});
  assert.equal(result.ok, false);
  assert.match(result.error, /banana/);
});

test('every agent may record findings and write artifacts', async () => {
  const artifacts = [];
  const findings = [];
  const bus = createToolBus({
    onArtifact: (a) => artifacts.push(a),
    onFinding: (f) => findings.push(f),
  });

  for (const agent of BUILTIN_AGENTS) {
    assert.equal(
      (await bus(agent, { name: 'record_finding', args: { finding: 'x', source: 'y' } }, {})).ok,
      true,
      `${agent.id} must be able to record a finding`,
    );
  }
  assert.equal(findings.length, BUILTIN_AGENTS.length);

  const saved = await bus(writer, {
    name: 'write_artifact',
    args: { title: 'Brief', content: 'Body text', format: 'markdown' },
  }, { taskId: 't1' });
  assert.equal(saved.ok, true);
  assert.equal(artifacts[0].title, 'Brief');
  assert.equal(artifacts[0].taskId, 't1');
});

test('artifact and finding tools reject empty content', async () => {
  const bus = createToolBus({});
  assert.equal((await bus(writer, { name: 'write_artifact', args: { title: 'x', content: '  ' } }, {})).ok, false);
  assert.equal((await bus(writer, { name: 'record_finding', args: { finding: '' } }, {})).ok, false);
});

test('web_fetch refuses a non-http target before any request is made', async () => {
  let called = false;
  const bus = createToolBus({ fetchImpl: async () => { called = true; return new Response('{}'); } });
  const result = await bus(researcher, { name: 'web_fetch', args: { url: 'file:///etc/passwd' } }, {});
  assert.equal(result.ok, false);
  assert.equal(called, false);
});

test('web_search reports proxy failure honestly rather than as empty results', async () => {
  const bus = createToolBus({
    fetchImpl: async () => new Response(JSON.stringify({ error: 'Web search is unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    }),
  });
  const result = await bus(researcher, { name: 'web_search', args: { query: 'anything' } }, {});
  assert.equal(result.ok, false);
  // An agent told "no results" would report the web is silent on the topic.
  assert.match(result.error, /unavailable/);
  assert.equal(result.results, undefined);
});

test('web_search passes the query through and returns results', async () => {
  const seen = [];
  const bus = createToolBus({
    fetchImpl: async (url, init) => {
      seen.push([url, JSON.parse(init.body)]);
      return new Response(JSON.stringify({ results: [{ title: 'T', url: 'https://e.com', snippet: 'S' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  const result = await bus(researcher, { name: 'web_search', args: { query: 'wildfires', limit: 3 } }, {});
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 1);
  assert.equal(seen[0][1].query, 'wildfires');
  assert.equal(seen[0][1].limit, 3);
});

test('camera-owning agents are pinned to one task at a time', () => {
  // Two concurrent flights would fight over a single camera and produce a
  // useless run, so this is a correctness constraint, not a perf tweak.
  assert.equal(getAgent(roster, 'geo-analyst').maxConcurrent, 1);
  assert.equal(getAgent(roster, 'recon').maxConcurrent, 1);
});

test('withheld globe tools stay off the agent surface', () => {
  // Tools that seize an output device without a human present are excluded.
  for (const withheld of ['control_radio', 'control_scene']) {
    assert.equal(GEV_TOOL_NAMES.includes(withheld), false, `${withheld} must not be agent-callable`);
    for (const agent of BUILTIN_AGENTS) {
      assert.equal(agentToolNames(agent).includes(withheld), false);
    }
  }
});

test('every tool named on a built-in agent is one the bus can route', () => {
  for (const agent of BUILTIN_AGENTS) {
    for (const tool of agentToolNames(agent)) {
      assert.ok(ALL_TOOL_NAMES.includes(tool), `${agent.id} names unroutable tool ${tool}`);
      assert.equal(checkToolGrant(agent, tool).allowed, true);
    }
  }
});

test('isGevTool separates globe tools from generic ones', () => {
  assert.equal(isGevTool('fly_to_location'), true);
  assert.equal(isGevTool('web_search'), false);
});

test('a custom agent cannot grant itself a tool that does not exist', () => {
  const bad = validateCustomAgent(
    { id: 'rogue', label: 'Rogue', system: 'You do whatever you want, at length.', tools: ['launch_missiles'] },
    { knownTools: ALL_TOOL_NAMES },
  );
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.includes('launch_missiles')));

  const good = validateCustomAgent(
    { id: 'scout', label: 'Scout', system: 'You scout things thoroughly and report back.', tools: ['web_search'] },
    { knownTools: ALL_TOOL_NAMES },
  );
  assert.equal(good.ok, true);
  assert.equal(good.agent.maxConcurrent, 2);
  assert.equal(good.agent.custom, true);
});

test('a custom agent replaces a built-in of the same id', () => {
  const custom = validateCustomAgent(
    { id: 'researcher', label: 'My Researcher', system: 'You research exactly how I want you to.', tools: [] },
    { knownTools: ALL_TOOL_NAMES },
  ).agent;
  const merged = resolveRoster([custom]);
  assert.equal(merged.filter((a) => a.id === 'researcher').length, 1);
  assert.equal(getAgent(merged, 'researcher').label, 'My Researcher');
  // Replacing one agent must not drop the rest of the roster.
  assert.equal(merged.length, BUILTIN_AGENTS.length);
});

test('an unknown agent id resolves to the generalist rather than undefined', () => {
  assert.equal(getAgent(roster, 'does-not-exist').id, 'generalist');
});

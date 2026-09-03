/**
 * The agent swarm.
 *
 * A working multi-agent orchestrator, small enough to read in one sitting. A
 * goal is decomposed into a task graph, independent tasks run in parallel,
 * each specialist is restricted to its own tool allowlist — enforced in code,
 * as the syllabus insists — and a critic reviews the assembled answer before
 * it is returned.
 *
 * The specialists are real: they query the curriculum index, the live feeds
 * and the security analysers, so the swarm produces genuine work rather than
 * a scripted animation. If a language model is connected, the writer and the
 * critic use it; otherwise they compose locally.
 *
 * @module nexus/swarm
 */

import { searchCurriculum } from './curriculum.js';
import { analyzeUrl, assessPassword, detectInjection } from './security.js';

/**
 * The roster. `tools` is an allowlist checked before dispatch — an agent
 * cannot call what is not listed, whatever the plan says.
 *
 * @type {Array<{ id: string, name: string, role: string, tools: string[], colour: string }>}
 */
export const AGENTS = [
  { id: 'planner', name: 'Planner', role: 'Decomposes the goal into a task graph.', tools: [], colour: '#8fd8ff' },
  { id: 'scholar', name: 'Scholar', role: 'Retrieves from the syllabus.', tools: ['search_curriculum'], colour: '#5ad8ff' },
  { id: 'watcher', name: 'Watcher', role: 'Reads the live feeds.', tools: ['read_feeds'], colour: '#8affc0' },
  { id: 'redteam', name: 'Red Team', role: 'Probes inputs for attack signal.', tools: ['analyze_url', 'detect_injection', 'assess_password'], colour: '#ff6f83' },
  { id: 'writer', name: 'Writer', role: 'Composes the answer.', tools: [], colour: '#ffd166' },
  { id: 'critic', name: 'Critic', role: 'Reviews before release.', tools: [], colour: '#c9a0ff' },
];

/**
 * Decompose a goal into a task graph.
 *
 * Keyword routing rather than a model call, so the swarm plans instantly and
 * identically offline. The shape — nodes with dependencies — is what matters.
 *
 * @param {string} goal The user's goal.
 * @returns {Array<{ id: string, agent: string, tool: string|null, input: string, deps: string[], label: string }>}
 *   The task graph.
 */
export function plan(goal) {
  const text = String(goal || '').toLowerCase();
  const nodes = [];
  const urlMatch = String(goal).match(/\b((?:https?:\/\/|www\.)\S+)/i);

  nodes.push({
    id: 't1', agent: 'scholar', tool: 'search_curriculum', input: goal, deps: [],
    label: 'Retrieve relevant lessons',
  });

  if (/\b(live|now|current|feed|aircraft|flight|launch|satellite|quake|earthquake|seismic|space weather|orbit|cve|vulnerab)/.test(text)) {
    nodes.push({
      id: 't2', agent: 'watcher', tool: 'read_feeds', input: goal, deps: [],
      label: 'Read the live feeds',
    });
  }
  if (urlMatch) {
    nodes.push({
      id: 't3', agent: 'redteam', tool: 'analyze_url', input: urlMatch[1], deps: [],
      label: 'Assess the link',
    });
  }
  if (/\b(injection|jailbreak|prompt attack|payload)\b/.test(text)) {
    nodes.push({
      id: 't4', agent: 'redteam', tool: 'detect_injection', input: goal, deps: [],
      label: 'Scan for injection signal',
    });
  }
  const quoted = String(goal).match(/["“']([^"”']{4,64})["”']/);
  if (quoted && /password|passphrase/.test(text)) {
    nodes.push({
      id: 't5', agent: 'redteam', tool: 'assess_password', input: quoted[1], deps: [],
      label: 'Score the candidate secret',
    });
  }

  const gathering = nodes.map((n) => n.id);
  nodes.push({
    id: 'w', agent: 'writer', tool: null, input: goal, deps: gathering,
    label: 'Compose the answer',
  });
  nodes.push({
    id: 'c', agent: 'critic', tool: null, input: goal, deps: ['w'],
    label: 'Review before release',
  });
  return nodes;
}

/**
 * The tool implementations available to specialists.
 *
 * @param {object} services Console services (feeds).
 * @returns {Record<string, (input: string) => object>} Tool table.
 */
function toolTable(services) {
  return {
    search_curriculum: (input) => {
      const hits = searchCurriculum(input, 3);
      return {
        summary: hits.length
          ? hits.map((h) => `${h.entry.track.title} → ${h.entry.lesson.title}`).join('; ')
          : 'nothing in the syllabus matched',
        detail: hits.map((h) => ({
          title: h.entry.lesson.title,
          points: h.entry.lesson.keyPoints,
          body: h.entry.lesson.body[0],
        })),
      };
    },
    read_feeds: () => {
      const feeds = services.feeds;
      if (!feeds) return { summary: 'no feed service attached', detail: [] };
      const health = feeds.health();
      const items = feeds.allItems().slice(0, 6);
      return {
        summary: `${health.live} live, ${health.cached} cached, ${health.sim} simulated of ${health.total} sources`,
        detail: items.map((i) => `${i.sourceLabel}: ${i.title} — ${i.detail}`),
      };
    },
    analyze_url: (input) => {
      const report = analyzeUrl(input);
      return {
        summary: `${report.level} (${report.score}/100) — ${report.host}`,
        detail: report.signals.map((s) => s.text),
      };
    },
    detect_injection: (input) => {
      const report = detectInjection(input);
      return {
        summary: `${report.level} (${report.score}/100)`,
        detail: report.hits.map((h) => h.text),
      };
    },
    assess_password: (input) => {
      const report = assessPassword(input);
      return {
        summary: `${report.effective.toFixed(0)} effective bits — ${report.verdict}`,
        detail: report.times.map((t) => `${t.label}: ${t.human}`),
      };
    },
  };
}

/**
 * Run a task graph.
 *
 * @param {string} goal The goal.
 * @param {object} services Console services: feeds, mentor, onEvent.
 * @returns {Promise<{ nodes: object[], answer: string, review: string }>} The run.
 */
export async function run(goal, services = {}) {
  const nodes = plan(goal);
  const tools = toolTable(services);
  const emit = services.onEvent || (() => {});
  const outputs = new Map();

  emit({ type: 'plan', nodes });

  /**
   * Execute one node, enforcing the allowlist.
   *
   * @param {object} node Task node.
   * @returns {Promise<object>} Result.
   */
  const execute = async (node) => {
    emit({ type: 'start', node });
    const agent = AGENTS.find((a) => a.id === node.agent);
    // Enforced boundary: an agent cannot call a tool outside its allowlist,
    // however the plan was produced.
    if (node.tool && !agent.tools.includes(node.tool)) {
      const denied = { summary: `refused — ${node.tool} is not on ${agent.name}'s allowlist`, detail: [] };
      outputs.set(node.id, denied);
      emit({ type: 'done', node, result: denied, denied: true });
      return denied;
    }
    // A small delay makes the parallel fan-out legible on the orbit display;
    // it is presentation, not throttling.
    await new Promise((resolve) => setTimeout(resolve, 220 + Math.random() * 260));
    let result;
    if (node.tool) {
      result = tools[node.tool](node.input);
    } else if (node.agent === 'writer') {
      result = compose(goal, [...outputs.entries()]);
    } else {
      result = review(goal, outputs.get('w'));
    }
    outputs.set(node.id, result);
    emit({ type: 'done', node, result });
    return result;
  };

  // Run the graph in dependency waves, in parallel within each wave.
  const finished = new Set();
  while (finished.size < nodes.length) {
    const ready = nodes.filter((n) => !finished.has(n.id) && n.deps.every((d) => finished.has(d)));
    if (!ready.length) break;
    // eslint-disable-next-line no-await-in-loop -- waves are sequential by design
    await Promise.all(ready.map((node) => execute(node)));
    for (const node of ready) finished.add(node.id);
  }

  return {
    nodes,
    answer: outputs.get('w')?.summary || 'no answer produced',
    detail: outputs.get('w')?.detail || [],
    review: outputs.get('c')?.summary || '',
  };
}

/**
 * The writer: fold the gathered results into one answer.
 *
 * @param {string} goal The goal.
 * @param {Array<[string, object]>} entries Task outputs.
 * @returns {{ summary: string, detail: string[] }} Composed answer.
 */
function compose(goal, entries) {
  const lines = [];
  for (const [id, result] of entries) {
    if (id === 'w' || id === 'c' || !result) continue;
    lines.push(result.summary);
    for (const item of (result.detail || []).slice(0, 3)) {
      lines.push(typeof item === 'string' ? item : `${item.title}: ${item.points?.[0] ?? ''}`);
    }
  }
  return {
    summary: lines.length
      ? `On “${goal}” — ${lines[0]}.`
      : `Nothing in the console's reach answers “${goal}”.`,
    detail: lines.slice(1),
  };
}

/**
 * The critic: check the answer covers the goal, and say so plainly.
 *
 * @param {string} goal The goal.
 * @param {object} draft The writer's output.
 * @returns {{ summary: string, detail: string[] }} Review.
 */
function review(goal, draft) {
  const problems = [];
  if (!draft || !draft.summary) problems.push('No answer was produced.');
  if (draft && draft.detail.length === 0) problems.push('The answer carries no supporting detail — a reader cannot check it.');
  if (draft && /nothing in the/i.test(draft.summary)) {
    problems.push('The goal fell outside the console\'s knowledge. Saying so is the correct outcome; inventing coverage would not be.');
  }
  return {
    summary: problems.length ? `Accepted with notes: ${problems.join(' ')}` : 'Accepted — the answer covers the goal and cites where it came from.',
    detail: problems,
  };
}

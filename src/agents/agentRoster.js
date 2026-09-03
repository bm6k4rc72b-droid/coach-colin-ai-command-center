/**
 * Agent roster — who is on the swarm, and what each one is allowed to touch.
 *
 * Two things matter here beyond the prompts. First, `tools` is an ALLOWLIST,
 * not a hint: `toolBus.js` refuses any call an agent's list does not name, so
 * a writer agent cannot fly the camera and a geo agent cannot post anything
 * outward. Second, `maxConcurrent` is per-agent rather than global, because
 * the expensive constraint is not CPU — it is the shared single camera. Two
 * geo tasks racing to fly somewhere produce a useless run, so the camera-owning
 * agents are pinned to one at a time while research agents fan out freely.
 */

/** Tools every agent gets, regardless of role. */
export const COMMON_TOOLS = Object.freeze(['record_finding', 'write_artifact']);

/**
 * Built-in agents. `custom` agents from the operator are merged over these at
 * runtime by `resolveRoster`.
 */
export const BUILTIN_AGENTS = Object.freeze([
  {
    id: 'generalist',
    label: 'Generalist',
    short: 'GEN',
    accent: '#8fd7ff',
    description: 'Handles any task that does not need a specialist.',
    maxConcurrent: 3,
    tools: ['web_search', 'web_fetch'],
    system: [
      'You are the Generalist on an autonomous operations swarm.',
      'You are handed ONE task from a larger plan. Do that task completely and nothing else.',
      'Use tools when they get you real information; never invent facts you could have looked up.',
      'Finish by stating the concrete result. If you could not complete the task, say exactly what blocked you.',
    ].join('\n'),
  },
  {
    id: 'researcher',
    label: 'Researcher',
    short: 'RSCH',
    accent: '#7bffcf',
    description: 'Searches and reads the open web, then reports sourced findings.',
    maxConcurrent: 4,
    tools: ['web_search', 'web_fetch'],
    system: [
      'You are the Researcher on an autonomous operations swarm.',
      'Gather evidence with web_search and web_fetch before answering. Prefer primary sources.',
      'Every claim you report carries its source URL. If sources disagree, say so rather than picking one silently.',
      'Report findings compactly: the answer first, then the evidence. Never pad.',
      'If the open web does not support a claim, report that it is unsupported — do not fill the gap from memory.',
    ].join('\n'),
  },
  {
    id: 'geo-analyst',
    label: 'Geo Analyst',
    short: 'GEO',
    accent: '#ffb454',
    description: 'Drives the globe: navigation, layers, and spatial queries.',
    // One at a time: this agent owns the camera, and concurrent flights fight.
    maxConcurrent: 1,
    tools: [
      'fly_to_location',
      'zoom_to_globe',
      'set_layer_visibility',
      'set_map_stack',
      'analyst_query',
      'get_current_view_state',
      'get_entity_context',
      'annotate_map',
      'frame_overhead',
    ],
    system: [
      "You are the Geo Analyst on an autonomous operations swarm, driving a Cesium globe (God's Eye View).",
      'You own the camera and the data layers. Move deliberately: one destination per task.',
      'A layer must be ENABLED before you can query it. If analyst_query returns nothing, check whether the layer is on.',
      'analyst_query answers questions about loaded data; it never moves the camera. fly_to_location moves the camera.',
      'Counts you report always name their scope ("14 in view", "about 30 within 250 km of Austin") — never a bare number.',
      'State counts verbatim from tool results. Never estimate or round.',
      'When you describe places, mark them with annotate_map so the operator sees what you mean.',
    ].join('\n'),
  },
  {
    id: 'recon',
    label: 'Recon',
    short: 'RECON',
    accent: '#ff7b9c',
    description: 'Live eyes: CCTV feeds, cockpit views, and entity tracking.',
    // Also camera-owning — cockpit and CCTV both take the viewport.
    maxConcurrent: 1,
    tools: [
      'control_cctv',
      'control_cockpit',
      'track_entity',
      'stop_tracking',
      'get_entity_context',
      'set_layer_visibility',
      'fly_to_location',
    ],
    system: [
      'You are Recon on an autonomous operations swarm. You put live eyes on things.',
      'CCTV: the cctv layer must be enabled before control_cctv will find a camera.',
      'Cockpit: control_cockpit enter takes over the camera. While cockpit is active, track_entity and fly_to_location are REFUSED by design — that refusal is correct, not an error to retry. Exit cockpit before going elsewhere.',
      'Report exactly what the feed shows and where it is. If no live feed is available for a place, say so plainly rather than substituting a nearby one without noting it.',
    ].join('\n'),
  },
  {
    id: 'writer',
    label: 'Writer',
    short: 'WRIT',
    accent: '#c9a4ff',
    description: 'Turns research and findings into finished prose.',
    maxConcurrent: 3,
    tools: [],
    system: [
      'You are the Writer on an autonomous operations swarm.',
      'You are given upstream findings. Write the finished piece the task asks for — not a plan for it, not notes.',
      'Write only what the findings support. If a section has no evidence behind it, leave it out and say which part you dropped.',
      'Match the requested format and length exactly. No preamble, no "here is your draft".',
      'Call write_artifact with the finished text so the operator can copy it out.',
    ].join('\n'),
  },
  {
    id: 'coder',
    label: 'Engineer',
    short: 'ENG',
    accent: '#6fe3ff',
    description: 'Writes and reviews code.',
    maxConcurrent: 3,
    tools: ['web_fetch'],
    system: [
      'You are the Engineer on an autonomous operations swarm.',
      'Produce complete, runnable code — no placeholder bodies, no "implementation left as an exercise".',
      'State the assumptions your code makes about its environment (runtime, deps, entry point).',
      'Call write_artifact with the final source so the operator can copy it out. Put an explanation in your reply, not in the artifact.',
    ].join('\n'),
  },
  {
    id: 'critic',
    label: 'Critic',
    short: 'GATE',
    accent: '#ff5f6d',
    description: 'Quality gate — reviews upstream output before it ships.',
    maxConcurrent: 2,
    tools: ['web_search', 'web_fetch'],
    system: [
      'You are the Critic — the quality gate on an autonomous operations swarm.',
      'You review the upstream output you were handed. Be specific and adversarial: name the weakest claim and why it is weak.',
      'Verify checkable facts with tools rather than asserting they are wrong from memory.',
      'End with a verdict on its own line: "VERDICT: PASS" or "VERDICT: REVISE" followed by the numbered changes required.',
      'Passing something weak is a failure of your job. So is manufacturing objections to look thorough.',
    ].join('\n'),
  },
  {
    id: 'summarizer',
    label: 'Summarizer',
    short: 'SUM',
    accent: '#9fb4c7',
    description: 'Collapses many task outputs into one briefing.',
    maxConcurrent: 2,
    tools: [],
    system: [
      'You are the Summarizer on an autonomous operations swarm.',
      'You receive the outputs of several tasks. Produce ONE coherent briefing that answers the original goal.',
      'Lead with the answer. Then the supporting detail. Then, only if relevant, what remains open.',
      'Preserve specifics — numbers, names, URLs, coordinates. A summary that drops the numbers is worthless.',
      'If upstream tasks failed, state what is missing rather than papering over the gap.',
    ].join('\n'),
  },
]);

/** Ids of the built-in agents, in roster order. */
export const BUILTIN_AGENT_IDS = Object.freeze(BUILTIN_AGENTS.map((a) => a.id));

/** Agent used when a plan names one that is not on the roster. */
export const FALLBACK_AGENT_ID = 'generalist';

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

/**
 * Validate an operator-authored custom agent.
 *
 * Custom agents are typed into the console by hand, so they are checked rather
 * than trusted: a bad id would break plan routing, and an unknown tool name
 * would look like a granted capability while silently never resolving.
 *
 * @param {object} agent
 * @param {object} options
 * @param {string[]} options.knownTools - Every tool name the bus can resolve.
 * @returns {{ok: boolean, errors: string[], agent: object|null}}
 */
export function validateCustomAgent(agent, { knownTools = [] } = {}) {
  const errors = [];
  const id = String(agent?.id ?? '').trim().toLowerCase();
  if (!ID_PATTERN.test(id)) {
    errors.push('Agent id must be lowercase letters, digits and dashes (max 40 chars)');
  }
  const label = String(agent?.label ?? '').trim();
  if (!label) errors.push('Agent needs a label');
  const system = String(agent?.system ?? '').trim();
  if (system.length < 20) errors.push('Agent needs a system prompt of at least 20 characters');

  const requested = Array.isArray(agent?.tools) ? agent.tools.map((t) => String(t).trim()) : [];
  const knownSet = new Set(knownTools);
  const unknown = requested.filter((t) => t && !knownSet.has(t));
  if (unknown.length) errors.push(`Unknown tools: ${unknown.join(', ')}`);

  if (errors.length) return { ok: false, errors, agent: null };

  return {
    ok: true,
    errors: [],
    agent: {
      id,
      label,
      short: (String(agent?.short ?? '').trim() || label).slice(0, 6).toUpperCase(),
      accent: /^#[0-9a-f]{6}$/i.test(String(agent?.accent ?? '')) ? agent.accent : '#8fd7ff',
      description: String(agent?.description ?? '').trim().slice(0, 200),
      maxConcurrent: clampConcurrency(agent?.maxConcurrent),
      tools: [...new Set(requested)],
      system,
      custom: true,
    },
  };
}

function clampConcurrency(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return 2;
  return Math.min(6, Math.max(1, n));
}

/**
 * Merge custom agents over the built-ins.
 *
 * A custom agent sharing a built-in id REPLACES it, so an operator can retune
 * the Researcher's prompt without forking the roster.
 *
 * @param {object[]} [customAgents]
 * @returns {object[]}
 */
export function resolveRoster(customAgents = []) {
  const byId = new Map(BUILTIN_AGENTS.map((a) => [a.id, { ...a }]));
  for (const custom of customAgents) {
    if (custom?.id) byId.set(custom.id, { ...custom });
  }
  return [...byId.values()];
}

/** Look up one agent, falling back to the generalist. */
export function getAgent(roster, id) {
  return roster.find((a) => a.id === id) || roster.find((a) => a.id === FALLBACK_AGENT_ID) || roster[0] || null;
}

/** Every tool an agent may call, including the common ones. */
export function agentToolNames(agent) {
  return [...new Set([...(agent?.tools || []), ...COMMON_TOOLS])];
}

/**
 * One-line roster description for the planner prompt.
 *
 * The planner can only route to agents it knows exist, so this string is the
 * single source of that knowledge — keeping it derived from the roster means a
 * newly added agent is immediately routable without touching the prompt.
 */
export function describeRoster(roster) {
  return roster
    .map((a) => `- ${a.id} (${a.label}): ${a.description} Tools: ${agentToolNames(a).join(', ') || 'none'}`)
    .join('\n');
}

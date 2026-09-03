# Agent Swarm

A multi-agent orchestration console built into God's Eye View. Give it a goal in
plain language; it decomposes the goal into a task graph, assigns each task to a
specialist agent, runs them in parallel where the graph allows, and folds the
results into one answer.

Open it with the **AGENTS** button (bottom right) or **Ctrl/Cmd+Shift+A**.

The agents can drive the globe. That is the part that makes this more than a
chat window: a task like *"find the biggest active wildfire in California, put it
on screen, and write me a one-page brief"* becomes a research task, a
`geo-analyst` task that actually enables the fires layer and flies the camera,
and a writer task — running as one job.

## Setup

`OPENAI_API_KEY` is the only required key (it is the same one voice control
uses). Copy `.env.example` to `.env` and set:

```sh
OPENAI_API_KEY=sk-...
OPENAI_AGENTS_MODEL=gpt-5      # optional, this is the default

# Optional — enables web_search for the Researcher and Critic. Set either one.
TAVILY_API_KEY=
BRAVE_SEARCH_API_KEY=
```

With no search key the swarm still runs; the Researcher is told search is
unavailable and must flag claims it could not verify rather than quietly
answering from memory. That mirrors how the FIRMS layer reports `KEY REQUIRED`
instead of rendering an empty map.

## How a run works

```
GOAL
 │
 ├─ 1. PLAN      one planner turn → a JSON task DAG (agent + dependsOn per task)
 ├─ 2. EXECUTE   scheduler pumps ready tasks into workers, respecting concurrency
 │               each worker runs a bounded tool loop against its own allowlist
 └─ 3. REPORT    the summarizer folds the leaf outputs into one answer
```

**Dependencies are the only ordering.** A task runs as soon as every task it
depends on has *succeeded*. Independent tasks run concurrently — up to 4 at once
globally, and per-agent caps below that.

**Failure is contained.** A failed task moves its dependents to `blocked`, not
`failed`, so one upstream error does not read as a dozen. Unrelated branches
keep running, and a run where anything succeeded finishes as `done` with the
per-task errors visible — partial output is still output.

## The roster

| Agent | Does | Camera | Max parallel |
|---|---|---|---|
| `generalist` | Anything without a specialist | – | 3 |
| `researcher` | Web search and reading, sourced findings | – | 4 |
| `geo-analyst` | Navigation, layers, spatial queries, annotations | ✓ | **1** |
| `recon` | CCTV feeds, cockpit views, entity tracking | ✓ | **1** |
| `writer` | Finished prose from upstream findings | – | 3 |
| `coder` | Code and review | – | 3 |
| `critic` | Quality gate; ends with `VERDICT: PASS`/`REVISE` | – | 2 |
| `summarizer` | Collapses many outputs into one briefing | – | 2 |

`geo-analyst` and `recon` are pinned to one task at a time on purpose. They own
the single shared camera, and two concurrent flights produce a useless run. That
is a correctness constraint, not a performance tuning knob — `toolBus.test.mjs`
pins it.

### Custom agents

**+ AGENT** in the console footer adds your own: an id, a label, a tool list,
and a system prompt. They persist in `localStorage` and are merged over the
built-ins, so a custom agent reusing a built-in id *replaces* it — the way to
retune the Researcher's prompt without forking the roster.

## Tools

Agents call tools; `src/agents/toolBus.js` executes them.

**Generic:** `web_search`, `web_fetch`, `record_finding`, `write_artifact`.

**Globe:** a subset of the same `GEV_REALTIME_TOOLS` array that backs voice
control — `fly_to_location`, `set_layer_visibility`, `analyst_query`,
`track_entity`, `control_cctv`, `control_cockpit`, `annotate_map` and the rest.
The schemas are resolved server-side in `vite.config.js` from that one array, so
voice and the swarm can never drift apart on what `fly_to_location` means.

`control_radio` and `control_scene` are deliberately **withheld** from agents:
both seize an output device on a timer, which is not something to hand an
unattended loop.

### The allowlist is enforced

Each agent's `tools` list is checked at execution time, not merely advertised to
the model. A Writer that hallucinates `fly_to_location` gets a refusal naming
the tools it *does* have — returned as a tool result, so the model can recover
within the same task rather than dying on it.

## Safety properties worth knowing

- **No key in the browser.** Every model call goes through `/api/agent-chat`;
  search and fetch through `/api/agent-web-search` and `/api/agent-web-fetch`.
- **SSRF guard on `web_fetch`.** The URL is chosen by a language model, so
  loopback, private ranges, `.internal`/`.local`, and cloud metadata addresses
  are refused before any request leaves the machine.
- **Bounded loops.** 8 tool calls per task, 2 attempts per task, 40 tasks per
  plan. On exhausting its tool budget an agent gets one final tool-free turn so
  the work already done becomes an answer instead of being discarded.
- **Untrusted planner output.** `normalizePlan` repairs whatever comes back —
  duplicate ids, unknown agents, dangling edges, dependency cycles — and reports
  each repair as a warning. A cycle would deadlock the scheduler, so back-edges
  are cut rather than kept.

## Files

| File | Role |
|---|---|
| `src/agents/taskGraph.js` | Pure DAG state machine — every scheduling decision |
| `src/agents/agentRoster.js` | Agent definitions, custom-agent validation |
| `src/agents/orchestrator.js` | Planner, scheduler, worker tool loop, report |
| `src/agents/toolBus.js` | Tool execution and allowlist enforcement |
| `src/agents/llmClient.js` | `/api/agent-chat` client |
| `src/agents/agentConsole.js` | Console DOM, task list, log, artifacts |
| `src/agents/agentOrbit.js` | Canvas orbital view |
| `src/agents/index.js` | `installAgentSwarm()` — the one call from `main.js` |

All graph and scheduling logic lives in `taskGraph.js` specifically so it is
testable without a browser or an API key. `orchestrator.test.mjs` drives whole
multi-agent runs — parallelism, dependency ordering, tool dispatch, failure
cascade — against a scripted fake proxy.

```sh
npm test                                    # whole suite
node --test src/agents/*.test.mjs           # just the swarm (46 tests)
```

## The orbital view

The left pane is a live status display, not decoration: node ring colour is task
state, packets carry the actual task title or tool name, and the render loop
**parks itself** when nothing is animating — a decorative 60fps canvas would tax
the same frame budget the Cesium globe needs.

## Notes

- Enter runs a goal; Shift+Enter is a newline.
- ESC closes the console, but never while a run is live — Stop is a visible
  button, and swallowing ESC mid-run would trap the operator.
- Artifacts (from `write_artifact`) appear in the output pane with a COPY
  button. The last 20 runs are kept in `localStorage`.

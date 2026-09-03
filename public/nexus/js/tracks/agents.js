/**
 * Track 1 — AI Agents.
 *
 * The syllabus the receptionist teaches from. Content is deliberately
 * framework-agnostic: the loop, the tools, the memory and the failure modes
 * are the same whether you build on the Claude API, an SDK, or by hand.
 *
 * @module nexus/tracks/agents
 */

/** @type {import('../curriculum.js').Track} */
export const AGENTS_TRACK = {
  id: 'agents',
  title: 'AI Agents',
  tagline: 'From a single model call to a system that plans, acts and checks itself.',
  accent: '#5ad8ff',
  modules: [
    {
      id: 'agents-loop',
      title: 'The agent loop',
      minutes: 14,
      lessons: [
        {
          id: 'what-is-an-agent',
          title: 'What actually makes something an agent',
          body: [
            'A chatbot answers. An agent decides. The difference is not the model — the same model sits behind both — it is the control flow around it. An agent runs a loop: observe the state of the world, decide on one action, take it, observe what changed, and repeat until the goal is met or a limit is hit.',
            'That loop is what buys you the interesting properties. Because the model sees the result of its own action before choosing the next one, it can recover from a failed step, notice that a file was empty, or realise the search returned nothing useful. A single call has none of that; it commits to a whole answer before learning anything.',
            'The cost is that everything becomes stateful. A one-shot call either works or does not. An agent can loop forever, spend your budget, take an irreversible action on step 7 based on a misreading on step 2, or drift so far from the goal that its final answer is confidently about the wrong thing. Every design decision after this lesson is really about containing those four failures.',
            'The practical test for whether you need an agent: does the right next step depend on something you cannot know until you have taken the previous one? If yes, loop. If the whole job is knowable up front, a single well-constructed call is cheaper, faster and far easier to debug.',
          ],
          code: {
            lang: 'javascript',
            text: `// The whole idea, with nothing else in the way.
async function runAgent(goal, tools, { maxSteps = 12 } = {}) {
  const history = [{ role: 'user', content: goal }];

  for (let step = 0; step < maxSteps; step += 1) {
    const reply = await model.respond({ history, tools });
    history.push(reply);

    if (!reply.toolCalls?.length) return reply.text;   // it is done

    for (const call of reply.toolCalls) {
      const result = await tools[call.name].run(call.input);   // act
      history.push({ role: 'tool', id: call.id, content: result }); // observe
    }
  }
  throw new Error('step budget exhausted — the loop never converged');
}`,
          },
          keyPoints: [
            'An agent is a loop around a model, not a bigger model.',
            'Observation between actions is the feature you are paying for.',
            'Always bound the loop: step count, wall-clock time, and spend.',
            'If the plan is knowable up front, do not use an agent.',
          ],
        },
        {
          id: 'context-engineering',
          title: 'Context is the real program',
          body: [
            'You do not program an agent with code so much as with what you put in its context window. The system prompt, the tool descriptions, the retrieved documents and the accumulated history are the instruction set. Debugging an agent is usually reading its context and asking "given only this, would I have done the right thing?"',
            'Three failure patterns dominate. Context poisoning: something wrong entered the history early and everything downstream inherits it. Context distraction: so much irrelevant material is present that the signal is buried. Context clash: two parts of the context give contradictory instructions, and which one wins is a coin flip.',
            'The fixes are structural, not verbal. Summarise and compact the history rather than letting it grow without limit. Put the most decision-relevant material closest to the instruction that uses it. Keep untrusted content — retrieved pages, tool output, user files — clearly delimited and never phrased as an instruction. And re-state the goal near the end of a long context, because attention over a long window is not uniform.',
            'Measure it. If you cannot print an agent\'s full context at step N, you cannot debug it. Build that view before you build anything clever.',
          ],
          keyPoints: [
            'The context window is the program; treat edits to it as code changes.',
            'Poisoning, distraction and clash cause most "the model is dumb" bugs.',
            'Compact history deliberately rather than truncating it blindly.',
            'Untrusted text must be visibly framed as data, never as instruction.',
          ],
        },
      ],
      quiz: [
        {
          q: 'What most reliably distinguishes an agent from a single model call?',
          options: [
            'It uses a larger model',
            'It observes the result of each action before choosing the next',
            'It streams its output',
            'It has a system prompt',
          ],
          answer: 1,
          why: 'The feedback loop — act, observe, decide again — is the whole distinction. Model size and streaming are orthogonal.',
        },
        {
          q: 'An agent gives a confident but wrong final answer. Where do you look first?',
          options: [
            'Swap in a different model',
            'Raise the temperature',
            'Print the full context at the step where it went wrong',
            'Add more tools',
          ],
          answer: 2,
          why: 'Read the context first. Most "bad model" reports are a poisoned, cluttered or self-contradicting context window.',
        },
        {
          q: 'Which job does NOT justify an agent loop?',
          options: [
            'Triaging an inbox where each mail needs a different lookup',
            'Reformatting 5,000 known records into a fixed schema',
            'Debugging a failing test suite',
            'Researching a question across several sources',
          ],
          answer: 1,
          why: 'The reformatting job is fully knowable up front, so a deterministic pipeline (or one call per record) is cheaper and more reliable.',
        },
      ],
    },
    {
      id: 'agents-tools',
      title: 'Tools and the outside world',
      minutes: 16,
      lessons: [
        {
          id: 'tool-design',
          title: 'Designing tools a model can actually use',
          body: [
            'A tool is an API whose documentation is read by a model at every call. That changes what "good" means. Names must say what happens, not what module it lives in. Descriptions must state preconditions, side effects and what the result looks like. Parameters should be few, flat, and hard to get wrong.',
            'The commonest mistake is exposing your internal surface directly — thirty CRUD endpoints, one tool each. Models drown in them. Design tools around tasks the agent must perform, not around your database tables. One `find_customer_by_anything` beats six lookup variants.',
            'Make failures teachable. A tool that returns "Error 400" teaches nothing; the loop will retry the same call. A tool that returns "start_date must be ISO-8601, you sent 03/09/26 — did you mean 2026-09-03?" gets corrected on the next step. Error strings are prompts.',
            'And separate reads from writes. Reads can be retried freely, run in parallel, and cached. Writes need confirmation, idempotency keys and an audit trail. If an agent can call a write tool twice because a network blip hid the first success, you will eventually pay somebody twice.',
          ],
          code: {
            lang: 'json',
            text: `{
  "name": "refund_order",
  "description": "Issue a refund against a completed order. WRITE: moves real money and emails the customer. Requires an explicit amount; will not guess. Fails if the order is already refunded, older than 90 days, or not in state 'completed'. Returns the refund id and the new order state.",
  "input_schema": {
    "type": "object",
    "properties": {
      "order_id":       { "type": "string", "description": "Order id as shown to the customer, e.g. 'ORD-8823-KX'" },
      "amount_minor":   { "type": "integer", "description": "Amount in minor units (pence/cents). Must be <= order total." },
      "reason_code":    { "type": "string", "enum": ["damaged", "not_received", "duplicate", "goodwill"] },
      "idempotency_key":{ "type": "string", "description": "Stable key so a retry cannot double-refund." }
    },
    "required": ["order_id", "amount_minor", "reason_code", "idempotency_key"]
  }
}`,
          },
          keyPoints: [
            'Tool descriptions are prompt real estate — write them for the model.',
            'Model tools on tasks, not on your internal endpoints.',
            'Error messages should tell the agent how to succeed next time.',
            'Every write tool needs an idempotency key and an audit record.',
          ],
        },
        {
          id: 'permissions',
          title: 'Least privilege, and the human in the loop',
          body: [
            'An agent inherits every permission you hand it, and it will use them in combinations you did not picture. The allowlist per agent should be an enforced boundary in your code, not a sentence in the prompt asking it to behave. A prompt is a suggestion; a whitelist check before dispatch is a control.',
            'Classify actions by reversibility rather than by how scary they sound. Reading a public page is free. Writing to a scratch branch is cheap to undo. Sending an email, moving money, deleting data, or posting publicly cannot be taken back — those get confirmation, and the confirmation must describe the actual effect, not the tool name.',
            'The confirmation dialogue is a real design problem. Ask too often and people click through without reading, which is worse than not asking. The workable pattern is to batch reversible work silently, surface a single clear checkpoint before the irreversible step, and always show what changed afterwards.',
            'Assume the agent will at some point be pointed at hostile input. The permission model is what stands between "an attacker put text on a web page" and "the agent emailed your customer list to that attacker". You will meet this again in the cybersecurity track.',
          ],
          keyPoints: [
            'Enforce tool allowlists in code, not in the prompt.',
            'Gate on reversibility, not on vibes.',
            'Batch the cheap steps; checkpoint once before the expensive one.',
            'Confirmations must describe effects, not tool names.',
          ],
          lab: 'injection',
        },
      ],
      quiz: [
        {
          q: 'Your agent keeps calling a tool with a malformed date and retrying identically. The best fix is to:',
          options: [
            'Lower the temperature',
            'Return an error that names the expected format and echoes what was sent',
            'Remove the tool',
            'Add a retry limit',
          ],
          answer: 1,
          why: 'The loop can only correct on information it receives. A descriptive error is the cheapest, most durable fix.',
        },
        {
          q: 'Which action should always sit behind a human checkpoint?',
          options: [
            'Reading a public documentation page',
            'Writing a file into a scratch directory',
            'Sending an email to a customer',
            'Running a search query',
          ],
          answer: 2,
          why: 'Reversibility is the test. A sent email cannot be recalled; the other three can be undone or repeated harmlessly.',
        },
        {
          q: 'Where should an agent\'s tool allowlist be enforced?',
          options: [
            'In the system prompt',
            'In the tool descriptions',
            'In code, before the call is dispatched',
            'By the model provider',
          ],
          answer: 2,
          why: 'Anything expressed only in the prompt is advisory. A pre-dispatch check is the only enforceable boundary.',
        },
      ],
    },
    {
      id: 'agents-memory',
      title: 'Memory, planning and retrieval',
      minutes: 15,
      lessons: [
        {
          id: 'memory-tiers',
          title: 'Four kinds of memory, and when each earns its place',
          body: [
            'Working memory is the context window itself — this turn, this task. It is fast, exact and expensive, and it disappears when the run ends. Most "give the agent memory" requests are actually a request to manage working memory better: compaction, summarisation, and dropping tool output that no longer matters.',
            'Episodic memory is the record of past runs: what was tried, what happened, what the user corrected. It is what stops an agent repeating a mistake next Tuesday. Store it as structured events with timestamps, not as a chat transcript, so you can query it.',
            'Semantic memory is the knowledge base — documents, code, policies — retrieved on demand. This is what RAG serves. The design question is not "which vector database" but "what is the retrievable unit?" A chunk that does not stand alone will not help the model, however well it embeds.',
            'Procedural memory is learned behaviour: the workflows, the checklists, the "in this repo, always run the linter first". In practice it lives in prompts, skills or config files. It is the highest-leverage and most-neglected tier, because it is the one you can edit by hand.',
            'Write things down deliberately. An agent that appends everything it sees to a memory store degrades: retrieval gets noisier every day. Deciding what not to remember is as important as remembering.',
          ],
          keyPoints: [
            'Working, episodic, semantic and procedural memory solve different problems.',
            'Most memory bugs are really context-management bugs.',
            'Retrievable units must make sense read alone.',
            'Unbounded remembering makes retrieval worse, not better.',
          ],
        },
        {
          id: 'planning',
          title: 'Plans, and why they go stale',
          body: [
            'Plan-then-execute is attractive: get the model to lay out the steps, then run them. It gives you a legible artefact, parallelism across independent steps, and a natural place for a human to intervene before anything happens.',
            'It also assumes the world holds still. The moment step 2 returns something the plan did not anticipate, steps 3 through 9 are fiction. Systems that only plan are brittle in exactly the situations that made you reach for an agent.',
            'The durable pattern is a plan you are willing to throw away. Produce a task graph, execute the independent branches in parallel, and after each completion ask a cheap question: does the remaining plan still make sense given what we now know? Re-plan when the answer is no. That is more calls, and it is worth it.',
            'Keep the graph explicit and inspectable — nodes, dependencies, status, output. When something goes wrong at 3am, "which node failed and what did it see" is the question you will need answered, and a plan that lives only inside a prompt cannot answer it.',
          ],
          keyPoints: [
            'Plans buy legibility, parallelism and a review point.',
            'Any plan is stale the moment observation contradicts it.',
            'Re-plan on contradiction; do not push through a dead plan.',
            'An explicit task graph is what makes failures debuggable.',
          ],
          lab: 'agentloop',
        },
      ],
      quiz: [
        {
          q: 'An agent repeats a mistake the user corrected last week. Which memory tier is missing?',
          options: ['Working', 'Episodic', 'Semantic', 'Procedural'],
          answer: 1,
          why: 'Episodic memory records what happened in past runs, including corrections. Without it, every run starts naive.',
        },
        {
          q: 'The strongest argument against pure plan-then-execute is:',
          options: [
            'It costs more tokens',
            'Plans become fiction as soon as an observation contradicts them',
            'Models cannot produce plans',
            'It cannot be parallelised',
          ],
          answer: 1,
          why: 'Plans assume a static world. Re-planning on contradiction is what keeps the approach honest.',
        },
        {
          q: 'A retrieved chunk helps the model most when it:',
          options: [
            'Is as short as possible',
            'Contains the highest keyword density',
            'Makes sense read on its own, with its source and date',
            'Comes from the newest document',
          ],
          answer: 2,
          why: 'Self-contained chunks survive being ripped out of their document. Fragments retrieve well and reason badly.',
        },
      ],
    },
    {
      id: 'agents-multi',
      title: 'Multi-agent systems and evaluation',
      minutes: 18,
      lessons: [
        {
          id: 'multi-agent',
          title: 'When more agents help, and when they just multiply the mess',
          body: [
            'Splitting work across agents buys three things: separate context windows so each specialist is not distracted by the others\' clutter, separate tool allowlists so a researcher cannot deploy, and genuine parallelism on independent branches.',
            'It costs coordination. Every handoff is a lossy summary. Two agents given the same ambiguous goal will interpret it differently, and the orchestrator will not notice until their outputs contradict. Cost and latency multiply, and debugging turns into distributed-systems work.',
            'A useful rule: split when the sub-tasks are genuinely independent and each needs a different tool set or a different kind of judgement. Do not split to "simulate a team". A researcher, a writer and a critic can be worth it. A "VP of Engineering agent" is theatre.',
            'The critic role is the one that most consistently pays for itself, because reviewing is easier than producing. Give the critic the original goal, the output, and permission to demand a redo — and give the loop a bounded number of redos so two agents cannot argue forever.',
          ],
          code: {
            lang: 'javascript',
            text: `// Fan out only what is independent; fold back through one critic.
const plan = await planner.decompose(goal);           // -> task graph
const ready = plan.nodes.filter((n) => n.deps.length === 0);

const results = await Promise.all(
  ready.map((node) => runSpecialist(node.agent, node, {
    tools: ALLOWLIST[node.agent],                     // enforced, not suggested
    budget: { steps: 8, seconds: 90 },
  })),
);

let draft = await writer.compose(goal, results);
for (let round = 0; round < 2; round += 1) {          // bounded argument
  const review = await critic.review(goal, draft);
  if (review.verdict === 'accept') break;
  draft = await writer.revise(draft, review.notes);
}`,
          },
          keyPoints: [
            'Separate contexts, separate permissions and parallelism are the real wins.',
            'Every handoff loses information — count them.',
            'Split on independence and tooling, not on job titles.',
            'A bounded critic loop is the highest-value second agent.',
          ],
        },
        {
          id: 'evals',
          title: 'Evaluating something non-deterministic',
          body: [
            'You cannot ship an agent on vibes, and you cannot unit-test it the usual way: the same input produces different traces. What you can do is fix the inputs, run repeatedly, and measure outcomes rather than wording.',
            'Start with an eval set of real cases — twenty is enough to be useful, and far better than none. For each, define what success means in a checkable way: a file that must exist, a value that must appear, a tool that must not have been called. Assertions on the trace are often more valuable than assertions on the text.',
            'Track four numbers per release: task success rate, mean steps to completion, cost per task, and rate of forbidden actions. The last one is the safety metric and should be zero. Watching only success rate hides an agent that succeeds by doing something you did not want.',
            'Use a model as a judge for the fuzzy parts, but pin it: give the judge a rubric, show it the reference answer, and spot-check its verdicts against human ones. An unpinned judge drifts, and you end up optimising against a moving target.',
            'Finally, keep the traces. When success rate drops two points after a prompt change, the only thing that tells you why is the diff between yesterday\'s trace and today\'s.',
          ],
          keyPoints: [
            'Fix the inputs, repeat the runs, measure outcomes not wording.',
            'Assert on the trace: which tools ran, in what order, with what.',
            'Success rate, steps, cost, forbidden-action rate — all four.',
            'A judge model needs a rubric and periodic human calibration.',
          ],
        },
      ],
      quiz: [
        {
          q: 'Which is the weakest reason to split a system into multiple agents?',
          options: [
            'The sub-tasks need different tool permissions',
            'The sub-tasks are independent and can run in parallel',
            'It mirrors how a human team is organised',
            'Each sub-task needs a different, cleaner context',
          ],
          answer: 2,
          why: 'Org-chart mimicry buys nothing technically. Permissions, independence and context hygiene are real reasons.',
        },
        {
          q: 'Your agent\'s success rate is up but it occasionally emails customers unprompted. Which metric would have caught this?',
          options: ['Mean steps', 'Cost per task', 'Forbidden-action rate', 'Token throughput'],
          answer: 2,
          why: 'Safety needs its own metric. Success rate can rise while the agent is doing things you never authorised.',
        },
        {
          q: 'The most useful thing to assert in an agent eval is often:',
          options: [
            'The exact wording of the final answer',
            'The trace — which tools were called, with what, in what order',
            'The total token count',
            'The response latency',
          ],
          answer: 1,
          why: 'Wording varies run to run. The trace captures whether it did the right thing, which is what you actually care about.',
        },
      ],
    },
  ],
};

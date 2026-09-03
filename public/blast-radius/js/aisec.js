/**
 * AI system security review.
 *
 * The premise of this module — and of the console around it — is that an LLM
 * agent is not a new kind of thing to secure. It is a new kind of *principal*:
 * one that reads attacker-controlled text all day, holds credentials, and calls
 * APIs on behalf of somebody it cannot authenticate. Everything that makes it
 * dangerous is already in the identity discipline; what is new is that the
 * confused deputy now speaks English and is very agreeable.
 *
 * So a finding here is not "prompt injection is possible" — it always is. A
 * finding is "prompt injection is possible *and* the tool it can reach runs as
 * a role that can read the payments signing key", which is a sentence with an
 * owner, a fix, and a number attached. That composition is what
 * {@link composeKillChain} produces, by asking the graph module what the
 * agent's identity can actually reach.
 *
 * @module blast-radius/aisec
 */

import { blastRadius, buildGraph, explainPath, nameOf } from './graph.js';
import { analyze } from './injection.js';

/**
 * @typedef {object} AgentSpec
 * @property {string} name
 * @property {string} principal Principal id of the agent in the estate.
 * @property {Array<{name: string, source: string, trusted: boolean, note?: string}>} inputs
 *   Every channel whose content reaches the model's context.
 * @property {Array<{name: string, writes: boolean, approval: boolean, identity: string, scope: string}>} tools
 * @property {{persistent: boolean, provenance: boolean, note?: string}} memory
 * @property {{corpus: string, writableBy: string, provenance: boolean}} [retrieval]
 * @property {{allowlist: boolean, rendersRemoteContent: boolean}} egress
 * @property {{perTool: boolean, actsAsUser: boolean, note?: string}} identity
 * @property {{inputScreening: boolean, outputScreening: boolean, rateLimits: boolean, logging: string}} guardrails
 * @property {{provider: string, pinned: boolean, evaluated: boolean}} model
 */

/**
 * The demonstration agent: Solstice's customer support copilot.
 *
 * @type {AgentSpec}
 */
export const SUPPORT_COPILOT = {
  name: 'support-copilot',
  principal: 'agent-support',
  inputs: [
    { name: 'Customer ticket text', source: 'support portal', trusted: false, note: 'Anyone with an email address can write here.' },
    { name: 'Inbound email thread', source: 'support@solstice', trusted: false },
    { name: 'Knowledge-base articles', source: 's3://solstice-support-kb', trusted: false, note: 'Editable by any of 120 support staff, and by anyone who compromises one of them.' },
    { name: 'Order records', source: 'dynamodb:support-tickets', trusted: false, note: 'Contains customer-supplied fields — delivery notes, names, gift messages.' },
    { name: 'Operator prompt', source: 'deployment config', trusted: true },
  ],
  tools: [
    { name: 'lookup_order', writes: false, approval: false, identity: 'role-agent-tools', scope: 'All orders, all customers' },
    { name: 'issue_refund', writes: true, approval: false, identity: 'role-agent-tools', scope: 'Any order, any amount' },
    { name: 'search_knowledge_base', writes: false, approval: false, identity: 'role-agent-tools', scope: 'Whole corpus' },
  ],
  memory: { persistent: true, provenance: false, note: 'Conversation summaries are written back and reloaded on the next contact from the same customer.' },
  retrieval: { corpus: 'Support knowledge base', writableBy: 'Any support agent', provenance: false },
  egress: { allowlist: false, rendersRemoteContent: true },
  identity: { perTool: false, actsAsUser: false, note: 'All three tools share one role; the agent has no per-request identity, so logs cannot attribute an action to a customer.' },
  guardrails: { inputScreening: false, outputScreening: false, rateLimits: true, logging: 'prompt and tool calls, 30-day retention' },
  model: { provider: 'hosted frontier model', pinned: false, evaluated: false },
};

/**
 * @typedef {object} Threat
 * @property {string} id
 * @property {string} name
 * @property {string} surface Which part of the system the threat lives on.
 * @property {string} description What actually goes wrong, in plain language.
 * @property {string} control The architectural answer, not the vendor answer.
 * @property {number} severity 1–5, before controls.
 * @property {(spec: AgentSpec) => {applies: boolean, evidence?: string, mitigated?: boolean}} check
 */

/**
 * Threat catalogue for LLM and agent systems.
 *
 * Ordered by how often each one turns out to be the root cause rather than by
 * how much attention it gets. Injection is first because everything else
 * downstream assumes it succeeded.
 *
 * @type {Threat[]}
 */
export const AI_THREATS = [
  {
    id: 'ai-indirect-injection',
    name: 'Indirect prompt injection through retrieved content',
    surface: 'Retrieval / inputs',
    description: 'The attacker never talks to the agent. They edit something the agent reads — a knowledge-base article, a document, a web page — and the instruction arrives with the authority of internal data.',
    control: 'Tag every context item with its provenance and forbid instruction-following from untrusted origins; treat the retrieval corpus as an authenticated write surface.',
    severity: 5,
    check: (spec) => {
      const untrusted = spec.inputs.filter((input) => !input.trusted);
      const provenance = spec.retrieval?.provenance ?? false;
      return {
        applies: untrusted.length > 0,
        mitigated: provenance,
        evidence: `${untrusted.length} of ${spec.inputs.length} context sources are attacker-writable (${untrusted.map((input) => input.name).join(', ')}), and context items ${provenance ? 'carry' : 'do not carry'} provenance tags.`,
      };
    },
  },
  {
    id: 'ai-excessive-agency',
    name: 'Excessive agency',
    surface: 'Tools',
    description: 'The agent can take an irreversible action — move money, delete data, send mail — without a human in the path. Injection then converts directly into loss.',
    control: 'Approval gate on every state-changing tool, and a per-tool spending or blast-radius limit that holds even when the agent is fully persuaded.',
    severity: 5,
    check: (spec) => {
      const unattended = spec.tools.filter((tool) => tool.writes && !tool.approval);
      return {
        applies: unattended.length > 0,
        evidence: unattended.length > 0
          ? `State-changing tools with no approval gate: ${unattended.map((tool) => tool.name).join(', ')}.`
          : 'Every state-changing tool requires an approval.',
      };
    },
  },
  {
    id: 'ai-identity-overreach',
    name: 'Tool identity over-scoped',
    surface: 'Identity',
    description: 'Tools share one credential sized for the union of everything they might need. The agent inherits that union, and so does anyone who steers it.',
    control: 'One identity per tool, scoped to the single resource that tool touches; the agent holds no credential of its own.',
    severity: 5,
    check: (spec) => ({
      applies: !spec.identity.perTool,
      evidence: spec.identity.note ?? `All ${spec.tools.length} tools execute as ${spec.tools[0]?.identity ?? 'one shared role'}.`,
    }),
  },
  {
    id: 'ai-output-exfiltration',
    name: 'Exfiltration through rendered output',
    surface: 'Egress',
    description: 'Model output containing a remote image or link is rendered by the client, and the fetch carries conversation data in the URL. The victim clicks nothing.',
    control: 'Strip or proxy remote references in model output and allow-list outbound hosts at the runtime, not in the prompt.',
    severity: 4,
    check: (spec) => ({
      applies: spec.egress.rendersRemoteContent || !spec.egress.allowlist,
      evidence: `Remote content in output is ${spec.egress.rendersRemoteContent ? 'rendered' : 'stripped'}; egress allow-list ${spec.egress.allowlist ? 'in place' : 'absent'}.`,
    }),
  },
  {
    id: 'ai-memory-poisoning',
    name: 'Memory poisoning',
    surface: 'Memory',
    description: 'An instruction planted in one conversation is summarised into persistent memory and reloaded later, when the attacker is gone and nobody is reviewing the transcript.',
    control: 'Memory entries keep their origin, are never re-injected as instructions, and expire; summaries are generated from tool results rather than from user text.',
    severity: 4,
    check: (spec) => ({
      applies: spec.memory.persistent && !spec.memory.provenance,
      evidence: spec.memory.note ?? 'Persistent memory without provenance tagging.',
    }),
  },
  {
    id: 'ai-scope-confusion',
    name: 'Missing per-request authorization',
    surface: 'Identity',
    description: 'The agent queries on behalf of a customer using a credential that can see every customer. Authorization is therefore whatever the model decides to type into the filter.',
    control: 'Pass the end user’s identity through to the data layer and enforce row-level authorization below the model, where prose cannot reach it.',
    severity: 5,
    check: (spec) => {
      const broad = spec.tools.filter((tool) => /all|any|whole/i.test(tool.scope));
      return {
        applies: broad.length > 0 && !spec.identity.actsAsUser,
        evidence: `${broad.length} tool${broad.length === 1 ? '' : 's'} query across every customer with no end-user identity in the call: ${broad.map((tool) => tool.name).join(', ')}.`,
      };
    },
  },
  {
    id: 'ai-no-screening',
    name: 'No screening on untrusted context',
    surface: 'Guardrails',
    description: 'Nothing looks at inbound content before it reaches the model, so the first evidence of an attack is its effect.',
    control: 'Score untrusted content on the way in and quarantine the top percentile for review — accepting that this is a detection layer and not a boundary.',
    severity: 3,
    check: (spec) => ({
      applies: !spec.guardrails.inputScreening,
      evidence: 'Inbound ticket, email and retrieved text reach the context unscreened.',
    }),
  },
  {
    id: 'ai-model-supply-chain',
    name: 'Unpinned model and no behavioural baseline',
    surface: 'Model',
    description: 'The model version changes underneath the system. Refusal behaviour, tool-calling habits and formatting all shift, and no test catches it because there is no baseline.',
    control: 'Pin the model version, run an evaluation suite that includes adversarial cases on every change, and gate promotion on it.',
    severity: 3,
    check: (spec) => ({
      applies: !spec.model.pinned || !spec.model.evaluated,
      evidence: `Model is ${spec.model.pinned ? 'pinned' : 'unpinned'} and ${spec.model.evaluated ? 'covered by' : 'has no'} adversarial evaluation suite.`,
    }),
  },
  {
    id: 'ai-attribution-gap',
    name: 'Actions not attributable',
    surface: 'Detection',
    description: 'Tool calls appear in the cloud audit log as the shared agent role. There is no way to answer "which conversation caused this refund" during an incident.',
    control: 'Carry a conversation id into every downstream call as a session tag, and join agent traces to cloud audit events on it.',
    severity: 3,
    check: (spec) => ({
      applies: !spec.identity.perTool,
      evidence: `Audit trail: ${spec.guardrails.logging}. Downstream calls all appear as one role, so cloud events cannot be joined to conversations.`,
    }),
  },
  {
    id: 'ai-consumption',
    name: 'Unbounded consumption',
    surface: 'Runtime',
    description: 'Long context and tool loops turn a cheap request into an expensive one; an attacker with a free ticket form controls the spend.',
    control: 'Per-conversation token and tool-call budgets, enforced by the runtime.',
    severity: 2,
    check: (spec) => ({
      applies: !spec.guardrails.rateLimits,
      evidence: spec.guardrails.rateLimits ? 'Rate limits present.' : 'No per-conversation budget.',
    }),
  },
];

/**
 * @typedef {object} Finding
 * @property {string} id
 * @property {string} name
 * @property {string} surface
 * @property {string} description
 * @property {string} control
 * @property {number} severity
 * @property {string} evidence
 * @property {boolean} mitigated
 */

/**
 * Review an agent architecture against the catalogue.
 *
 * @param {AgentSpec} spec Architecture under review.
 * @returns {{findings: Finding[], score: number, surfaces: Record<string, number>}}
 *   Findings worst-first, a 0–100 exposure score, and the count per surface.
 */
export function reviewArchitecture(spec) {
  const findings = [];
  for (const threat of AI_THREATS) {
    const result = threat.check(spec);
    if (!result.applies) continue;
    findings.push({
      id: threat.id,
      name: threat.name,
      surface: threat.surface,
      description: threat.description,
      control: threat.control,
      severity: threat.severity,
      evidence: result.evidence ?? '',
      mitigated: Boolean(result.mitigated),
    });
  }
  findings.sort((a, b) => b.severity - a.severity);

  const worst = AI_THREATS.reduce((sum, threat) => sum + threat.severity, 0);
  const actual = findings.filter((finding) => !finding.mitigated)
    .reduce((sum, finding) => sum + finding.severity, 0);
  const surfaces = {};
  for (const finding of findings) surfaces[finding.surface] = (surfaces[finding.surface] ?? 0) + 1;

  return { findings, score: Math.round((actual / worst) * 100), surfaces };
}

/**
 * @typedef {object} KillChain
 * @property {string} entry Where the attacker's text enters.
 * @property {number} injectionScore Detector score for the sample used.
 * @property {Array<{stage: string, actor: string, detail: string, detection?: string}>} steps
 * @property {object[]} path Identity-graph edges walked.
 * @property {object|null} objective The crown-jewel resource reached.
 * @property {number} feasibility 0–1 estimate of an attempt succeeding.
 * @property {string[]} breakpoints Controls that sever the chain, in order of
 *   how early they cut.
 */

/**
 * Compose the end-to-end chain: untrusted text to crown-jewel data.
 *
 * This is the artefact worth putting in a design review. Each half is
 * unremarkable — "agents can be injected", "roles can read secrets" — and the
 * composition is the incident.
 *
 * @param {object} estate Estate under analysis.
 * @param {AgentSpec} spec Agent architecture.
 * @param {string} sampleText Untrusted content used as the entry payload.
 * @returns {KillChain} The chain, with the point where each control cuts it.
 */
export function composeKillChain(estate, spec, sampleText) {
  const analysis = analyze(sampleText);
  const edges = buildGraph(estate);
  const radius = blastRadius(estate, spec.principal, edges);
  const crown = radius.impact.find((item) => item.classification === 'crown') ?? null;
  const path = radius.worstPath ?? [];

  const untrusted = spec.inputs.filter((input) => !input.trusted);
  const writeTool = spec.tools.find((tool) => tool.writes && !tool.approval) ?? spec.tools[0];

  const steps = [
    {
      stage: 'Entry',
      actor: untrusted[0]?.name ?? 'untrusted input',
      detail: `Attacker-supplied text reaches the model context through ${untrusted.map((input) => input.name.toLowerCase()).slice(0, 3).join(', ')}. Detector score ${analysis.score}/100 — ${analysis.verdict}.`,
      detection: 'det-injection-score',
    },
    {
      stage: 'Control',
      actor: spec.name,
      detail: spec.guardrails.inputScreening
        ? 'Content is screened before it reaches the context, so only payloads below the threshold proceed.'
        : 'Nothing screens the content; the model treats the instruction and the ticket as the same kind of text.',
    },
    {
      stage: 'Action',
      actor: writeTool ? `tool: ${writeTool.name}` : 'tool surface',
      detail: writeTool
        ? `${writeTool.approval ? 'Approval required, so the attacker needs a human to agree' : 'No approval gate'} — the call executes as ${nameOf(estate, writeTool.identity)}.`
        : 'No tools exposed.',
      detection: 'det-agent-tool',
    },
    ...explainPath(estate, path).map((line, index) => ({
      stage: 'Escalation',
      actor: nameOf(estate, path[index].to),
      detail: line.replace(/^\d+\.\s*/, ''),
      detection: path[index].detection,
    })),
  ];

  if (crown) {
    steps.push({
      stage: 'Objective',
      actor: crown.viaName,
      detail: `${crown.resource} reached with ${crown.actions.join(', ')} — ${estate.resources.find((resource) => resource.arn === crown.arn)?.note ?? 'crown-jewel data'}.`,
      detection: 'det-crown-access',
    });
  }

  const gates = [
    spec.guardrails.inputScreening,
    Boolean(writeTool?.approval),
    spec.identity.perTool,
    path.length === 0,
  ].filter(Boolean).length;
  const feasibility = Math.max(0.02, (analysis.score / 100) * Math.pow(0.45, gates));

  const breakpoints = [
    !spec.identity.perTool && 'Per-tool least-privilege identity — removes the escalation half of the chain entirely.',
    writeTool && !writeTool.approval && 'Approval gate on state-changing tools — the attacker still gets in, and gets nothing.',
    !spec.retrieval?.provenance && 'Provenance-tagged context — the knowledge-base route stops being an instruction channel.',
    !spec.guardrails.inputScreening && 'Input screening — catches the known shapes and buys detection time; not a boundary.',
  ].filter(Boolean);

  return {
    entry: untrusted[0]?.name ?? 'untrusted input',
    injectionScore: analysis.score,
    steps,
    path,
    objective: crown,
    feasibility,
    breakpoints,
  };
}

/**
 * Turn a kill chain into a quantified risk scenario.
 *
 * The link between the technical work and the money is the only reason an
 * architecture finding ever gets funded, and it should be explicit enough to
 * argue with: frequency comes from attempt volume times the feasibility the
 * chain analysis produced, magnitude from the record count of what the chain
 * reaches.
 *
 * @param {KillChain} chain Composed chain.
 * @param {object} estate Estate under analysis.
 * @param {number} [attemptsPerYear] Estimated injection attempts reaching the
 *   agent per year.
 * @returns {import('./fair.js').Scenario} Scenario ready for simulation.
 */
export function chainToScenario(chain, estate, attemptsPerYear = 120) {
  const resource = estate.resources.find((item) => item.arn === chain.objective?.arn);
  const records = resource?.records ?? 500_000;
  const perRecordLow = 4;
  const perRecordHigh = 18;
  const conversion = 0.002;
  const mode = attemptsPerYear * chain.feasibility * conversion;

  return {
    id: 'sc-agent-chain',
    name: 'Support agent compromised into cardholder data access',
    narrative: `An injected instruction reaches the support agent through ${chain.entry.toLowerCase()}, the agent's tool role reads a stored payments credential, and ${resource?.name ?? 'crown-jewel data'} is read at scale.`,
    frequency: { min: mode * 0.2, mode, max: mode * 4 },
    magnitude: { low: records * perRecordLow, high: records * perRecordHigh },
    basis: [
      `Feasibility ${(chain.feasibility * 100).toFixed(0)}% from the composed chain: ${chain.steps.length} steps, ${chain.path.length} identity hops.`,
      `${attemptsPerYear} injection attempts per year assumed to reach the agent, of which ${(conversion * 100).toFixed(1)}% of feasible ones run the whole chain to the objective before anyone notices. This conversion factor is the softest number in the model and the first one to argue about.`,
      `${records.toLocaleString('en-GB')} records at $${perRecordLow}–$${perRecordHigh} per record, covering notification, card reissue, fines and churn.`,
    ],
    controls: ['ctl-agent-secret-scope', 'ctl-tool-approval'],
  };
}

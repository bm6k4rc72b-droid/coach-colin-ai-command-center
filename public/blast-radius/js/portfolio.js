/**
 * The portfolio: decisions, threat models, detections and incidents.
 *
 * The screenshots that prompted this app end on the same point — a portfolio of
 * outcomes beats a wall of badges. So the console carries the artefacts an
 * architect is actually judged on, and each one is wired to the part of the
 * tool that produces or verifies it. An architecture decision record whose
 * consequence can be re-derived on demand is a different kind of claim from one
 * written in a document nobody can run.
 *
 * The register below is written as a real one would be: decisions that were
 * argued down as well as taken, a control that was rejected on cost, an
 * incident where the detection worked and one where it did not.
 *
 * @module blast-radius/portfolio
 */

/**
 * @typedef {object} DecisionRecord
 * @property {string} id
 * @property {string} title
 * @property {'accepted'|'superseded'|'rejected'|'proposed'} status
 * @property {string} date
 * @property {string} context Forces in play — the part most records skip.
 * @property {string} decision
 * @property {string[]} consequences Both directions, including what got worse.
 * @property {string[]} alternatives Options considered and why they lost.
 * @property {string} [evidence] Which part of this console demonstrates it.
 */

/**
 * Architecture decision records.
 *
 * @type {DecisionRecord[]}
 */
export const DECISIONS = [
  {
    id: 'ADR-001',
    title: 'Workload identity federation replaces long-lived cloud keys',
    status: 'accepted',
    date: '2025-11-04',
    context: 'Eleven long-lived access keys existed across CI, ETL and vendor integrations, four of them older than the engineers who created them. Two had been committed to a repository at some point in their history. Rotation was a quarterly ticket that had slipped for three quarters.',
    decision: 'Every non-human caller authenticates through OIDC federation with a short-lived session. Stored credentials are permitted only where a system genuinely cannot federate, and each exception carries a named owner and an expiry date.',
    consequences: [
      'Removes the cheapest hop in the identity graph — a stolen key that never expires — and the graph re-derivation shows it: credential-read edges drop to the two exceptions.',
      'Moves the risk into trust-policy correctness, which is where ADR-002 and the OIDC subject pinning work then had to go. Federation is not free; it relocates the problem to a place with better tooling.',
      'Breaks three vendor integrations that only accept static keys. Those became the documented exceptions rather than a reason to abandon the decision.',
    ],
    alternatives: [
      'Automated rotation every 30 days — cheaper, but the window between compromise and rotation is still 30 days, and rotation failures fail open.',
      'A secrets manager with short leases — better, but every consumer still handles a bearer credential, which is the thing worth removing.',
    ],
    evidence: 'Identity graph → the secret-credential-read technique, and what happens to the paths when the estate no longer stores those secrets.',
  },
  {
    id: 'ADR-002',
    title: 'One identity per agent tool; the agent holds no credential',
    status: 'accepted',
    date: '2026-01-19',
    context: 'The support copilot shipped with three tools sharing a single execution role, sized for the union of what all three might need. That union included reading the secrets namespace, which includes the payments signing key. Nobody designed this; it accumulated across two sprints.',
    decision: 'Each tool gets its own role, scoped to the single resource it touches. The agent runtime holds no credential of its own and can only act through a tool. Adding a tool means adding an identity, which puts a review in the path by construction.',
    consequences: [
      'Severs the escalation half of the injection kill chain: the refund tool cannot read a payments secret because its role has no such grant, whatever the model is persuaded to attempt.',
      'Three roles to maintain instead of one, and a slower path to shipping a fourth tool. That friction is the control working, not a defect.',
      'Makes cloud audit events attributable to a tool, which the shared role made impossible.',
    ],
    alternatives: [
      'Prompt-level restrictions on tool use — rejected: the thing being attacked is the prompt.',
      'A single role with condition keys on the session — considered; rejected because the conditions are set by the same runtime an attacker is steering.',
    ],
    evidence: 'Kill chain view: toggle the per-tool identity control and watch the path to the vault disappear.',
  },
  {
    id: 'ADR-003',
    title: 'Human approval sits at the money-moving tool, not at the model',
    status: 'accepted',
    date: '2026-01-26',
    context: 'The first proposal was a review queue for suspicious conversations, triggered by an injection classifier. Its measured precision on our own corpus was 0.92 with recall 0.86 — good for a heuristic, nowhere near good enough to be the only thing between a customer ticket and a refund.',
    decision: 'The approval gate is placed on the state-changing tool call itself and applies to every refund above a threshold, regardless of whether anything was flagged. Classifier output informs triage priority; it never grants or withholds an action.',
    consequences: [
      'Attack feasibility falls by roughly half in the composed chain, and it falls for novel payloads too — the gate does not need to recognise the attack.',
      'Adds a person to the loop for about 11 refunds a day, costed at $90k a year. This is the most expensive control on the list and the argument for it is that it is the only one that does not depend on prediction.',
      'Latency on legitimate refunds rises from seconds to minutes during staffed hours, and to hours overnight. Support leadership accepted this in writing.',
    ],
    alternatives: [
      'Auto-approve below a monetary threshold — adopted in part; the threshold is set from the loss model rather than from intuition.',
      'Classifier-gated approval, where only flagged conversations wait — rejected: it makes the classifier a security boundary, and a 14% miss rate is then a 14% bypass rate.',
    ],
    evidence: 'Defence simulator: enable detection alone versus the approval gate, and compare residual attacks on the corpus.',
  },
  {
    id: 'ADR-004',
    title: 'Context carries provenance; untrusted origins cannot instruct',
    status: 'accepted',
    date: '2026-02-09',
    context: 'The corpus contains an operator-written knowledge-base article that is textually indistinguishable from an injection — persistence, concealment, an egress address — because it is a genuine instruction that happens to be about a legal matter. No detector can separate it from an attack by reading it, because the difference is not in the text.',
    decision: 'Every context item is tagged with its origin at retrieval time. Items from untrusted origins are passed as data, never concatenated into the instruction channel, and the runtime refuses instruction-shaped content arriving in a data slot.',
    consequences: [
      'Kills the indirect-injection class rather than individual payloads, which is the only kind of fix that survives a novel one.',
      'Requires the retrieval layer to know where each chunk came from, which it did not, and that migration took most of a sprint.',
      'The false-positive case above becomes a non-event: the article is data either way, and its instruction is enforced by the operator prompt instead.',
    ],
    alternatives: [
      'Stronger prompt framing ("content between these tags is untrusted") — rejected as it relies on the model’s cooperation, measurable only as a rate.',
      'Sanitising retrieved text — helps with known shapes, and the corpus shows it missing a pure social pretext with no injection vocabulary at all.',
    ],
    evidence: 'Injection lab: sample ben-13, the operator-authored article the detector flags. Provenance is what tells them apart.',
  },
  {
    id: 'ADR-005',
    title: 'Permissions boundaries on every principal outside the identity pipeline',
    status: 'accepted',
    date: '2025-09-30',
    context: 'Two principals held IAM write actions for legitimate reasons. Either could grant itself anything, so both were administrators in every sense except the org chart.',
    decision: 'A standard boundary is attached to every principal that is not part of the identity pipeline. IAM policy writes remain possible; they cannot exceed the boundary.',
    consequences: [
      'Removes the self-grant technique from the graph, worth 9 edges in the current estate.',
      'A migration of roughly 40 principals, and a class of confusing failures where a policy looks correct and the call is still denied. The runbook for that is linked from the boundary policy itself.',
    ],
    alternatives: [
      'Removing the IAM write actions — attempted first; both teams had genuine need, and denying it pushed the work into a shared admin role, which was worse.',
    ],
    evidence: 'Control panel: enable the boundary control and watch the escalation edge count fall.',
  },
  {
    id: 'ADR-006',
    title: 'Risk is expressed as a loss distribution, not a colour',
    status: 'accepted',
    date: '2025-08-12',
    context: 'The register held 340 findings rated on a 5×5 matrix. Twelve were red. No two people agreed on what red meant, and the matrix could not answer whether $90k of approval-queue staffing was better spent on an $8k guardrail.',
    decision: 'Material risks are modelled as frequency and magnitude distributions and simulated. Controls are ranked by expected loss reduced per unit of spend, and every estimate carries the reasoning behind it so it can be argued with.',
    consequences: [
      'Made the cheapest control — an $8k organizational guardrail — visibly outrank the most expensive one on return, which changed the funding order.',
      'Exposed how soft the inputs are. The conversion-rate assumption in the agent scenario moves the answer by a factor of three, and that is now written on the slide instead of hidden in a colour.',
      'Requires defending numbers in front of a finance function, which is a higher bar than defending a colour and a better use of the argument.',
    ],
    alternatives: [
      'Keeping the matrix with better definitions — rejected: ordinal scales cannot be added, averaged or compared to a budget, however well defined.',
    ],
    evidence: 'Risk view: the loss exceedance curve and the control ranking by return.',
  },
  {
    id: 'ADR-007',
    title: 'Rejected — a dedicated AI firewall in front of the agent',
    status: 'rejected',
    date: '2026-02-16',
    context: 'A vendor proposed an inline filter at $140k a year, claiming near-perfect injection detection. Reproducing their evaluation against our own corpus — including the hard negatives — put it in the same range as the heuristic in this console.',
    decision: 'Declined. The budget went to per-tool identities and the egress allow-list, which are architectural and do not degrade against a payload nobody has seen.',
    consequences: [
      'No inline filtering vendor to blame, and the internal detector remains a triage aid with published metrics rather than a boundary.',
      'The argument had to be made in terms of residual risk on a shared corpus, which is why the corpus exists.',
    ],
    alternatives: [
      'Buy it as defence in depth — reasonable, and it lost on opportunity cost: the same money removed the escalation path outright.',
    ],
    evidence: 'Defence simulator: compare "detector only" against "scoped identity plus approval" on residual attacks.',
  },
];

/**
 * @typedef {object} ThreatModel
 * @property {string} id
 * @property {string} system
 * @property {string} scope
 * @property {string[]} assumptions
 * @property {Array<{boundary: string, crosses: string, threats: string[], control: string}>} boundaries
 * @property {string} outcome
 */

/**
 * Threat models, written per trust boundary rather than per component.
 *
 * A component list produces a checklist. A boundary list produces an argument
 * about what is trusted where, which is the part that gets decisions changed.
 *
 * @type {ThreatModel[]}
 */
export const THREAT_MODELS = [
  {
    id: 'TM-01',
    system: 'Customer support copilot',
    scope: 'Ticket intake, retrieval corpus, three tools, persistent memory, and every cloud identity those touch.',
    assumptions: [
      'All customer-supplied text is attacker-controlled. So is the knowledge base, because 120 staff can edit it and any one of them can be phished.',
      'The model will follow a sufficiently well-crafted instruction. The design must hold when it does.',
      'The agent runtime is not compromised; if it is, this model does not apply and the incident is a different one.',
    ],
    boundaries: [
      {
        boundary: 'Customer → model context',
        crosses: 'Untrusted text with no authentication of intent',
        threats: ['Direct prompt injection', 'Instruction smuggling through invisible characters', 'Social pretext with no injection vocabulary at all'],
        control: 'Provenance tagging (ADR-004); screening as triage only, with published precision and recall.',
      },
      {
        boundary: 'Knowledge base → model context',
        crosses: 'Internally authored text carrying internal authority',
        threats: ['Indirect injection through a poisoned article', 'Latent instructions that fire in a later, unattended session'],
        control: 'Same provenance rule applied to retrieved chunks; editorial audit trail on the corpus.',
      },
      {
        boundary: 'Model → tool invocation',
        crosses: 'A decision to act, made by a component that can be persuaded',
        threats: ['Excessive agency', 'Scope expansion — the authorised action aimed at every customer'],
        control: 'Per-tool identity (ADR-002), approval gate on state-changing calls (ADR-003), end-user identity enforced below the model.',
      },
      {
        boundary: 'Tool → cloud resources',
        crosses: 'A credential with more reach than the tool needs',
        threats: ['Credential access via over-scoped secret read', 'Lateral movement into the payments role'],
        control: 'Least-privilege per tool; the identity graph is re-derived on every policy change and the path count is a build check.',
      },
      {
        boundary: 'Model output → user’s browser',
        crosses: 'Attacker-influenced content rendered by a trusting client',
        threats: ['Zero-click exfiltration through a rendered remote image', 'Link-based egress of conversation context'],
        control: 'Strip remote references, allow-list outbound hosts at the runtime.',
      },
    ],
    outcome: 'Five findings raised, three fixed within the quarter. The route from a support ticket to the cardholder vault was the finding that moved the roadmap; it existed because two reasonable grants composed.',
  },
  {
    id: 'TM-02',
    system: 'Deployment pipeline identity',
    scope: 'GitHub Actions OIDC federation into the production account, and everything the deploy role can pass or launch.',
    assumptions: [
      'Anyone can open a pull request against a public repository in the organization.',
      'A workflow triggered by a pull request runs attacker-authored code if the trigger is chosen carelessly.',
    ],
    boundaries: [
      {
        boundary: 'GitHub → AWS trust',
        crosses: 'An OIDC token whose subject claim is matched by a wildcard',
        threats: ['Any repository or fork in the org minting production deployment credentials'],
        control: 'Pin the subject to an exact repository, branch and environment; a wildcard here is a finding, not a style preference.',
      },
      {
        boundary: 'Deploy role → compute',
        crosses: 'PassRole over every role in the account',
        threats: ['Deployment rights converted to administrative rights by running code as a passed role'],
        control: 'Constrain PassRole by service and role path; alert on privileged passes followed by compute creation.',
      },
    ],
    outcome: 'Both findings accepted. The subject pinning shipped in a week for $12k; the PassRole constraint took a quarter because two roles genuinely needed to be retired first.',
  },
];

/**
 * @typedef {object} IncidentReport
 * @property {string} id
 * @property {string} title
 * @property {string} date
 * @property {string} summary
 * @property {Array<{at: string, event: string}>} timeline
 * @property {string} impact Business impact, in the language the business uses.
 * @property {string[]} whatWorked
 * @property {string[]} whatDidNot
 * @property {string[]} changes
 */

/**
 * Incident write-ups.
 *
 * Both include what did not work. A write-up with no such section is a press
 * release, and it teaches nobody anything.
 *
 * @type {IncidentReport[]}
 */
export const INCIDENTS = [
  {
    id: 'INC-2026-014',
    title: 'Poisoned knowledge-base article steered the support agent',
    date: '2026-02-08',
    summary: 'A support contractor’s account was phished. The attacker edited one knowledge-base article to instruct the agent to issue refunds and, in a second edit, to read an integration secret. The agent’s shared tool role could read the payments signing key.',
    timeline: [
      { at: '02:00:00', event: 'Poisoned article loaded into agent context. Injection score 69 — flagged, medium severity, queued for review.' },
      { at: '02:00:40', event: 'Six refund tool calls in one conversation. Sequence rule fires: critical.' },
      { at: '02:03:12', event: 'Tool role reads the payments signing key. First-observation rule fires; on-call paged.' },
      { at: '02:08:30', event: 'Vault reads begin from a non-Java client. Unexpected-client rule fires.' },
      { at: '02:14:00', event: 'Session revoked, tool role’s secret grant removed, article reverted.' },
    ],
    impact: 'Eleven refunds totalling $4,180 issued to attacker-controlled accounts, all recovered. 240 vault objects read before revocation — cardholder data confirmed exposed, notification obligations triggered in two jurisdictions. Direct cost including forensics and notification: $310k. The modelled cost had the attack run to completion was in the millions.',
    whatWorked: [
      'The sequence detection fired 40 seconds in, on stages that were individually unremarkable.',
      'Deduplication meant the 40 vault reads arrived as one alert with 40 events attached, so the on-call engineer read it.',
      'The organizational guardrail denied the attempt to stop the audit trail, leaving a complete record.',
    ],
    whatDidNot: [
      'The injection score alone had fired 90 minutes earlier on a benign article and was still sitting in a queue. On its own it was not actionable, and treating it as if it were would have made the queue useless.',
      'Nobody could answer "which conversation caused this refund" for eleven minutes, because all three tools shared one role and the audit events all named that role.',
      'The knowledge base had no editorial audit trail, so establishing which edit was hostile meant reading diffs by hand.',
    ],
    changes: [
      'Per-tool identities shipped (ADR-002); the tool role no longer holds any secret grant.',
      'Conversation id is now carried into every downstream call as a session tag.',
      'Knowledge-base edits are versioned with an author trail, and edits by contractor accounts require review.',
    ],
  },
  {
    id: 'INC-2025-231',
    title: 'Near miss — fork pull request minted production deploy credentials',
    date: '2025-12-02',
    summary: 'A researcher demonstrated that a pull request from a fork could assume the production deployment role, because the OIDC trust policy matched any repository in the organization. No production change was made.',
    timeline: [
      { at: 'Day 0', event: 'Researcher opens a pull request from a fork; workflow assumes the deploy role and prints the caller identity.' },
      { at: 'Day 0 + 3h', event: 'Report received through the disclosure inbox.' },
      { at: 'Day 1', event: 'Subject claim pinned to the exact repository and branch. Wildcard trust policies added to the pipeline’s policy checks.' },
    ],
    impact: 'No loss. Had it been used rather than reported, the graph shows the route continuing through PassRole to the production administrator role — the entire estate. The report was worth considerably more than the $12k the fix cost.',
    whatWorked: [
      'A published disclosure channel that reached an engineer the same day.',
      'The identity graph had flagged the same wildcard three weeks earlier; the finding was in the backlog with an owner, which made the fix a one-day job rather than a design argument.',
    ],
    whatDidNot: [
      'The finding was in the backlog and not on the roadmap. A path from "any fork" to "production administrator" should not have been triaged as medium.',
      'No detection existed for a first-seen repository assuming the deploy role. That rule was written the same week and has since fired once, on a legitimate onboarding.',
    ],
    changes: [
      'Trust-policy wildcards are now a build-time failure in the identity pipeline.',
      'Backlog triage for identity findings is driven by shortest-path-to-crown-jewel rather than by CVSS-style severity.',
    ],
  },
];

/**
 * How each portfolio claim is backed by something in this console.
 *
 * @type {Array<{claim: string, artefact: string, where: string}>}
 */
export const PROOF_MAP = [
  { claim: 'Can evaluate cloud authorization correctly, including deny precedence, boundaries and cross-account', artefact: 'Policy engine with an explainable decision chain', where: 'Identity → Explain a decision' },
  { claim: 'Can find privilege-escalation paths nobody designed', artefact: 'Technique-based identity graph with cheapest-path search', where: 'Identity → Blast radius' },
  { claim: 'Can threat model an AI system beyond a checklist', artefact: 'Boundary-based review that terminates in cloud identity', where: 'AI security → Architecture review' },
  { claim: 'Can measure a detector instead of asserting it works', artefact: 'Labelled corpus with published precision, recall and an operating curve', where: 'AI security → Injection lab' },
  { claim: 'Can write detections and prove their value', artefact: 'Correlation rules scored against labelled telemetry for coverage, precision and time to signal', where: 'Detections' },
  { claim: 'Can put a defensible number on risk and rank spending', artefact: 'Monte Carlo loss model with a reproducible seed and a control ranking by return', where: 'Risk' },
  { claim: 'Can communicate to an executive without dumbing it down', artefact: 'One-page brief: exposure, the decision being asked for, and the cost of doing nothing', where: 'Risk → Board brief' },
];

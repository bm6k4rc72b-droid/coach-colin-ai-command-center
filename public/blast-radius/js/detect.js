/**
 * Detection engine and the detections themselves.
 *
 * Detection engineering is where the architecture work gets its feedback loop.
 * The identity graph says which paths exist; these rules say whether anyone
 * would notice somebody walking one. Rules written from an estate's own paths
 * beat a bought rule pack, because a rule pack was written for a different
 * architecture and cannot know that a `GetSecretValue` by one particular role is
 * the moment a support chatbot became a payments service.
 *
 * Four rule shapes cover almost everything worth writing:
 *
 * - **single** — one event matches a predicate. Cheap, and usually noisy.
 * - **baseline** — first time this principal has done this to this resource,
 *   learned from a training window rather than declared by hand.
 * - **sequence** — ordered stages within a time window, correlated by a key.
 *   This is where the leverage is: the stages are individually ordinary.
 * - **threshold** — N of something within a window, per key.
 *
 * Every rule carries the false-positive note its author owed the on-call
 * engineer, and every rule is scored against labelled telemetry, so "we have
 * coverage" is a measurement here rather than a claim.
 *
 * @module blast-radius/detect
 */

/**
 * @typedef {object} Rule
 * @property {string} id
 * @property {string} name
 * @property {'single'|'baseline'|'sequence'|'threshold'} kind
 * @property {'critical'|'high'|'medium'|'low'} severity
 * @property {string} tactic
 * @property {string} rationale Why this rule exists, tied to a specific path.
 * @property {string} falsePositives What benign activity looks like this.
 * @property {string} response First action for whoever picks up the alert.
 * @property {(event: object) => boolean} [match] For single and baseline rules.
 * @property {(event: object) => string} [key] Grouping key.
 * @property {Array<{label: string, match: (event: object) => boolean}>} [stages]
 * @property {number} [within] Window in milliseconds.
 * @property {number} [count] Threshold count.
 */

const MINUTE = 60_000;

/**
 * The detection set for the Solstice estate.
 *
 * @type {Rule[]}
 */
export const RULES = [
  {
    id: 'det-agent-tool',
    name: 'Injected context followed by a state-changing tool call',
    kind: 'sequence',
    severity: 'critical',
    tactic: 'Execution',
    rationale: 'The first two steps of the agent kill chain. Neither stage is alarming alone: agents load context constantly and refunds are the job. The pairing, inside ten minutes, is the attack.',
    falsePositives: 'A knowledge-base article that legitimately scores high — policy text about refunds reads like instructions, because it is instructions.',
    response: 'Freeze the conversation, pull the context item, check whether the refund executed.',
    key: (event) => event.actor,
    within: 10 * MINUTE,
    stages: [
      { label: 'High-scoring context loaded', match: (event) => event.action === 'agent:ContextLoad' && Number(event.meta?.injectionScore ?? 0) >= 45 },
      { label: 'State-changing tool invoked', match: (event) => event.action === 'agent:ToolCall' && event.resource === 'issue_refund' },
    ],
  },
  {
    id: 'det-secret-read',
    name: 'Principal reads a secret for the first time',
    kind: 'baseline',
    severity: 'high',
    tactic: 'Credential access',
    rationale: 'Stored credentials are the cheapest hop in the graph. Which principals read which secrets is one of the most stable patterns in a cloud estate, so a first-time read is a strong, low-volume signal.',
    falsePositives: 'A genuine new deployment reads a new secret. Suppressed by requiring the principal to be outside the deployment pipeline.',
    response: 'Confirm the change ticket; if none, rotate the secret before investigating further.',
    match: (event) => event.action === 'secretsmanager:GetSecretValue' && event.actor !== 'role-ci-deploy',
    key: (event) => `${event.actor}|${event.resource}`,
  },
  {
    id: 'det-federation',
    name: 'Web identity assumed from an unseen repository',
    kind: 'baseline',
    severity: 'high',
    tactic: 'Initial access',
    rationale: 'The trust policy accepts a wildcard subject, so the control that should exist in IAM has to be reconstructed in detection until the wildcard is fixed.',
    falsePositives: 'A new repository legitimately onboarding to the pipeline — which is exactly the event that should also require a change record.',
    response: 'Check the repository and the workflow trigger; a pull_request trigger from a fork is an incident.',
    match: (event) => event.action === 'sts:AssumeRoleWithWebIdentity',
    key: (event) => String(event.meta?.sub ?? '').split(':ref')[0].split(':pull')[0],
  },
  {
    id: 'det-passrole',
    name: 'PassRole of a privileged role followed by compute creation',
    kind: 'sequence',
    severity: 'critical',
    tactic: 'Privilege escalation',
    rationale: 'The graph shows deployment credentials reaching production-admin through PassRole. Deployments pass roles all day, so the signal is passing a *privileged* role and then immediately creating something to run it.',
    falsePositives: 'A genuine platform deployment that creates a function running as an administrative role — which should not exist, and finding one is a useful outcome too.',
    response: 'Delete the function, revoke the session, and check for access keys created in the following minutes.',
    key: (event) => event.sourceIp,
    within: 15 * MINUTE,
    stages: [
      { label: 'Privileged role passed', match: (event) => event.action === 'iam:PassRole' && /production-admin|platform-engineering/.test(event.resource) },
      { label: 'Compute created', match: (event) => event.action === 'lambda:CreateFunction' || event.action === 'ec2:RunInstances' },
    ],
  },
  {
    id: 'det-crown-access',
    name: 'Cardholder vault read by an unexpected client',
    kind: 'single',
    severity: 'critical',
    tactic: 'Collection',
    rationale: 'The vault is only ever read by the payments service, which is a Java application. The identity can be stolen; the user agent tends to follow the attacker rather than the victim.',
    falsePositives: 'A payments-service library upgrade changes the agent string. This rule needs an owner who is told about those, which is the price of it being this specific.',
    response: 'Treat as a live data-theft event: revoke the role session immediately, then investigate.',
    match: (event) => /cardholder-vault/.test(event.resource)
      && event.action.startsWith('s3:')
      && !/^aws-sdk-java/.test(event.userAgent),
  },
  {
    id: 'det-vault-volume',
    name: 'Bulk read of the cardholder vault',
    kind: 'threshold',
    severity: 'critical',
    tactic: 'Exfiltration',
    rationale: 'Catches the objective itself, independent of how the attacker arrived. A volume rule is the backstop for every path the graph has not been told about yet.',
    falsePositives: 'Quarterly reconciliation jobs. They run from a known IP range on a schedule and should be excluded by identity, not by lowering the threshold.',
    response: 'Cut the session, then reconstruct the object list from the trail to size the breach.',
    match: (event) => /cardholder-vault/.test(event.resource) && event.action === 's3:GetObject',
    key: (event) => event.actor,
    count: 25,
    within: 30 * MINUTE,
  },
  {
    id: 'det-audit-tamper',
    name: 'Attempt to stop or delete the audit trail',
    kind: 'single',
    severity: 'high',
    tactic: 'Defense evasion',
    rationale: 'The organizational guardrail already denies this, so every occurrence is either a misconfiguration or somebody who has escalated far enough to try. A denied attempt is the highest-quality signal in the estate.',
    falsePositives: 'Effectively none. Any hit deserves a page.',
    response: 'Page the on-call. Assume the principal is compromised and revoke its sessions.',
    match: (event) => event.action.startsWith('cloudtrail:Stop') || event.action.startsWith('cloudtrail:Delete'),
  },
  {
    id: 'det-trust-rewrite',
    name: 'Trust policy modified outside the identity pipeline',
    kind: 'single',
    severity: 'high',
    tactic: 'Persistence',
    rationale: 'Rewriting a trust policy is a two-line route to any role in the account. Written because the graph found the edge — not because the estate has ever seen it used.',
    falsePositives: 'Identity-pipeline runs, excluded by principal.',
    response: 'Diff the trust document against source control and revert.',
    match: (event) => event.action === 'iam:UpdateAssumeRolePolicy' && event.actor !== 'role-identity-pipeline',
  },
  {
    id: 'det-injection-score',
    name: 'High-scoring content entering agent context',
    kind: 'single',
    severity: 'medium',
    tactic: 'Initial access',
    rationale: 'The detector’s own output as telemetry. On its own it is a lead, not an incident, which is why it is medium and why the sequence rule above exists.',
    falsePositives: 'Measured, not guessed: the corpus benchmark puts precision near 0.92 at the default threshold, so roughly one in twelve of these is an ordinary ticket.',
    response: 'Queue for review; escalate only if a tool call follows.',
    match: (event) => event.action === 'agent:ContextLoad' && Number(event.meta?.injectionScore ?? 0) >= 45,
  },
];

/**
 * @typedef {object} Alert
 * @property {string} rule Rule id.
 * @property {string} name
 * @property {string} severity
 * @property {number} ts Timestamp the rule had enough evidence to fire.
 * @property {string} key Correlation key.
 * @property {object[]} events Contributing events.
 * @property {string} detail What fired, in one line.
 */

/**
 * Run a rule set over an event stream.
 *
 * @param {object[]} events Chronologically ordered events.
 * @param {Rule[]} [rules] Rules to run.
 * @param {{learnUntil?: number, cooldown?: number}} [options] `learnUntil` is
 *   the timestamp at which baseline learning stops and detection starts; before
 *   it, baseline rules only observe. `cooldown` collapses repeat alerts from the
 *   same rule and key, defaulting to 30 minutes — without it a single incident
 *   arrives as forty pages and the fortieth is the one nobody reads.
 * @returns {Alert[]} Alerts in time order, deduplicated, each carrying the
 *   number of repeats it absorbed.
 */
export function runDetections(events, rules = RULES, options = {}) {
  const alerts = [];
  const learnUntil = options.learnUntil ?? 0;
  const cooldown = options.cooldown ?? 30 * MINUTE;

  for (const rule of rules) {
    if (rule.kind === 'single') {
      for (const event of events) {
        if (!rule.match(event)) continue;
        alerts.push({
          rule: rule.id, name: rule.name, severity: rule.severity, ts: event.ts,
          key: event.actor, events: [event],
          detail: `${event.actor} · ${event.action} · ${shortResource(event.resource)}`,
        });
      }
    }

    if (rule.kind === 'baseline') {
      const known = new Set();
      for (const event of events) {
        if (!rule.match(event)) continue;
        const key = rule.key(event);
        if (event.ts < learnUntil) { known.add(key); continue; }
        if (known.has(key)) continue;
        known.add(key);
        alerts.push({
          rule: rule.id, name: rule.name, severity: rule.severity, ts: event.ts,
          key, events: [event],
          detail: `First observation of ${key.replace('|', ' → ')}`,
        });
      }
    }

    if (rule.kind === 'sequence') {
      const pending = new Map();
      for (const event of events) {
        const key = rule.key(event);
        const state = pending.get(key) ?? { index: 0, events: [] };
        if (state.events.length > 0 && event.ts - state.events[0].ts > rule.within) {
          state.index = 0;
          state.events = [];
        }
        if (rule.stages[state.index].match(event)) {
          state.index += 1;
          state.events.push(event);
          if (state.index === rule.stages.length) {
            alerts.push({
              rule: rule.id, name: rule.name, severity: rule.severity, ts: event.ts,
              key, events: [...state.events],
              detail: rule.stages.map((stage, index) => `${index + 1}. ${stage.label}`).join(' → '),
            });
            state.index = 0;
            state.events = [];
          }
        }
        pending.set(key, state);
      }
    }

    if (rule.kind === 'threshold') {
      const windows = new Map();
      const fired = new Set();
      for (const event of events) {
        if (!rule.match(event)) continue;
        const key = rule.key(event);
        const window = (windows.get(key) ?? []).filter((candidate) => event.ts - candidate.ts <= rule.within);
        window.push(event);
        windows.set(key, window);
        if (window.length >= rule.count && !fired.has(key)) {
          fired.add(key);
          alerts.push({
            rule: rule.id, name: rule.name, severity: rule.severity, ts: event.ts,
            key, events: [...window],
            detail: `${window.length} matching events from ${key} within ${Math.round(rule.within / MINUTE)} minutes`,
          });
        }
      }
    }
  }

  return deduplicate(alerts.sort((a, b) => a.ts - b.ts), cooldown);
}

/**
 * Collapse repeat alerts from the same rule and key inside a cooldown window.
 *
 * The absorbed events stay attached to the surviving alert, so an investigation
 * still sees all forty vault reads — it just does not get forty pages about
 * them. Suppression is reported rather than silent, because a rule that
 * absorbed 300 repeats is telling you something about itself.
 *
 * @param {Alert[]} alerts Alerts in time order.
 * @param {number} cooldown Window in milliseconds.
 * @returns {Alert[]} Deduplicated alerts, each with a `repeats` count.
 */
export function deduplicate(alerts, cooldown) {
  const lastFired = new Map();
  const kept = [];
  for (const alert of alerts) {
    const key = `${alert.rule}|${alert.key}`;
    const previous = lastFired.get(key);
    if (previous && alert.ts - previous.ts <= cooldown) {
      previous.repeats += 1;
      previous.events.push(...alert.events);
      continue;
    }
    const entry = { ...alert, repeats: 0 };
    lastFired.set(key, entry);
    kept.push(entry);
  }
  return kept;
}

/**
 * Shorten an ARN for display.
 *
 * @param {string} resource Resource identifier.
 * @returns {string} Trailing, human-meaningful portion.
 */
export function shortResource(resource) {
  const parts = String(resource).split(/[:/]/).filter(Boolean);
  return parts.slice(-2).join('/') || resource;
}

/**
 * @typedef {object} DetectionScore
 * @property {number} alerts Total alerts raised.
 * @property {number} truePositives Alerts touching a labelled attack.
 * @property {number} falsePositives Alerts touching none.
 * @property {number} precision
 * @property {number} noisePerDay False positives per day.
 * @property {Array<{id: string, name: string, detected: boolean, mttdMs: number|null, coverage: number, byRule: string[]}>} attacks
 * @property {Array<{id: string, name: string, severity: string, fired: number, truePositives: number, falsePositives: number}>} rules
 */

/**
 * Score a rule set against labelled telemetry.
 *
 * The headline number is time to detection, not alert count. A rule set that
 * fires forty times after the data has left is worse than one rule that fires
 * once at minute three.
 *
 * @param {Alert[]} alerts Alerts produced by {@link runDetections}.
 * @param {object[]} events The stream they came from.
 * @param {Rule[]} [rules] Rules that were run, so silent ones still appear.
 * @returns {DetectionScore} Per-attack and per-rule results.
 */
export function scoreDetections(alerts, events, rules = RULES) {
  const attackIds = [...new Set(events.filter((event) => event.attack).map((event) => event.attack))];
  const starts = new Map();
  const stepCounts = new Map();
  for (const event of events) {
    if (!event.attack) continue;
    if (!starts.has(event.attack) || event.ts < starts.get(event.attack)) starts.set(event.attack, event.ts);
    const steps = stepCounts.get(event.attack) ?? new Set();
    steps.add(event.step);
    stepCounts.set(event.attack, steps);
  }

  let truePositives = 0;
  let falsePositives = 0;
  const perRule = new Map(rules.map((rule) => [rule.id, {
    id: rule.id, name: rule.name, severity: rule.severity, fired: 0, truePositives: 0, falsePositives: 0,
  }]));
  const perAttack = new Map(attackIds.map((id) => [id, { first: null, steps: new Set(), byRule: new Set() }]));

  for (const alert of alerts) {
    const attacks = new Set(alert.events.map((event) => event.attack).filter(Boolean));
    const entry = perRule.get(alert.rule);
    if (entry) entry.fired += 1;
    if (attacks.size > 0) {
      truePositives += 1;
      if (entry) entry.truePositives += 1;
      for (const attack of attacks) {
        const record = perAttack.get(attack);
        if (!record) continue;
        if (record.first === null || alert.ts < record.first) record.first = alert.ts;
        record.byRule.add(alert.rule);
        for (const event of alert.events) if (event.attack === attack) record.steps.add(event.step);
      }
    } else {
      falsePositives += 1;
      if (entry) entry.falsePositives += 1;
    }
  }

  const spanDays = events.length > 0
    ? Math.max(1, (events[events.length - 1].ts - events[0].ts) / 86_400_000)
    : 1;

  return {
    alerts: alerts.length,
    truePositives,
    falsePositives,
    precision: alerts.length === 0 ? 0 : truePositives / alerts.length,
    noisePerDay: falsePositives / spanDays,
    attacks: attackIds.map((id) => {
      const record = perAttack.get(id);
      const totalSteps = stepCounts.get(id)?.size ?? 1;
      return {
        id,
        detected: record.first !== null,
        mttdMs: record.first === null ? null : record.first - starts.get(id),
        coverage: record.steps.size / totalSteps,
        byRule: [...record.byRule],
      };
    }),
    rules: [...perRule.values()],
  };
}

/**
 * Format a duration for an incident timeline.
 *
 * @param {number|null} ms Duration in milliseconds.
 * @returns {string} Compact human-readable duration.
 */
export function formatDuration(ms) {
  if (ms === null || ms === undefined) return 'not detected';
  if (ms < MINUTE) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / MINUTE)}m`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  return `${(ms / 86_400_000).toFixed(1)}d`;
}

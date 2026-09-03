/**
 * Policy evaluation engine.
 *
 * Every other module in Blast Radius eventually asks the same question: *can
 * this principal perform this action on this resource?* This file is the only
 * place that answers it, and it answers with its work shown — an ordered list
 * of the checks that ran and which statement decided the outcome. An answer
 * nobody can audit is worthless in an architecture review, so `evaluate`
 * returns the reasoning, not just a boolean.
 *
 * The model follows AWS's evaluation chain, which is the strictest of the
 * major clouds and a superset of the others' semantics:
 *
 *   1. A service control policy (organization guardrail) must allow the call.
 *   2. An explicit `Deny` anywhere wins, unconditionally.
 *   3. A permissions boundary, if attached, must also allow the call.
 *   4. Identity policy allows — or, cross-account, identity *and* resource
 *      policy must both allow.
 *   5. Otherwise: implicit deny.
 *
 * Entra ID and GCP estates are expressed in the same shape by
 * {@link module:blast-radius/estate}: a GCP role binding becomes a statement
 * with one action glob and one resource prefix, an Entra app role becomes a
 * statement over a `graph:` action namespace. The vocabulary differs; the
 * lattice does not.
 *
 * @module blast-radius/iam
 */

/**
 * @typedef {object} Condition
 * @property {string} operator Condition operator, e.g. `StringEquals`,
 *   `StringLike`, `ArnLike`, `Bool`, `IpAddress`, `NumericLessThan`, `Null`.
 *   A trailing `IfExists` makes the condition pass when the key is absent.
 * @property {string} key Context key, e.g. `aws:MultiFactorAuthPresent`.
 * @property {string[]} values Values the key is tested against (OR within a
 *   single condition, AND across conditions — same as the real thing).
 */

/**
 * @typedef {object} Statement
 * @property {string} [sid] Statement id, used in explanations.
 * @property {'Allow'|'Deny'} effect
 * @property {string[]} [actions] Action globs this statement covers.
 * @property {string[]} [notActions] Inverse form: every action *except* these.
 * @property {string[]} [resources] Resource globs, defaulting to `['*']`.
 * @property {string[]} [notResources] Inverse form.
 * @property {string[]} [principals] Only meaningful on resource and trust
 *   policies: which principals the statement speaks about.
 * @property {Condition[]} [conditions]
 */

/**
 * @typedef {object} Policy
 * @property {string} id
 * @property {string} name
 * @property {'identity'|'resource'|'trust'|'boundary'|'scp'} kind
 * @property {Statement[]} statements
 */

/**
 * @typedef {object} AccessRequest
 * @property {string} action Fully qualified action, e.g. `s3:GetObject`.
 * @property {string} resource Resource identifier the action targets.
 * @property {string} [principal] ARN of the calling principal.
 * @property {Record<string, string|boolean|number>} [context] Request context
 *   keys — MFA state, source IP, federated subject, and so on.
 * @property {boolean} [sameAccount] Whether principal and resource live in the
 *   same account. Defaults to true.
 */

/**
 * @typedef {object} PolicySet
 * @property {Policy[]} [identity] Policies attached to the principal.
 * @property {Policy} [resource] Policy attached to the resource being touched.
 * @property {Policy} [boundary] Permissions boundary on the principal.
 * @property {Policy[]} [scps] Organizational guardrails in scope.
 */

/**
 * @typedef {object} DecisionStep
 * @property {string} stage Which link of the chain ran.
 * @property {'allow'|'deny'|'pass'|'skip'} outcome
 * @property {string} detail Human-readable explanation.
 * @property {string} [policy] Policy name that produced the outcome.
 * @property {string} [sid] Statement id that produced the outcome.
 */

/**
 * @typedef {object} Decision
 * @property {boolean} allowed
 * @property {string} reason One-line summary suitable for a report.
 * @property {DecisionStep[]} chain Every stage that ran, in order.
 */

const WILDCARD_CACHE = new Map();

/**
 * Compile a policy glob (`*` and `?`) into an anchored regular expression.
 *
 * Compiled patterns are cached because a blast-radius sweep over a mid-sized
 * estate evaluates the same globs tens of thousands of times.
 *
 * @param {string} pattern Glob to compile.
 * @param {boolean} [caseInsensitive] Whether matching ignores case. Action
 *   names are case-insensitive in AWS; resource ARNs are not.
 * @returns {RegExp} Anchored expression equivalent to the glob.
 */
export function globToRegExp(pattern, caseInsensitive = false) {
  const cacheKey = `${caseInsensitive ? 'i' : 's'}:${pattern}`;
  const cached = WILDCARD_CACHE.get(cacheKey);
  if (cached) return cached;
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const compiled = new RegExp(`^${escaped}$`, caseInsensitive ? 'i' : '');
  WILDCARD_CACHE.set(cacheKey, compiled);
  return compiled;
}

/**
 * Test a value against a list of globs.
 *
 * @param {string} value Value under test.
 * @param {string[]|undefined} patterns Globs to try.
 * @param {boolean} [caseInsensitive] Case sensitivity of the comparison.
 * @returns {boolean} True when any glob matches.
 */
export function matchesAny(value, patterns, caseInsensitive = false) {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((pattern) => globToRegExp(pattern, caseInsensitive).test(value));
}

/**
 * Evaluate one condition block against the request context.
 *
 * Unknown operators fail closed: a condition this engine cannot interpret is
 * treated as unsatisfied, so the engine under-reports access rather than
 * inventing it. Over-reporting access is how a review misses a finding.
 *
 * @param {Condition} condition Condition to test.
 * @param {Record<string, string|boolean|number>} context Request context keys.
 * @returns {boolean} True when the condition is satisfied.
 */
export function evaluateCondition(condition, context = {}) {
  const ifExists = condition.operator.endsWith('IfExists');
  const operator = ifExists ? condition.operator.slice(0, -'IfExists'.length) : condition.operator;
  const present = Object.prototype.hasOwnProperty.call(context, condition.key);
  const raw = context[condition.key];

  if (operator === 'Null') {
    const wantAbsent = String(condition.values[0]).toLowerCase() === 'true';
    return wantAbsent ? !present : present;
  }
  if (!present) return ifExists;

  const value = String(raw);
  switch (operator) {
    case 'StringEquals':
      return condition.values.includes(value);
    case 'StringNotEquals':
      return !condition.values.includes(value);
    case 'StringEqualsIgnoreCase':
      return condition.values.some((candidate) => candidate.toLowerCase() === value.toLowerCase());
    case 'StringLike':
    case 'ArnLike':
      return matchesAny(value, condition.values);
    case 'StringNotLike':
    case 'ArnNotLike':
      return !matchesAny(value, condition.values);
    case 'Bool':
      return condition.values.some((candidate) => String(candidate).toLowerCase() === value.toLowerCase());
    case 'IpAddress':
      return condition.values.some((cidr) => ipInCidr(value, cidr));
    case 'NotIpAddress':
      return !condition.values.some((cidr) => ipInCidr(value, cidr));
    case 'NumericEquals':
      return condition.values.some((candidate) => Number(candidate) === Number(value));
    case 'NumericLessThan':
      return Number(value) < Number(condition.values[0]);
    case 'NumericGreaterThan':
      return Number(value) > Number(condition.values[0]);
    case 'DateLessThan':
      return Date.parse(value) < Date.parse(condition.values[0]);
    case 'DateGreaterThan':
      return Date.parse(value) > Date.parse(condition.values[0]);
    default:
      return false;
  }
}

/**
 * Test an IPv4 address for membership of a CIDR block.
 *
 * @param {string} address Dotted-quad address.
 * @param {string} cidr Block in `a.b.c.d/len` form; a bare address means /32.
 * @returns {boolean} True when the address falls inside the block.
 */
export function ipInCidr(address, cidr) {
  const [network, lengthText] = cidr.split('/');
  const length = lengthText === undefined ? 32 : Number(lengthText);
  const toInt = (text) => text.split('.').reduce((acc, octet) => (acc * 256) + Number(octet), 0);
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(address) || !/^(\d{1,3}\.){3}\d{1,3}$/.test(network)) return false;
  if (length <= 0) return true;
  const mask = length >= 32 ? 0xffffffff : (0xffffffff << (32 - length)) >>> 0;
  return ((toInt(address) & mask) >>> 0) === ((toInt(network) & mask) >>> 0);
}

/**
 * Decide whether a single statement speaks to a request.
 *
 * @param {Statement} statement Statement under test.
 * @param {AccessRequest} request Request being evaluated.
 * @returns {boolean} True when action, resource, principal and conditions all
 *   match, meaning the statement's effect applies.
 */
export function statementApplies(statement, request) {
  const actionHit = statement.notActions
    ? !matchesAny(request.action, statement.notActions, true)
    : matchesAny(request.action, statement.actions ?? ['*'], true);
  if (!actionHit) return false;

  const resourceHit = statement.notResources
    ? !matchesAny(request.resource, statement.notResources)
    : matchesAny(request.resource, statement.resources ?? ['*']);
  if (!resourceHit) return false;

  if (statement.principals && request.principal !== undefined
    && !matchesAny(request.principal, statement.principals)) return false;

  const conditions = statement.conditions ?? [];
  return conditions.every((condition) => evaluateCondition(condition, request.context ?? {}));
}

/**
 * Find the first statement in a policy that applies with a given effect.
 *
 * @param {Policy|undefined} policy Policy to scan.
 * @param {AccessRequest} request Request being evaluated.
 * @param {'Allow'|'Deny'} effect Effect being looked for.
 * @returns {Statement|null} The matching statement, or null.
 */
function findStatement(policy, request, effect) {
  if (!policy) return null;
  return policy.statements.find(
    (statement) => statement.effect === effect && statementApplies(statement, request),
  ) ?? null;
}

/**
 * Evaluate a request against a full policy set.
 *
 * @param {AccessRequest} request Request being evaluated.
 * @param {PolicySet} policies Policies in scope for the request.
 * @returns {Decision} Verdict plus the chain of checks that produced it.
 */
export function evaluate(request, policies = {}) {
  const chain = /** @type {DecisionStep[]} */ ([]);
  const identity = policies.identity ?? [];
  const sameAccount = request.sameAccount !== false;

  const scps = policies.scps ?? [];
  if (scps.length > 0) {
    const scpDeny = scps.map((scp) => ({ scp, hit: findStatement(scp, request, 'Deny') }))
      .find((entry) => entry.hit);
    if (scpDeny) {
      chain.push({
        stage: 'Service control policy',
        outcome: 'deny',
        detail: `Organization guardrail explicitly denies ${request.action}.`,
        policy: scpDeny.scp.name,
        sid: scpDeny.hit.sid,
      });
      return { allowed: false, reason: `Denied by organization guardrail ${scpDeny.scp.name}.`, chain };
    }
    const scpAllow = scps.map((scp) => ({ scp, hit: findStatement(scp, request, 'Allow') }))
      .find((entry) => entry.hit);
    if (!scpAllow) {
      chain.push({
        stage: 'Service control policy',
        outcome: 'deny',
        detail: `No guardrail permits ${request.action} in this organizational unit.`,
      });
      return { allowed: false, reason: 'Outside the organization guardrail allow-list.', chain };
    }
    chain.push({
      stage: 'Service control policy',
      outcome: 'pass',
      detail: 'Guardrail permits the action; evaluation continues.',
      policy: scpAllow.scp.name,
      sid: scpAllow.hit.sid,
    });
  } else {
    chain.push({ stage: 'Service control policy', outcome: 'skip', detail: 'No guardrail in scope.' });
  }

  const denySources = [
    ...identity.map((policy) => ['Identity policy', policy]),
    ...(policies.resource ? [['Resource policy', policies.resource]] : []),
    ...(policies.boundary ? [['Permissions boundary', policies.boundary]] : []),
  ];
  for (const [stage, policy] of denySources) {
    const hit = findStatement(policy, request, 'Deny');
    if (hit) {
      chain.push({
        stage,
        outcome: 'deny',
        detail: `Explicit deny on ${request.action}; nothing overrides it.`,
        policy: policy.name,
        sid: hit.sid,
      });
      return { allowed: false, reason: `Explicit deny in ${policy.name}.`, chain };
    }
  }
  chain.push({ stage: 'Explicit deny sweep', outcome: 'pass', detail: 'No explicit deny matched.' });

  if (policies.boundary) {
    const hit = findStatement(policies.boundary, request, 'Allow');
    if (!hit) {
      chain.push({
        stage: 'Permissions boundary',
        outcome: 'deny',
        detail: 'Boundary does not permit the action, so the identity grant cannot take effect.',
        policy: policies.boundary.name,
      });
      return { allowed: false, reason: `Outside permissions boundary ${policies.boundary.name}.`, chain };
    }
    chain.push({
      stage: 'Permissions boundary',
      outcome: 'pass',
      detail: 'Boundary permits the action.',
      policy: policies.boundary.name,
      sid: hit.sid,
    });
  }

  const identityHit = identity.map((policy) => ({ policy, hit: findStatement(policy, request, 'Allow') }))
    .find((entry) => entry.hit);
  const resourceHit = findStatement(policies.resource, request, 'Allow');

  if (sameAccount) {
    if (identityHit) {
      chain.push({
        stage: 'Identity policy',
        outcome: 'allow',
        detail: `Grants ${request.action} on the requested resource.`,
        policy: identityHit.policy.name,
        sid: identityHit.hit.sid,
      });
      return { allowed: true, reason: `Allowed by ${identityHit.policy.name}.`, chain };
    }
    if (resourceHit) {
      chain.push({
        stage: 'Resource policy',
        outcome: 'allow',
        detail: 'Resource policy names this principal directly.',
        policy: policies.resource.name,
        sid: resourceHit.sid,
      });
      return { allowed: true, reason: `Allowed by resource policy ${policies.resource.name}.`, chain };
    }
  } else {
    if (identityHit && resourceHit) {
      chain.push({
        stage: 'Cross-account',
        outcome: 'allow',
        detail: 'Both the caller’s identity policy and the resource policy allow the action.',
        policy: `${identityHit.policy.name} + ${policies.resource.name}`,
        sid: resourceHit.sid,
      });
      return { allowed: true, reason: 'Allowed by matching identity and resource grants.', chain };
    }
    chain.push({
      stage: 'Cross-account',
      outcome: 'deny',
      detail: identityHit
        ? 'Identity policy allows, but the resource policy does not name this principal.'
        : 'Resource policy allows, but the caller has no matching identity grant.',
    });
    return { allowed: false, reason: 'Cross-account access needs both sides to agree.', chain };
  }

  chain.push({
    stage: 'Implicit deny',
    outcome: 'deny',
    detail: 'Nothing in scope grants the action.',
  });
  return { allowed: false, reason: 'Implicit deny — no matching grant.', chain };
}

/**
 * Convenience wrapper for callers that only need the verdict.
 *
 * @param {AccessRequest} request Request being evaluated.
 * @param {PolicySet} policies Policies in scope.
 * @returns {boolean} Whether the request is allowed.
 */
export function allows(request, policies) {
  return evaluate(request, policies).allowed;
}

/**
 * Expand a principal's grants over a catalogue of action/resource pairs.
 *
 * This is deliberately catalogue-driven rather than exhaustive: enumerating the
 * real product of every cloud action and every resource is both enormous and
 * mostly noise. The catalogue holds the actions that actually move a review —
 * privilege manipulation, credential access, data egress, compute creation.
 *
 * @param {AccessRequest[]} probes Requests to test.
 * @param {PolicySet} policies Policies in scope.
 * @returns {{allowed: AccessRequest[], denied: AccessRequest[]}} Partition of
 *   the probe list.
 */
export function expandPermissions(probes, policies) {
  const allowed = [];
  const denied = [];
  for (const probe of probes) {
    (evaluate(probe, policies).allowed ? allowed : denied).push(probe);
  }
  return { allowed, denied };
}

/**
 * Score how wide a set of statements is, on a 0–100 scale.
 *
 * Wildcards in the action and resource fields, and the absence of any
 * condition, are what turn a role into a liability. The score is a heuristic
 * for sorting a review queue, not a risk number — {@link module:blast-radius/fair}
 * does risk.
 *
 * @param {Policy} policy Policy to score.
 * @returns {{score: number, findings: string[]}} Breadth score and the reasons
 *   behind it, worst first.
 */
export function scorePolicyBreadth(policy) {
  let score = 0;
  const findings = [];
  for (const statement of policy.statements) {
    if (statement.effect !== 'Allow') continue;
    const actions = statement.actions ?? ['*'];
    const resources = statement.resources ?? ['*'];
    const unconditioned = (statement.conditions ?? []).length === 0;

    if (actions.includes('*') && resources.includes('*')) {
      score += 60;
      findings.push(`${statement.sid ?? 'statement'}: full administrative grant (action ∗ on resource ∗).`);
    } else if (actions.includes('*')) {
      score += 35;
      findings.push(`${statement.sid ?? 'statement'}: every action on ${resources.join(', ')}.`);
    } else if (resources.includes('*')) {
      score += 25;
      findings.push(`${statement.sid ?? 'statement'}: ${actions.join(', ')} on every resource in the account.`);
    }
    const serviceWildcards = actions.filter((action) => /^[a-z0-9-]+:\*$/i.test(action));
    if (serviceWildcards.length > 0) {
      score += 12 * serviceWildcards.length;
      findings.push(`${statement.sid ?? 'statement'}: service-wide wildcard ${serviceWildcards.join(', ')}.`);
    }
    if (unconditioned && (actions.includes('*') || resources.includes('*'))) {
      score += 8;
      findings.push(`${statement.sid ?? 'statement'}: no condition keys — grant applies from any network, with or without MFA.`);
    }
  }
  return { score: Math.min(100, score), findings };
}

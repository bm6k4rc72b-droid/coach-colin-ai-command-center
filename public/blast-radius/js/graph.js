/**
 * Identity graph and privilege-escalation path search.
 *
 * A permission review that reads policies one at a time finds sloppy wildcards.
 * It does not find the thing that actually causes incidents: a chain of
 * individually reasonable grants that composes into a route from a low-value
 * identity to a crown-jewel resource. Nobody approved the chain, because nobody
 * ever saw it — each link was approved on its own.
 *
 * So this module turns the estate into a directed graph whose nodes are
 * principals and whose edges are *techniques* — concrete, named ways one
 * identity can come to act as another. Every edge is derived by asking the
 * policy engine real questions, and carries the evidence that produced it, so a
 * path can be read out to an engineer or an executive without hand-waving.
 *
 * Edge weights are attacker cost: how much work and noise a hop takes. The
 * shortest path is therefore the one an attacker would actually walk, not the
 * one with the fewest nodes.
 *
 * @module blast-radius/graph
 */

import { evaluate } from './iam.js';

/**
 * @typedef {object} Edge
 * @property {string} from Source principal id.
 * @property {string} to Destination principal id.
 * @property {string} technique Technique id.
 * @property {string} label Short technique name.
 * @property {string} tactic Attack-lifecycle phase the technique belongs to.
 * @property {number} cost Attacker effort/noise, 1 (trivial) to 5 (hard).
 * @property {string} evidence Why this edge exists, in one sentence.
 * @property {string} [detection] Id of the detection that would catch it.
 * @property {string} [control] The control that would remove the edge.
 */

/**
 * Techniques the graph builder knows how to look for.
 *
 * Each entry is data plus a `find` function; adding a technique means adding
 * one object here and nothing else. `cost` is calibrated against how much of
 * the hop is one API call versus a chain requiring infrastructure, waiting, or
 * user interaction.
 *
 * @type {Array<{id: string, label: string, tactic: string, cost: number,
 *   control: string, detection: string,
 *   find: (estate: object, from: object) => Array<{to: string, evidence: string, cost?: number}>}>}
 */
export const TECHNIQUES = [
  {
    id: 'sts-assume-role',
    label: 'Assume role',
    tactic: 'Lateral movement',
    cost: 1,
    control: 'Scope trust policies to named principals and require an external id or MFA.',
    detection: 'det-role-chain',
    find(estate, from) {
      const found = [];
      for (const target of estate.principals) {
        if (target.id === from.id || !target.trust) continue;
        const callerAllowed = can(estate, from.id, 'sts:AssumeRole', target.arn).allowed;
        if (!callerAllowed) continue;
        const trust = evaluate(
          { action: 'sts:AssumeRole', resource: target.arn, principal: from.arn, context: sessionContext(from) },
          { resource: estate.policies[target.trust] },
        );
        if (!trust.allowed) continue;
        found.push({
          to: target.id,
          evidence: `${from.name} may call sts:AssumeRole on ${target.name}, and that role's trust policy accepts it (${trust.reason})`,
        });
      }
      return found;
    },
  },
  {
    id: 'iam-trust-rewrite',
    label: 'Rewrite trust policy',
    tactic: 'Privilege escalation',
    cost: 2,
    control: 'Deny iam:UpdateAssumeRolePolicy outside the identity pipeline via a service control policy.',
    detection: 'det-trust-rewrite',
    find(estate, from) {
      return estate.principals
        .filter((target) => target.id !== from.id && target.kind === 'role'
          && can(estate, from.id, 'iam:UpdateAssumeRolePolicy', target.arn).allowed)
        .map((target) => ({
          to: target.id,
          evidence: `${from.name} can rewrite ${target.name}'s trust policy and name itself as a trusted principal`,
        }));
    },
  },
  {
    id: 'iam-policy-write',
    label: 'Grant itself permissions',
    tactic: 'Privilege escalation',
    cost: 2,
    control: 'Attach a permissions boundary to every non-pipeline principal.',
    detection: 'det-policy-write',
    find(estate, from) {
      const writes = ['iam:PutRolePolicy', 'iam:AttachRolePolicy', 'iam:CreatePolicyVersion', 'iam:PutUserPolicy'];
      const canWriteSelf = writes.some((action) => can(estate, from.id, action, from.arn).allowed)
        || writes.some((action) => can(estate, from.id, action, '*').allowed);
      if (!canWriteSelf) return [];
      return estate.principals
        .filter((target) => target.id !== from.id && target.account === from.account)
        .map((target) => ({
          to: target.id,
          evidence: `${from.name} can write IAM policy documents, so it can grant itself whatever ${target.name} holds`,
        }));
    },
  },
  {
    id: 'iam-passrole-compute',
    label: 'Pass role to compute',
    tactic: 'Privilege escalation',
    cost: 2,
    control: 'Constrain iam:PassRole with iam:PassedToService and a role-path prefix.',
    detection: 'det-passrole',
    find(estate, from) {
      const launchers = ['lambda:CreateFunction', 'ec2:RunInstances', 'ecs:RunTask', 'glue:CreateDevEndpoint'];
      const launcher = launchers.find((action) => can(estate, from.id, action, '*').allowed);
      if (!launcher) return [];
      return estate.principals
        .filter((target) => target.id !== from.id && target.kind === 'role'
          && can(estate, from.id, 'iam:PassRole', target.arn).allowed)
        .map((target) => ({
          to: target.id,
          evidence: `${from.name} holds iam:PassRole for ${target.name} plus ${launcher}, so it can run its own code as that role`,
        }));
    },
  },
  {
    id: 'secret-credential-read',
    label: 'Read stored credentials',
    tactic: 'Credential access',
    cost: 1,
    control: 'Replace long-lived stored credentials with workload identity federation.',
    detection: 'det-secret-read',
    find(estate, from) {
      return (estate.secrets ?? [])
        .filter((secret) => secret.holds && secret.holds !== from.id
          && can(estate, from.id, 'secretsmanager:GetSecretValue', secret.arn).allowed)
        .map((secret) => ({
          to: secret.holds,
          evidence: `${from.name} can read ${secret.name}, which stores a long-lived credential for ${nameOf(estate, secret.holds)}`,
        }));
    },
  },
  {
    id: 'compute-hijack',
    label: 'Hijack running compute',
    tactic: 'Lateral movement',
    cost: 2,
    control: 'Separate deploy permissions from runtime roles; require signed artifacts.',
    detection: 'det-compute-hijack',
    find(estate, from) {
      const found = [];
      for (const workload of estate.compute ?? []) {
        if (!workload.runsAs || workload.runsAs === from.id) continue;
        const actions = workload.kind === 'ec2'
          ? ['ssm:SendCommand', 'ec2:CreateSnapshot']
          : ['lambda:UpdateFunctionCode', 'ecs:UpdateService'];
        const action = actions.find((candidate) => can(estate, from.id, candidate, workload.arn).allowed);
        if (!action) continue;
        found.push({
          to: workload.runsAs,
          evidence: `${from.name} can call ${action} against ${workload.name}, which runs as ${nameOf(estate, workload.runsAs)}`,
        });
      }
      return found;
    },
  },
  {
    id: 'federation-subject-wildcard',
    label: 'Federated subject wildcard',
    tactic: 'Initial access',
    cost: 3,
    control: 'Pin the OIDC subject claim to an exact repository, branch and environment.',
    detection: 'det-federation',
    find(estate, from) {
      if (from.kind !== 'federated') return [];
      const found = [];
      for (const target of estate.principals) {
        if (!target.trust || target.id === from.id) continue;
        const trustPolicy = estate.policies[target.trust];
        const loose = (trustPolicy.statements ?? []).some((statement) => (statement.conditions ?? []).some(
          (condition) => condition.key.endsWith(':sub')
            && condition.values.some((value) => value.includes('*'))
            && (from.subjects ?? []).some((subject) => value_matches(subject, condition.values)),
        ));
        if (!loose) continue;
        found.push({
          to: target.id,
          evidence: `${target.name} trusts ${from.name} through a wildcard subject claim, so any branch, fork or pull request in scope can mint its credentials`,
        });
      }
      return found;
    },
  },
  {
    id: 'agent-tool-delegation',
    label: 'Agent tool executes as role',
    tactic: 'Privilege escalation',
    cost: 1,
    control: 'Give each tool its own least-privilege identity and require approval for state-changing calls.',
    detection: 'det-agent-tool',
    find(estate, from) {
      if (from.kind !== 'agent') return [];
      return (estate.agentTools ?? [])
        .filter((tool) => tool.agent === from.id && tool.executesAs && tool.executesAs !== from.id)
        .map((tool) => ({
          to: tool.executesAs,
          cost: tool.humanApproval ? 4 : 1,
          evidence: tool.humanApproval
            ? `Tool "${tool.name}" runs as ${nameOf(estate, tool.executesAs)} but every call waits on a human approval`
            : `Tool "${tool.name}" runs as ${nameOf(estate, tool.executesAs)} with no approval gate, so anything that steers the agent inherits that role`,
        }));
    },
  },
];

/**
 * Test a value against condition globs, tolerating the `*` wildcard.
 *
 * @param {string} value Candidate subject claim.
 * @param {string[]} patterns Patterns from the trust policy condition.
 * @returns {boolean} True when the claim would satisfy the condition.
 */
function value_matches(value, patterns) {
  return patterns.some((pattern) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(value));
}

/**
 * Look up a principal's display name.
 *
 * @param {object} estate Estate under analysis.
 * @param {string} id Principal id.
 * @returns {string} Display name, or the id when unknown.
 */
export function nameOf(estate, id) {
  return estate.principals.find((principal) => principal.id === id)?.name ?? id;
}

/**
 * Build the request context a principal's session would carry.
 *
 * @param {object} principal Principal record.
 * @returns {Record<string, string|boolean>} Context keys for policy conditions.
 */
export function sessionContext(principal) {
  return {
    'aws:PrincipalArn': principal.arn,
    'aws:MultiFactorAuthPresent': String(Boolean(principal.mfa)),
    'aws:PrincipalTag/team': principal.team ?? '',
    'aws:SourceIp': principal.sourceIp ?? '203.0.113.10',
    ...(principal.claims ?? {}),
  };
}

/**
 * Assemble the policy set that governs one principal's call.
 *
 * @param {object} estate Estate under analysis.
 * @param {string} principalId Caller.
 * @param {string} resourceArn Resource being touched.
 * @returns {{policies: object, request: object}|null} Everything `evaluate`
 *   needs, or null when the principal is unknown.
 */
export function policySetFor(estate, principalId, resourceArn) {
  const principal = estate.principals.find((candidate) => candidate.id === principalId);
  if (!principal) return null;
  const resource = [...(estate.resources ?? []), ...(estate.secrets ?? []), ...(estate.compute ?? [])]
    .find((candidate) => candidate.arn === resourceArn);
  return {
    policies: {
      identity: (principal.policies ?? []).map((id) => estate.policies[id]).filter(Boolean),
      boundary: principal.boundary ? estate.policies[principal.boundary] : undefined,
      resource: resource?.resourcePolicy ? estate.policies[resource.resourcePolicy] : undefined,
      scps: (estate.scps ?? [])
        .filter((scp) => !scp.accounts || scp.accounts.includes(principal.account))
        .map((scp) => estate.policies[scp.policy])
        .filter(Boolean),
    },
    request: {
      principal: principal.arn,
      context: sessionContext(principal),
      sameAccount: !resource || resource.account === principal.account,
    },
  };
}

/**
 * Ask whether a principal can perform an action, with the reasoning attached.
 *
 * @param {object} estate Estate under analysis.
 * @param {string} principalId Caller.
 * @param {string} action Action being attempted.
 * @param {string} resourceArn Resource being touched.
 * @param {Record<string, string|boolean|number>} [extraContext] Extra context
 *   keys merged over the session's own.
 * @returns {import('./iam.js').Decision} Verdict with its chain of reasoning.
 */
export function can(estate, principalId, action, resourceArn, extraContext = {}) {
  const setup = policySetFor(estate, principalId, resourceArn);
  if (!setup) return { allowed: false, reason: 'Unknown principal.', chain: [] };
  return evaluate(
    { ...setup.request, action, resource: resourceArn, context: { ...setup.request.context, ...extraContext } },
    setup.policies,
  );
}

/**
 * Derive every escalation edge in the estate.
 *
 * @param {object} estate Estate under analysis.
 * @returns {Edge[]} Edges, deduplicated on (from, to, technique).
 */
export function buildGraph(estate) {
  const edges = [];
  const seen = new Set();
  for (const principal of estate.principals) {
    for (const technique of TECHNIQUES) {
      for (const hit of technique.find(estate, principal)) {
        const key = `${principal.id}→${hit.to}:${technique.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({
          from: principal.id,
          to: hit.to,
          technique: technique.id,
          label: technique.label,
          tactic: technique.tactic,
          cost: hit.cost ?? technique.cost,
          evidence: hit.evidence,
          detection: technique.detection,
          control: technique.control,
        });
      }
    }
  }
  return edges;
}

/**
 * Cheapest-path search across escalation edges.
 *
 * Dijkstra rather than breadth-first, because the question is not "how many
 * hops" but "how much work" — a single trivial hop through a stored credential
 * beats three hops that each need a deployment.
 *
 * @param {Edge[]} edges Graph edges.
 * @param {string} sourceId Starting principal.
 * @returns {Map<string, {cost: number, path: Edge[]}>} Reachable principals
 *   mapped to the cheapest route that reaches them.
 */
export function cheapestPaths(edges, sourceId) {
  const adjacency = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push(edge);
  }
  const best = new Map([[sourceId, { cost: 0, path: [] }]]);
  const frontier = [{ id: sourceId, cost: 0 }];
  const settled = new Set();

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost);
    const current = frontier.shift();
    if (settled.has(current.id)) continue;
    settled.add(current.id);
    for (const edge of adjacency.get(current.id) ?? []) {
      const cost = current.cost + edge.cost;
      const incumbent = best.get(edge.to);
      if (!incumbent || cost < incumbent.cost) {
        best.set(edge.to, { cost, path: [...best.get(current.id).path, edge] });
        frontier.push({ id: edge.to, cost });
      }
    }
  }
  best.delete(sourceId);
  return best;
}

/**
 * Compute the blast radius of one compromised principal.
 *
 * The output answers the only two questions a review actually cares about:
 * which identities does this become, and what can those identities do to the
 * things that matter?
 *
 * @param {object} estate Estate under analysis.
 * @param {string} sourceId Principal assumed to be compromised.
 * @param {Edge[]} [edges] Prebuilt graph; built on demand when omitted.
 * @returns {{source: string, reached: Array<object>, impact: Array<object>,
 *   score: number, worstPath: Edge[]}} Reachable identities, the crown-jewel
 *   access that follows, and a 0–100 severity score.
 */
export function blastRadius(estate, sourceId, edges = buildGraph(estate)) {
  const paths = cheapestPaths(edges, sourceId);
  const identities = [sourceId, ...paths.keys()];
  const impact = [];

  for (const resource of estate.resources ?? []) {
    for (const identity of identities) {
      const hits = (resource.probes ?? []).filter((action) => can(estate, identity, action, resource.arn).allowed);
      if (hits.length === 0) continue;
      const route = paths.get(identity);
      impact.push({
        resource: resource.name,
        arn: resource.arn,
        classification: resource.classification,
        value: resource.value ?? 0,
        via: identity,
        viaName: nameOf(estate, identity),
        actions: hits,
        hops: route ? route.path.length : 0,
        cost: route ? route.cost : 0,
      });
      break;
    }
  }

  const weight = { crown: 1, sensitive: 0.5, internal: 0.15 };
  const exposed = impact.reduce((sum, item) => sum + (weight[item.classification] ?? 0.1), 0);
  const total = (estate.resources ?? []).reduce((sum, item) => sum + (weight[item.classification] ?? 0.1), 0);
  const reachShare = identities.length / Math.max(1, estate.principals.length);
  const score = Math.round(Math.min(100, ((total > 0 ? exposed / total : 0) * 75) + (reachShare * 25)));

  const worst = impact.filter((item) => item.classification === 'crown')
    .sort((a, b) => a.cost - b.cost)[0];

  return {
    source: sourceId,
    reached: [...paths.entries()].map(([id, route]) => ({
      id, name: nameOf(estate, id), cost: route.cost, path: route.path,
    })).sort((a, b) => a.cost - b.cost),
    impact: impact.sort((a, b) => (weight[b.classification] ?? 0) - (weight[a.classification] ?? 0)),
    score,
    worstPath: worst ? (paths.get(worst.via)?.path ?? []) : [],
  };
}

/**
 * Count the identities that can reach crown-jewel data by escalating.
 *
 * The raw edge count is a poor headline: splitting one over-scoped role into
 * three least-privilege ones *adds* principals, and therefore adds edges from
 * the account's administrators to each of them, so a genuine improvement can
 * read as a regression. This counts what a review actually cares about — how
 * many identities end up somewhere they were never meant to reach — and
 * deliberately excludes principals that hold direct, intended access, because
 * the payments service reaching the payments vault is the system working.
 *
 * @param {object} estate Estate under analysis.
 * @param {Edge[]} [edges] Prebuilt graph.
 * @returns {{count: number, principals: Array<{id: string, name: string, hops: number, resource: string}>}}
 *   Identities with an unintended route to crown-jewel data.
 */
export function crownRoutes(estate, edges = buildGraph(estate)) {
  const principals = [];
  for (const principal of estate.principals) {
    const radius = blastRadius(estate, principal.id, edges);
    const crown = radius.impact.find((item) => item.classification === 'crown' && item.hops > 0);
    if (!crown) continue;
    principals.push({ id: principal.id, name: principal.name, hops: crown.hops, resource: crown.resource });
  }
  return { count: principals.length, principals: principals.sort((a, b) => a.hops - b.hops) };
}

/**
 * Render a path as numbered prose.
 *
 * Architecture findings get read by people who will never open the console, so
 * every path has to survive being pasted into a ticket.
 *
 * @param {object} estate Estate under analysis.
 * @param {Edge[]} path Ordered edges.
 * @returns {string[]} One line per hop.
 */
export function explainPath(estate, path) {
  return path.map((edge, index) => `${index + 1}. ${nameOf(estate, edge.from)} → ${nameOf(estate, edge.to)} — ${edge.label} (${edge.tactic}). ${edge.evidence}.`);
}

/**
 * Find which single control removes the most escalation edges.
 *
 * Fixing everything is not a plan. This ranks the technique-level controls by
 * how many edges disappear when each is applied, which is the first slide of
 * any remediation conversation that gets funded.
 *
 * @param {Edge[]} edges Graph edges.
 * @returns {Array<{control: string, technique: string, removes: number, edges: Edge[]}>}
 *   Controls, most effective first.
 */
export function rankControls(edges) {
  const grouped = new Map();
  for (const edge of edges) {
    const entry = grouped.get(edge.technique) ?? { control: edge.control, technique: edge.label, removes: 0, edges: [] };
    entry.removes += 1;
    entry.edges.push(edge);
    grouped.set(edge.technique, entry);
  }
  return [...grouped.values()].sort((a, b) => b.removes - a.removes);
}

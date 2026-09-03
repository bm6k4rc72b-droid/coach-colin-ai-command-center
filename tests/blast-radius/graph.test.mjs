/**
 * Tests for the identity graph.
 *
 * The claim these protect is the one the console is built on: escalation paths
 * are *derived* from policy, not declared. So each technique is tested against
 * a minimal estate that contains exactly the grant it looks for, and the
 * demonstration estate is used to check that the composed route from the
 * support agent to the cardholder vault exists — and disappears when the
 * corresponding control is applied.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  blastRadius, buildGraph, can, cheapestPaths, crownRoutes, explainPath, rankControls,
} from '../../public/blast-radius/js/graph.js';
import { CONTROLS, ESTATE, applyControls } from '../../public/blast-radius/js/estate.js';

/**
 * Build a two-principal estate carrying one grant.
 *
 * @param {import('../../public/blast-radius/js/iam.js').Statement[]} statements
 *   Statements attached to the attacker principal.
 * @param {object} [extra] Extra estate fields (secrets, compute, agentTools).
 * @returns {object} A minimal estate.
 */
function miniEstate(statements, extra = {}) {
  return {
    id: 'mini',
    name: 'Mini',
    policies: {
      'pol-attacker': { id: 'pol-attacker', name: 'Attacker', kind: 'identity', statements },
      'trust-open': {
        id: 'trust-open',
        name: 'OpenTrust',
        kind: 'trust',
        statements: [{ effect: 'Allow', actions: ['sts:AssumeRole'], resources: ['*'], principals: ['arn:aws:iam::1:role/attacker'] }],
      },
    },
    principals: [
      { id: 'attacker', name: 'attacker', kind: 'role', arn: 'arn:aws:iam::1:role/attacker', account: '1', policies: ['pol-attacker'] },
      { id: 'target', name: 'target', kind: 'role', arn: 'arn:aws:iam::1:role/target', account: '1', policies: [], trust: 'trust-open' },
    ],
    resources: [],
    ...extra,
  };
}

test('assume-role needs both the caller grant and the trust policy', () => {
  const withGrant = buildGraph(miniEstate([{ effect: 'Allow', actions: ['sts:AssumeRole'], resources: ['*'] }]));
  assert.equal(withGrant.some((edge) => edge.technique === 'sts-assume-role' && edge.to === 'target'), true);

  const withoutGrant = buildGraph(miniEstate([{ effect: 'Allow', actions: ['s3:GetObject'], resources: ['*'] }]));
  assert.equal(withoutGrant.some((edge) => edge.technique === 'sts-assume-role'), false);

  const closedTrust = miniEstate([{ effect: 'Allow', actions: ['sts:AssumeRole'], resources: ['*'] }]);
  closedTrust.policies['trust-open'].statements[0].principals = ['arn:aws:iam::9:role/somebody-else'];
  assert.equal(buildGraph(closedTrust).some((edge) => edge.technique === 'sts-assume-role'), false,
    'a caller grant alone does not open a role whose trust policy names somebody else');
});

test('PassRole is only an escalation when paired with a way to run code', () => {
  const passOnly = buildGraph(miniEstate([{ effect: 'Allow', actions: ['iam:PassRole'], resources: ['*'] }]));
  assert.equal(passOnly.some((edge) => edge.technique === 'iam-passrole-compute'), false);

  const passAndLaunch = buildGraph(miniEstate([
    { effect: 'Allow', actions: ['iam:PassRole'], resources: ['*'] },
    { effect: 'Allow', actions: ['lambda:CreateFunction'], resources: ['*'] },
  ]));
  const edge = passAndLaunch.find((candidate) => candidate.technique === 'iam-passrole-compute');
  assert.ok(edge, 'PassRole plus a launcher is an escalation');
  assert.match(edge.evidence, /lambda:CreateFunction/);
});

test('a stored credential is an edge to whatever it holds', () => {
  const estate = miniEstate(
    [{ effect: 'Allow', actions: ['secretsmanager:GetSecretValue'], resources: ['*'] }],
    { secrets: [{ id: 's', name: 'target-key', arn: 'arn:aws:secretsmanager:::secret/target', account: '1', holds: 'target' }] },
  );
  const edge = buildGraph(estate).find((candidate) => candidate.technique === 'secret-credential-read');
  assert.ok(edge);
  assert.equal(edge.to, 'target');
  assert.equal(edge.cost, 1, 'reading a stored credential is the cheapest hop there is');
});

test('an agent tool with an approval gate costs an attacker more', () => {
  const build = (humanApproval) => buildGraph({
    ...miniEstate([]),
    principals: [
      { id: 'agent', name: 'agent', kind: 'agent', arn: 'arn:aws:iam::1:agent/a', account: '1', policies: [] },
      { id: 'target', name: 'target', kind: 'role', arn: 'arn:aws:iam::1:role/target', account: '1', policies: [] },
    ],
    agentTools: [{ agent: 'agent', name: 'refund', executesAs: 'target', humanApproval, writes: true }],
  }).find((edge) => edge.technique === 'agent-tool-delegation');

  assert.equal(build(false).cost, 1);
  assert.equal(build(true).cost, 4);
  assert.match(build(true).evidence, /approval/);
});

test('cheapest-path search prefers effort over hop count', () => {
  const edges = [
    { from: 'a', to: 'b', cost: 1, technique: 't', label: 'l', tactic: 'x', evidence: '' },
    { from: 'b', to: 'd', cost: 1, technique: 't', label: 'l', tactic: 'x', evidence: '' },
    { from: 'a', to: 'd', cost: 5, technique: 't', label: 'l', tactic: 'x', evidence: '' },
  ];
  const best = cheapestPaths(edges, 'a').get('d');
  assert.equal(best.cost, 2);
  assert.equal(best.path.length, 2, 'two cheap hops beat one expensive one');
});

test('the demonstration estate contains the agent-to-vault route', () => {
  const radius = blastRadius(ESTATE, 'agent-support');
  const crown = radius.impact.find((item) => item.classification === 'crown');
  assert.ok(crown, 'the support agent reaches crown-jewel data');
  assert.equal(crown.resource, 'Cardholder data vault');
  assert.equal(radius.worstPath.length, 2, 'two hops: tool delegation, then a stored credential');
  assert.deepEqual(radius.worstPath.map((edge) => edge.technique),
    ['agent-tool-delegation', 'secret-credential-read']);
  assert.ok(radius.score > 50, `severity should be high, got ${radius.score}`);

  const prose = explainPath(ESTATE, radius.worstPath);
  assert.equal(prose.length, 2);
  assert.match(prose[1], /payments-service-signing-key/);
});

test('the demonstration estate contains the pull-request-to-administrator route', () => {
  const radius = blastRadius(ESTATE, 'fed-github');
  const admin = radius.reached.find((item) => item.id === 'role-prod-admin');
  assert.ok(admin, 'a fork build reaches the production administrator role');
  assert.deepEqual(admin.path.map((edge) => edge.technique),
    ['federation-subject-wildcard', 'iam-passrole-compute']);
});

test('scoping the agent secret grant severs the route it enables', () => {
  const hardened = applyControls(ESTATE, ['ctl-agent-secret-scope']);
  const radius = blastRadius(hardened, 'agent-support');
  assert.equal(radius.impact.some((item) => item.classification === 'crown'), false,
    'no crown-jewel resource is reachable once the secret grant is scoped');
  assert.equal(
    can(hardened, 'role-agent-tools', 'secretsmanager:GetSecretValue', ESTATE.secrets[0].arn).allowed,
    false,
  );
});

test('pinning the OIDC subject closes the pipeline entry point', () => {
  const hardened = applyControls(ESTATE, ['ctl-oidc-pin']);
  const edges = buildGraph(hardened);
  assert.equal(edges.some((edge) => edge.technique === 'federation-subject-wildcard'), false);
  assert.equal(blastRadius(hardened, 'fed-github', edges).reached.length, 0);
});

test('crown-jewel routes count unintended access only', () => {
  const routes = crownRoutes(ESTATE);
  assert.ok(routes.count > 0);
  assert.equal(routes.principals.every((entry) => entry.hops > 0), true,
    'a principal with direct, intended access is not a finding');
  assert.equal(routes.principals.some((entry) => entry.id === 'role-payments'), false,
    'the payments service reaching the payments vault is the system working');
  assert.equal(routes.principals.some((entry) => entry.id === 'agent-support'), true);
});

test('no control makes the estate worse, and the full set makes it much better', () => {
  const baseline = crownRoutes(ESTATE).count;
  for (const control of CONTROLS.filter((candidate) => candidate.apply)) {
    const after = crownRoutes(applyControls(ESTATE, [control.id])).count;
    assert.ok(after <= baseline, `${control.id} increased unintended crown-jewel access (${baseline} → ${after})`);
  }
  const all = crownRoutes(applyControls(ESTATE, CONTROLS.map((control) => control.id))).count;
  assert.ok(all < baseline / 2, `the full control set should more than halve exposure (${baseline} → ${all})`);
});

test('splitting one role into three least-privilege roles reads as an improvement', () => {
  const split = applyControls(ESTATE, ['ctl-per-tool-identity']);
  assert.ok(buildGraph(split).length > buildGraph(ESTATE).length,
    'more principals means more edges — which is why edge count is not the headline metric');
  assert.ok(crownRoutes(split).count < crownRoutes(ESTATE).count,
    'the metric that matters still improves');
});

test('controls are ranked by how many edges they remove', () => {
  const ranking = rankControls(buildGraph(ESTATE));
  assert.ok(ranking.length > 0);
  for (let index = 1; index < ranking.length; index += 1) {
    assert.ok(ranking[index - 1].removes >= ranking[index].removes, 'ranking is descending');
  }
  assert.ok(ranking.every((entry) => entry.control.length > 0), 'every entry names its control');
});

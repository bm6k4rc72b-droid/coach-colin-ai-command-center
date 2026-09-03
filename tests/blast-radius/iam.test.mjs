/**
 * Tests for the policy evaluation engine.
 *
 * The engine is the foundation every other module stands on, so these tests
 * are about the parts of cloud authorization people get wrong in review: deny
 * precedence, boundaries that silently withhold a grant, guardrails that
 * withhold it earlier, cross-account calls needing both sides to agree, and
 * conditions that must fail closed when the engine does not understand them.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  allows, evaluate, evaluateCondition, expandPermissions, globToRegExp, ipInCidr,
  matchesAny, scorePolicyBreadth, statementApplies,
} from '../../public/blast-radius/js/iam.js';

const identity = (statements) => ({ id: 'p', name: 'TestPolicy', kind: 'identity', statements });

test('globs anchor and honour case rules', () => {
  assert.equal(globToRegExp('s3:Get*', true).test('s3:GetObject'), true);
  assert.equal(globToRegExp('s3:Get*', true).test('S3:GETOBJECT'), true);
  assert.equal(globToRegExp('s3:Get*').test('kms:s3:GetObject'), false, 'must anchor at both ends');
  assert.equal(matchesAny('arn:aws:s3:::bucket/key', ['arn:aws:s3:::bucket/*']), true);
  assert.equal(matchesAny('arn:aws:s3:::other/key', ['arn:aws:s3:::bucket/*']), false);
  assert.equal(globToRegExp('a.b*').test('axbc'), false, 'dots are literal in a policy glob');
});

test('an explicit deny beats every allow in scope', () => {
  const decision = evaluate(
    { action: 's3:GetObject', resource: 'arn:aws:s3:::vault/card' },
    {
      identity: [
        identity([{ sid: 'Allow', effect: 'Allow', actions: ['s3:*'], resources: ['*'] }]),
        identity([{ sid: 'Deny', effect: 'Deny', actions: ['s3:GetObject'], resources: ['arn:aws:s3:::vault/*'] }]),
      ],
    },
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /Explicit deny/);
  assert.equal(decision.chain.at(-1).outcome, 'deny');
});

test('a permissions boundary withholds a grant the identity policy makes', () => {
  const policies = {
    identity: [identity([{ effect: 'Allow', actions: ['iam:CreateUser'], resources: ['*'] }])],
    boundary: {
      id: 'b', name: 'Boundary', kind: 'boundary',
      statements: [{ effect: 'Allow', actions: ['s3:*'], resources: ['*'] }],
    },
  };
  const decision = evaluate({ action: 'iam:CreateUser', resource: '*' }, policies);
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /boundary/i);
  assert.equal(allows({ action: 's3:GetObject', resource: 'arn:aws:s3:::x/y' }, policies), false,
    'the boundary permits it but no identity policy grants it');
});

test('a service control policy decides before anything else runs', () => {
  const scps = [{
    id: 's', name: 'Guardrail', kind: 'scp',
    statements: [
      { effect: 'Allow', actions: ['*'], resources: ['*'] },
      { sid: 'NoTrailTampering', effect: 'Deny', actions: ['cloudtrail:StopLogging'], resources: ['*'] },
    ],
  }];
  const admin = [identity([{ effect: 'Allow', actions: ['*'], resources: ['*'] }])];
  const denied = evaluate({ action: 'cloudtrail:StopLogging', resource: '*' }, { identity: admin, scps });
  assert.equal(denied.allowed, false);
  assert.equal(denied.chain[0].stage, 'Service control policy');
  assert.equal(denied.chain.length, 1, 'evaluation stops at the guardrail');

  const allowed = evaluate({ action: 's3:GetObject', resource: 'arn:aws:s3:::x/y' }, { identity: admin, scps });
  assert.equal(allowed.allowed, true);
});

test('cross-account access needs both sides to agree', () => {
  const policies = {
    identity: [identity([{ effect: 'Allow', actions: ['s3:GetObject'], resources: ['*'] }])],
    resource: {
      id: 'r', name: 'BucketPolicy', kind: 'resource',
      statements: [{
        effect: 'Allow',
        actions: ['s3:GetObject'],
        resources: ['*'],
        principals: ['arn:aws:iam::111:role/partner'],
      }],
    },
  };
  const request = { action: 's3:GetObject', resource: 'arn:aws:s3:::x/y', sameAccount: false };
  assert.equal(evaluate({ ...request, principal: 'arn:aws:iam::111:role/partner' }, policies).allowed, true);
  assert.equal(evaluate({ ...request, principal: 'arn:aws:iam::999:role/stranger' }, policies).allowed, false);
  assert.equal(
    evaluate({ ...request, principal: 'arn:aws:iam::111:role/partner' }, { resource: policies.resource }).allowed,
    false,
    'a resource grant alone is not enough across accounts',
  );
});

test('conditions evaluate, and unknown operators fail closed', () => {
  assert.equal(evaluateCondition({ operator: 'Bool', key: 'mfa', values: ['true'] }, { mfa: true }), true);
  assert.equal(evaluateCondition({ operator: 'StringNotEquals', key: 'r', values: ['eu-west-1'] }, { r: 'us-east-1' }), true);
  assert.equal(evaluateCondition({ operator: 'Null', key: 'tag', values: ['true'] }, {}), true);
  assert.equal(evaluateCondition({ operator: 'StringEquals', key: 'a', values: ['x'] }, {}), false,
    'a missing key means the condition is unsatisfied');
  assert.equal(evaluateCondition({ operator: 'StringEqualsIfExists', key: 'a', values: ['x'] }, {}), true);
  assert.equal(evaluateCondition({ operator: 'MadeUpOperator', key: 'a', values: ['x'] }, { a: 'x' }), false,
    'an operator the engine cannot interpret must not grant access');
});

test('IP conditions understand CIDR boundaries', () => {
  assert.equal(ipInCidr('10.0.4.9', '10.0.0.0/16'), true);
  assert.equal(ipInCidr('10.1.4.9', '10.0.0.0/16'), false);
  assert.equal(ipInCidr('203.0.113.7', '203.0.113.7'), true);
  assert.equal(ipInCidr('not-an-ip', '10.0.0.0/8'), false);
});

test('statements match on action, resource, principal and condition together', () => {
  const statement = {
    effect: 'Allow',
    actions: ['sts:AssumeRole'],
    resources: ['*'],
    principals: ['arn:aws:iam::111:role/*'],
    conditions: [{ operator: 'Bool', key: 'aws:MultiFactorAuthPresent', values: ['true'] }],
  };
  const base = { action: 'sts:AssumeRole', resource: 'arn:aws:iam::111:role/target', principal: 'arn:aws:iam::111:role/caller' };
  assert.equal(statementApplies(statement, { ...base, context: { 'aws:MultiFactorAuthPresent': 'true' } }), true);
  assert.equal(statementApplies(statement, { ...base, context: { 'aws:MultiFactorAuthPresent': 'false' } }), false);
  assert.equal(statementApplies(statement, { ...base, principal: 'arn:aws:iam::222:role/caller', context: { 'aws:MultiFactorAuthPresent': 'true' } }), false);
});

test('NotAction and NotResource invert the match', () => {
  const policy = identity([{ effect: 'Allow', notActions: ['iam:*'], resources: ['*'] }]);
  assert.equal(allows({ action: 's3:GetObject', resource: '*' }, { identity: [policy] }), true);
  assert.equal(allows({ action: 'iam:CreateUser', resource: '*' }, { identity: [policy] }), false);
});

test('permission expansion partitions a probe list', () => {
  const policies = { identity: [identity([{ effect: 'Allow', actions: ['s3:GetObject'], resources: ['arn:aws:s3:::open/*'] }])] };
  const { allowed, denied } = expandPermissions([
    { action: 's3:GetObject', resource: 'arn:aws:s3:::open/a' },
    { action: 's3:GetObject', resource: 'arn:aws:s3:::closed/a' },
    { action: 's3:PutObject', resource: 'arn:aws:s3:::open/a' },
  ], policies);
  assert.equal(allowed.length, 1);
  assert.equal(denied.length, 2);
});

test('breadth scoring ranks an administrative grant above a scoped one', () => {
  const admin = scorePolicyBreadth(identity([{ sid: 'All', effect: 'Allow', actions: ['*'], resources: ['*'] }]));
  const wide = scorePolicyBreadth(identity([{ sid: 'Wide', effect: 'Allow', actions: ['s3:*'], resources: ['*'] }]));
  const scoped = scorePolicyBreadth(identity([{ sid: 'Narrow', effect: 'Allow', actions: ['s3:GetObject'], resources: ['arn:aws:s3:::b/*'] }]));
  assert.ok(admin.score > wide.score, 'admin outranks a service wildcard');
  assert.ok(wide.score > scoped.score, 'a service wildcard outranks a scoped grant');
  assert.equal(scoped.score, 0);
  assert.ok(admin.findings.length > 0, 'the score comes with its reasons');
  assert.ok(admin.score <= 100);
});

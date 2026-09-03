/**
 * Synthetic telemetry with labelled attacks.
 *
 * A detection nobody has measured is a hypothesis. Measuring one needs a stream
 * where the answer is known, and no company will hand over a real audit log
 * with a real breach in it, so this module generates fourteen days of plausible
 * activity for the demonstration estate and threads two labelled attack chains
 * through it — the ones the identity graph says are available.
 *
 * The background noise is the important half. It is easy to write a rule that
 * fires on `GetSecretValue`; the question is whether it fires eleven times a
 * day on the batch job that legitimately reads a secret every morning. So the
 * generator includes the ordinary, slightly irregular, occasionally
 * out-of-hours behaviour that turns naive rules into ignored alerts.
 *
 * @module blast-radius/telemetry
 */

import { rng } from './fair.js';

/**
 * @typedef {object} Event
 * @property {number} ts Epoch milliseconds.
 * @property {'cloudtrail'|'agent'|'idp'} source Log the event came from.
 * @property {string} actor Principal id.
 * @property {string} actorType
 * @property {string} action Action name, cloud-native spelling.
 * @property {string} resource Resource touched.
 * @property {string} sourceIp
 * @property {string} userAgent
 * @property {'success'|'failure'} outcome
 * @property {Record<string, string|number|boolean>} [meta] Event-specific detail.
 * @property {string} [attack] Attack id, present only on injected events.
 * @property {number} [step] Position within that attack chain.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

/** Start of the simulated window. */
export const WINDOW_START = Date.parse('2026-02-02T00:00:00Z');

/** Length of the simulated window, in days. */
export const WINDOW_DAYS = 14;

/**
 * Ordinary activity patterns, sampled to build the background stream.
 *
 * `perDay` is the mean count; `hours` bounds the working window for activity
 * that has one. Anything without an `hours` bound is machine traffic and runs
 * around the clock, which is exactly why "out of hours" alone is a poor signal.
 *
 * @type {Array<object>}
 */
const BACKGROUND = [
  {
    actor: 'role-payments', actorType: 'role', source: 'cloudtrail',
    action: 'secretsmanager:GetSecretValue',
    resource: 'arn:aws:secretsmanager:us-east-1:210987654321:secret/payments-service-key',
    perDay: 4, ip: '10.40.2.', agent: 'aws-sdk-java/2.25.1',
  },
  {
    actor: 'role-payments', actorType: 'role', source: 'cloudtrail',
    action: 's3:GetObject', resource: 'arn:aws:s3:::solstice-cardholder-vault/*',
    perDay: 22, ip: '10.40.2.', agent: 'aws-sdk-java/2.25.1',
  },
  {
    actor: 'role-payments', actorType: 'role', source: 'cloudtrail',
    action: 'kms:Decrypt', resource: 'arn:aws:kms:us-east-1:210987654321:key/payments',
    perDay: 30, ip: '10.40.2.', agent: 'aws-sdk-java/2.25.1',
  },
  {
    actor: 'role-agent-tools', actorType: 'role', source: 'cloudtrail',
    action: 'dynamodb:Query', resource: 'arn:aws:dynamodb:us-east-1:210987654321:table/support-tickets',
    perDay: 90, ip: '10.60.7.', agent: 'aws-sdk-nodejs/3.600.0',
  },
  {
    actor: 'role-agent-tools', actorType: 'role', source: 'cloudtrail',
    action: 'lambda:InvokeFunction', resource: 'arn:aws:lambda:us-east-1:210987654321:function:refund-worker',
    perDay: 14, ip: '10.60.7.', agent: 'aws-sdk-nodejs/3.600.0',
  },
  {
    actor: 'agent-support', actorType: 'agent', source: 'agent',
    action: 'agent:ToolCall', resource: 'lookup_order',
    perDay: 120, ip: '10.60.7.', agent: 'support-copilot/1.4',
  },
  {
    actor: 'agent-support', actorType: 'agent', source: 'agent',
    action: 'agent:ToolCall', resource: 'issue_refund',
    perDay: 11, ip: '10.60.7.', agent: 'support-copilot/1.4',
  },
  {
    actor: 'user-analyst', actorType: 'human', source: 'cloudtrail',
    action: 'sts:AssumeRole', resource: 'arn:aws:iam::345678901234:role/data-etl',
    perDay: 3, hours: [8, 19], ip: '198.51.100.', agent: 'aws-cli/2.15.0',
  },
  {
    actor: 'role-data-etl', actorType: 'role', source: 'cloudtrail',
    action: 's3:GetObject', resource: 'arn:aws:s3:::solstice-customer-pii/*',
    perDay: 40, ip: '10.80.1.', agent: 'aws-sdk-python/1.34.0',
  },
  {
    actor: 'fed-github', actorType: 'federated', source: 'cloudtrail',
    action: 'sts:AssumeRoleWithWebIdentity', resource: 'arn:aws:iam::210987654321:role/pipeline-deploy',
    perDay: 9, hours: [7, 21], ip: '20.201.28.', agent: 'GitHubActions/2.320.0',
    meta: { sub: 'repo:solstice-retail/storefront:ref:refs/heads/main' },
  },
  {
    actor: 'role-ci-deploy', actorType: 'role', source: 'cloudtrail',
    action: 'lambda:UpdateFunctionCode', resource: 'arn:aws:lambda:us-east-1:210987654321:function:checkout-api',
    perDay: 6, hours: [7, 21], ip: '20.201.28.', agent: 'GitHubActions/2.320.0',
  },
  {
    actor: 'role-platform', actorType: 'role', source: 'cloudtrail',
    action: 'ssm:SendCommand', resource: 'arn:aws:ec2:us-east-1:345678901234:instance/i-0c9f2',
    perDay: 2, hours: [9, 18], ip: '198.51.100.', agent: 'aws-cli/2.15.0',
  },
  {
    actor: 'role-audit', actorType: 'role', source: 'cloudtrail',
    action: 'iam:ListRoles', resource: '*',
    perDay: 5, ip: '10.10.5.', agent: 'securityhub-scanner/2.1',
  },
  {
    actor: 'role-payments', actorType: 'role', source: 'cloudtrail',
    action: 's3:GetObject', resource: 'arn:aws:s3:::solstice-cardholder-vault/*',
    perDay: 0.12, hours: [9, 18], ip: '198.51.100.', agent: 'aws-cli/2.15.0',
    note: 'A payments engineer spot-checking an object by hand. Legitimate, and indistinguishable from theft by user agent alone.',
  },
  {
    actor: 'role-payments', actorType: 'role', source: 'cloudtrail',
    action: 's3:GetObject', resource: 'arn:aws:s3:::solstice-cardholder-vault/*',
    perDay: 2.3, onlyDays: [3, 10], burst: 30, burstMinutes: 9, ip: '10.40.2.', agent: 'aws-sdk-java/2.25.1',
    note: 'Nightly reconciliation batch. Trips the volume rule exactly as its author predicted it would.',
  },
  {
    actor: 'role-data-etl', actorType: 'role', source: 'cloudtrail',
    action: 'secretsmanager:GetSecretValue',
    resource: 'arn:aws:secretsmanager:us-east-1:345678901234:secret/analytics-loader',
    perDay: 3, fromDay: 8, ip: '10.80.1.', agent: 'aws-sdk-python/1.34.0',
    note: 'A genuine new integration shipped on day 8. The first-seen rule cannot tell this from the attack.',
  },
  {
    actor: 'fed-github', actorType: 'federated', source: 'cloudtrail',
    action: 'sts:AssumeRoleWithWebIdentity', resource: 'arn:aws:iam::210987654321:role/pipeline-deploy',
    perDay: 4, fromDay: 9, hours: [8, 20], ip: '20.201.28.', agent: 'GitHubActions/2.320.0',
    meta: { sub: 'repo:solstice-retail/mobile-app:ref:refs/heads/main' },
    note: 'A second repository onboarding legitimately.',
  },
  {
    actor: 'agent-support', actorType: 'agent', source: 'agent',
    action: 'agent:ContextLoad', resource: 'kb-article/recall-guidance',
    perDay: 0.2, ip: '10.60.7.', agent: 'support-copilot/1.4',
    meta: { injectionScore: 49, origin: 'knowledge-base', editor: 'support-lead-03' },
    note: 'The corpus false positive in the wild: real operator guidance that reads exactly like an injection.',
  },
];

/**
 * The two attack chains, expressed as steps relative to the chain's start.
 *
 * Both are the routes the identity graph found in the demonstration estate —
 * they were not invented for the detections to catch. That ordering matters: a
 * detection programme built from an architecture's actual paths beats one built
 * from a vendor's rule pack, because the second is written for somebody else's
 * architecture.
 *
 * @type {Array<{id: string, name: string, narrative: string, startDay: number,
 *   startHour: number, steps: Array<object>}>}
 */
export const ATTACKS = [
  {
    id: 'atk-agent-vault',
    name: 'Injected support agent to cardholder vault',
    narrative: 'A poisoned knowledge-base article steers the support agent; its shared tool role reads the payments signing key and the vault is read at scale.',
    startDay: 6,
    startHour: 2,
    steps: [
      {
        offset: 0, source: 'agent', actor: 'agent-support', actorType: 'agent',
        action: 'agent:ContextLoad', resource: 'kb-article/refund-policy-2026',
        meta: { injectionScore: 69, origin: 'knowledge-base', editor: 'support-staff-41' },
      },
      {
        offset: 40 * 1000, source: 'agent', actor: 'agent-support', actorType: 'agent',
        action: 'agent:ToolCall', resource: 'issue_refund',
        meta: { conversation: 'c-88213', repeated: 6 },
      },
      {
        offset: 3 * MINUTE, source: 'cloudtrail', actor: 'role-agent-tools', actorType: 'role',
        action: 'secretsmanager:GetSecretValue',
        resource: 'arn:aws:secretsmanager:us-east-1:210987654321:secret/payments-service-key',
        meta: { firstTimeForPrincipal: true },
      },
      {
        offset: 6 * MINUTE, source: 'cloudtrail', actor: 'role-payments', actorType: 'role',
        action: 'kms:Decrypt', resource: 'arn:aws:kms:us-east-1:210987654321:key/payments',
        ip: '10.60.7.', agent: 'python-requests/2.32.0',
      },
      {
        offset: 8 * MINUTE, source: 'cloudtrail', actor: 'role-payments', actorType: 'role',
        action: 's3:ListBucket', resource: 'arn:aws:s3:::solstice-cardholder-vault',
        ip: '10.60.7.', agent: 'python-requests/2.32.0',
      },
      {
        offset: 9 * MINUTE, source: 'cloudtrail', actor: 'role-payments', actorType: 'role',
        action: 's3:GetObject', resource: 'arn:aws:s3:::solstice-cardholder-vault/*',
        ip: '10.60.7.', agent: 'python-requests/2.32.0', repeat: 40, spacing: 12 * 1000,
      },
    ],
  },
  {
    id: 'atk-oidc-admin',
    name: 'Pull-request build to production administrator',
    narrative: 'A fork raises a pull request; the wildcard OIDC subject mints deployment credentials, PassRole turns them into administrative ones.',
    startDay: 10,
    startHour: 23,
    steps: [
      {
        offset: 0, source: 'cloudtrail', actor: 'fed-github', actorType: 'federated',
        action: 'sts:AssumeRoleWithWebIdentity', resource: 'arn:aws:iam::210987654321:role/pipeline-deploy',
        ip: '185.199.108.', agent: 'GitHubActions/2.320.0',
        meta: { sub: 'repo:solstice-retail/marketing-site:pull_request', firstTimeForRepo: true },
      },
      {
        offset: 2 * MINUTE, source: 'cloudtrail', actor: 'role-ci-deploy', actorType: 'role',
        action: 'iam:PassRole', resource: 'arn:aws:iam::210987654321:role/production-admin',
        ip: '185.199.108.', agent: 'aws-cli/2.15.0',
      },
      {
        offset: 2.5 * MINUTE, source: 'cloudtrail', actor: 'role-ci-deploy', actorType: 'role',
        action: 'lambda:CreateFunction', resource: 'arn:aws:lambda:us-east-1:210987654321:function:tmp-build-helper',
        ip: '185.199.108.', agent: 'aws-cli/2.15.0',
      },
      {
        offset: 3 * MINUTE, source: 'cloudtrail', actor: 'role-ci-deploy', actorType: 'role',
        action: 'lambda:InvokeFunction', resource: 'arn:aws:lambda:us-east-1:210987654321:function:tmp-build-helper',
        ip: '185.199.108.', agent: 'aws-cli/2.15.0',
      },
      {
        offset: 5 * MINUTE, source: 'cloudtrail', actor: 'role-prod-admin', actorType: 'role',
        action: 'iam:CreateAccessKey', resource: 'arn:aws:iam::210987654321:user/svc-backup',
        ip: '185.199.108.', agent: 'aws-cli/2.15.0',
      },
      {
        offset: 9 * MINUTE, source: 'cloudtrail', actor: 'role-prod-admin', actorType: 'role',
        action: 'cloudtrail:StopLogging', resource: 'arn:aws:cloudtrail:us-east-1:210987654321:trail/org-trail',
        ip: '185.199.108.', agent: 'aws-cli/2.15.0', outcome: 'failure',
        meta: { deniedBy: 'OrganizationBaseline' },
      },
    ],
  },
];

/**
 * Generate the labelled event stream.
 *
 * @param {number} [seed] Seed, so a demonstration and its screenshots agree.
 * @returns {Event[]} Events in chronological order.
 */
export function generateStream(seed = 20260202) {
  const random = rng(seed);
  const events = [];

  for (let day = 0; day < WINDOW_DAYS; day += 1) {
    const weekday = new Date(WINDOW_START + (day * DAY)).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    for (const pattern of BACKGROUND) {
      if (pattern.fromDay !== undefined && day < pattern.fromDay) continue;
      if (pattern.onlyDays && !pattern.onlyDays.includes(day)) continue;
      const scale = weekend && pattern.hours ? 0.15 : 1;
      const expected = pattern.perDay * scale;
      const count = pattern.burst
        ? pattern.burst
        : expected < 1
          ? (random() < expected ? 1 : 0)
          : Math.max(0, Math.round(expected * (0.7 + (random() * 0.6))));
      const burstStart = pattern.burst ? 1 + (random() * 2) : 0;
      for (let index = 0; index < count; index += 1) {
        const [from, to] = pattern.hours ?? [0, 24];
        const hour = pattern.burst
          ? burstStart + ((index / count) * (pattern.burstMinutes / 60))
          : from + (random() * (to - from));
        events.push({
          ts: WINDOW_START + (day * DAY) + (hour * HOUR) + (pattern.burst ? 0 : Math.floor(random() * HOUR)),
          source: pattern.source,
          actor: pattern.actor,
          actorType: pattern.actorType,
          action: pattern.action,
          resource: pattern.resource,
          sourceIp: `${pattern.ip}${1 + Math.floor(random() * 250)}`,
          userAgent: pattern.agent,
          outcome: random() < 0.02 ? 'failure' : 'success',
          meta: { ...(pattern.meta ?? {}) },
        });
      }
    }
  }

  for (const attack of ATTACKS) {
    const base = WINDOW_START + (attack.startDay * DAY) + (attack.startHour * HOUR);
    let step = 0;
    for (const template of attack.steps) {
      step += 1;
      const repeats = template.repeat ?? 1;
      for (let index = 0; index < repeats; index += 1) {
        events.push({
          ts: base + template.offset + (index * (template.spacing ?? 0)),
          source: template.source,
          actor: template.actor,
          actorType: template.actorType,
          action: template.action,
          resource: template.resource,
          sourceIp: `${template.ip ?? '10.60.7.'}${40 + (index % 5)}`,
          userAgent: template.agent ?? 'support-copilot/1.4',
          outcome: template.outcome ?? 'success',
          meta: { ...(template.meta ?? {}) },
          attack: attack.id,
          step,
        });
      }
    }
  }

  return events.sort((a, b) => a.ts - b.ts);
}

/**
 * First event of each attack, used to measure time to detection.
 *
 * @param {Event[]} events Stream to inspect.
 * @returns {Map<string, number>} Attack id to the timestamp it began.
 */
export function attackStarts(events) {
  const starts = new Map();
  for (const event of events) {
    if (!event.attack) continue;
    if (!starts.has(event.attack) || event.ts < starts.get(event.attack)) starts.set(event.attack, event.ts);
  }
  return starts;
}

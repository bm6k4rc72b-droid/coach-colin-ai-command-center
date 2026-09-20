/**
 * The parts of the page that are claims about a business rather than a film.
 *
 * The set pieces can be wrong and it costs an afternoon. These cannot: a
 * catalog that links somewhere dead, an agent plan that quietly schedules more
 * email than a mailbox survives, a security quote that is short by the
 * four-hour minimum. Those turn into a refund, a blocked domain, or an
 * argument about an invoice.
 *
 * So the assertions here are mostly about refusal — that the modules decline
 * to overstate, and say so out loud.
 *
 * @module tests/vice/operations
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { APPS, appById, headliners, linkFor, ranked } from '../../public/vice/js/apps.js';
import {
  AGENTS, CHANNELS, WORKING_DAYS, agentById, byKind, dailyTouches, deploymentPlan, safeThrottle,
} from '../../public/vice/js/agents.js';
import {
  LICENSING, MINIMUM_HOURS, RATE_CARD, SERVICES, UPLIFTS, money, quote, serviceById, summarise, weekLoad,
} from '../../public/vice/js/security.js';

/* --- the catalog -------------------------------------------------------- */

test('every app is complete enough to render a card', () => {
  for (const app of APPS) {
    assert.ok(app.id && app.name && app.tagline && app.blurb, `${app.id} is missing copy`);
    assert.ok(['flagship', 'platform', 'suite'].includes(app.tier), `${app.id} has tier ${app.tier}`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(app.accent), `${app.id} has no usable accent`);
    assert.ok(Array.isArray(app.points) && app.points.length >= 3, `${app.id} needs selling points`);
  }
});

test('app ids are unique', () => {
  assert.equal(new Set(APPS.map((app) => app.id)).size, APPS.length);
});

test('the flagships from the brief lead the rack', () => {
  const order = ranked().map((app) => app.id);
  assert.equal(order[0], 'firehazmat', 'FireHazmat is the flagship and leads');
  assert.ok(order.indexOf('artifact') < order.indexOf('sentry'));
  assert.ok(order.indexOf('gods-eye') < order.indexOf('sentry'));
  // Tiers never interleave.
  const tiers = ranked().map((app) => app.tier);
  const seen = [];
  for (const tier of tiers) if (seen[seen.length - 1] !== tier) seen.push(tier);
  assert.deepEqual(seen, ['flagship', 'platform', 'suite']);
});

test('the apps with artwork are the ones that get a full plate', () => {
  const withMedia = headliners().map((app) => app.id);
  assert.deepEqual(withMedia, ['firehazmat', 'artifact', 'gods-eye']);
});

test('a card never invents a link it does not have', () => {
  for (const app of APPS) {
    const href = linkFor(app);
    if (href === null) continue;
    assert.ok(
      href.startsWith('http') || href.startsWith('../') || href === '../',
      `${app.id} links to ${href}, which is neither external nor a sibling app`,
    );
    if (href.startsWith('http')) assert.ok(href.startsWith('https://'), `${app.id} links over plain http`);
  }
  assert.equal(linkFor(null), null);
  assert.equal(linkFor({}), null);
});

test('internal links point at apps that exist in this repo', async () => {
  const { existsSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');
  for (const app of APPS) {
    const href = linkFor(app);
    if (!href || href.startsWith('http')) continue;
    const target = href === '../' ? publicDir : path.join(publicDir, href.replace(/^\.\.\//, ''));
    assert.ok(existsSync(target), `${app.id} links to ${href}, which is not in public/`);
  }
});

test('lookup by id', () => {
  assert.equal(appById('firehazmat').name, 'FireHazmat');
  assert.equal(appById('nope'), null);
});

/* --- the swarm ---------------------------------------------------------- */

test('every agent names channels the roster actually knows about', () => {
  const known = new Set(CHANNELS.map((channel) => channel.id));
  for (const agent of AGENTS) {
    assert.ok(agent.channels.length, `${agent.id} works no channel`);
    for (const channel of agent.channels) {
      assert.ok(known.has(channel), `${agent.id} works unknown channel ${channel}`);
    }
    assert.ok(agent.guardrail, `${agent.id} has no guardrail`);
    assert.ok(['drafts', 'acts', 'reports'].includes(agent.autonomy), `${agent.id}: ${agent.autonomy}`);
    assert.ok(agent.perDay > 0 && agent.reviewSeconds >= 0);
  }
});

test('the roster splits into outreach and automation with nothing left over', () => {
  assert.equal(byKind('outreach').length + byKind('automation').length, AGENTS.length);
  assert.equal(agentById('prospector').kind, 'outreach');
  assert.equal(agentById('poster').kind, 'automation');
  assert.equal(agentById('nope'), null);
});

test('an empty selection is reported as idle, not as a clean plan', () => {
  const plan = deploymentPlan([]);
  assert.equal(plan.weeklyTouches, 0);
  assert.equal(plan.clean, false);
  assert.match(plan.warnings.join(' '), /idle/i);
});

test('the whole swarm at full throttle is called out as too much', () => {
  const plan = deploymentPlan(AGENTS.map((agent) => agent.id), { reviewHoursPerWeek: 5 });
  assert.equal(plan.clean, false);
  assert.ok(plan.warnings.length >= 2, 'both kinds of problem should surface');
  assert.ok(
    plan.warnings.some((warning) => /caution line/i.test(warning)),
    'over-volume on a channel must be named',
  );
  assert.ok(
    plan.warnings.some((warning) => /hours a week/i.test(warning)),
    'the approval burden must be named',
  );
});

test('a channel over its caution line is flagged on the channel, not just in prose', () => {
  const plan = deploymentPlan(['prospector', 'opener', 'closer', 'concierge'], { reviewHoursPerWeek: 40 });
  const email = plan.perChannel.find((channel) => channel.id === 'email');
  assert.ok(email, 'email should carry load');
  assert.equal(email.over, email.daily > email.safeDaily);
  assert.ok(email.pressure > 1, 'four email agents is over one mailbox');
});

test('the throttle finder returns a setting that is actually clean', () => {
  const all = AGENTS.map((agent) => agent.id);
  const throttle = safeThrottle(all, { reviewHoursPerWeek: 5 });
  assert.ok(throttle > 0 && throttle < 1, `expected a partial throttle, got ${throttle}`);
  const plan = deploymentPlan(all, { throttle, reviewHoursPerWeek: 5 });
  assert.equal(plan.clean, true, plan.warnings.join(' | '));
  // And a hair above it is not.
  const over = deploymentPlan(all, { throttle: Math.min(throttle + 0.05, 1), reviewHoursPerWeek: 5 });
  assert.equal(over.clean, false);
});

test('a selection that is already clean is left at full throttle', () => {
  assert.equal(safeThrottle(['analyst'], { reviewHoursPerWeek: 40 }), 1);
  assert.equal(safeThrottle([], {}), 0);
});

test('agents that act on their own do not add to the approval queue', () => {
  const acting = deploymentPlan(['poster'], { reviewHoursPerWeek: 1 });
  assert.equal(acting.reviewHours, 0, 'an agent that sends for itself costs no approval time');
  const drafting = deploymentPlan(['opener'], { reviewHoursPerWeek: 100 });
  assert.ok(drafting.reviewHours > 0, 'an agent that drafts does');
});

test('weekly volume is the daily figure across the working week', () => {
  const plan = deploymentPlan(['analyst'], { reviewHoursPerWeek: 40 });
  assert.equal(plan.weeklyTouches, dailyTouches(agentById('analyst')) * WORKING_DAYS);
});

test('throttling scales volume down and never below zero', () => {
  const full = deploymentPlan(['opener'], { throttle: 1, reviewHoursPerWeek: 99 }).weeklyTouches;
  const half = deploymentPlan(['opener'], { throttle: 0.5, reviewHoursPerWeek: 99 }).weeklyTouches;
  assert.ok(half < full && half > 0);
  assert.equal(deploymentPlan(['opener'], { throttle: 0, reviewHoursPerWeek: 99 }).weeklyTouches, 0);
  assert.equal(deploymentPlan(['opener'], { throttle: -4, reviewHoursPerWeek: 99 }).weeklyTouches, 0);
});

test('an unknown agent id is ignored rather than crashing the console', () => {
  const plan = deploymentPlan(['opener', 'nope', undefined], { reviewHoursPerWeek: 99 });
  assert.equal(plan.agents.length, 1);
});

/* --- the security desk -------------------------------------------------- */

test('every service carries the defaults its estimate starts from', () => {
  for (const service of SERVICES) {
    assert.ok(service.id && service.name && service.tagline && service.blurb);
    assert.ok(service.includes.length >= 3, `${service.id} lists too little`);
    assert.ok(service.defaults.officers >= 1 && service.defaults.hours >= 1);
    assert.ok(RATE_CARD[service.defaults.tier], `${service.id} defaults to an unpriced tier`);
  }
  assert.equal(serviceById('open-house').name, 'Open House Detail');
  assert.equal(serviceById('nope'), null);
});

test('open house protection is offered, because it is the pitch', () => {
  const openHouse = serviceById('open-house');
  assert.ok(openHouse);
  assert.match(openHouse.blurb.toLowerCase(), /listing|open|visitor|property|home/);
});

test('the four-hour minimum is applied and declared, never applied silently', () => {
  const short = quote({ service: 'open-house', hours: 1 });
  assert.equal(short.billedHours, MINIMUM_HOURS);
  assert.equal(short.minimumApplied, true);
  assert.ok(
    short.assumptions.some((line) => /minimum/i.test(line) && /1/.test(line)),
    'the quote must say the hours were raised, and from what',
  );
  const long = quote({ service: 'open-house', hours: 9 });
  assert.equal(long.minimumApplied, false);
  assert.equal(long.billedHours, 9);
});

test('a quote is arithmetic anyone can check by hand', () => {
  const estimate = quote({ service: 'open-house', officers: 2, hours: 5, tier: 'armed', vehicle: false, days: 1 });
  assert.equal(estimate.total, RATE_CARD.armed * 5 * 2);
  const withVehicle = quote({ service: 'open-house', officers: 2, hours: 5, tier: 'armed', vehicle: true });
  assert.equal(withVehicle.total, RATE_CARD.armed * 5 * 2 + RATE_CARD.vehicle * 5);
});

test('uplifts multiply, are listed, and are the only things that raise the rate', () => {
  const plain = quote({ service: 'private-event', hours: 6, officers: 1, tier: 'unarmed', vehicle: false });
  const holiday = quote({
    service: 'private-event', hours: 6, officers: 1, tier: 'unarmed', vehicle: false, uplifts: ['holiday'],
  });
  assert.equal(holiday.total, Math.round(plain.total * UPLIFTS.holiday.factor));
  assert.ok(holiday.assumptions.some((line) => line.includes(UPLIFTS.holiday.label)));

  const both = quote({
    service: 'private-event', hours: 6, officers: 1, tier: 'unarmed', vehicle: false,
    uplifts: ['holiday', 'overnight'],
  });
  assert.ok(Math.abs(both.factor - UPLIFTS.holiday.factor * UPLIFTS.overnight.factor) < 1e-9);
  const unknown = quote({ service: 'private-event', hours: 6, uplifts: ['nonsense'] });
  assert.equal(unknown.factor, 1, 'an unknown uplift must not silently change the price');
});

test('days multiply the whole detail, vehicle included', () => {
  const one = quote({ service: 'estate', days: 1 });
  const three = quote({ service: 'estate', days: 3 });
  assert.equal(three.total, one.total * 3);
});

test('nonsense input is coerced to something quotable rather than producing NaN', () => {
  const estimate = quote({ service: 'nope', officers: -4, hours: 0, days: 0, tier: 'platinum' });
  assert.ok(Number.isFinite(estimate.total) && estimate.total > 0);
  assert.equal(estimate.officers, 1);
  assert.equal(estimate.tier, 'unarmed', 'an unpriced tier falls back to the priced one');
  assert.equal(estimate.days, 1);
});

test('every quote carries its disclaimer and the licensing note exists', () => {
  const estimate = quote({ service: 'executive' });
  assert.match(estimate.disclaimer, /estimate/i);
  assert.match(estimate.disclaimer, /writing/i);
  assert.match(LICENSING.note, /licen[cs]ed/i);
  assert.match(LICENSING.note, /insur/i);
});

test('the enquiry line says what was actually quoted', () => {
  const estimate = quote({ service: 'ranch-patrol', officers: 2, hours: 8, days: 2, vehicle: true });
  const line = summarise(estimate);
  assert.match(line, /Ranch & Property Patrol/);
  assert.match(line, /2 armed officers/);
  assert.match(line, /marked vehicle/);
  assert.match(line, /across 2 days/);
  assert.match(line, /\$[\d,]+/);
});

test('money reads like money', () => {
  assert.equal(money(1234.6), '$1,235');
  assert.equal(money(0), '$0');
});

test('a week of work is reported against real capacity', () => {
  const light = weekLoad([quote({ service: 'open-house' })], 6);
  assert.equal(light.overCommitted, false);
  const heavy = weekLoad(Array.from({ length: 12 }, () => quote({ service: 'estate', days: 5 })), 2);
  assert.equal(heavy.overCommitted, true);
  assert.ok(heavy.utilisation > 1);
});

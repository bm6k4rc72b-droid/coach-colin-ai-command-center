/**
 * COLIN OS core rules, checked without a browser.
 * @module tests/colin-os/core
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkCompliance, withDisclosure, classifyLead, affiliateLink, weekPlan, toICS, postMetrics, offlineDraft, PROFILE,
} from '../../public/colin-os/js/core.js';

test('compliance: disease, dosing and FDA claims block; a missing #ad on a partner post blocks', () => {
  const bad = checkCompliance('This peptide cures diabetes. FDA approved. Inject 250 mcg daily. Link in bio!');
  assert.equal(bad.ok, false);
  const ids = bad.flags.map((f) => f.id);
  for (const id of ['cure', 'disease', 'fda', 'dose', 'disclosure']) assert.ok(ids.includes(id), id);
});

test('compliance: a disclosed, claim-free partner post passes', () => {
  const r = checkCompliance('#ad · I earn a commission from Optimum Regen links. Blood work first, then we build habits.');
  assert.equal(r.ok, true);
  assert.equal(r.score, 100);
});

test('compliance: guarantees and weight promises warn without blocking', () => {
  const r = checkCompliance('Guaranteed: lose 30 lbs this month!', { promotesPartner: false });
  assert.equal(r.ok, true);
  assert.deepEqual(r.flags.map((f) => f.level), ['warn', 'warn']);
});

test('withDisclosure adds #ad and the medical line once, and the result passes', () => {
  const once = withDisclosure('My supplier: Optimum Regen peptides.');
  assert.equal(withDisclosure(once), once);
  assert.ok(checkCompliance(once).ok);
});

test('classifyLead routes to the right lane and reads intent', () => {
  assert.equal(classifyLead('I play college football and want to get recruited D1').lane, 'athlete');
  assert.equal(classifyLead('On tirzepatide, need help with weight loss').lane, 'glp');
  const r = classifyLead("I'm a realtor with crazy long hours, how much is coaching?");
  assert.equal(r.lane, 'pressure');
  assert.equal(r.intent, 'hot');
  assert.equal(classifyLead('nice hat').lane, 'general');
  assert.equal(classifyLead('nice hat').intent, 'cold');
});

test('affiliateLink keeps the partner path and adds clean UTM tags', () => {
  const u = new URL(affiliateLink(PROFILE.partner.url, { campaign: 'Weekly Push', content: 'GLP Muscle Reel!' }));
  assert.equal(u.pathname, '/a/colin-cook');
  assert.equal(u.searchParams.get('utm_source'), 'instagram');
  assert.equal(u.searchParams.get('utm_campaign'), 'weekly-push');
  assert.equal(u.searchParams.get('utm_content'), 'glp-muscle-reel');
});

test('weekPlan starts on a Monday, runs 7 days, and the ICS has 7 events', () => {
  const plan = weekPlan(new Date(2026, 10, 12), { hour: 18 }); // Thu 12 Nov 2026
  assert.equal(plan.length, 7);
  assert.equal(plan[0].date.getDay(), 1);
  assert.equal(plan[0].date.getDate(), 16);
  assert.equal(plan[6].date.getDay(), 0);
  const ics = toICS(plan, new Date(0));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 7);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR') && ics.endsWith('END:VCALENDAR'));
});

test('postMetrics computes rates and flags weak retention', () => {
  const m = postMetrics({ reach: 10000, likes: 400, comments: 20, shares: 10, saves: 30, follows: 5, avgWatch: 6, length: 30 });
  assert.equal(m.engagementRate, 4.6);
  assert.equal(m.retention, 20);
  assert.ok(m.notes.some((n) => /hook/.test(n)));
  assert.equal(postMetrics({}).reach, 0);
});

test('offline drafts are compliant out of the box', () => {
  const c = offlineDraft('caption', { topic: 'GLP muscle' });
  assert.ok(checkCompliance(c.caption).ok, JSON.stringify(checkCompliance(c.caption).flags));
  assert.ok(checkCompliance(offlineDraft('dm', { lane: 'glp' }).reply, { promotesPartner: false }).ok);
});

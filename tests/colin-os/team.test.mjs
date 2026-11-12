import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { DEPARTMENTS, ALL_AGENTS, routeGoal } from '../../public/colin-os/js/team.js';

test('10 departments x 5 agents, unique ids', () => {
  assert.equal(DEPARTMENTS.length, 10);
  assert.ok(DEPARTMENTS.every((d) => d.agents.length === 5));
  assert.equal(new Set(ALL_AGENTS.map((a) => a.id)).size, 50);
});

test('every agent has a generated Claude Code subagent and only uses skills that exist', () => {
  for (const a of ALL_AGENTS) {
    const f = new URL(`../../.claude/agents/${a.id}.md`, import.meta.url);
    assert.ok(existsSync(f), `${a.id}.md missing: run npm run agents:colin-os`);
    assert.match(readFileSync(f, 'utf8'), new RegExp(`^---\\nname: ${a.id}\\n`));
    for (const s of a.skills) assert.ok(existsSync(new URL(`../../.claude/skills/${s}/SKILL.md`, import.meta.url)), `${a.id} → ${s}`);
  }
  assert.ok(existsSync(new URL('../../.claude/agents/ceo.md', import.meta.url)));
});

test('routeGoal spreads a goal across departments and always returns a team', () => {
  const seo = routeGoal('rank our serum on Google and get cited in AI answers (SEO and GEO)').map((a) => a.id);
  assert.ok(seo.some((id) => ['keyword-research', 'onpage-seo', 'technical-seo'].includes(id)), seo.join());
  const email = routeGoal('write a newsletter and an email nurture sequence').map((a) => a.dept);
  assert.ok(email.includes('email'));
  assert.equal(routeGoal('zzz qqq').length, 5);
  const picks = routeGoal('grow instagram reels and leads', 5);
  assert.equal(new Set(picks.slice(0, 3).map((a) => a.dept)).size, 3, 'top picks come from different departments');
});

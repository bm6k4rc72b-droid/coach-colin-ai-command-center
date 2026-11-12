/**
 * The 50-agent marketing team: 10 departments x 5 specialists, led by a CEO agent.
 *
 * One source of truth: the COLIN OS page renders and runs these, and
 * scripts/colin-os-agents.mjs writes them out as Claude Code subagents in .claude/agents/.
 * `skills` names the imported Claude Code skills (.claude/skills/) each agent should lean on.
 *
 * @module colin-os/team
 */

/** @typedef {{ id: string, does: string, skills: string[] }} Agent */
/** @typedef {{ id: string, name: string, color: string, agents: Agent[] }} Department */

/** @type {Department[]} */
export const DEPARTMENTS = [
  { id: 'intel', name: 'Market Intelligence', color: '#e8743b', agents: [
    { id: 'market-research', does: 'Analyse markets, trends and opportunities', skills: ['customer-research', 'competitors', 'geo-content-research'] },
    { id: 'icp-research', does: 'Build detailed ideal customer profiles', skills: ['customer-research', 'product-marketing'] },
    { id: 'competitor-intel', does: 'Track and analyse competitors', skills: ['competitor-profiling', 'competitors', 'reverse-engineer-marketing'] },
    { id: 'customer-insights', does: 'Analyse customer feedback and pain points', skills: ['customer-research'] },
    { id: 'trend-analysis', does: 'Identify emerging trends and market shifts', skills: ['reddit-opportunity-research', 'geo-content-research'] },
  ] },
  { id: 'strategy', name: 'Strategy & Positioning', color: '#3b82f6', agents: [
    { id: 'marketing-strategy', does: 'Create go-to-market strategies and 90-day plans', skills: ['marketing-plan', 'launch', 'marketing-council'] },
    { id: 'positioning', does: 'Define positioning and differentiation', skills: ['product-marketing', 'competitors'] },
    { id: 'messaging', does: 'Develop key messages and brand narratives', skills: ['copywriting', 'product-marketing'] },
    { id: 'offer-strategy', does: 'Craft compelling offers and value propositions', skills: ['offers', 'pricing', 'marketing-psychology'] },
    { id: 'brand-strategy', does: 'Build and maintain brand strategy and guidelines', skills: ['product-marketing', 'research-brand'] },
  ] },
  { id: 'seo', name: 'SEO & Search', color: '#10b981', agents: [
    { id: 'keyword-research', does: 'Find high-value keywords and search opportunities', skills: ['research-keywords', 'programmatic-seo'] },
    { id: 'content-gap', does: 'Identify content gaps and clustering opportunities', skills: ['geo-content-planning', 'audit-content'] },
    { id: 'onpage-seo', does: 'Optimise content for search intent and rankings', skills: ['seo-audit', 'ai-seo', 'improve-aeo-geo'] },
    { id: 'technical-seo', does: 'Analyse technical SEO issues and recommend fixes', skills: ['seo-audit', 'schema', 'site-architecture', 'audit-website-aeo'] },
    { id: 'link-building', does: 'Create internal linking and link-building strategies', skills: ['link-building', 'build-backlinks', 'build-resource-pages', 'directory-submissions'] },
  ] },
  { id: 'content', name: 'Content', color: '#d4a017', agents: [
    { id: 'content-strategy', does: 'Plan content calendars and topics', skills: ['content-strategy', 'geo-content-planning'] },
    { id: 'content-brief', does: 'Create detailed content briefs', skills: ['content-strategy', 'write-seo-geo-content'] },
    { id: 'longform-content', does: 'Write in-depth articles and guides', skills: ['write-seo-geo-content', 'copywriting', 'create-geo-charts'] },
    { id: 'content-editor', does: 'Edit and improve existing content', skills: ['copy-editing', 'audit-content'] },
    { id: 'repurposing', does: 'Turn content into multiple formats across channels', skills: ['social', 'video'] },
  ] },
  { id: 'social', name: 'Social & LinkedIn', color: '#8b5cf6', agents: [
    { id: 'social-strategy', does: 'Build social and LinkedIn strategies', skills: ['social', 'community-marketing'] },
    { id: 'linkedin-posts', does: 'Write high-performing LinkedIn posts', skills: ['social', 'copywriting'] },
    { id: 'hook-creator', does: 'Generate scroll-stopping hooks and angles', skills: ['social', 'video', 'marketing-psychology'] },
    { id: 'thought-leadership', does: 'Develop thought-leadership content', skills: ['social', 'public-relations'] },
    { id: 'social-repurposing', does: 'Turn content into posts, threads and carousels', skills: ['social'] },
  ] },
  { id: 'demand', name: 'Demand Generation', color: '#22a06b', agents: [
    { id: 'campaign-strategy', does: 'Plan multi-channel campaigns', skills: ['marketing-plan', 'ads', 'ad-creative'] },
    { id: 'lead-magnets', does: 'Create high-value lead magnets', skills: ['lead-magnets', 'free-tools'] },
    { id: 'distribution', does: 'Plan content and campaign distribution', skills: ['community-marketing', 'co-marketing', 'influencer-marketing'] },
    { id: 'nurture-campaigns', does: 'Build nurture sequences and follow-up campaigns', skills: ['emails', 'cold-email'] },
    { id: 'audience-growth', does: 'Grow and engage your audience', skills: ['referrals', 'marketing-loops', 'influencer-marketing'] },
  ] },
  { id: 'email', name: 'Email & Lifecycle', color: '#c2410c', agents: [
    { id: 'email-strategy', does: 'Create email and lifecycle strategies', skills: ['emails', 'onboarding'] },
    { id: 'newsletter', does: 'Plan and write newsletters', skills: ['emails', 'copywriting'] },
    { id: 'email-copy', does: 'Write high-converting email copy', skills: ['emails', 'cold-email', 'copywriting'] },
    { id: 'lifecycle', does: 'Build automated lifecycle sequences', skills: ['emails', 'churn-prevention', 'sms'] },
    { id: 'email-optimisation', does: 'Analyse email performance and improve results', skills: ['emails', 'ab-testing'] },
  ] },
  { id: 'conversion', name: 'Conversion', color: '#be185d', agents: [
    { id: 'landing-page', does: 'Create and optimise landing pages', skills: ['cro', 'copywriting', 'signup'] },
    { id: 'cro-analysis', does: 'Analyse and improve conversion rates', skills: ['cro', 'popups', 'paywalls'] },
    { id: 'cta-optimiser', does: 'Write and test high-converting CTAs', skills: ['cro', 'copywriting', 'ab-testing'] },
    { id: 'funnel-analysis', does: 'Analyse funnels and identify drop-offs', skills: ['analytics', 'cro'] },
    { id: 'experiment-design', does: 'Organise tests and conversion experiments', skills: ['ab-testing'] },
  ] },
  { id: 'analytics', name: 'Analytics & Insights', color: '#2563eb', agents: [
    { id: 'data-analyst', does: 'Analyse marketing data and find insights', skills: ['analytics'] },
    { id: 'campaign-analysis', does: 'Assess campaign performance', skills: ['analytics', 'attribution'] },
    { id: 'content-performance', does: 'Track content performance and ROI', skills: ['analytics', 'audit-content'] },
    { id: 'reporting', does: 'Create clear marketing reports and dashboards', skills: ['analytics', 'revops'] },
    { id: 'analytics-optimisation', does: 'Identify areas for performance and growth', skills: ['analytics', 'conversion-tracking', 'attribution'] },
  ] },
  { id: 'ops', name: 'Marketing Operations', color: '#16a34a', agents: [
    { id: 'workflow-architect', does: 'Design marketing workflows and processes', skills: ['revops', 'marketing-loops'] },
    { id: 'system-integration', does: 'Set up tools, MCP connections and automation', skills: ['conversion-tracking', 'revops'] },
    { id: 'marketing-qa', does: 'Review and quality-check marketing outputs', skills: ['copy-editing'] },
    { id: 'documentation', does: 'Create and maintain marketing docs and playbooks', skills: ['sales-enablement'] },
    { id: 'marketing-systems', does: 'Organise assets, folders and knowledge bases', skills: ['revops'] },
  ] },
];

export const ALL_AGENTS = DEPARTMENTS.flatMap((d) => d.agents.map((a) => ({ ...a, dept: d.id, deptName: d.name, color: d.color })));

/** Businesses the team can work for. The CEO asks which one when a goal is ambiguous. */
export const BUSINESSES = {
  coach: 'Coach Colin (@coachcolinc): GLP / peptides lifestyle coaching for D1-track athletes, GLP-lifestyle clients (blood work mandatory) and high-pressure professionals; Optimum Regen Peptides affiliate.',
  beauty: 'Beauty commerce: hair, skin and anti-aging products sold through Shopify, TikTok Shop and Amazon (dropshipping / private label).',
};

/**
 * Offline router: picks the agents whose job text best matches a goal. The live CEO uses Claude;
 * this keeps the org chart useful without a key and gives the CEO a shortlist.
 * @param {string} goal
 * @param {number} [k]
 */
export function routeGoal(goal, k = 5) {
  const words = String(goal || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const stop = new Set(['the', 'and', 'for', 'a', 'to', 'of', 'my', 'in', 'on', 'with', 'me', 'i', 'we', 'our', 'an', 'is', 'it', 'this', 'that', 'how', 'make', 'get', 'more']);
  const terms = words.filter((w) => w.length > 2 && !stop.has(w));
  const syn = { seo: ['search', 'keyword', 'rank'], geo: ['search', 'ai', 'answer'], tiktok: ['social', 'hook', 'video'], reel: ['hook', 'social', 'video'], reels: ['hook', 'social', 'video'], instagram: ['social', 'hook'], email: ['email', 'newsletter'], leads: ['lead', 'nurture', 'campaign'], sales: ['conversion', 'offer', 'funnel'], launch: ['strategy', 'campaign', 'plan'], competitors: ['competitor'], ads: ['campaign'] };
  const expanded = terms.flatMap((t) => [t, ...(syn[t] || [])]);
  const scored = ALL_AGENTS.map((a) => {
    const hay = `${a.id} ${a.does} ${a.deptName} ${a.skills.join(' ')}`.toLowerCase();
    const score = expanded.reduce((n, t) => n + (hay.includes(t.replace(/s$/, '')) ? 1 : 0), 0);
    return { a, score };
  }).filter((x) => x.score > 0).sort((x, y) => y.score - x.score);
  const picked = [];
  const seenDept = new Set();
  for (const { a } of scored) { if (!seenDept.has(a.dept)) { picked.push(a); seenDept.add(a.dept); } if (picked.length >= k) break; }
  for (const { a } of scored) { if (picked.length >= k) break; if (!picked.includes(a)) picked.push(a); }
  if (!picked.length) return ['marketing-strategy', 'content-strategy', 'hook-creator', 'campaign-strategy', 'data-analyst'].map((id) => ALL_AGENTS.find((a) => a.id === id));
  return picked;
}

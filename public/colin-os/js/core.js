/**
 * COLIN OS core: the parts of the agent team that need no AI and no network.
 *
 * Profile, compliance guard, lead routing, affiliate links, the weekly plan and
 * offline drafts. Pure functions, so they run in the browser and under node --test.
 *
 * @module colin-os/core
 */

/** Who the agents work for. Edit here (or in the Profile tab) and every agent follows. */
export const PROFILE = {
  name: 'Coach Colin',
  handle: 'coachcolinc',
  instagram: 'https://www.instagram.com/coachcolinc',
  offer: 'GLP / Peptides Lifestyle Coaching: worldwide online, in person locally, plus mobile travel',
  partner: {
    name: 'Optimum Regen Peptides',
    url: 'https://www.optimumregenpeptides.com/a/colin-cook',
    code: '',
  },
  certifications: [
    'ISSA Certified GLP-1 Weight Loss Specialist',
    'ISSA Certified Brain Fitness Coach',
    'ISSA Certified Personal Trainer, Elite Trainer, Master Trainer',
    'ISSA Strength & Conditioning, Corrective Exercise, Nutritionist, Transformation Specialist',
    'NASM Nutritionist, Sports Nutritionist, Behavior Change Specialist, Wellness Coach',
    'NASM Performance Enhancement Specialist',
  ],
  voice: 'Direct, confident, no-fluff coach. Short punchy lines. Rewards commitment. Respects the grind.',
};

/** The three client lanes from the pinned post. A lead is routed to one of these (or "general"). */
export const LANES = {
  athlete: {
    label: 'D1-track athletes',
    blurb: 'Athletes pursuing D1 college-level expectations',
    keywords: ['d1', 'college', 'recruit', 'scholarship', 'athlete', 'football', 'basketball', 'baseball', 'soccer', 'track', 'speed', 'vertical', 'season', 'sport', 'combine', 'wrestling'],
  },
  glp: {
    label: 'GLP lifestyle',
    blurb: 'GLP lifestyle management (blood work mandatory)',
    keywords: ['glp', 'glp-1', 'semaglutide', 'tirzepatide', 'ozempic', 'wegovy', 'mounjaro', 'zepbound', 'peptide', 'peptides', 'weight loss', 'lose weight', 'fat loss', 'bloodwork', 'blood work', 'lbs', 'pounds', 'appetite'],
  },
  pressure: {
    label: 'High-pressure pros',
    blurb: 'High-pressure occupations: realtors, sales, firefighters, those who serve',
    keywords: ['realtor', 'real estate', 'sales', 'salesperson', 'firefighter', 'fire fighter', 'police', 'officer', 'military', 'veteran', 'army', 'marine', 'navy', 'nurse', 'ems', 'paramedic', 'stress', 'burnout', 'long hours', 'shift', 'commission'],
  },
};

/**
 * Claims a coach promoting peptides must not make. Each rule has a fix the UI shows.
 * Peptides sold online are usually labelled for research use; GLP-1 drugs are prescription only.
 */
export const RISK_RULES = [
  { id: 'cure', level: 'block', re: /\b(cures?|cured|heals?|treats?|treatment for|reverses?)\b/i, fix: 'Do not say a product cures, treats or reverses anything. Talk about your coaching, habits and results you can document.' },
  { id: 'disease', level: 'block', re: /\b(diabetes|cancer|alzheimer'?s|arthritis|depression|anxiety disorder|heart disease|obesity disease|covid)\b/i, fix: 'No disease claims next to a product. Refer people to their doctor.' },
  { id: 'fda', level: 'block', re: /\bfda[- ]?(approved|cleared)\b/i, fix: 'Never call a peptide FDA approved unless that exact product is. Drop the phrase.' },
  { id: 'dose', level: 'block', re: /\b\d+(\.\d+)?\s?(mg|mcg|µg|iu|units?|ml)\b|\b(inject|injection|dose|dosing|dosage|reconstitute|subq|sub-q)\b/i, fix: 'No dosing or injection instructions in public content. That conversation belongs with a licensed provider.' },
  { id: 'guarantee', level: 'warn', re: /\b(guarantee[ds]?|100\s?%|risk[- ]free|no side effects|zero side effects|miracle|instant(ly)?)\b/i, fix: 'Remove guarantees and "no side effects". Results vary.' },
  { id: 'weight', level: 'warn', re: /\b(lose|drop|melt)\s+\d+\s?(lbs?|pounds|kg|kilos)\b/i, fix: 'Specific weight-loss promises need a "results not typical" note and real, documented proof. Safer: describe the process.' },
  { id: 'rx', level: 'warn', re: /\b(no prescription|without a prescription|skip the doctor|no doctor)\b/i, fix: 'Never suggest skipping a prescriber. Your own post says blood work is mandatory: lead with that.' },
  { id: 'unverified', level: 'warn', re: /\b(most certified|#1|number one|best in the world|clinically proven)\b/i, fix: 'Superlatives and "clinically proven" need proof you can show. List the certifications instead.' },
];

const DISCLOSURE_RE = /(#ad\b|#sponsored\b|#affiliate\b|\bpaid partnership\b|\baffiliate link\b|\bi earn a commission\b|\bcommissionable\b)/i;

/**
 * Checks a draft for risky claims and a missing affiliate disclosure.
 * @param {string} text
 * @param {{ promotesPartner?: boolean }} [opts] promotesPartner defaults to "the text mentions the partner or a link"
 * @returns {{ ok: boolean, score: number, flags: {id:string, level:string, match:string, fix:string}[] }}
 */
export function checkCompliance(text, opts = {}) {
  const t = String(text || '');
  const flags = [];
  for (const r of RISK_RULES) {
    const m = t.match(r.re);
    if (m) flags.push({ id: r.id, level: r.level, match: m[0], fix: r.fix });
  }
  const promotes = opts.promotesPartner ?? /(optimum\s?regen|peptide|link in bio|\/a\/colin-cook|code\s+[A-Z0-9]{3,})/i.test(t);
  if (promotes && !DISCLOSURE_RE.test(t)) {
    flags.push({ id: 'disclosure', level: 'block', match: '(none)', fix: 'Add a clear disclosure near the top, e.g. "#ad · I earn a commission from Optimum Regen links."' });
  }
  const blocks = flags.filter((f) => f.level === 'block').length;
  const warns = flags.length - blocks;
  return { ok: blocks === 0, score: Math.max(0, 100 - blocks * 30 - warns * 10), flags };
}

/** Adds the disclosure and a "not medical advice" line when the draft promotes the partner and lacks them. */
export function withDisclosure(text) {
  let t = String(text || '').trim();
  if (!DISCLOSURE_RE.test(t)) t = `#ad · I earn a commission from Optimum Regen links.\n\n${t}`;
  if (!/not medical advice/i.test(t)) t += '\n\nCoaching, not medical advice. Talk to your doctor and get blood work before starting anything.';
  return t;
}

/**
 * Routes a comment or DM to a client lane by keyword weight.
 * @param {string} message
 * @returns {{ lane: 'athlete'|'glp'|'pressure'|'general', scores: Record<string, number>, intent: 'hot'|'warm'|'cold' }}
 */
export function classifyLead(message) {
  const t = ` ${String(message || '').toLowerCase()} `;
  const scores = {};
  for (const [k, lane] of Object.entries(LANES)) {
    scores[k] = lane.keywords.reduce((n, w) => n + (t.includes(w) ? (w.includes(' ') ? 2 : 1) : 0), 0);
  }
  let lane = 'general';
  let best = 0;
  for (const [k, v] of Object.entries(scores)) if (v > best) { best = v; lane = k; }
  const hot = /\b(price|cost|how much|sign me up|sign up|start|ready|link|book|call|spots?|join|interested|dm me|how do i)\b/i.test(t);
  const warm = /\?|\b(how|what|does|can|help|info|more)\b/i.test(t);
  return { lane, scores, intent: hot ? 'hot' : warm ? 'warm' : 'cold' };
}

/**
 * The affiliate URL with UTM tags so the Analyst can tell which post sold.
 * @param {string} base
 * @param {{ source?: string, medium?: string, campaign?: string, content?: string }} [tags]
 */
export function affiliateLink(base = PROFILE.partner.url, tags = {}) {
  const u = new URL(base);
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  u.searchParams.set('utm_source', slug(tags.source || 'instagram'));
  u.searchParams.set('utm_medium', slug(tags.medium || 'social'));
  if (tags.campaign) u.searchParams.set('utm_campaign', slug(tags.campaign));
  if (tags.content) u.searchParams.set('utm_content', slug(tags.content));
  return u.toString();
}

/** The weekly rhythm: what each day is for. Mon is index 0. */
export const WEEK_PILLARS = [
  { day: 'Mon', pillar: 'Authority', format: 'Reel', lane: 'glp', idea: 'One myth about GLP-1 / peptide lifestyles, busted in 30 seconds' },
  { day: 'Tue', pillar: 'Athlete lab', format: 'Reel', lane: 'athlete', idea: 'A D1-standard drill with the coaching cue that fixes it' },
  { day: 'Wed', pillar: 'Proof', format: 'Carousel', lane: 'glp', idea: 'Client process breakdown: habits, training, blood-work checkpoints (with consent)' },
  { day: 'Thu', pillar: 'Pressure pros', format: 'Reel', lane: 'pressure', idea: 'A 10-minute routine for realtors, sales and first responders on a brutal day' },
  { day: 'Fri', pillar: 'Partner', format: 'Story + Reel', lane: 'glp', idea: 'Optimum Regen: what I look for in a supplier, disclosed, no dosing talk' },
  { day: 'Sat', pillar: 'Lifestyle', format: 'Reel', lane: 'general', idea: 'Behind the scenes: cowboy-hat Coach Colin, travel sessions, the grind' },
  { day: 'Sun', pillar: 'Community', format: 'Stories + Q&A', lane: 'general', idea: 'Answer the week\'s best DM questions; open 3 coaching spots' },
];

/**
 * A dated 7-day plan starting on the Monday on or after `from`.
 * @param {Date} from
 * @param {{ hour?: number }} [opts] posting hour, local time
 */
export function weekPlan(from = new Date(), opts = {}) {
  const hour = opts.hour ?? 18;
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const shift = (8 - start.getDay()) % 7; // days until Monday (0 if already Monday)
  start.setDate(start.getDate() + shift);
  return WEEK_PILLARS.map((p, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    d.setHours(hour, 0, 0, 0);
    return { ...p, date: d };
  });
}

const icsDate = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}00Z`;
const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** Calendar file for the plan, so posting reminders land on the phone. */
export function toICS(plan, now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//COLIN OS//Agent Team//EN', 'CALSCALE:GREGORIAN'];
  plan.forEach((p, i) => {
    const end = new Date(p.date.getTime() + 30 * 60000);
    lines.push('BEGIN:VEVENT', `UID:colin-os-${p.date.getTime()}-${i}@coachcolinc`, `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(p.date)}`, `DTEND:${icsDate(end)}`, `SUMMARY:${icsEsc(`Post: ${p.pillar} (${p.format})`)}`,
      `DESCRIPTION:${icsEsc(p.hook || p.idea)}`, 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Turns pasted Instagram Insights numbers into the rates the Analyst reasons about.
 * @param {{ reach?: number, plays?: number, likes?: number, comments?: number, shares?: number, saves?: number, follows?: number, linkClicks?: number, avgWatch?: number, length?: number }} m
 */
export function postMetrics(m) {
  const n = (x) => Math.max(0, Number(x) || 0);
  const reach = n(m.reach) || n(m.plays);
  const pct = (x) => (reach ? +(100 * x / reach).toFixed(2) : 0);
  const eng = n(m.likes) + n(m.comments) * 2 + n(m.shares) * 3 + n(m.saves) * 3;
  const out = {
    reach,
    engagementRate: pct(n(m.likes) + n(m.comments) + n(m.shares) + n(m.saves)),
    weightedEngagement: pct(eng),
    shareRate: pct(n(m.shares)),
    saveRate: pct(n(m.saves)),
    followRate: pct(n(m.follows)),
    clickRate: pct(n(m.linkClicks)),
    retention: n(m.length) ? +Math.min(100, (100 * n(m.avgWatch)) / n(m.length)).toFixed(1) : null,
  };
  const notes = [];
  if (out.retention !== null && out.retention < 40) notes.push('Retention under 40%: the hook is losing them. Put the payoff in the first 2 seconds.');
  if (out.shareRate < 0.5 && reach > 500) notes.push('Few shares: make it something a client sends to a friend ("tag the realtor who needs this").');
  if (out.saveRate < 0.5 && reach > 500) notes.push('Few saves: add a checklist or routine people want to keep.');
  if (out.followRate < 0.3 && reach > 1000) notes.push('Low follows: end with why to follow (one line, one promise).');
  if (out.clickRate > 0 && out.clickRate < 0.2) notes.push('Link clicks are low: move the CTA to the first comment and a story sticker.');
  if (!notes.length) notes.push('Healthy numbers. Repeat the format and change only the hook.');
  return { ...out, notes };
}

/** Offline drafts so the team does something useful before an API key is added. */
export function offlineDraft(agent, brief = {}) {
  const topic = brief.topic || 'GLP-1 lifestyle coaching';
  const lane = LANES[brief.lane]?.blurb || 'people who are ready to commit';
  const link = affiliateLink(PROFILE.partner.url, { campaign: brief.campaign || 'weekly', content: topic });
  switch (agent) {
    case 'scout':
      return { angles: [
        `The #1 mistake people make on a GLP-1 lifestyle (and it is not the medication)`,
        `${topic}: why I make blood work mandatory first`,
        `What D1 athletes do on recovery days that you skip`,
        `The 10-minute reset for realtors and first responders between calls`,
        `Peptides: the questions to ask any supplier before you buy`,
      ], audience: lane };
    case 'script':
      return { hook: `Stop. If you're on a GLP-1, this is why you're losing muscle.`, beats: [
        '0–2s: hook to camera, hat brim up, gold light',
        '2–8s: the problem: low protein + no lifting = the scale lies',
        '8–20s: the fix: 3 lifts, protein at every meal, blood work every 90 days',
        '20–27s: proof: a client process (with consent), no before/after promises',
        '27–30s: CTA: comment "LANE" and I will tell you if you qualify',
      ], onScreen: 'GLP-1? Protect your muscle.' };
    case 'caption':
      return { caption: withDisclosure(`Losing weight is easy to start and hard to keep. Muscle is what keeps it.\n\nI only take clients who commit: blood work, training, protein, check-ins.\n\nComment "LANE" and I will tell you if you are a fit.\nPeptide supplier I use: ${link}`), hashtags: ['#glp1coach', '#peptidecoach', '#d1athlete', '#firstresponderfitness', '#realtorlife', '#coachcolin'] };
    case 'dm':
      return { reply: `Appreciate you reaching out. I coach ${lane}. Quick questions so I can tell you if it's a fit: 1) your main goal in 90 days, 2) do you have recent blood work, 3) online or in person? I'll take it from there.` };
    default:
      return {};
  }
}

/**
 * The new wing: data and engines for the half-life bench, the body
 * holo-scan, the regulatory globe, Colin vs the influencer, the debate arena
 * and the future-peptides wing.
 *
 * Everything quantitative is computed here so the holograms, the wall screens
 * and the cards share one source. Regulatory and pipeline facts are a dated
 * snapshot (October 2026) and say so wherever they are shown.
 *
 * @module astra/showcase/wing
 */

import { PEPTIDES, SYSTEMS, findAny } from '../js/data/peptides.js';
import { analyseClaim, complianceCheck, compliantRewrite } from '../js/claims.js';
import { READINGS, SUBJECTS } from './sections.js';

/* ================================================================ 1 · PK */

/**
 * Teaching pharmacokinetics: a one-compartment model with first-order
 * absorption. A single subcutaneous dose gives the Bateman function
 *
 *     C(t) ∝ (kₐ / (kₐ − kₑ)) · (e^(−kₑt) − e^(−kₐt)),   kₑ = ln 2 / t½,
 *
 * repeated doses every τ hours add by superposition, and the steady-state
 * accumulation ratio is R = 1 / (1 − e^(−kₑτ)). Concentrations are relative
 * (the first dose's peak = 1): this is a model of shape, not of amounts, and
 * it is deliberately useless as a dosing tool.
 */
export const PK = [
  { id: 'native', name: 'Native GLP-1', halfLife: 2 / 60, tmax: 0, interval: 24 * 7, route: 'released by gut L-cells; IV-like', note: 'Cleaved by DPP-4 within minutes — weekly dosing of the native hormone would be pointless.', source: 'Drucker, Cell Metab 2018' },
  { id: 'semaglutide', name: 'Semaglutide', halfLife: 165, tmax: 48, interval: 24 * 7, route: 'weekly subcutaneous injection', note: 'Albumin binding via a C18 diacid stretches t½ to about a week.', source: 'Wegovy/Ozempic prescribing information; Lau et al., J Med Chem 2015' },
  { id: 'tirzepatide', name: 'Tirzepatide', halfLife: 117, tmax: 24, interval: 24 * 7, route: 'weekly subcutaneous injection', note: 'C20 diacid albumin binding; t½ about five days.', source: 'Mounjaro/Zepbound prescribing information' },
  { id: 'retatrutide', name: 'Retatrutide', halfLife: 144, tmax: 24, interval: 24 * 7, route: 'weekly subcutaneous injection (investigational)', note: 't½ about six days (Phase 1); time to peak here is an assumption.', source: 'Coskun et al., Cell Metab 2022' },
  { id: 'orforglipron', name: 'Orforglipron', halfLife: 36, tmax: 6, interval: 24, route: 'daily oral tablet — a small molecule, not a peptide', note: 'Shorter t½, so it is taken daily; approximate Phase 1 values.', source: 'Pratt et al., Diabetes Obes Metab 2023 (Phase 1)' },
];

/** Absorption rate constant that puts the single-dose peak at tmax. */
export function absorptionRate(ke, tmax) {
  if (!tmax) return Infinity;
  // tmax = ln(ka/ke)/(ka − ke): solve for ka > ke by bisection.
  let lo = ke * 1.0001;
  let hi = ke * 1e4;
  for (let i = 0; i < 200; i += 1) {
    const mid = Math.sqrt(lo * hi);
    const t = Math.log(mid / ke) / (mid - ke);
    if (t > tmax) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

/**
 * Simulate a dosing schedule.
 *
 * @param {object} drug A PK record.
 * @param {{ interval?: number, hours?: number, step?: number, miss?: number|null }} options τ (h), span, resolution, index of a missed dose.
 * @returns {object} The curve and its summary numbers.
 */
export function simulatePK(drug, { interval = drug.interval, hours = 24 * 7 * 6, step = 1, miss = null } = {}) {
  const ke = Math.LN2 / drug.halfLife;
  const ka = absorptionRate(ke, drug.tmax);
  const single = (t) => {
    if (t < 0) return 0;
    if (!Number.isFinite(ka)) return Math.exp(-ke * t);
    return (ka / (ka - ke)) * (Math.exp(-ke * t) - Math.exp(-ka * t));
  };
  // Normalise so the first dose peaks at 1.
  const tPeak = Number.isFinite(ka) ? Math.log(ka / ke) / (ka - ke) : 0;
  const peak1 = single(tPeak) || 1;
  const doses = [];
  for (let k = 0; k * interval < hours; k += 1) if (k !== miss) doses.push(k * interval);
  const points = [];
  for (let t = 0; t <= hours; t += step) {
    let c = 0;
    for (const d of doses) c += single(t - d);
    points.push([t, c / peak1]);
  }
  const accumulation = 1 / (1 - Math.exp(-ke * interval));
  // Peak and trough over the last full interval (steady-state-ish).
  const lastStart = hours - interval;
  const window = points.filter(([t]) => t >= lastStart);
  const peak = Math.max(...window.map((p) => p[1]));
  const trough = Math.min(...window.map((p) => p[1]));
  return {
    points,
    doses,
    ke,
    ka,
    accumulation,
    toSteady90: Math.log(10) / ke, // hours to 90% of steady state
    peak,
    trough,
    fluctuation: trough > 0 ? peak / trough : Infinity,
  };
}

/* ========================================================= 5 · holo-scan */

/** Where each body system lives on the scan figure (figure metres, 1.75 m tall). */
export const ZONES = [
  { id: 'nervous', at: [0, 1.62, 0.02], r: 0.12 },
  { id: 'endocrine', at: [0, 1.47, 0.05], r: 0.06 },
  { id: 'cardiovascular', at: [0.06, 1.24, 0.06], r: 0.08 },
  { id: 'immune', at: [-0.08, 1.3, 0.05], r: 0.06 },
  { id: 'metabolic', at: [-0.08, 1.04, 0.07], r: 0.09 },
  { id: 'gastrointestinal', at: [0.05, 0.96, 0.08], r: 0.1 },
  { id: 'musculoskeletal', at: [0.12, 0.5, 0.03], r: 0.1 },
  { id: 'integumentary', at: [-0.3, 0.92, 0.04], r: 0.07 },
];

/** Compounds with any graded evidence touching a body system, strongest first. */
export function compoundsFor(systemId) {
  return READINGS.filter((r) => PEPTIDES.find((p) => p.id === r.id)?.systems.includes(systemId));
}

export const SYSTEM_LABEL = Object.fromEntries(SYSTEMS.map((s) => [s.id, s.label]));

/* ======================================================= 6 · regulatory */

/** The regulators on the globe, with latitude/longitude for the markers. */
export const REGIONS = [
  { id: 'us', label: 'United States', agency: 'FDA', lat: 39, lon: -98 },
  { id: 'ca', label: 'Canada', agency: 'Health Canada', lat: 57, lon: -106 },
  { id: 'uk', label: 'United Kingdom', agency: 'MHRA', lat: 54, lon: -2 },
  { id: 'eu', label: 'European Union', agency: 'EMA', lat: 49, lon: 12 },
  { id: 'ru', label: 'Russia', agency: 'Minzdrav', lat: 58, lon: 60 },
  { id: 'jp', label: 'Japan', agency: 'MHLW / PMDA', lat: 36, lon: 138 },
  { id: 'au', label: 'Australia', agency: 'TGA', lat: -25, lon: 134 },
];

export const STATUS = {
  approved: { label: 'Approved medicine', color: '#3ef0b4' },
  cosmetic: { label: 'Cosmetic ingredient only', color: '#f0b75a' },
  investigational: { label: 'Investigational — trials only', color: '#6fd3ff' },
  withdrawn: { label: 'Application withdrawn / not approved', color: '#ff8a5c' },
  none: { label: 'Not approved as a medicine', color: '#ff5a5a' },
  untracked: { label: 'Not tracked here', color: '#5a6478' },
};

const all = (status) => Object.fromEntries(REGIONS.map((r) => [r.id, status]));

/**
 * Status by compound and region — a dated snapshot (October 2026) of public
 * regulator decisions. Where a status is not well established it is marked
 * untracked rather than guessed.
 */
export const REGULATORY = {
  semaglutide: { ...all('approved'), ru: 'untracked', note: 'Diabetes and weight-management products approved by FDA, EMA, MHRA, Health Canada, TGA and MHLW (Wegovy in Japan since 2023).' },
  tirzepatide: { ...all('approved'), ru: 'untracked', note: 'Approved for type 2 diabetes widely since 2022; weight management in the US (2023), EU, UK and Japan (Zepbound, December 2024).' },
  retatrutide: { ...all('investigational'), note: 'No approval anywhere. Lilly has said it plans to file in the US in early 2027 after TRIUMPH.' },
  tesamorelin: { ...all('none'), us: 'approved', ca: 'approved', eu: 'withdrawn', ru: 'untracked', note: 'FDA approval 2010 (HIV-associated abdominal fat); Health Canada 2014; the EU application was withdrawn in 2012 after CHMP concerns.' },
  'ghk-cu': { ...all('cosmetic'), ru: 'untracked', note: 'Sold as a cosmetic ingredient (copper tripeptide-1). Not approved as a medicine anywhere.' },
  semax: { ...all('none'), ru: 'approved', note: 'Registered as a medicine in Russia; not approved by FDA, EMA, MHRA, Health Canada, TGA or MHLW.' },
  selank: { ...all('none'), ru: 'approved', note: 'Registered in Russia; not approved elsewhere on this globe.' },
  'bpc-157': { ...all('none'), note: 'Not approved as a medicine anywhere. In 2023 the FDA placed it in compounding Category 2 (significant safety concerns).' },
  'tb-500': { ...all('none'), note: 'Not approved anywhere; the full-length parent protein has only been tested in trials.' },
  kpv: { ...all('none'), note: 'No approved product anywhere; research chemical only.' },
  'cjc-1295': { ...all('none'), note: 'Development stopped after early trials; not approved anywhere.' },
  ipamorelin: { ...all('none'), note: 'Failed its Phase 2 endpoint; not approved anywhere.' },
};

/** WADA status from the corpus's own sport line. */
export function wadaStatus(peptide) {
  const text = peptide?.regulatory?.sport || '';
  if (/not (currently |specifically )?prohibited/i.test(text)) return { banned: false, text };
  if (/prohibited|S0|S2/i.test(text)) return { banned: true, text };
  return { banned: null, text: text || 'Check the current WADA Prohibited List.' };
}

/* ============================================== 9 · Colin vs the influencer */

/** Made-up captions in the style of the genre — not real posts or people. */
export const CAPTIONS = [
  '🔥 BPC-157 healed my torn ACL in 2 weeks!! Doctors HATE this. Science-backed, 100% natural. Link in bio 💉',
  'Retatrutide is the strongest fat burner ever made, way better than Ozempic and totally safe. Grab research vials before they get banned!!',
  'GHK-Cu literally reverses ageing at the DNA level. Clinically proven. My skin is 10 years younger 😍',
  'Semaglutide changed my life and the weight stays off even after you stop. Big Pharma doesn’t want you to know this.',
];

const HYPE = [
  [/\b(doctors|big pharma|they) (hate|don['’]?t want|doesn['’]?t want)\b/i, 'Conspiracy hook'],
  [/\blink in (bio|my bio)\b/i, 'Sales link', 8],
  [/\b100\s?%|\bguarantee(d)?\b/i, 'Absolute promise'],
  [/\b(miracle|magic|insane|crazy|literally)\b/i, 'Hype word'],
  [/\b(before they(['’]re| get)? banned|limited|hurry|grab|only \d+ left|last chance|selling (out|fast)|buy now|act now)\b/i, 'Urgency pressure', 10],
  [/\b(totally|completely) safe\b|\bno side effects\b/i, 'Safety promise'],
  [/\b(safe\s*(&|and)\s*natural|all[- ]natural|100%\s*natural|chemical[- ]free|natural(ly)? safe)\b/i, 'Appeal to nature (natural ≠ safe)', 14],
  [/\b(heal(ed|s)?|cure[sd]?|fix(ed|es)?|clear(ed|s)?|got rid of)\b.{0,40}?\b(in|within)\s*(\d+\s*(h|hrs?|hours?|days?)\b|a (day|week)\b)|\bovernight\b/i, 'Health claim on a miracle timescale', 22],
  [/\bmy (skin|body|friend|results?|acne)\b|\bworked for me\b|\bchanged my life\b/i, 'Anecdote as proof'],
  [/\b[A-Z]{4,}\b/, 'SHOUTING'],
];

/**
 * Fact-check a caption line by line.
 *
 * @param {string} caption The post.
 * @returns {{ lines: object[], score: number, rewrite: string, hype: number }} The roast.
 */
export function roast(caption) {
  const text = String(caption || '').trim();
  const lines = (text.match(/[^.!?\n]+[.!?]*/g) || []).map((s) => s.trim()).filter((s) => s.replace(/[^\w]/g, '').length > 2);
  let score = 100;
  let hypeCount = 0;
  const out = lines.map((line) => {
    const hits = HYPE.filter(([re]) => re.test(line));
    const hype = hits.map(([, label]) => label);
    hypeCount += hype.length;
    const compliance = complianceCheck(line);
    const words = line.split(/\s+/).length;
    const analysis = words >= 3 ? analyseClaim(line) : { ok: false };
    const level = analysis.ok && analysis.subject ? analysis.verdict.level : null;
    let penalty = hits.reduce((sum, [, , weight]) => sum + (weight ?? 6), 0);
    penalty += compliance.findings.filter((f) => f.severity === 'block').length * 20;
    penalty += compliance.findings.filter((f) => f.severity === 'warn').length * 8;
    if (level === 'contradicted') penalty += 30;
    if (level === 'unsupported') penalty += 25;
    if (level === 'overstated') penalty += 18;
    if (level === 'mixed') penalty += 8;
    score -= penalty;
    const verdict = level === 'supported' ? 'holds' : level ? 'fails' : (hype.length || compliance.severity !== 'clear') ? 'hype' : 'neutral';
    return {
      line,
      hype,
      compliance,
      level,
      subject: analysis.ok ? analysis.subject : null,
      headline: analysis.ok && analysis.subject ? analysis.verdict.headline : null,
      verdict,
    };
  });
  return {
    lines: out,
    score: Math.max(0, Math.min(100, Math.round(score))),
    hype: hypeCount,
    rewrite: honestVersion(out),
  };
}

/**
 * What the post could have said: one evidence-true line per compound it
 * mentions, plus the disclosure.
 */
function honestVersion(lines) {
  // Every compound the post names, in the order it names them.
  const text = lines.map((l) => l.line).join(' ').toLowerCase();
  const seen = new Map();
  SUBJECTS
    .map((s) => ({ s, at: text.indexOf(s.name.toLowerCase()) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .forEach(({ s }) => { const entry = findAny(s.id); if (entry && !entry.members) seen.set(entry.id, entry); });
  for (const l of lines) if (l.subject && !seen.has(l.subject.id)) seen.set(l.subject.id, l.subject);
  if (!seen.size) return compliantRewrite(lines.map((l) => l.line).join(' '));
  const parts = [...seen.values()].map((subject) => {
    const reading = READINGS.find((r) => r.id === subject.id);
    const best = reading ? `${Math.round(reading.score * 100)}% evidence confidence (${reading.band.label.toLowerCase()})` : 'limited evidence';
    const status = subject.regulatory ? subject.regulatory.headline : '';
    return `What the research actually shows on ${subject.name}: ${best}. ${subject.tagline} ${status}`.trim();
  });
  return `${parts.join('\n\n')}\n\nEducational only — not medical advice. Talk to a clinician before using any medicine.`;
}

/* ======================================================= 16 · the arena */

export const CUES = {
  evidence: [
    [/\brandomi[sz]ed\b|\bRCT\b|\bplacebo\b|\bdouble.?blind/i, 'Cites trial design', 6],
    [/\bmeta.?analys[ie]s\b|\bsystematic review\b/i, 'Cites a synthesis', 6],
    [/\bn\s?=\s?\d+|\b\d{2,}\s(participants|patients|people|subjects)\b/i, 'Gives a sample size', 5],
    [/\b(phase [123i]{1,3}|trial|study|journal|NEJM|Lancet|published)\b/i, 'Points at a study', 4],
    [/\b(mice|mouse|rats?|rodent|animal|in vitro|cell)\b/i, 'Names the evidence tier', 4],
    [/\b(limitation|small sample|short|confound|bias|not replicated|industry.?funded)\b/i, 'Weighs a limitation', 5],
  ],
  fallacy: [
    [/\bmy (friend|mate|brother|sister|client|cousin)\b|\bi know (someone|a guy)\b|\bworked for me\b|\bpersonally\b/i, 'Anecdote', 8],
    [/\beveryone\b|\bmillions of people\b|\ball the (gym|influencers)\b/i, 'Appeal to popularity', 6],
    [/\b(doctors?|experts?|scientists?) (say|said|agree)\b/i, 'Unnamed authority', 5],
    [/\b(always|never|100\s?%|proven|cures?|guarantee)\b/i, 'Absolute claim', 6],
    [/\b(idiot|stupid|shill|clown|moron)\b/i, 'Ad hominem', 12],
    [/\bbig pharma\b|\bthey (hide|don['’]?t want)\b|\bcover.?up\b/i, 'Conspiracy', 8],
  ],
};

/**
 * Score one argument in the arena.
 *
 * @param {string} text The argument.
 * @param {'for'|'against'} side Which side the speaker argues.
 * @param {{ favoured: 'for'|'against'|null }} motion The motion's evidence lean.
 * @returns {{ points: number, plus: string[], minus: string[] }} The breakdown.
 */
export function scoreArgument(text, side, motion) {
  const plus = [];
  const minus = [];
  let points = 10;
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  if (words < 8) { points -= 5; minus.push('Too thin (under eight words)'); }
  else if (words > 25) { points += 3; plus.push('Developed argument'); }
  let evidence = 0;
  for (const [re, label, value] of CUES.evidence) {
    if (re.test(text) && evidence < 20) { evidence += value; plus.push(label); }
  }
  points += evidence;
  for (const [re, label, value] of CUES.fallacy) {
    if (re.test(text)) { points -= value; minus.push(label); }
  }
  if (motion.favoured && motion.favoured === side) { points += 4; plus.push('The graded evidence leans your way'); }
  return { points: Math.max(0, points), plus, minus };
}

/** Which side the library's evidence favours for a motion. */
export function motionLean(motion) {
  const analysis = analyseClaim(motion);
  if (!analysis.ok || !analysis.subject) return { analysis, favoured: null };
  const level = analysis.verdict.level;
  const favoured = level === 'supported' ? 'for' : ['contradicted', 'unsupported', 'overstated'].includes(level) ? 'against' : null;
  return { analysis, favoured };
}

/* ====================================================== 17 · future wing */

/**
 * The pipeline as of October 2026. Stage drives where each candidate sits
 * in the hologram; numbers are the sponsor's or the paper's headline figure
 * with its estimand, and every one should be re-checked as programmes move.
 */
export const STAGES = [
  { id: 'approved', label: 'Approved in 2026' },
  { id: 'review', label: 'Under regulatory review' },
  { id: 'phase3', label: 'Phase 3' },
  { id: 'phase2', label: 'Phase 2' },
  { id: 'early', label: 'Early research & speculation' },
];

export const FUTURE = [
  { id: 'orforglipron', name: 'Orforglipron (Foundayo)', stage: 'approved', what: 'Daily oral GLP-1 receptor agonist — a small molecule, not a peptide, so no injection and no food or water rules.', result: 'ATTAIN-1: about 12% mean weight loss at 72 weeks on the top dose (efficacy estimand) vs about 1% placebo.', status: 'FDA approved 1 April 2026 for chronic weight management.', source: 'FDA approval coverage, April 2026; Wharton et al., NEJM 2025' },
  { id: 'cagrisema', name: 'CagriSema', stage: 'review', what: 'Weekly cagrilintide (an amylin analogue) plus semaglutide: two satiety hormones in one injection.', result: 'REDEFINE 1: 20.4% vs 3.0% placebo at 68 weeks (treatment-policy); 22.7% on treatment.', status: 'NDA submitted to the FDA in December 2025; decision expected 2026–27.', source: 'Novo Nordisk, December 2025; REDEFINE 1' },
  { id: 'retatrutide', name: 'Retatrutide', stage: 'phase3', what: 'Weekly GIP + GLP-1 + glucagon triple agonist.', result: 'TRIUMPH-1 topline: 28.3% at 80 weeks (efficacy estimand); not yet peer-reviewed.', status: 'Phase 3 reading out; US filing planned early 2027.', source: 'Eli Lilly toplines, 2025–26' },
  { id: 'survodutide', name: 'Survodutide', stage: 'phase3', what: 'Weekly glucagon + GLP-1 dual agonist, also aimed at fatty liver disease (MASH).', result: 'SYNCHRONIZE-1 topline: 16.6% vs 3.2% placebo at 76 weeks (efficacy estimand).', status: 'Phase 3 results reported in 2026.', source: 'Boehringer Ingelheim / Zealand Pharma, 2026' },
  { id: 'maritide', name: 'MariTide (maridebart cafraglutide)', stage: 'phase3', what: 'Monthly antibody–peptide conjugate: GLP-1 agonist peptides on an antibody that blocks the GIP receptor.', result: 'Phase 2: up to about 20% vs 2.6% placebo at 52 weeks without diabetes; no plateau yet.', status: 'Phase 3 MARITIME programme under way.', source: 'Amgen, ADA 2025' },
  { id: 'amycretin', name: 'Amycretin', stage: 'phase3', what: 'One molecule that activates both GLP-1 and amylin receptors, as an injection and as a pill.', result: 'Phase 2 in type 2 diabetes: up to 14.5% vs 2.6% placebo at 36 weeks (injection).', status: 'Moving into Phase 3 in 2026 for weight management.', source: 'Novo Nordisk, 2025–26' },
  { id: 'bimagrumab', name: 'Bimagrumab + semaglutide', stage: 'phase2', what: 'An antibody against activin type II receptors, added to keep muscle while losing fat.', result: 'BELIEVE: about 20% weight loss at 48 weeks with the combination vs 15% semaglutide alone; lean-mass loss about 3% vs 7%.', status: 'Phase 2b published (Nature Medicine, 2026).', source: 'BELIEVE, Nature Medicine 2026' },
  { id: 'ai-binders', name: 'AI-designed peptide binders', stage: 'early', what: 'Peptides designed from scratch by protein-design models to bind a chosen target, instead of copying a hormone.', result: 'Real binders made and tested in the lab; none in late-stage trials.', status: 'Preclinical research.', source: 'De novo protein design literature, 2023–26' },
  { id: 'stapled', name: 'Stapled & cyclic peptides', stage: 'early', what: 'Chemical “staples” lock a helix in shape so it survives enzymes and can reach targets inside cells.', result: 'Several have reached early clinical trials, mostly in cancer.', status: 'Early clinical.', source: 'Stapled-peptide reviews' },
  { id: 'patches', name: 'Microneedle peptide patches', stage: 'early', what: 'Painless patches of dissolving microneedles that deliver a peptide through the skin.', result: 'Early human studies for some hormones and vaccines.', status: 'Early clinical.', source: 'Microneedle delivery reviews' },
  { id: 'cell-factories', name: 'Engineered cells that make GLP-1', stage: 'early', what: 'Implanted or gut-resident engineered cells that secrete a peptide on demand.', result: 'Animal studies only.', status: 'Preclinical.', source: 'Synthetic-biology literature' },
  { id: 'nanobots', name: 'Peptide nanobots', stage: 'early', what: 'Self-assembling machines that sense, decide and release a peptide inside the body.', result: 'None exist as therapies. This is speculation.', status: 'Science fiction — for now.', source: '—' },
];

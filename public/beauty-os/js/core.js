/**
 * BEAUTY OS core: product research scoring, channel economics, SEO + GEO listing tools,
 * cosmetic-claim compliance, and lead scoring / outreach checks for a hair, skin and anti-aging
 * store selling on Shopify, TikTok Shop and Amazon.
 *
 * Pure functions (browser + node --test). Fee defaults are editable estimates: check each
 * platform's current fee page before pricing.
 *
 * @module beauty-os/core
 */

/* ───────────────────────── Channel economics ───────────────────────── */

/** Default fee model per channel. Every number is editable in the UI. */
export const CHANNELS = {
  shopify: { label: 'Shopify', pct: 0.029, fixed: 0.30, note: 'Shopify Payments card rate on Basic; plan fee not included.' },
  tiktok: { label: 'TikTok Shop', pct: 0.06, fixed: 0.30, note: 'Referral fee estimate plus processing; affiliate commission added separately.' },
  amazon: { label: 'Amazon', pct: null, fixed: 0, note: 'Beauty referral fee: 8% at $10 and under, 15% above. FBA fee entered per item.' },
};

/** Amazon Beauty & Personal Care referral rate by price. */
export const amazonReferral = (price) => (price <= 10 ? 0.08 : 0.15);

/**
 * Unit economics for one sale on one channel.
 * @param {{ price: number, cost: number, shipping?: number, adSpend?: number, affiliatePct?: number, fbaFee?: number, returnRate?: number }} p
 * @param {'shopify'|'tiktok'|'amazon'} channel
 * @param {Partial<typeof CHANNELS>} [overrides]
 */
export function unitEconomics(p, channel, overrides = {}) {
  const ch = { ...CHANNELS[channel], ...(overrides[channel] || {}) };
  const price = +p.price || 0;
  const pct = channel === 'amazon' && ch.pct == null ? amazonReferral(price) : ch.pct;
  const fees = price * pct + ch.fixed + (channel === 'amazon' ? +p.fbaFee || 0 : 0);
  const affiliate = price * (+p.affiliatePct || 0);
  const returns = price * (+p.returnRate || 0);
  const landed = (+p.cost || 0) + (channel === 'amazon' ? 0 : +p.shipping || 0);
  const profit = price - fees - affiliate - returns - landed - (+p.adSpend || 0);
  const margin = price ? profit / price : 0;
  const contribution = price - fees - affiliate - returns - landed;
  return {
    channel, price, fees: round(fees), affiliate: round(affiliate), returns: round(returns), landed: round(landed), adSpend: round(+p.adSpend || 0),
    profit: round(profit), margin: round(margin, 3),
    breakEvenCPA: round(contribution),
    breakEvenROAS: contribution > 0 ? round(price / contribution) : null,
  };
}

const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/** Least-squares slope of a series, as % of its mean per step. Positive = rising interest. */
export function trendSlope(series) {
  const y = (series || []).map(Number).filter((v) => Number.isFinite(v));
  const n = y.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0; let den = 0;
  y.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2; });
  return my ? round((100 * num) / den / my, 2) : 0;
}

/* ───────────────────────── Product research ───────────────────────── */

/**
 * Scores a product idea 0–100 across what decides whether it sells profitably and safely.
 * @param {{ name: string, price: number, cost: number, shipping?: number, interest?: number[], competitors?: number,
 *   avgReviews?: number, weightOz?: number, liquid?: boolean, fragile?: boolean, claims?: string, category?: string,
 *   repeatPurchase?: boolean, demoable?: boolean }} p
 */
export function scoreProduct(p) {
  const eco = unitEconomics({ ...p, adSpend: 0 }, 'shopify');
  const slope = trendSlope(p.interest);
  const latest = (p.interest || []).at(-1) ?? 50;
  const parts = {
    margin: clamp01((eco.margin - 0.2) / 0.5), // 20% → 0, 70% → 1
    demand: clamp01(latest / 100),
    momentum: clamp01(0.5 + slope / 10),
    competition: clamp01(1 - Math.log10(1 + (+p.competitors || 0)) / 4) * 0.6 + clamp01(1 - Math.log10(1 + (+p.avgReviews || 0)) / 4) * 0.4,
    logistics: clamp01(1 - (+p.weightOz || 0) / 32 - (p.liquid ? 0.15 : 0) - (p.fragile ? 0.25 : 0)),
    impulse: p.price >= 15 && p.price <= 45 ? 1 : p.price < 15 ? 0.6 : clamp01(1 - (p.price - 45) / 80),
    retention: p.repeatPurchase ? 1 : 0.4,
    content: p.demoable ? 1 : 0.5,
  };
  const weights = { margin: 0.22, demand: 0.14, momentum: 0.14, competition: 0.12, logistics: 0.08, impulse: 0.1, retention: 0.1, content: 0.1 };
  let score = Object.entries(weights).reduce((s, [k, w]) => s + w * parts[k], 0) * 100;
  const risk = categoryRisk(p.category, p.claims);
  score -= risk.penalty;
  const verdict = risk.level === 'stop' ? 'Do not sell as described' : score >= 70 ? 'Test it' : score >= 55 ? 'Maybe: fix the weak spots' : 'Skip';
  return { score: Math.max(0, Math.round(score)), parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, round(v)])), slope, economics: eco, risk, verdict };
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** Categories and ingredients that turn a cosmetic into a drug, or need extra care. */
const CATEGORY_RISK = [
  { re: /minoxidil|finasteride|hair regrowth|regrows? hair/i, level: 'stop', why: 'Hair regrowth products are OTC drugs (minoxidil) or prescription (finasteride). Not a dropshipping product.' },
  { re: /\bspf\b|sunscreen|sun protection/i, level: 'high', why: 'Sunscreen is an OTC drug in the US: needs monograph-compliant testing, drug facts label and registration.' },
  { re: /hydroquinone|tretinoin|prescription/i, level: 'stop', why: 'Prescription-only or restricted actives. Do not sell.' },
  { re: /benzoyl peroxide|salicylic acid.*acne|acne treatment/i, level: 'high', why: 'Acne treatment is an OTC drug claim. Sell as a cleanser with cosmetic claims only, or use a compliant OTC supplier.' },
  { re: /microneedl|derma ?roller|led mask|red light/i, level: 'medium', why: 'Devices can be FDA-regulated and are high-return. Check clearance status and supplier documents.' },
  { re: /collagen supplement|biotin|gumm(y|ies)|ingestible/i, level: 'medium', why: 'Supplements follow DSHEA rules: structure/function claims need the FDA disclaimer; Amazon requires testing documents.' },
  { re: /lash serum|brow serum/i, level: 'medium', why: 'Some lash serums contain prostaglandin analogues (drug ingredients). Get the full INCI list.' },
];

/** @returns {{ level: 'low'|'medium'|'high'|'stop', reasons: string[], penalty: number }} */
export function categoryRisk(category = '', claims = '') {
  const t = `${category} ${claims}`;
  const hits = CATEGORY_RISK.filter((r) => r.re.test(t));
  const claimFlags = checkClaims(claims).flags.filter((f) => f.level === 'drug');
  const order = ['low', 'medium', 'high', 'stop'];
  let level = hits.reduce((l, h) => (order.indexOf(h.level) > order.indexOf(l) ? h.level : l), 'low');
  if (claimFlags.length && order.indexOf(level) < 2) level = 'high';
  const penalty = { low: 0, medium: 8, high: 20, stop: 60 }[level];
  return { level, reasons: [...hits.map((h) => h.why), ...claimFlags.map((f) => f.fix)], penalty };
}

/* ───────────────────────── Claims compliance ───────────────────────── */

/**
 * Cosmetic vs drug claim rules (FDA), plus platform words that get listings suppressed.
 * level 'drug' = makes the product a drug; 'platform' = Amazon/TikTok suppress it; 'proof' = needs evidence.
 */
export const CLAIM_RULES = [
  { re: /\b(regrow(s|th)?|stops? hair loss|prevents? hair loss|cures? (baldness|alopecia))\b/i, level: 'drug', fix: 'Say "for fuller-looking hair" or "reduces breakage", not regrowth or stopping hair loss.' },
  { re: /\b(boosts?|stimulates?|increases?) (collagen|elastin|cell (turnover|renewal))\b/i, level: 'drug', fix: 'Say "improves the look of firmness", not that it changes collagen production.' },
  { re: /\b(heals?|treats?|cures?|repairs? (dna|skin barrier damage)|eliminates? (acne|eczema|rosacea|psoriasis))\b/i, level: 'drug', fix: 'No treat/heal/cure claims. "Helps skin look clearer and calmer" is cosmetic.' },
  { re: /\b(removes?|erases?|eliminates?) (wrinkles|fine lines|dark spots|scars|stretch marks)\b/i, level: 'drug', fix: 'Say "reduces the appearance of wrinkles", which is a cosmetic claim.' },
  { re: /\b(anti-?inflammatory|antibacterial|antifungal|antimicrobial|kills (bacteria|germs))\b/i, level: 'drug', fix: 'Drop medical action words; describe the feel and the look instead.' },
  { re: /\b(botox|filler)[- ]?(alternative|in a (jar|bottle)|like)\b/i, level: 'drug', fix: 'Do not compare to Botox or fillers (a drug/procedure comparison and a trademark).' },
  { re: /\bspf\s?\d+|sun ?protection|blocks uv/i, level: 'drug', fix: 'SPF claims make it an OTC drug. Only with a compliant, tested OTC product.' },
  { re: /\b(fda[- ]?(approved|certified|registered))\b/i, level: 'platform', fix: 'Cosmetics are not FDA approved. Remove; "FDA registered facility" only if true and proven.' },
  { re: /\b(clinically proven|dermatologist recommended|#1|best[- ]selling|doctor recommended)\b/i, level: 'proof', fix: 'Keep only with a study, survey or sales record you can show the platform.' },
  { re: /\b(guaranteed?|permanent(ly)?|instant(ly)? (results|lift)|miracle|100% natural|chemical[- ]free|non[- ]toxic)\b/i, level: 'platform', fix: 'Amazon and TikTok suppress absolute or unprovable claims. Describe the ingredients instead.' },
  { re: /\b(free shipping|sale|discount|cheap|best price|limited time)\b/i, level: 'platform', fix: 'Amazon titles and bullets may not contain promotions or pricing language.' },
];

export function checkClaims(text) {
  const t = String(text || '');
  const flags = [];
  for (const r of CLAIM_RULES) { const m = t.match(r.re); if (m) flags.push({ level: r.level, match: m[0], fix: r.fix }); }
  const drug = flags.filter((f) => f.level === 'drug').length;
  return { ok: drug === 0, score: Math.max(0, 100 - drug * 30 - (flags.length - drug) * 10), flags };
}

/* ───────────────────────── Listing SEO by channel ───────────────────────── */

/** Field limits per channel. Amazon search terms are measured in bytes. */
export const LIMITS = {
  amazon: { title: 200, bullets: 5, bullet: 500, searchTermsBytes: 249, banned: /[!$?_{}^¬¦]/ },
  shopify: { seoTitle: 60, metaDescription: 155, handle: 80 },
  tiktok: { title: 255, titleMin: 25, description: 10000 },
};

const bytes = (s) => new TextEncoder().encode(String(s || '')).length;
export const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, LIMITS.shopify.handle);

/**
 * Lints a listing against the channel's rules plus the claims rules.
 * @param {'amazon'|'shopify'|'tiktok'} channel
 * @param {{ title?: string, bullets?: string[], searchTerms?: string, seoTitle?: string, metaDescription?: string, handle?: string, description?: string }} l
 * @returns {{ issues: { field: string, msg: string, level: 'error'|'warn' }[], score: number }}
 */
export function lintListing(channel, l) {
  const issues = [];
  const add = (field, msg, level = 'error') => issues.push({ field, msg, level });
  if (channel === 'amazon') {
    const L = LIMITS.amazon;
    if (!l.title) add('title', 'Missing title');
    else {
      if (l.title.length > L.title) add('title', `Title is ${l.title.length} chars; max ${L.title}`);
      if (L.banned.test(l.title)) add('title', 'Title has a banned character (! $ ? _ { } ^ ¬ ¦)');
      const counts = {};
      for (const w of l.title.toLowerCase().match(/[a-z]{3,}/g) || []) counts[w] = (counts[w] || 0) + 1;
      const rep = Object.entries(counts).filter(([w, c]) => c > 2 && !['and', 'for', 'with', 'the'].includes(w)).map(([w]) => w);
      if (rep.length) add('title', `Words used more than twice: ${rep.join(', ')}`);
      if (l.title.length > 80) add('title', 'Over 80 chars: mobile shows ~80. Put brand + product + key benefit first.', 'warn');
    }
    const b = l.bullets || [];
    if (b.length < L.bullets) add('bullets', `${b.length} of 5 bullets`, 'warn');
    b.forEach((x, i) => { if (x.length > L.bullet) add('bullets', `Bullet ${i + 1} is ${x.length} chars; keep under ${L.bullet}`, 'warn'); });
    if (l.searchTerms != null) {
      const n = bytes(l.searchTerms);
      if (n > L.searchTermsBytes) add('searchTerms', `Search terms are ${n} bytes; Amazon indexes ${L.searchTermsBytes}`);
      const titleWords = new Set((l.title || '').toLowerCase().match(/[a-z]+/g) || []);
      const dup = [...new Set((l.searchTerms.toLowerCase().match(/[a-z]+/g) || []).filter((w) => titleWords.has(w) && w.length > 2))];
      if (dup.length) add('searchTerms', `Repeats title words (wasted bytes): ${dup.slice(0, 8).join(', ')}`, 'warn');
      if (/,/.test(l.searchTerms)) add('searchTerms', 'Use spaces, not commas', 'warn');
    }
  }
  if (channel === 'shopify') {
    const L = LIMITS.shopify;
    if (!l.seoTitle) add('seoTitle', 'Missing SEO title'); else if (l.seoTitle.length > L.seoTitle) add('seoTitle', `SEO title is ${l.seoTitle.length} chars; Google shows ~${L.seoTitle}`, 'warn');
    if (!l.metaDescription) add('metaDescription', 'Missing meta description', 'warn'); else if (l.metaDescription.length > L.metaDescription) add('metaDescription', `Meta description is ${l.metaDescription.length} chars; keep under ${L.metaDescription}`, 'warn');
    if (l.handle && l.handle !== slugify(l.handle)) add('handle', `Handle should be "${slugify(l.handle)}"`, 'warn');
  }
  if (channel === 'tiktok') {
    const L = LIMITS.tiktok;
    if (!l.title) add('title', 'Missing product name');
    else {
      if (l.title.length > L.title) add('title', `Product name is ${l.title.length} chars; max ${L.title}`);
      if (l.title.length < L.titleMin) add('title', `Product name under ${L.titleMin} chars reads thin in search`, 'warn');
    }
  }
  const all = [l.title, l.seoTitle, l.metaDescription, l.description, ...(l.bullets || [])].filter(Boolean).join('\n');
  for (const f of checkClaims(all).flags) add('claims', `"${f.match}": ${f.fix}`, f.level === 'drug' ? 'error' : 'warn');
  const errors = issues.filter((i) => i.level === 'error').length;
  return { issues, score: Math.max(0, 100 - errors * 15 - (issues.length - errors) * 5) };
}

/* ───────────────────────── Keywords ───────────────────────── */

const TRANSACTIONAL = /\b(buy|best|cheap|price|deal|near me|sale|shop|order|amazon|tiktok shop|review|reviews|vs|top)\b/;
const INFO = /\b(how|what|why|does|can|is|routine|tips|guide|benefits|side effects|ingredients|safe)\b/;

/** Groups keywords by their head term and labels intent. */
export function clusterKeywords(list) {
  const kws = [...new Set(String(Array.isArray(list) ? list.join('\n') : list).split(/[\n,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
  const heads = ['retinol', 'peptide', 'collagen', 'vitamin c', 'hyaluronic', 'niacinamide', 'serum', 'cream', 'oil', 'mask', 'shampoo', 'conditioner', 'cleanser', 'toner', 'moisturizer', 'eye', 'lip', 'hair', 'scalp', 'brow', 'lash', 'sunscreen', 'device', 'tool'];
  const clusters = {};
  for (const k of kws) {
    const head = heads.find((h) => k.includes(h)) || k.split(' ').at(-1);
    const intent = TRANSACTIONAL.test(k) ? 'buy' : INFO.test(k) ? 'learn' : 'browse';
    (clusters[head] ||= []).push({ keyword: k, intent, words: k.split(' ').length });
  }
  return Object.entries(clusters).map(([head, items]) => ({ head, items: items.sort((a, b) => b.words - a.words), buy: items.filter((i) => i.intent === 'buy').length }))
    .sort((a, b) => b.items.length - a.items.length);
}

/* ───────────────────────── GEO (AI answer engines) ───────────────────────── */

/**
 * Scores how quotable a product page is for ChatGPT, Perplexity, Gemini and Google AI Overviews.
 * @param {string} text the page copy
 */
export function geoScore(text) {
  const t = String(text || '');
  const firstPara = t.split(/\n\s*\n/)[0] || '';
  const checks = [
    { id: 'answer-first', ok: firstPara.length > 40 && firstPara.length < 400 && /\b(is|are|helps|for)\b/i.test(firstPara), fix: 'Open with a 1–2 sentence answer: what it is, who it is for, the main result (cosmetic wording).' },
    { id: 'ingredients', ok: /\d+(\.\d+)?\s?%/.test(t) || /\b(inci|ingredients?:)/i.test(t), fix: 'Name key actives with concentrations (e.g. "5% niacinamide"). AI engines quote specifics.' },
    { id: 'who-for', ok: /\b(for (dry|oily|combination|sensitive|mature|curly|fine|thick|color-treated)|skin types?|hair types?)\b/i.test(t), fix: 'Say which skin or hair types it suits, and which it does not.' },
    { id: 'how-to-use', ok: /\b(how to use|directions|apply|use (am|pm|daily|nightly))\b/i.test(t), fix: 'Add a short "How to use" section.' },
    { id: 'faq', ok: (t.match(/\?\s*\n/g) || []).length >= 3 || /\bfaq\b/i.test(t), fix: 'Add 4–6 real customer questions with direct answers (mark them up as FAQPage).' },
    { id: 'comparison', ok: /\b(vs\.?|versus|compared (to|with)|difference between)\b/i.test(t), fix: 'Add an honest comparison (e.g. "retinol vs bakuchiol") with a small table.' },
    { id: 'evidence', ok: /\b(study|tested|participants|consumer perception|according to|source)\b/i.test(t), fix: 'Cite real testing or sources. Never invent numbers.' },
    { id: 'entity', ok: /\b(brand|made by|formulated (in|by)|cruelty[- ]free|vegan|leaping bunny)\b/i.test(t), fix: 'State the brand entity clearly: who makes it, where, and verifiable certifications.' },
    { id: 'safe-claims', ok: checkClaims(t).ok, fix: 'Remove drug claims; AI engines and platforms both downrank unsafe health claims.' },
  ];
  const score = Math.round((100 * checks.filter((c) => c.ok).length) / checks.length);
  return { score, checks };
}

/**
 * schema.org Product JSON-LD for a product page (Shopify themes can include it in product.liquid).
 * @param {{ name: string, description?: string, brand?: string, sku?: string, gtin?: string, image?: string|string[], url?: string, price?: number, currency?: string, availability?: string, rating?: number, reviewCount?: number }} p
 */
export function productJsonLd(p) {
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name,
    ...(p.description && { description: p.description }), ...(p.image && { image: p.image }),
    ...(p.brand && { brand: { '@type': 'Brand', name: p.brand } }), ...(p.sku && { sku: p.sku }), ...(p.gtin && { gtin: p.gtin }),
  };
  if (p.price != null) ld.offers = { '@type': 'Offer', price: Number(p.price).toFixed(2), priceCurrency: p.currency || 'USD', availability: `https://schema.org/${p.availability || 'InStock'}`, ...(p.url && { url: p.url }) };
  // Only real reviews: the rating is emitted only when there is a count behind it.
  if (p.rating && p.reviewCount > 0) ld.aggregateRating = { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.reviewCount };
  return ld;
}

/** schema.org FAQPage JSON-LD. */
export const faqJsonLd = (faqs) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: (faqs || []).filter((f) => f.q && f.a).map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });

/**
 * llms.txt for the store (https://llmstxt.org): a plain map AI agents can read.
 * @param {{ name: string, url: string, summary: string, collections?: {name:string,url:string,note?:string}[], policies?: {name:string,url:string}[] }} s
 */
export function llmsTxt(s) {
  const link = (x) => `- [${x.name}](${x.url})${x.note ? `: ${x.note}` : ''}`;
  return [`# ${s.name}`, '', `> ${s.summary}`, '',
    ...(s.collections?.length ? ['## Products', ...s.collections.map(link), ''] : []),
    ...(s.policies?.length ? ['## Policies', ...s.policies.map(link), ''] : []),
    '## Optional', `- [Sitemap](${new URL('/sitemap.xml', s.url).href})`, ''].join('\n');
}

/* ───────────────────────── Leads & outreach ───────────────────────── */

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF). Returns objects keyed by header. */
export function parseCSV(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim() !== ''));
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const num = (v) => { const m = String(v ?? '').replace(/,/g, '').match(/([\d.]+)\s*([km])?/i); if (!m) return 0; return +m[1] * (m[2]?.toLowerCase() === 'k' ? 1e3 : m[2]?.toLowerCase() === 'm' ? 1e6 : 1); };
const pick = (o, ...keys) => { for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]; return ''; };

/** Lead types BEAUTY OS works with. */
export const LEAD_TYPES = {
  creator: 'TikTok / Instagram creators for affiliate and UGC',
  salon: 'Salons, spas, med-spas and estheticians (wholesale / retail partners)',
  retailer: 'Boutiques and online retailers (wholesale)',
  supplier: 'Manufacturers and private-label suppliers',
};

/** Normalises a CSV row from Apollo, TikTok Affiliate Center, Instagram exports or a hand-made sheet. */
export function normalizeLead(r) {
  return {
    name: pick(r, 'name', 'full_name', 'creator_name', 'company', 'company_name', 'business_name', 'first_name'),
    company: pick(r, 'company', 'company_name', 'organization', 'business_name', 'account_name'),
    email: pick(r, 'email', 'email_address', 'work_email').toLowerCase(),
    handle: pick(r, 'handle', 'username', 'tiktok', 'instagram', 'creator_handle').replace(/^@/, '').toLowerCase(),
    website: pick(r, 'website', 'domain', 'company_website', 'url').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''),
    city: pick(r, 'city', 'location', 'company_city'),
    followers: num(pick(r, 'followers', 'follower_count', 'followers_count')),
    engagement: num(pick(r, 'engagement_rate', 'engagement', 'er')),
    gmv: num(pick(r, 'gmv', 'sales', 'gmv_30d', 'video_gmv')),
    niche: pick(r, 'niche', 'category', 'industry', 'keywords', 'bio').toLowerCase(),
    title: pick(r, 'title', 'job_title', 'role').toLowerCase(),
    moq: num(pick(r, 'moq', 'min_order')),
    leadDays: num(pick(r, 'lead_time', 'lead_time_days')),
    certs: pick(r, 'certifications', 'certs', 'gmp').toLowerCase(),
    consent: /^(y|yes|true|1|opted in)$/i.test(pick(r, 'consent', 'opt_in', 'opted_in')),
  };
}

/** Drops duplicates by email, then website, then handle. */
export function dedupeLeads(leads) {
  const seen = new Set();
  return leads.filter((l) => {
    const keys = [l.email && `e:${l.email}`, l.website && `w:${l.website}`, l.handle && `h:${l.handle}`].filter(Boolean);
    if (!keys.length || keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });
}

const NICHE = /\b(skin|skincare|beauty|hair|curl|anti-?aging|wrinkle|glow|makeup|esthetic|aesthetic|spa|salon|derm|lash|brow|wellness|selfcare|self-care|grwm)\b/;

/**
 * Scores a lead 0–100 for the given type, with the reasons.
 * @param {ReturnType<typeof normalizeLead>} l @param {keyof LEAD_TYPES} type
 */
export function scoreLead(l, type) {
  const why = [];
  let s = 0;
  const has = (cond, pts, msg) => { if (cond) { s += pts; why.push(msg); } };
  if (type === 'creator') {
    const f = l.followers;
    has(f >= 5e3 && f <= 250e3, 30, 'Micro/mid creator: best cost per sale');
    has(f > 250e3, 12, 'Large reach (costly; negotiate flat + commission)');
    const er = l.engagement > 1 ? l.engagement / 100 : l.engagement;
    has(er >= 0.04, 25, `Engagement ${(er * 100).toFixed(1)}% (strong)`); has(er >= 0.02 && er < 0.04, 12, `Engagement ${(er * 100).toFixed(1)}% (ok)`);
    has(NICHE.test(l.niche), 25, 'Beauty / hair / skin niche');
    has(l.gmv > 0, 20, 'Already sells on TikTok Shop (GMV)');
  } else if (type === 'salon' || type === 'retailer') {
    has(NICHE.test(`${l.niche} ${l.company}`), 30, 'Beauty business');
    has(!!l.email, 20, 'Has a direct email');
    has(/owner|founder|buyer|purchas|manager|director/.test(l.title), 25, 'Decision maker');
    has(!!l.website, 15, 'Has a website');
    has(!!l.city, 10, 'Local (good for samples / visits)');
  } else if (type === 'supplier') {
    has(/gmp|iso ?22716/.test(l.certs), 30, 'GMP / ISO 22716 certified');
    has(/fda|mocra/.test(l.certs), 20, 'MoCRA facility registration');
    has(l.moq > 0 && l.moq <= 500, 20, `Low MOQ (${l.moq})`);
    has(l.leadDays > 0 && l.leadDays <= 21, 15, `Fast lead time (${l.leadDays} days)`);
    has(!!l.email, 15, 'Has a direct email');
  }
  s = Math.min(100, s);
  return { score: s, tier: s >= 70 ? 'A' : s >= 45 ? 'B' : 'C', why };
}

/**
 * Checks an outreach email for CAN-SPAM basics and deliverability traps.
 * @param {{ subject: string, body: string, from?: string }} m
 */
export function checkOutreach(m) {
  const issues = [];
  const body = String(m.body || '');
  const subject = String(m.subject || '');
  if (!/unsubscribe|opt[- ]out|reply ["“]?stop/i.test(body)) issues.push('Add a way to opt out (CAN-SPAM).');
  if (!/\d{2,6}\s+\w+.*(st|street|ave|avenue|rd|road|blvd|suite|ste|po box|p\.o\.)/i.test(body)) issues.push('Add your physical mailing address (CAN-SPAM).');
  if (/^(re|fwd?):/i.test(subject)) issues.push('Fake "Re:"/"Fwd:" subjects are deceptive (CAN-SPAM).');
  if (/!!|\$\$\$|free money|act now|100% free|guarantee/i.test(`${subject} ${body}`)) issues.push('Spam-trigger wording.');
  if ((body.match(/https?:\/\//g) || []).length > 2) issues.push('More than 2 links hurts deliverability on a first touch.');
  if (body.split(/\s+/).length > 150) issues.push('Over 150 words: cold emails that get replies are short.');
  for (const f of checkClaims(body).flags) if (f.level === 'drug') issues.push(`Claim: "${f.match}". ${f.fix}`);
  return { ok: issues.length === 0, issues };
}

/** Offline outreach templates per lead type (the AI writer personalises these when a key is set). */
export function outreachTemplate(type, l, brand = { name: 'Your Brand', sender: 'Your Name', address: '123 Main St, Suite 100, City, ST 00000' }) {
  const first = (l.name || 'there').split(' ')[0];
  const foot = `\n\n${brand.sender}\n${brand.name} · ${brand.address}\nNot interested? Reply "stop" and I won't email again.`;
  const T = {
    creator: { subject: `${brand.name} x @${l.handle || first}: paid collab?`, body: `Hi ${first},\n\nYour ${l.niche || 'beauty'} videos are exactly how we'd want our product shown. We'd send free product, pay a commission on TikTok Shop sales, and a flat fee for videos we run as ads.\n\nWant me to send a sample? Disclosure (#ad / paid partnership) is required on every post.${foot}` },
    salon: { subject: `Retail line for ${l.company || 'your salon'}`, body: `Hi ${first},\n\nWe make a hair and skin line salons stock at the front desk: wholesale margin around 50%, no large minimum, and testers for your team.\n\nCould I drop off samples next week${l.city ? ` in ${l.city}` : ''}?${foot}` },
    retailer: { subject: `Wholesale: ${brand.name} for ${l.company || 'your store'}`, body: `Hi ${first},\n\nWe're a growing ${brand.name} skincare line with fast-moving SKUs on TikTok Shop. Wholesale terms, low minimums and marketing assets included.\n\nShall I send the line sheet?${foot}` },
    supplier: { subject: 'Private-label quote request', body: `Hi ${first},\n\nWe're sourcing a private-label formula (hair/skin) for Shopify, TikTok Shop and Amazon. Could you share MOQ, unit price at 500 / 1,000 / 5,000, lead time, GMP or ISO 22716 certificates, your MoCRA registration, and full INCI lists?${foot}` },
  };
  return T[type];
}

/**
 * Search plan to find leads from licensed sources (no scraping). Each line is copy-paste ready.
 * @param {keyof LEAD_TYPES} type @param {{ niche?: string, city?: string }} q
 */
export function leadSearchPlan(type, q = {}) {
  const niche = q.niche || 'skincare';
  const city = q.city || '';
  const plans = {
    creator: [
      `TikTok Shop Seller Center → Affiliate → Find creators: category Beauty & Personal Care, followers 5K–250K, GMV > $1K, keyword "${niche}". Export or invite in bulk.`,
      `Instagram Creator Marketplace (Professional Dashboard → Partnership ads): search "${niche}", filter by audience location.`,
      `TikTok Creative Center → Trends → top creators for "#${niche.replace(/\s+/g, '')}"; shortlist by engagement, then contact through the Affiliate Center.`,
    ],
    salon: [
      `Apollo People Search: titles Owner / Founder / Spa Director / Salon Manager; industry "Health, Wellness & Fitness" or "Cosmetics"; keywords "salon", "med spa", "esthetics"${city ? `; location ${city}` : ''}. Verify emails before sending.`,
      `Google Maps (Places API, licensed): "hair salon" / "med spa" / "esthetician"${city ? ` near ${city}` : ''}; rating ≥ 4.5 with 100+ reviews.`,
    ],
    retailer: [
      'Apollo Company Search: industry "Retail" or "Cosmetics", keywords "boutique", "beauty supply", "skincare shop"; 2–50 employees. Then People Search for Owner / Buyer.',
      'Faire and Tundra wholesale marketplaces: list your brand so retailers find you (inbound leads).',
    ],
    supplier: [
      `Alibaba / Made-in-China: "${niche} private label", filters Verified Supplier + Trade Assurance, MOQ ≤ 500.`,
      `US private label: search "${niche} private label manufacturer GMP ISO 22716 USA"; ask for MoCRA facility registration numbers.`,
    ],
  };
  return plans[type] || [];
}

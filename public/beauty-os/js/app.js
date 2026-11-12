/**
 * BEAUTY OS interface.
 * @module beauty-os/app
 */
import {
  CHANNELS, unitEconomics, scoreProduct, lintListing, clusterKeywords, geoScore, productJsonLd, faqJsonLd, llmsTxt,
  parseCSV, normalizeLead, dedupeLeads, scoreLead, LEAD_TYPES, leadSearchPlan, outreachTemplate, checkOutreach, checkClaims, slugify,
} from './core.js';
import { getKey, setKey, explain, researchIdeas, writeListing, writeGeoPage, writeOutreach } from './agents.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const list = (xs, tag = 'ul') => `<${tag}>${(xs || []).map((x) => `<li>${esc(x)}</li>`).join('')}</${tag}>`;
const card = (title, body, copy) => `<div class="card">${copy != null ? `<button class="btn ghost copy" data-copy="${esc(copy)}">Copy</button>` : ''}<h4>${esc(title)}</h4>${body}</div>`;
const needKey = '<p class="hint">Add an Anthropic key in Settings for AI writing. Everything else on this page works without it.</p>';
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(`beauty-os.${k}`)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(`beauty-os.${k}`, JSON.stringify(v)); } catch { /* private */ } } };

/* Tabs, copy buttons, key status */
const show = (t) => { document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t)); document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('on', p.dataset.panel === t)); };
$('tabs').addEventListener('click', (e) => e.target.dataset.tab && show(e.target.dataset.tab));
document.addEventListener('click', (e) => { const t = e.target.closest('[data-copy]'); if (t) navigator.clipboard?.writeText(t.dataset.copy).then(() => { t.textContent = 'Copied'; setTimeout(() => { t.textContent = 'Copy'; }, 1200); }); });
const keynote = () => { $('keynote').innerHTML = getKey() ? '<b>● AI writers on</b> · Claude, your key.' : '<b class="off">● Rules-only mode</b> · scoring, linting, schema and lead scoring work now; add a key in Settings for AI writing.'; };
const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } finally { btn.disabled = false; } };
const err = (el, e) => el.insertAdjacentHTML('beforeend', `<p class="err">${esc(explain(e))}</p>`);
const pill = (s) => `<span class="pill ${s >= 70 ? 'ok' : s >= 45 ? 'warn' : 'bad'}">${s}</span>`;
const issuesHtml = (issues) => (issues.length ? issues.map((i) => `<div class="flag ${i.level}"><b>${esc(i.field)}</b> · ${esc(i.msg)}</div>`).join('') : '<p><span class="pill ok">No issues</span></p>');

/* Research */
$('prod').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const p = { ...f, price: +f.price, cost: +f.cost, shipping: +f.shipping, weightOz: +f.weightOz, competitors: +f.competitors, avgReviews: +f.avgReviews,
    interest: f.interest.split(/[,\s]+/).map(Number).filter(Number.isFinite), liquid: !!f.liquid, fragile: !!f.fragile, repeatPurchase: !!f.repeatPurchase, demoable: !!f.demoable };
  const r = scoreProduct(p);
  const bars = Object.entries(r.parts).map(([k, v]) => `<div class="bar"><span>${k}</span><i style="--v:${v}"></i><b>${Math.round(v * 100)}</b></div>`).join('');
  $('prod-out').innerHTML = card(`${p.name}: ${r.verdict}`, `<p class="big">${pill(r.score)} <span class="pill ${r.risk.level === 'low' ? 'ok' : r.risk.level === 'stop' ? 'bad' : 'warn'}">claim risk: ${r.risk.level}</span> <span class="pill">trend ${r.slope > 0 ? '+' : ''}${r.slope}%/mo</span></p>${bars}<p>Shopify profit before ads: <b>$${r.economics.profit}</b> (${Math.round(r.economics.margin * 100)}%) · break-even CPA <b>$${r.economics.breakEvenCPA}</b></p>${r.risk.reasons.length ? list(r.risk.reasons) : ''}`);
});
$('ideas-go').addEventListener('click', (e) => busy(e.target, async () => {
  const out = $('ideas-out');
  if (!getKey()) { out.innerHTML = needKey; return; }
  out.innerHTML = '<p class="hint">Researching…</p>';
  try {
    const r = await researchIdeas($('niche').value);
    out.innerHTML = r.ideas.map((i) => {
      const risk = checkClaims(i.mainClaim);
      return card(i.name, `<p><span class="pill">${esc(i.category)}</span><span class="pill">${esc(i.priceRange)}</span>${risk.ok ? '' : '<span class="pill bad">claim needs rewording</span>'}</p><p>${esc(i.why)}</p><p><b>Buyer:</b> ${esc(i.buyer)}<br><b>Claim:</b> ${esc(i.mainClaim)}<br><b>Content angle:</b> ${esc(i.contentAngle)}</p><p><b>Risks</b></p>${list(i.risks)}<p><b>Validate before buying stock</b></p>${list(i.validate, 'ol')}`);
    }).join('');
  } catch (x) { out.innerHTML = ''; err(out, x); }
}));

/* Economics */
function drawEco() {
  const f = Object.fromEntries(new FormData($('eco')));
  const p = { price: +f.price, cost: +f.cost, shipping: +f.shipping, fbaFee: +f.fbaFee, adSpend: +f.adSpend, affiliatePct: +f.affiliatePct / 100, returnRate: +f.returnRate / 100 };
  const over = { tiktok: { pct: +f.tiktokPct / 100 } };
  $('eco-out').innerHTML = ['shopify', 'tiktok', 'amazon'].map((ch) => {
    const r = unitEconomics({ ...p, affiliatePct: ch === 'tiktok' ? p.affiliatePct : 0 }, ch, over);
    return `<div class="card"><h4>${CHANNELS[ch].label}</h4><p class="big ${r.profit > 0 ? 'pos' : 'neg'}">$${r.profit}<small> / sale · ${Math.round(r.margin * 100)}%</small></p><ul><li>Fees $${r.fees}</li>${r.affiliate ? `<li>Creator commission $${r.affiliate}</li>` : ''}<li>Product + shipping $${r.landed}</li><li>Returns $${r.returns}</li><li>Ads $${r.adSpend}</li></ul><p>Break-even CPA <b>$${r.breakEvenCPA}</b> · ROAS <b>${r.breakEvenROAS ?? '∞'}</b></p><p class="hint">${esc(CHANNELS[ch].note)}</p></div>`;
  }).join('');
}
$('eco').addEventListener('input', drawEco); drawEco();

/* Listing SEO */
const drawClusters = (kw) => {
  $('kw-out').innerHTML = clusterKeywords(kw).map((c) => card(`${c.head} · ${c.items.length}`, `<ul>${c.items.map((i) => `<li>${esc(i.keyword)} <span class="pill ${i.intent === 'buy' ? 'ok' : i.intent === 'learn' ? 'warn' : ''}">${i.intent}</span></li>`).join('')}</ul>`)).join('');
};
$('lst').addEventListener('submit', (e) => busy(e.submitter, async () => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  drawClusters(f.keywords);
  const out = $('lst-out');
  if (e.submitter.value === 'lint') {
    $('lst-own').classList.remove('hidden');
    const bullets = $('own-bullets').value.split('\n').filter(Boolean);
    const extra = $('own-extra').value;
    const l = f.channel === 'amazon' ? { title: $('own-title').value, bullets, searchTerms: extra } : f.channel === 'shopify' ? { seoTitle: $('own-title').value, metaDescription: extra, description: bullets.join('\n') } : { title: $('own-title').value, description: bullets.join('\n') };
    const r = lintListing(f.channel, l);
    out.innerHTML = card(`Lint · ${f.channel}`, `<p>Score ${pill(r.score)}</p>${issuesHtml(r.issues)}`);
    return;
  }
  if (!getKey()) { out.innerHTML = needKey + '<p class="hint">Or use "Lint my own" to check a listing you wrote.</p>'; return; }
  out.innerHTML = '<p class="hint">Writing…</p>';
  try {
    const l = await writeListing(f.channel, f.facts, f.keywords);
    if (f.channel === 'shopify') l.handle = slugify(l.handle || l.title);
    const r = lintListing(f.channel, l);
    const rows = Object.entries(l).map(([k, v]) => `<p><b>${esc(k)}</b> <small class="hint">${typeof v === 'string' ? `${v.length} chars` : ''}</small><br>${Array.isArray(v) ? list(v.map((x) => (typeof x === 'object' ? `${x.q} ${x.a}` : x))) : esc(v)}</p>`).join('');
    out.innerHTML = card(`${f.channel} listing`, `<p>Lint ${pill(r.score)}</p>${rows}${issuesHtml(r.issues)}`, JSON.stringify(l, null, 2))
      + (l.faqs ? card('FAQPage JSON-LD', `<pre>${esc(JSON.stringify(faqJsonLd(l.faqs), null, 2))}</pre>`, `<script type="application/ld+json">${JSON.stringify(faqJsonLd(l.faqs))}</script>`) : '');
  } catch (x) { out.innerHTML = ''; err(out, x); }
}));
drawClusters($('lst').keywords.value);

/* GEO */
function geoReport(text) {
  const g = geoScore(text);
  return card('GEO readiness', `<p>${pill(g.score)}</p>${g.checks.map((c) => `<div class="flag ${c.ok ? 'pass' : 'warn'}"><b>${c.ok ? '✓' : '✕'} ${esc(c.id)}</b>${c.ok ? '' : ` · ${esc(c.fix)}`}</div>`).join('')}`);
}
$('geo-score').addEventListener('click', () => { $('geo-out').innerHTML = geoReport($('geo-in').value); });
$('geo-rewrite').addEventListener('click', (e) => busy(e.target, async () => {
  const out = $('geo-out');
  if (!getKey()) { out.innerHTML = geoReport($('geo-in').value) + needKey; return; }
  out.innerHTML = '<p class="hint">Rewriting…</p>';
  try {
    const r = await writeGeoPage($('lst').facts.value, $('geo-in').value);
    out.innerHTML = geoReport(r.page) + card('Rewritten page', `<pre>${esc(r.page)}</pre><p><b>Comparison</b></p><pre>${esc(r.comparison)}</pre>${r.missingFacts.length ? `<p><b>Facts to add</b></p>${list(r.missingFacts)}` : ''}`, r.page)
      + card('FAQPage JSON-LD', `<pre>${esc(JSON.stringify(faqJsonLd(r.faqs), null, 2))}</pre>`, `<script type="application/ld+json">${JSON.stringify(faqJsonLd(r.faqs))}</script>`);
  } catch (x) { out.innerHTML = ''; err(out, x); }
}));
$('ld').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const url = f.url.replace(/\/$/, '');
  const ld = productJsonLd({ name: f.name, brand: f.store, sku: f.sku, gtin: f.gtin || undefined, price: f.price ? +f.price : undefined, url: `${url}/products/${slugify(f.name)}`, rating: +f.rating || undefined, reviewCount: +f.reviewCount || 0 });
  const tag = `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>`;
  const txt = llmsTxt({ name: f.store, url, summary: `${f.store} sells hair, skin and anti-aging products. Ingredients, directions and policies are on each product page.`, collections: [{ name: f.name, url: `${url}/products/${slugify(f.name)}` }], policies: [{ name: 'Shipping', url: `${url}/policies/shipping-policy` }, { name: 'Refunds', url: `${url}/policies/refund-policy` }] });
  $('ld-out').innerHTML = card('Product JSON-LD (paste into the product template)', `<pre>${esc(tag)}</pre>${f.rating && !+f.reviewCount ? '<p class="flag warn">Rating left out: it needs a real review count.</p>' : ''}`, tag)
    + card('llms.txt (upload to the site root)', `<pre>${esc(txt)}</pre><p class="hint">On Shopify, serve it with an app proxy or a redirect from /llms.txt to a page or file.</p>`, txt);
});

/* Leads */
$('lead-type').innerHTML = Object.entries(LEAD_TYPES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
$('o-type').innerHTML = $('lead-type').innerHTML;
const drawPlan = () => { $('plan-out').innerHTML = card('Where to find them', list(leadSearchPlan($('lead-type').value, { niche: $('lead-niche').value, city: $('lead-city').value }), 'ol')); };
['lead-type', 'lead-niche', 'lead-city'].forEach((id) => $(id).addEventListener('input', drawPlan)); drawPlan();
$('csv').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) $('csv-text').value = await f.text(); });
let scored = store.get('leads', []);
function drawLeads() {
  $('leads-out').innerHTML = scored.length ? `<div class="table"><table><thead><tr><th>Tier</th><th>Lead</th><th>Score</th><th>Why</th></tr></thead><tbody>${scored.map((l) => `<tr><td><span class="pill ${l.s.tier === 'A' ? 'ok' : l.s.tier === 'B' ? 'warn' : 'bad'}">${l.s.tier}</span></td><td><b>${esc(l.name || l.company)}</b><br><small>${esc([l.handle && `@${l.handle}`, l.email, l.website, l.city].filter(Boolean).join(' · '))}</small></td><td>${l.s.score}</td><td><small>${esc(l.s.why.join('; '))}</small></td></tr>`).join('')}</tbody></table></div><button class="btn ghost" id="leads-csv">Download scored CSV</button>` : '';
  $('o-lead').innerHTML = `<option value="">Sample lead</option>${scored.map((l, i) => `<option value="${i}">${esc(`${l.s.tier} · ${l.name || l.company}`)}</option>`).join('')}`;
}
$('leads-go').addEventListener('click', () => {
  const type = $('lead-type').value;
  const raw = parseCSV($('csv-text').value).map(normalizeLead);
  const uniq = dedupeLeads(raw);
  scored = uniq.map((l) => ({ ...l, type, s: scoreLead(l, type) })).sort((a, b) => b.s.score - a.s.score);
  store.set('leads', scored);
  drawLeads();
  $('leads-out').insertAdjacentHTML('afterbegin', `<p class="hint">${raw.length} rows · ${raw.length - uniq.length} duplicates removed · ${scored.filter((l) => l.s.tier === 'A').length} tier A</p>`);
});
document.addEventListener('click', (e) => {
  if (e.target.id !== 'leads-csv') return;
  const cols = ['tier', 'score', 'name', 'company', 'email', 'handle', 'website', 'city', 'followers', 'why'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...scored.map((l) => [l.s.tier, l.s.score, l.name, l.company, l.email, l.handle, l.website, l.city, l.followers, l.s.why.join('; ')].map(q).join(','))].join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'beauty-os-leads.csv' });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});
drawLeads();

/* Outreach */
const brand = () => { const b = store.get('brand', {}); return { name: b.name || 'Your Brand', sender: b.sender || 'Your Name', address: b.address || '[ADD your mailing address]' }; };
const bf = $('brand');
Object.entries(store.get('brand', {})).forEach(([k, v]) => { if (bf[k]) bf[k].value = v; });
bf.addEventListener('input', () => store.set('brand', Object.fromEntries(new FormData(bf))));
$('o-lead').addEventListener('change', () => { const l = scored[$('o-lead').value]; if (l) $('o-type').value = l.type; });
function emailCard(title, m) {
  const c = checkOutreach(m);
  return card(title, `<p><b>Subject:</b> ${esc(m.subject)}</p><pre>${esc(m.body)}</pre>${c.ok ? '<p><span class="pill ok">CAN-SPAM + claims OK</span></p>' : c.issues.map((i) => `<div class="flag warn">${esc(i)}</div>`).join('')}`, `Subject: ${m.subject}\n\n${m.body}`);
}
$('o-write').addEventListener('click', (e) => busy(e.target, async () => {
  const type = $('o-type').value;
  const l = scored[$('o-lead').value] || { name: 'Ana Lee', handle: 'anaglow', company: 'Glow Studio', city: 'Austin', niche: 'skincare' };
  const out = $('o-out');
  const tpl = outreachTemplate(type, l, brand());
  if (!getKey()) { out.innerHTML = emailCard('Template (add a key for a personalised version)', tpl); return; }
  out.innerHTML = '<p class="hint">Writing…</p>';
  try {
    const { s, ...facts } = l;
    const r = await writeOutreach(type, facts, brand());
    out.innerHTML = emailCard('First email', r) + r.followUps.map((f, i) => emailCard(`Follow-up ${i + 1} (day ${i ? 8 : 3})`, { subject: r.subject, body: f })).join('')
      + (r.dm ? card('DM version', `<pre>${esc(r.dm)}</pre>`, r.dm) : '');
  } catch (x) { out.innerHTML = ''; err(out, x); }
}));
$('c-go').addEventListener('click', () => { $('c-out').innerHTML = emailCard('Result', { subject: $('c-subj').value, body: $('c-body').value }); });

/* Settings */
$('key').value = getKey() ? '••••••••' : '';
$('key-save').addEventListener('click', () => { const v = $('key').value.trim(); if (v && !v.startsWith('•')) setKey(v); $('key').value = getKey() ? '••••••••' : ''; keynote(); });
$('key-clear').addEventListener('click', () => { setKey(''); $('key').value = ''; keynote(); });
keynote();

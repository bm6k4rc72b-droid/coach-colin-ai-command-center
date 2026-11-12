/**
 * BEAUTY OS rules, checked without a browser.
 * @module tests/beauty-os/core
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  unitEconomics, amazonReferral, trendSlope, scoreProduct, categoryRisk, checkClaims, lintListing, slugify, clusterKeywords,
  geoScore, productJsonLd, faqJsonLd, llmsTxt, parseCSV, normalizeLead, dedupeLeads, scoreLead, checkOutreach, outreachTemplate, leadSearchPlan,
} from '../../public/beauty-os/js/core.js';

test('Amazon beauty referral is 8% at $10 and under, 15% above', () => {
  assert.equal(amazonReferral(10), 0.08);
  assert.equal(amazonReferral(10.01), 0.15);
});

test('unitEconomics: Shopify $30 serum costing $6 + $4 shipping', () => {
  const e = unitEconomics({ price: 30, cost: 6, shipping: 4 }, 'shopify');
  assert.equal(e.fees, 1.17); // 2.9% + $0.30
  assert.equal(e.profit, 18.83);
  assert.equal(e.breakEvenCPA, 18.83);
  assert.equal(e.breakEvenROAS, 1.59);
  const a = unitEconomics({ price: 30, cost: 6, fbaFee: 4.5 }, 'amazon');
  assert.equal(a.fees, 9); // 15% + FBA
});

test('trendSlope: rising, flat and falling series', () => {
  assert.ok(trendSlope([10, 20, 30, 40]) > 0);
  assert.equal(trendSlope([5, 5, 5]), 0);
  assert.ok(trendSlope([40, 30, 20]) < 0);
  assert.equal(trendSlope([1]), 0);
});

test('scoreProduct: a light, demoable, rising serum beats a heavy fragile device', () => {
  const serum = scoreProduct({ name: 'Peptide serum', price: 32, cost: 5, shipping: 3.5, interest: [40, 55, 70, 85], competitors: 40, avgReviews: 150, weightOz: 2, liquid: true, repeatPurchase: true, demoable: true, category: 'serum', claims: 'reduces the appearance of fine lines' });
  const device = scoreProduct({ name: 'LED mask', price: 129, cost: 45, shipping: 12, interest: [80, 70, 60], competitors: 3000, avgReviews: 5000, weightOz: 30, fragile: true, category: 'led mask', claims: '' });
  assert.ok(serum.score > device.score, `${serum.score} vs ${device.score}`);
  assert.equal(serum.verdict, 'Test it');
  assert.equal(device.risk.level, 'medium');
});

test('categoryRisk stops hair-regrowth drugs and escalates drug claims', () => {
  assert.equal(categoryRisk('minoxidil foam').level, 'stop');
  assert.equal(categoryRisk('sunscreen spf 50').level, 'high');
  assert.equal(categoryRisk('face cream', 'boosts collagen production').level, 'high');
  assert.equal(categoryRisk('hair oil', 'adds shine').level, 'low');
});

test('checkClaims: drug claims fail, cosmetic wording passes', () => {
  assert.equal(checkClaims('Erases wrinkles and regrows hair. FDA approved!').ok, false);
  const ok = checkClaims('Reduces the appearance of fine lines; for fuller-looking hair.');
  assert.equal(ok.ok, true); assert.equal(ok.flags.length, 0);
});

test('lintListing: Amazon title chars, repeats, search-term bytes and title overlap', () => {
  const r = lintListing('amazon', { title: 'Serum Serum Serum Glow!', bullets: ['a'], searchTerms: 'serum, glow ' + 'x'.repeat(260) });
  const msgs = r.issues.map((i) => i.msg).join(' | ');
  assert.match(msgs, /banned character/);
  assert.match(msgs, /more than twice: serum/);
  assert.match(msgs, /bytes/);
  assert.match(msgs, /Repeats title words/);
  assert.match(msgs, /commas/);
  const clean = lintListing('amazon', { title: 'Lumen Peptide Serum for Face, 1 fl oz', bullets: ['1', '2', '3', '4', '5'], searchTerms: 'firming hydrating mature skin' });
  assert.equal(clean.issues.filter((i) => i.level === 'error').length, 0);
});

test('lintListing: Shopify SEO lengths and handle; TikTok name length', () => {
  const s = lintListing('shopify', { seoTitle: 'x'.repeat(70), metaDescription: 'y'.repeat(160), handle: 'Peptide Serum!' });
  assert.equal(s.issues.length, 3);
  assert.equal(slugify('Peptide Sérum! 30ml'), 'peptide-serum-30ml');
  assert.equal(lintListing('tiktok', { title: 'x'.repeat(300) }).issues[0].level, 'error');
});

test('clusterKeywords groups by head term and labels intent', () => {
  const c = clusterKeywords('best peptide serum\npeptide serum for mature skin\nhow to use retinol\nretinol cream amazon');
  const peptide = c.find((x) => x.head === 'peptide');
  assert.equal(peptide.items.length, 2);
  assert.equal(c.find((x) => x.head === 'retinol').items.find((i) => i.keyword === 'how to use retinol').intent, 'learn');
});

test('geoScore rewards answer-first, specific, sourced copy', () => {
  const thin = geoScore('Amazing serum. Buy now.');
  const rich = geoScore(`Lumen Peptide Serum is a lightweight serum for mature and dry skin that reduces the appearance of fine lines.\n\nIngredients: 5% niacinamide, 2% matrixyl peptides. Made by Lumen, cruelty-free (Leaping Bunny).\n\nHow to use: apply AM and PM.\n\nPeptides vs retinol: peptides are gentler.\n\nIn a consumer perception study of 32 participants...\n\nFAQ\nIs it safe for sensitive skin?\nYes.\nCan I use it with retinol?\nYes.\nHow long does a bottle last?\n8 weeks.`);
  assert.ok(thin.score < 30); assert.ok(rich.score >= 88, String(rich.score));
});

test('JSON-LD: no aggregateRating without real reviews; FAQ drops empty items; llms.txt', () => {
  const p = productJsonLd({ name: 'Serum', price: 32, brand: 'Lumen', rating: 4.9 });
  assert.equal(p.aggregateRating, undefined);
  assert.equal(p.offers.price, '32.00');
  assert.equal(productJsonLd({ name: 'S', rating: 4.8, reviewCount: 12 }).aggregateRating.reviewCount, 12);
  assert.equal(faqJsonLd([{ q: 'a?', a: 'b' }, { q: '', a: 'x' }]).mainEntity.length, 1);
  const txt = llmsTxt({ name: 'Lumen', url: 'https://lumen.example', summary: 'Peptide skincare.', collections: [{ name: 'Serums', url: 'https://lumen.example/collections/serums' }] });
  assert.match(txt, /^# Lumen\n\n> Peptide skincare\./);
  assert.match(txt, /sitemap\.xml/);
});

test('parseCSV handles quotes and CRLF; leads normalise, dedupe and score', () => {
  const rows = parseCSV('Name,Email,Followers,Engagement Rate,Niche,GMV\r\n"Ana, Glow",ANA@x.com,"48,000",5.2%,skincare grwm,1200\r\nAna dup,ana@x.com,1000,1%,food,0\r\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'Ana, Glow');
  const leads = dedupeLeads(rows.map(normalizeLead));
  assert.equal(leads.length, 1);
  assert.equal(leads[0].followers, 48000);
  const s = scoreLead(leads[0], 'creator');
  assert.equal(s.tier, 'A');
  assert.equal(normalizeLead({ followers: '1.2M' }).followers, 1200000);
  assert.equal(scoreLead(normalizeLead({ certifications: 'GMP, ISO 22716, MoCRA', moq: '300', lead_time: '14', email: 'a@b.co' }), 'supplier').score, 100);
});

test('outreach: templates pass CAN-SPAM checks; fake Re: and missing footer fail', () => {
  for (const t of ['creator', 'salon', 'retailer', 'supplier']) {
    const m = outreachTemplate(t, { name: 'Ana Lee', handle: 'ana', company: 'Glow Spa', city: 'Austin' });
    assert.ok(checkOutreach(m).ok, `${t}: ${checkOutreach(m).issues}`);
  }
  const bad = checkOutreach({ subject: 'Re: quick question', body: 'Our cream heals acne!!' });
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.length >= 4);
  assert.ok(leadSearchPlan('salon', { city: 'Miami' })[0].includes('Miami'));
});

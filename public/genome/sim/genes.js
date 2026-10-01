// GENOME ATHLETE · the gene panel and the exact population genetics behind it.
//
// Each SNP has two alleles a/b; a genotype is the number of b copies (0, 1, 2).
// Hardy–Weinberg: P(aa) = (1−q)², P(ab) = 2q(1−q), P(bb) = q²  (q = frequency of b).
// Total genotype score (Williams & Folland 2008): each SNP scores 0/1/2 favourable alleles,
//   TGS = 100 · Σ score / (2n).
// Population distribution of Σ score: exact convolution of the n per-SNP distributions.
// Inheritance: a parent with g copies of b transmits b with probability g/2 (Mendel); unlinked
// loci assort independently, so the child's panel score is again an exact convolution.
//
// Allele frequencies are approximate values for European-ancestry populations (they vary a lot
// between populations). Effects are small: no single variant explains more than ~1–2 % of the
// variance in performance.

// role: favourable allele per panel ('a' | 'b'); omitted = not in that panel.
export const SNPS = [
  { id: 'actn3', gene: 'ACTN3', rs: 'rs1815739', name: 'R577X', a: 'R', b: 'X', q: 0.42, chr: 11, role: { power: 'a', endurance: 'b' } },
  { id: 'ace', gene: 'ACE', rs: 'rs4646994', name: 'I/D', a: 'I', b: 'D', q: 0.55, chr: 17, role: { power: 'b', endurance: 'a' } },
  { id: 'ppargc1a', gene: 'PPARGC1A', rs: 'rs8192678', name: 'Gly482Ser', a: 'Gly', b: 'Ser', q: 0.35, chr: 4, role: { endurance: 'a' } },
  { id: 'ppara', gene: 'PPARA', rs: 'rs4253778', name: 'G/C intron 7', a: 'G', b: 'C', q: 0.18, chr: 22, role: { endurance: 'a', power: 'b' } },
  { id: 'ampd1', gene: 'AMPD1', rs: 'rs17602729', name: 'C34T (Q12X)', a: 'C', b: 'T', q: 0.12, chr: 1, role: { endurance: 'a', power: 'a' } },
  { id: 'vegfa', gene: 'VEGFA', rs: 'rs2010963', name: 'G−634C', a: 'G', b: 'C', q: 0.32, chr: 6, role: { endurance: 'b' } },
  { id: 'mct1', gene: 'SLC16A1', rs: 'rs1049434', name: 'MCT1 A1470T', a: 'A', b: 'T', q: 0.40, chr: 1, role: { endurance: 'a', power: 'a' } },
  { id: 'hfe', gene: 'HFE', rs: 'rs1799945', name: 'H63D', a: 'H', b: 'D', q: 0.15, chr: 6, role: { endurance: 'b' } },
  { id: 'agt', gene: 'AGT', rs: 'rs699', name: 'M235T', a: 'M', b: 'T', q: 0.42, chr: 1, role: { power: 'b' } },
  { id: 'hif1a', gene: 'HIF1A', rs: 'rs11549465', name: 'Pro582Ser', a: 'Pro', b: 'Ser', q: 0.10, chr: 14, role: { power: 'b' } },
  { id: 'il6', gene: 'IL6', rs: 'rs1800795', name: 'G−174C', a: 'G', b: 'C', q: 0.40, chr: 7, role: { power: 'a' } },
  { id: 'col5a1', gene: 'COL5A1', rs: 'rs12722', name: 'C/T 3′UTR', a: 'C', b: 'T', q: 0.55, chr: 9, role: { injury: 'a' } },
  { id: 'col1a1', gene: 'COL1A1', rs: 'rs1800012', name: 'Sp1 G/T', a: 'G', b: 'T', q: 0.17, chr: 17, role: { injury: 'b' } },
  { id: 'gdf5', gene: 'GDF5', rs: 'rs143383', name: '+104T/C', a: 'C', b: 'T', q: 0.62, chr: 20, role: { injury: 'a' } },
];
export const PANELS = ['endurance', 'power', 'injury'];
export const BY_ID = Object.fromEntries(SNPS.map((s) => [s.id, s]));
export const panelSnps = (panel) => SNPS.filter((s) => s.role[panel]);

export const genoLabel = (s, g) => { const x = [s.a, s.b], al = g === 0 ? [0, 0] : g === 1 ? [0, 1] : [1, 1]; return x[al[0]] + (s.a.length > 1 ? '/' : '') + x[al[1]]; };
export const hwe = (q) => [(1 - q) * (1 - q), 2 * q * (1 - q), q * q];
// Favourable-allele count for genotype g (copies of b) in a panel.
export const favCount = (s, panel, g) => (s.role[panel] === 'b' ? g : 2 - g);
export const favFreq = (s, panel) => (s.role[panel] === 'b' ? s.q : 1 - s.q);

export function convolve(a, b) { const out = new Array(a.length + b.length - 1).fill(0); for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j]; return out; }

// Exact population distribution of Σ favourable alleles for a panel (HWE, independent loci).
export function popDist(panel) { let d = [1]; for (const s of panelSnps(panel)) { const f = favFreq(s, panel); d = convolve(d, [(1 - f) ** 2, 2 * f * (1 - f), f * f]); } return d; }
export function score(geno, panel) { const L = panelSnps(panel); const sum = L.reduce((t, s) => t + favCount(s, panel, geno[s.id]), 0); return { sum, max: 2 * L.length, tgs: (100 * sum) / (2 * L.length) }; }
// Mid-rank percentile: P(S < s) + ½P(S = s).
export function percentile(dist, s) { let p = 0; for (let i = 0; i < s; i++) p += dist[i]; return 100 * (p + 0.5 * dist[s]); }
export const pOptimal = (panel) => panelSnps(panel).reduce((p, s) => p * favFreq(s, panel) ** 2, 1);
export const genoFreq = (geno) => SNPS.reduce((p, s) => p * hwe(s.q)[geno[s.id]], 1);
export const distStats = (d) => { let m = 0, v = 0; d.forEach((p, i) => (m += p * i)); d.forEach((p, i) => (v += p * (i - m) ** 2)); return { mean: m, sd: Math.sqrt(v) }; };

// ── Inheritance ─────────────────────────────────────
// Child distribution of b copies at one SNP: two independent Bernoulli(g/2) transmissions.
export const childSnp = (g1, g2) => convolve([1 - g1 / 2, g1 / 2], [1 - g2 / 2, g2 / 2]);
// The 2×2 Punnett square: gametes of each parent (allele index 0 = a, 1 = b) with probability ½ each.
export function punnett(s, g1, g2) {
  const gam = (g) => (g === 0 ? [0, 0] : g === 1 ? [0, 1] : [1, 1]);
  const A = gam(g1), B = gam(g2), al = [s.a, s.b];
  return { rows: A.map((x) => al[x]), cols: B.map((y) => al[y]), cells: A.map((x) => B.map((y) => ({ g: x + y, label: genoLabel(s, x + y) }))), dist: childSnp(g1, g2) };
}
// Exact distribution of the child's panel score.
export function childDist(gA, gB, panel) {
  let d = [1];
  for (const s of panelSnps(panel)) {
    const c = childSnp(gA[s.id], gB[s.id]), f = [0, 0, 0];
    for (let g = 0; g < 3; g++) f[favCount(s, panel, g)] += c[g];
    d = convolve(d, f);
  }
  return d;
}
// Breeder's equation for a polygenic trait: offspring | midparent ~ N(μ + h²(m − μ), σ²(1 − h⁴/2)).
export const offspring = (mid, mu, sd, h2) => ({ mean: mu + h2 * (mid - mu), sd: sd * Math.sqrt(1 - (h2 * h2) / 2) });

// ── Profiles ─────────────────────────────────────────
// Deterministic PRNG so a 'random person' is reproducible within a session.
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export function randomGeno(r = Math.random) { const g = {}; for (const s of SNPS) { const u = r(), p = hwe(s.q); g[s.id] = u < p[0] ? 0 : u < p[0] + p[1] ? 1 : 2; } return g; }
// Most common genotype at each locus.
export function commonGeno() { const g = {}; for (const s of SNPS) { const p = hwe(s.q); g[s.id] = p.indexOf(Math.max(...p)); } return g; }
// Archetypes: favourable homozygote at every locus of a panel, common elsewhere.
export function archetype(panel) { const g = commonGeno(); for (const s of panelSnps(panel)) g[s.id] = s.role[panel] === 'b' ? 2 : 0; return g; }
export const PRESETS = { average: () => commonGeno(), sprinter: () => archetype('power'), marathoner: () => archetype('endurance'), random: (r) => randomGeno(r) };

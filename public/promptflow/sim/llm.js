// PROMPTFLOW · what happens when you press send. A real (small) byte-pair-encoding tokenizer trained in your
// browser, real attention maths on real vectors, a real n-gram next-token model with temperature and top-p,
// and the physics of moving the request and running the model. Small enough to run here; the same steps,
// at a much bigger scale, happen inside a production model.

// ── Corpus (original text) used to train the toy tokenizer and toy language model ──
export const CORPUS = `When you send a message to an assistant, your words travel as light through glass fibre to a data centre.
There the text is split into tokens, and each token becomes a vector of numbers. The model reads every token,
and attention lets each word look back at the words that came before it. Layer after layer, the vectors are
mixed and refined. At the end the model scores every possible next token, picks one, and then does it all again.
The answer streams back one token at a time. A good answer depends on a clear question. The model does not
look things up in a book; it predicts the next token from patterns it learned during training. Training reads
trillions of tokens and adjusts billions of weights so that the next token is predicted a little better each time.
The weights live in fast memory on the graphics processors, and every new token means reading all of them again.
That is why long answers take longer, and why a busy data centre batches many requests together.
Light in fibre travels at about two thirds of its speed in a vacuum. A request that crosses a continent spends
tens of milliseconds on the road before the first token is computed. The question you ask, the words you choose,
and the order you put them in all change the vectors, the attention, and the answer that comes back to you.
Tell the assistant what you want, why you want it, and what a great answer would look like. Then read the answer,
ask again, and refine. The assistant can be wrong, so check what matters. The more context you give, the better
the model can predict what you need. Thank you for asking a good question about how the model works.`;

// ── 1 · Network: from your thumb to the data centre ────────────────────────────
// Light in silica fibre (refractive index ≈ 1.468) travels at c/n ≈ 2.04×10⁸ m/s. Routes are not straight:
// real paths run ≈ 1.5× the great-circle distance. Each router adds ≈ 0.05 ms; TLS 1.3 needs one round trip.
export const C = 299792458, N_FIBRE = 1.468;
export function network(km, hops = 14) {
  const path = km * 1000 * 1.5, oneWay = path / (C / N_FIBRE) + hops * 0.05e-3, rtt = 2 * oneWay;
  return { oneWay, rtt, tcp: rtt, tls: rtt, total: 3 * rtt, path, speed: C / N_FIBRE };
}
export function payload(text) { const b = new TextEncoder().encode(text).length; return { bytes: b, json: b + 220, wire: b + 220 + 29 + 40 }; }   // JSON wrapper ≈ 220 B, TLS record 29 B, TCP/IP headers 40 B

// ── 2 · Tokenizer: byte-pair encoding ───────────────────────────────────────────
// Start from characters (each word carries its leading space, as GPT-style tokenizers do). Repeatedly merge the
// most frequent adjacent pair into a new symbol. Encoding applies the learned merges in the order learned.
export function trainBPE(text, merges = 420) {
  const words = new Map();
  for (const w of text.replace(/\s+/g, ' ').match(/ ?[A-Za-z]+| ?[0-9]+| ?[^\sA-Za-z0-9]/g) || []) words.set(w, (words.get(w) || 0) + 1);
  let seqs = [...words].map(([w, n]) => [[...w], n]);
  const rules = [];
  for (let m = 0; m < merges; m++) {
    const pairs = new Map();
    for (const [s, n] of seqs) for (let i = 0; i < s.length - 1; i++) { const k = s[i] + '\u0000' + s[i + 1]; pairs.set(k, (pairs.get(k) || 0) + n); }
    let best = null, bn = 1; for (const [k, n] of pairs) if (n > bn) { bn = n; best = k; }
    if (!best) break;
    const [a, b] = best.split('\u0000'); rules.push([a, b]);
    seqs = seqs.map(([s, n]) => { const o = []; for (let i = 0; i < s.length; i++) { if (i < s.length - 1 && s[i] === a && s[i + 1] === b) { o.push(a + b); i++; } else o.push(s[i]); } return [o, n]; });
  }
  const rank = new Map(rules.map(([a, b], i) => [a + '\u0000' + b, i]));
  const vocab = new Map(); let id = 0;
  for (let c = 32; c < 127; c++) vocab.set(String.fromCharCode(c), id++);
  for (const [a, b] of rules) if (!vocab.has(a + b)) vocab.set(a + b, id++);
  return { rules, rank, vocab, size: id };
}
export function encode(T, text) {
  const out = [];
  for (const w of text.replace(/\s+/g, ' ').match(/ ?[A-Za-z]+| ?[0-9]+| ?[^\sA-Za-z0-9]/g) || []) {
    let s = [...w];
    for (;;) { let bi = -1, br = Infinity; for (let i = 0; i < s.length - 1; i++) { const r = T.rank.get(s[i] + '\u0000' + s[i + 1]); if (r !== undefined && r < br) { br = r; bi = i; } } if (bi < 0) break; s = [...s.slice(0, bi), s[bi] + s[bi + 1], ...s.slice(bi + 2)]; }
    for (const p of s) out.push({ s: p, id: T.vocab.get(p) ?? (T.vocab.get('?') ?? 0), word: w });
  }
  return out;
}

// ── 3 · Embeddings and attention ────────────────────────────────────────────────
// Each token id maps to a learned vector (here: fixed pseudo-random, d = 32) plus a sinusoidal position code
// PE(p, 2i) = sin(p/10000^(2i/d)), PE(p, 2i+1) = cos(…) (Vaswani et al. 2017). One attention head:
// Q = XW_Q, K = XW_K, V = XW_V, A = softmax(QKᵀ/√d_k + causal mask). Each row of A sums to 1: how much token i
// looks at each earlier token j.
export const D = 32, DK = 16;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let q = Math.imul(a ^ (a >>> 15), 1 | a); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
export function embed(id, pos) { const r = rng(id * 7919 + 13), v = new Float64Array(D); for (let i = 0; i < D; i++) { const pe = i % 2 ? Math.cos(pos / 10000 ** ((i - 1) / D)) : Math.sin(pos / 10000 ** (i / D)); v[i] = gauss(r) * 0.8 + pe; } return v; }
function mat(seed, a, b) { const r = rng(seed), m = []; for (let i = 0; i < a; i++) { const row = new Float64Array(b); for (let j = 0; j < b; j++) row[j] = gauss(r) / Math.sqrt(a); m.push(row); } return m; }
const mul = (v, M) => { const o = new Float64Array(M[0].length); for (let i = 0; i < v.length; i++) for (let j = 0; j < o.length; j++) o[j] += v[i] * M[i][j]; return o; };
export function attention(tokens, head = 0) {
  const X = tokens.map((t, p) => embed(t.id, p)), Wq = mat(101 + head * 3, D, DK), Wk = mat(102 + head * 3, D, DK), Wv = mat(103 + head * 3, D, DK);
  const Q = X.map((x) => mul(x, Wq)), K = X.map((x) => mul(x, Wk)), Vv = X.map((x) => mul(x, Wv)), n = X.length, A = [];
  for (let i = 0; i < n; i++) { const s = []; let mx = -Infinity; for (let j = 0; j <= i; j++) { let d = 0; for (let k = 0; k < DK; k++) d += Q[i][k] * K[j][k]; d /= Math.sqrt(DK); s.push(d); mx = Math.max(mx, d); } const e = s.map((x) => Math.exp(x - mx)), z = e.reduce((a, b) => a + b, 0); A.push(e.map((x) => x / z)); }
  return { A, X, Q, K, V: Vv };
}
export const softmax = (z, T = 1) => { const m = Math.max(...z), e = z.map((x) => Math.exp((x - m) / T)), s = e.reduce((a, b) => a + b, 0); return e.map((x) => x / s); };

// ── 4 · Next token: a real n-gram language model on the corpus tokens ──────────
// P(w | u, v) by "stupid backoff" (Brants et al. 2007): trigram count ratio if seen, else 0.4 × bigram, else
// 0.4² × unigram. Logits are log-probabilities; temperature T divides them, top-p keeps the smallest set of
// tokens whose probability adds up to p, and one is sampled.
export function trainLM(T, text) {
  const ids = encode(T, text).map((t) => t.id), uni = new Map(), bi = new Map(), tri = new Map();
  ids.forEach((w, i) => { uni.set(w, (uni.get(w) || 0) + 1); if (i > 0) { const k = ids[i - 1] + ',' + w; bi.set(k, (bi.get(k) || 0) + 1); } if (i > 1) { const k = ids[i - 2] + ',' + ids[i - 1] + ',' + w; tri.set(k, (tri.get(k) || 0) + 1); } });
  const cnt = (m, k) => m.get(k) || 0, ctx2 = new Map(), ctx1 = new Map();
  for (const [k, n] of tri) { const c = k.split(',').slice(0, 2).join(','); ctx2.set(c, (ctx2.get(c) || 0) + n); }
  for (const [k, n] of bi) { const c = k.split(',')[0]; ctx1.set(c, (ctx1.get(c) || 0) + n); }
  return { ids, uni, bi, tri, ctx2, ctx1, N: ids.length, cnt, vocab: [...uni.keys()] };
}
export function nextDist(LM, hist) {
  const u = hist[hist.length - 2], v = hist[hist.length - 1], out = [];
  for (const w of LM.vocab) {
    let p; const t = LM.cnt(LM.tri, u + ',' + v + ',' + w), c2 = LM.ctx2.get(u + ',' + v) || 0, b = LM.cnt(LM.bi, v + ',' + w), c1 = LM.ctx1.get(String(v)) || 0;
    if (t && c2) p = t / c2; else if (b && c1) p = 0.4 * (b / c1); else p = 0.16 * (LM.uni.get(w) / LM.N);
    out.push([w, p]);
  }
  const z = out.reduce((a, b) => a + b[1], 0); return out.map(([w, p]) => [w, p / z]).sort((a, b) => b[1] - a[1]);
}
export function sample(dist, { T = 0.8, topP = 0.9, r = Math.random() }) {
  if (T <= 0.01) return { pick: dist[0][0], kept: [dist[0]] };
  const lg = dist.map(([, p]) => Math.log(p + 1e-12)), q = softmax(lg, T), d2 = dist.map(([w], i) => [w, q[i]]).sort((a, b) => b[1] - a[1]);
  const kept = []; let acc = 0; for (const x of d2) { kept.push(x); acc += x[1]; if (acc >= topP) break; }
  const z = kept.reduce((a, b) => a + b[1], 0); let s = r * z; for (const [w, p] of kept) { s -= p; if (s <= 0) return { pick: w, kept: kept.map(([w2, p2]) => [w2, p2 / z]) }; }
  return { pick: kept[0][0], kept };
}

// ── 5 · Compute: serving the model ──────────────────────────────────────────────
// Prefill (reading your prompt) is compute-bound: FLOPs ≈ 2·N·L_in. Decoding one token for a batch of B users
// reads every weight once: time ≈ max(bytes/(G·BW), 2·N·B/(G·peak·u)). Energy per token = G·P_gpu·t_step/B.
export const GPU = { peak: 989e12, bw: 3.35e12, hbm: 80e9, watts: 700 };
export function serve({ N, bytes, G, B, Lin, Lout, rtt }) {
  const W = N * bytes, fits = W * 1.15 <= G * GPU.hbm, prefill = (2 * N * Lin) / (G * GPU.peak * 0.45);
  const tMem = W / (G * GPU.bw * 0.8), tCmp = (2 * N * B) / (G * GPU.peak * 0.45), step = Math.max(tMem, tCmp);
  const ttft = rtt + prefill + step, tps = 1 / step, total = ttft + (Lout - 1) * step, joules = (G * GPU.watts * step) / B;
  return { W, fits, prefill, tMem, tCmp, step, ttft, tps, total, joules, Wh: (joules * Lout) / 3600, memBound: tMem >= tCmp };
}

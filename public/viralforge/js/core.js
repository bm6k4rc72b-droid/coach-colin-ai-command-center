/**
 * VIRALFORGE core: the scoring maths, with no DOM and no models, so Node can test it.
 *
 * Everything the browser measures (frames, faces, OCR text, loudness, transcript) is reduced
 * to plain numbers here and turned into scores a creator can act on. Every score is a
 * weighted sum of named parts, and each part carries the tip that would raise it, so the app
 * never shows a number it cannot explain.
 *
 * These are heuristics drawn from public short-form guidance (hook in the first 3 s, a face
 * early, on-screen text, captions, 9:16, 7–35 s for Reels). They rank your own drafts against
 * each other. They do not predict view counts, and nothing can.
 *
 * @module viralforge/core
 */

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp01 = (v, lo, hi) => clamp((v - lo) / (hi - lo));
const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

/* ───────────────────────────── pixels ───────────────────────────── */

/**
 * Per-frame image statistics from an RGBA buffer.
 * @returns {{luma:number, contrast:number, saturation:number, colorfulness:number, sharpness:number}}
 *   luma, contrast and saturation are 0–1. colorfulness is Hasler–Süsstrunk (0 to about 150).
 *   sharpness is the variance of a 4-neighbour Laplacian on luma (0–255 scale).
 */
export function frameStats(data, w, h) {
  const n = w * h;
  const L = new Float32Array(n);
  let sum = 0, sum2 = 0, sat = 0;
  let rgS = 0, rgS2 = 0, ybS = 0, ybS2 = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    L[i] = y; sum += y; sum2 += y * y;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat += mx === 0 ? 0 : (mx - mn) / mx;
    const rg = r - g, yb = 0.5 * (r + g) - b;
    rgS += rg; rgS2 += rg * rg; ybS += yb; ybS2 += yb * yb;
  }
  const mean = sum / n;
  const sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  const rgM = rgS / n, ybM = ybS / n;
  const rgSd = Math.sqrt(Math.max(0, rgS2 / n - rgM * rgM));
  const ybSd = Math.sqrt(Math.max(0, ybS2 / n - ybM * ybM));
  const colorfulness = Math.hypot(rgSd, ybSd) + 0.3 * Math.hypot(rgM, ybM);
  let lap = 0, lap2 = 0, m = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const v = 4 * L[i] - L[i - 1] - L[i + 1] - L[i - w] - L[i + w];
    lap += v; lap2 += v * v; m++;
  }
  const lapM = m ? lap / m : 0;
  return {
    luma: mean / 255,
    contrast: sd / 128,
    saturation: sat / n,
    colorfulness,
    sharpness: m ? lap2 / m - lapM * lapM : 0,
  };
}

/** Mean absolute luma difference between two same-size RGBA frames, 0–1. */
export function frameDiff(a, b) {
  let d = 0;
  const n = Math.min(a.length, b.length);
  for (let p = 0; p < n; p += 4) {
    const ya = 0.299 * a[p] + 0.587 * a[p + 1] + 0.114 * a[p + 2];
    const yb = 0.299 * b[p] + 0.587 * b[p + 1] + 0.114 * b[p + 2];
    d += Math.abs(ya - yb);
  }
  return d / (n / 4) / 255;
}

/**
 * Hard cuts from a series of frame differences: a diff that is both above `floor` and well
 * above its neighbours' median is a cut, not motion.
 * @param {number[]} diffs diffs[i] is between frame i-1 and frame i (diffs[0] ignored)
 * @param {number[]} times
 * @returns {number[]} the times of the cuts
 */
export function detectCuts(diffs, times, { floor = 0.12, ratio = 2.5 } = {}) {
  const cuts = [];
  for (let i = 1; i < diffs.length; i++) {
    const win = diffs.slice(Math.max(1, i - 3), i).concat(diffs.slice(i + 1, i + 4)).sort((x, y) => x - y);
    const med = win.length ? win[Math.floor(win.length / 2)] : 0;
    if (diffs[i] >= floor && diffs[i] >= ratio * Math.max(med, 0.01)) cuts.push(times[i]);
  }
  return cuts;
}

/**
 * Dominant colours by k-means (k-means++ seeding with a fixed seed, so the same frame always
 * gives the same palette). Pixels with alpha < 128 are skipped.
 * @returns {{hex:string, rgb:number[], share:number}[]} sorted by share, largest first
 */
export function kmeansPalette(data, k = 5, { iters = 12, stride = 4, seed = 7 } = {}) {
  const px = [];
  for (let p = 0; p < data.length; p += 4 * stride) if (data[p + 3] >= 128) px.push([data[p], data[p + 1], data[p + 2]]);
  if (!px.length) return [];
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const C = [px[Math.floor(rand() * px.length)].slice()];
  while (C.length < Math.min(k, px.length)) {
    const ds = px.map((p) => Math.min(...C.map((c) => d2(p, c))));
    const tot = ds.reduce((a, b) => a + b, 0);
    if (tot === 0) break;
    let r = rand() * tot, j = 0;
    while (j < ds.length - 1 && (r -= ds[j]) > 0) j++;
    C.push(px[j].slice());
  }
  const lab = new Int32Array(px.length);
  for (let it = 0; it < iters; it++) {
    const acc = C.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < px.length; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < C.length; c++) { const d = d2(px[i], C[c]); if (d < bd) { bd = d; best = c; } }
      lab[i] = best;
      const a = acc[best]; a[0] += px[i][0]; a[1] += px[i][1]; a[2] += px[i][2]; a[3]++;
    }
    for (let c = 0; c < C.length; c++) if (acc[c][3]) C[c] = [acc[c][0] / acc[c][3], acc[c][1] / acc[c][3], acc[c][2] / acc[c][3]];
  }
  const counts = C.map(() => 0);
  for (const l of lab) counts[l]++;
  const hex = (v) => Math.round(v).toString(16).padStart(2, '0');
  return C.map((c, i) => ({ rgb: c.map(Math.round), hex: `#${hex(c[0])}${hex(c[1])}${hex(c[2])}`, share: counts[i] / px.length }))
    .filter((c) => c.share > 0)
    .sort((a, b) => b.share - a.share);
}

/* ───────────────────────────── audio ───────────────────────────── */

/** RMS loudness in dBFS of a sample window (−100 for silence). */
export function rmsDb(samples, start = 0, end = samples.length) {
  let s = 0;
  for (let i = start; i < end; i++) s += samples[i] * samples[i];
  const rms = Math.sqrt(s / Math.max(1, end - start));
  return rms > 1e-5 ? 20 * Math.log10(rms) : -100;
}

/** Loudness curve: one dBFS value per `win` seconds. */
export function loudnessCurve(samples, sampleRate, win = 0.1) {
  const step = Math.max(1, Math.round(sampleRate * win));
  const out = [];
  for (let i = 0; i < samples.length; i += step) out.push(rmsDb(samples, i, Math.min(samples.length, i + step)));
  return out;
}

/** First time (s) the curve rises above `thresholdDb`; null if it never does. */
export function soundOnset(curve, win = 0.1, thresholdDb = -35) {
  const i = curve.findIndex((v) => v > thresholdDb);
  return i < 0 ? null : round(i * win, 2);
}

/* ───────────────────────────── scores ───────────────────────────── */

/**
 * Hook score (0–100) for the first three seconds.
 *
 * @param {object} f measured features
 * @param {number} f.motion3       mean frame diff over 0–3 s (0–1)
 * @param {number} f.cuts3         hard cuts in 0–3 s
 * @param {number|null} f.faceAt   first time a face is seen (s), null if never
 * @param {boolean} f.text3        on-screen text found in 0–3 s
 * @param {number|null} f.soundAt  first time the audio is above −35 dBFS (s)
 * @param {number} f.hookDb        mean loudness over 0–3 s (dBFS)
 * @param {number} f.luma3         mean brightness over 0–3 s (0–1)
 * @param {number} f.color3        mean colourfulness over 0–3 s
 * @param {number} f.sharp3        mean sharpness over 0–3 s
 * @returns {{score:number, parts:{key:string,label:string,score:number,weight:number,value:string,tip:string}[]}}
 */
export function hookScore(f) {
  const parts = [
    {
      key: 'motion', label: 'Motion in the first 3 s', weight: 18,
      score: lerp01(f.motion3 ?? 0, 0.01, 0.08), value: `${round((f.motion3 ?? 0) * 100, 1)}% px change`,
      tip: 'Open on movement: walk into frame, push the camera in, or start mid-action.',
    },
    {
      key: 'cuts', label: 'Pattern interrupts (cuts)', weight: 10,
      score: f.cuts3 >= 1 ? (f.cuts3 <= 3 ? 1 : 0.7) : 0.25, value: `${f.cuts3 ?? 0} cut${f.cuts3 === 1 ? '' : 's'}`,
      tip: 'Add one cut or zoom punch-in inside the first 3 seconds.',
    },
    {
      key: 'face', label: 'A face early', weight: 16,
      score: f.faceAt == null ? 0 : f.faceAt <= 1 ? 1 : f.faceAt <= 3 ? 0.6 : 0.25,
      value: f.faceAt == null ? 'none found' : `at ${round(f.faceAt, 1)} s`,
      tip: 'Show a face (yours, or a person reacting) within the first second. For residents, use the skeleton/blur export.',
    },
    {
      key: 'text', label: 'On-screen hook text', weight: 16,
      score: f.text3 ? 1 : 0, value: f.text3 ? 'found' : 'none found',
      tip: 'Burn a 3–7 word hook on screen. Many people watch muted. Use the Export tab to add it.',
    },
    {
      key: 'sound', label: 'Sound starts at once', weight: 14,
      score: f.soundAt == null ? 0 : f.soundAt <= 0.3 ? 1 : f.soundAt <= 1 ? 0.6 : 0.2,
      value: f.soundAt == null ? 'silent' : `at ${round(f.soundAt, 2)} s`,
      tip: 'Trim the silence: the first word or beat should land in the first 0.3 s.',
    },
    {
      key: 'level', label: 'Hook loudness', weight: 8,
      score: lerp01(f.hookDb ?? -100, -40, -18), value: `${round(f.hookDb ?? -100)} dBFS`,
      tip: 'Normalise the voice to around −16 to −14 LUFS so the hook is not quieter than the feed.',
    },
    {
      key: 'light', label: 'Exposure', weight: 8,
      score: 1 - Math.min(1, Math.abs((f.luma3 ?? 0.5) - 0.52) / 0.32), value: `${round((f.luma3 ?? 0) * 100)}% brightness`,
      tip: 'Light the subject: dim openings get scrolled past.',
    },
    {
      key: 'color', label: 'Colour pop', weight: 5,
      score: lerp01(f.color3 ?? 0, 15, 60), value: `${round(f.color3 ?? 0)} colourfulness`,
      tip: 'One saturated accent colour (scrubs, a sign, a jacket) makes a thumbnail stop the thumb.',
    },
    {
      key: 'sharp', label: 'Sharpness', weight: 5,
      score: lerp01(f.sharp3 ?? 0, 20, 250), value: `${round(f.sharp3 ?? 0)} Laplacian var.`,
      tip: 'Lock focus and clean the lens. Soft openings look like reposts.',
    },
  ];
  return finish(parts);
}

function finish(parts) {
  const W = parts.reduce((a, p) => a + p.weight, 0);
  const score = Math.round((100 * parts.reduce((a, p) => a + p.weight * clamp(p.score), 0)) / W);
  return { score, parts };
}

/**
 * Whole-post score: the hook plus format, length, captions, thumbnail and copy.
 * @param {object} o
 * @param {number} o.hook        hookScore().score
 * @param {number} o.duration    seconds
 * @param {number} o.aspect      width / height
 * @param {boolean} o.captions   burned or planned captions
 * @param {number} o.thumb       best thumbnail score 0–100
 * @param {number} o.cutsPerMin  editing pace
 * @param {string} [o.caption]   post caption text
 * @param {'reels'|'tiktok'|'shorts'} [o.platform]
 */
export function postScore(o) {
  const ideal = { reels: [7, 35], tiktok: [9, 45], shorts: [15, 50] }[o.platform || 'reels'];
  const d = o.duration ?? 0;
  const lenScore = d >= ideal[0] && d <= ideal[1] ? 1 : d < ideal[0] ? lerp01(d, 3, ideal[0]) : 1 - lerp01(d, ideal[1], 120) * 0.8;
  const vertical = o.aspect <= 0.6 ? 1 : o.aspect <= 0.85 ? 0.7 : o.aspect <= 1.05 ? 0.45 : 0.2;
  const cap = o.caption || '';
  const capQ = captionQuality(cap);
  const parts = [
    { key: 'hook', label: 'Hook (first 3 s)', weight: 35, score: (o.hook ?? 0) / 100, value: `${o.hook ?? 0}/100`, tip: 'See the hook breakdown above.' },
    { key: 'len', label: 'Length', weight: 12, score: lenScore, value: `${round(d, 1)} s`, tip: `Aim for ${ideal[0]}–${ideal[1]} s on this platform. Cut anything that does not move the story.` },
    { key: 'format', label: 'Vertical 9:16', weight: 12, score: vertical, value: `${round(o.aspect ?? 0, 2)} aspect`, tip: 'Export 1080×1920. The Export tab auto-reframes and follows the subject.' },
    { key: 'captions', label: 'Captions', weight: 12, score: o.captions ? 1 : 0, value: o.captions ? 'yes' : 'no', tip: 'Turn on burned-in captions in Export (Whisper transcribes on your device).' },
    { key: 'thumb', label: 'Cover frame', weight: 10, score: (o.thumb ?? 0) / 100, value: `${o.thumb ?? 0}/100`, tip: 'Pick the top-ranked frame in the Thumbnail lab as the cover.' },
    { key: 'pace', label: 'Editing pace', weight: 9, score: lerp01(o.cutsPerMin ?? 0, 2, 14), value: `${round(o.cutsPerMin ?? 0, 1)} cuts/min`, tip: 'Change the shot every 3–5 s: a cut, a zoom, a B-roll insert or a text pop.' },
    { key: 'copy', label: 'Caption copy', weight: 10, score: capQ.score, value: capQ.summary, tip: capQ.tip },
  ];
  return finish(parts);
}

/** Checks a post caption: opening line length, a question or CTA, hashtag count. */
export function captionQuality(text) {
  const t = (text || '').trim();
  if (!t) return { score: 0, summary: 'empty', tip: 'Write a caption: a one-line hook, a question, then 3–5 hashtags.' };
  const first = t.split(/\n/)[0];
  const tags = (t.match(/#[\p{L}\p{N}_]+/gu) || []).length;
  const cta = /\?|comment|save|share|follow|tag|link in bio|dm/i.test(t);
  let s = 0;
  s += first.length <= 80 ? 0.4 : 0.15;
  s += cta ? 0.35 : 0;
  s += tags >= 3 && tags <= 8 ? 0.25 : tags > 0 ? 0.1 : 0;
  const tips = [];
  if (first.length > 80) tips.push('shorten the first line to under 80 characters');
  if (!cta) tips.push('end with a question or a "save this" call to action');
  if (tags < 3 || tags > 8) tips.push('use 3–8 targeted hashtags');
  return { score: s, summary: `${first.length}-char opener · ${tags} tags${cta ? ' · CTA' : ''}`, tip: tips.length ? `To improve: ${tips.join('; ')}.` : 'Caption looks good.' };
}

/**
 * Heuristic thumbnail score for one frame (0–100). CLIP, when it is loaded, is blended in by
 * the caller; this part needs no model.
 * @param {ReturnType<typeof frameStats>} s
 * @param {{faces:number, faceArea:number}} v faceArea is the largest face's share of the frame
 */
export function thumbHeuristic(s, v = { faces: 0, faceArea: 0 }) {
  const face = v.faces ? clamp(0.55 + v.faceArea * 6) : 0;
  const parts = [
    0.3 * face,
    0.2 * lerp01(s.contrast, 0.15, 0.5),
    0.2 * lerp01(s.colorfulness, 15, 70),
    0.2 * lerp01(s.sharpness, 20, 300),
    0.1 * (1 - Math.min(1, Math.abs(s.luma - 0.5) / 0.35)),
  ];
  return Math.round(100 * parts.reduce((a, b) => a + b, 0));
}

/* ───────────────────────────── captions & reframe ───────────────────────────── */

/**
 * Group word timings into on-screen caption cards (the short, punchy 1–3 word style).
 * @param {{text:string,start:number,end:number}[]} words
 * @returns {{text:string,start:number,end:number,words:{text:string,start:number,end:number}[]}[]}
 */
export function chunkCaptions(words, { maxWords = 3, maxChars = 18, maxDur = 1.6, gap = 0.45 } = {}) {
  const out = [];
  let cur = null;
  for (const raw of words) {
    const w = { text: raw.text.trim(), start: raw.start, end: Math.max(raw.end, raw.start + 0.05) };
    if (!w.text) continue;
    const fits = cur
      && cur.words.length < maxWords
      && (cur.text + ' ' + w.text).length <= maxChars
      && w.end - cur.start <= maxDur
      && w.start - cur.end <= gap
      && !/[.!?]$/.test(cur.text);
    if (fits) { cur.words.push(w); cur.text += ' ' + w.text; cur.end = w.end; }
    else { cur = { text: w.text, start: w.start, end: w.end, words: [w] }; out.push(cur); }
  }
  return out;
}

/** The caption card on screen at time t, or null. */
export function captionAt(cards, t) {
  for (const c of cards) if (t >= c.start && t < c.end + 0.15) return c;
  return null;
}

/**
 * Crop rectangle (source pixels) for a target aspect, centred on cx/cy (0–1) and kept inside
 * the frame. Used to turn 16:9 footage into 9:16 that follows the subject.
 */
export function cropRect(srcW, srcH, aspect, cx = 0.5, cy = 0.5) {
  let w = srcW, h = srcW / aspect;
  if (h > srcH) { h = srcH; w = srcH * aspect; }
  const x = clamp(cx * srcW - w / 2, 0, srcW - w);
  const y = clamp(cy * srcH - h / 2, 0, srcH - h);
  return { x, y, w, h };
}

/**
 * A subject track that a virtual camera can follow without jitter: exponential smoothing plus
 * a dead zone, so the crop stays still until the subject really moves.
 */
export class SmoothCam {
  constructor({ alpha = 0.12, dead = 0.04, start = 0.5 } = {}) { this.alpha = alpha; this.dead = dead; this.x = start; this.target = start; }
  update(x) {
    if (x != null && Math.abs(x - this.target) > this.dead) this.target = x;
    this.x += (this.target - this.x) * this.alpha;
    return this.x;
  }
}

/* ───────────────────────────── copy, tags, schedule ───────────────────────────── */

/** Niche presets. `care-tech` is the ElderGuardian / VIGIL lane. */
export const NICHES = {
  'care-tech': {
    label: 'Care-tech · elder safety',
    audience: 'adult children caring for ageing parents, care-home owners and nurses',
    tags: ['#eldercare', '#caregiver', '#agingparents', '#falldetection', '#seniorsafety', '#caretech', '#dementiacare', '#nursinghome', '#ai', '#healthtech', '#caregiving', '#momanddad'],
    pains: ['a fall nobody saw', 'a parent living alone', 'night-time wandering', 'a 2 a.m. phone call', 'guilt about not being there'],
    youtubeQuery: 'elderly fall detection AI caregiver',
  },
  fitness: {
    label: 'Fitness coaching',
    audience: 'busy adults who want to get fit without a gym',
    tags: ['#fitness', '#workout', '#fitnesscoach', '#homeworkout', '#fatloss', '#strengthtraining', '#gymtok', '#fitover40'],
    pains: ['no time to train', 'a plateau', 'back pain', 'starting over again'],
    youtubeQuery: 'fitness coach tips shorts',
  },
  ai: {
    label: 'AI & tech',
    audience: 'founders and creators who want to use AI to get ahead',
    tags: ['#ai', '#artificialintelligence', '#tech', '#startup', '#automation', '#chatgpt', '#claude', '#futuretech'],
    pains: ['hours of busywork', 'falling behind', 'tools that do not talk to each other'],
    youtubeQuery: 'AI tools demo shorts',
  },
};

/** Proven short-form hook patterns. `{t}` is the topic, `{p}` a pain point, `{a}` the audience. */
export const HOOK_TEMPLATES = [
  { type: 'Curiosity gap', tpl: 'Nobody tells you this about {t}…' },
  { type: 'Fear / stakes', tpl: 'If you have {p}, watch this before it is too late.' },
  { type: 'Contrarian', tpl: 'Stop doing this with {t}. Do this instead.' },
  { type: 'Proof', tpl: 'This {t} caught something in 3 seconds that a person missed.' },
  { type: 'POV', tpl: 'POV: you finally stop worrying about {p}.' },
  { type: 'Question', tpl: 'Would you know if {p} happened right now?' },
  { type: 'List', tpl: '3 things about {t} that {a} need to know.' },
  { type: 'Before / after', tpl: 'Before {t} vs after {t}. Watch the difference.' },
  { type: 'Story', tpl: 'At 2 a.m. last night, {t} did something I did not expect.' },
  { type: 'Callout', tpl: 'This is for {a}.' },
];

/** Fill the hook templates for a topic. Deterministic: the pain points rotate by index. */
export function fillHooks(topic, nicheKey = 'care-tech') {
  const n = NICHES[nicheKey] || NICHES['care-tech'];
  const t = (topic || 'this').trim();
  return HOOK_TEMPLATES.map((h, i) => ({
    type: h.type,
    text: h.tpl.replace(/\{t\}/g, t).replace(/\{p\}/g, n.pains[i % n.pains.length]).replace(/\{a\}/g, n.audience.split(',')[0]),
  }));
}

/** Hashtags: niche tags first, then keywords turned into tags, de-duplicated, capped. */
export function hashtags(nicheKey, keywords = [], max = 8) {
  const n = NICHES[nicheKey] || NICHES['care-tech'];
  const kw = keywords.map((k) => '#' + k.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')).filter((k) => k.length > 2);
  const keep = [...new Set(kw)].slice(0, Math.max(0, max - 3));
  const fill = n.tags.filter((t) => !keep.includes(t));
  return [...fill.slice(0, max - keep.length), ...keep];
}

/** Tiny English sentiment lexicon: the no-model fallback for the comment-mood tab. */
const POS = 'love,great,amazing,awesome,good,best,wow,thank,thanks,helpful,genius,need,want,brilliant,beautiful,cool,yes,smart,incredible,lifesaver,perfect,fire,goat,useful,peace,safe'.split(',');
const NEG = 'hate,bad,worst,creepy,scary,fake,scam,no,never,terrible,awful,invasion,privacy,spy,stupid,useless,expensive,wrong,sad,angry,ugly,boring,cringe,dystopian,ban'.split(',');
export function lexSentiment(text) {
  const words = (text || '').toLowerCase().match(/[a-z']+/g) || [];
  let s = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/'s$/, '');
    const neg = i > 0 && /^(not|no|never|don't|dont|isn't|isnt)$/.test(words[i - 1]);
    const v = POS.some((p) => w.startsWith(p)) ? 1 : NEG.some((p) => w === p || w.startsWith(p + 's')) ? -1 : 0;
    s += neg ? -v : v;
  }
  const emoji = (text.match(/[😍❤️🔥🙏👏💯😂🥹]/gu) || []).length - (text.match(/[😡🤮👎😬😒]/gu) || []).length;
  s += emoji;
  return s > 0 ? 'positive' : s < 0 ? 'negative' : 'neutral';
}

/**
 * Posting slots: `perDay` posts a day at the best general short-form windows (local time),
 * for `days` days from `start`. Slot times are minutes past midnight.
 */
export const DEFAULT_SLOTS = [7 * 60 + 30, 12 * 60 + 15, 19 * 60 + 45];
export function postingPlan(start, days = 7, slots = DEFAULT_SLOTS) {
  const out = [];
  const d0 = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  for (let d = 0; d < days; d++) for (const m of slots) {
    const at = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + d, Math.floor(m / 60), m % 60);
    if (at > start) out.push(at);
  }
  return out;
}

/** An .ics calendar (floating local times) so the plan lands in the phone's calendar. */
export function toICS(items, prodId = 'VIRALFORGE') {
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const esc = (s) => String(s).replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${prodId}//EN`, 'CALSCALE:GREGORIAN'];
  items.forEach((it, i) => {
    const end = new Date(it.at.getTime() + 15 * 60000);
    lines.push('BEGIN:VEVENT', `UID:${fmt(it.at)}-${i}@viralforge`, `DTSTAMP:${fmt(it.at)}`, `DTSTART:${fmt(it.at)}`, `DTEND:${fmt(end)}`,
      `SUMMARY:${esc(it.title)}`, `DESCRIPTION:${esc(it.note || '')}`, 'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(it.title)}`, 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/** Views per day for a trend row (YouTube Data API numbers). */
export function velocity(views, publishedAt, now = new Date()) {
  const days = Math.max(1 / 24, (now - new Date(publishedAt)) / 86400000);
  return Math.round(views / days);
}

/** Which hook patterns the top-performing titles use: a quick read on what the niche rewards. */
export function titlePatterns(titles) {
  const rx = {
    'Question': /\?/,
    'Number / list': /\b\d+\b/,
    'POV': /^pov\b/i,
    'You / your': /\byou(r)?\b/i,
    'Negative / warning': /\b(never|stop|don't|dont|warning|mistake|worst|danger)\b/i,
    'Curiosity': /\b(secret|nobody|this is why|what happens|truth|until)\b/i,
    'ALL CAPS word': /\b[A-Z]{3,}\b/,
  };
  return Object.entries(rx).map(([k, r]) => ({ pattern: k, share: titles.length ? titles.filter((t) => r.test(t)).length / titles.length : 0 }))
    .sort((a, b) => b.share - a.share);
}

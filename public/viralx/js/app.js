/**
 * ViralX UI wiring.
 * @module viralx/app
 */
import { NICHES, postScore, fillHooks, hashtags, chunkCaptions, lexSentiment, postingPlan, toICS, velocity, titlePatterns, clamp, SIGNALS } from './core.js';
import { TECHNIQUES, recommend } from './techniques.js';
import { analyze } from './analyze.js';
import { clipAppeal, transcribe, classify, aiDevice, MODELS } from './ai.js';
import { renderClip } from './render.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d = '') { try { return localStorage.getItem('viralx.' + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('viralx.' + k, v); } catch { /* private mode */ } },
};

const S = { a: null, file: null, words: null, thumbs: null, clip: null, job: null };

/* ───────────── tabs & niche ───────────── */
function show(tab) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.id === tab));
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  store.set('tab', tab);
  if (tab === 'stack') renderStack();
  if (tab === 'lab') mountLabOnce();
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.tab); });
document.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', () => show(a.dataset.go)));

const nicheSel = $('#niche');
for (const [k, n] of Object.entries(NICHES)) nicheSel.add(new Option(n.label, k));
nicheSel.value = store.get('niche', 'care-tech');
const niche = () => NICHES[nicheSel.value];
function applyNiche() {
  store.set('niche', nicheSel.value);
  $('#audience').value = niche().audience;
  $('#ytQ').value = niche().youtubeQuery;
}
nicheSel.addEventListener('change', applyNiche);
applyNiche();

/* ───────────── studio ───────────── */
const drop = $('#drop'), fileIn = $('#file');
$('#pick').onclick = () => fileIn.click();
fileIn.onchange = () => fileIn.files[0] && run(fileIn.files[0]);
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) run(f); });

function status(msg, frac) {
  $('#status').hidden = false; $('#statusText').textContent = msg;
  if (frac != null) $('#bar').style.width = `${Math.round(frac * 100)}%`;
}

async function run(file) {
  S.file = file; S.words = null; S.thumbs = null; S.clip = null;
  $('#sample').hidden = true;
  const pv = $('#player'); if (pv.src) URL.revokeObjectURL(pv.src); pv.src = URL.createObjectURL(file);
  $('#report').hidden = true; $('#transcript').value = ''; $('#asrStatus').textContent = '';
  document.body.dataset.busy = '1';
  try {
    S.a = await analyze(file, status, { faces: $('#optFaces').checked, ocr: $('#optOcr').checked });
    status(`Done · ${file.name}`, 1);
    report();
    renderThumbs();
  } catch (e) {
    console.error(e); status(`Could not analyse: ${e.message}`, 0);
  } finally { delete document.body.dataset.busy; }
}

function ring(el, v) {
  el.querySelector('b').textContent = v;
  const c = el.querySelector('.v');
  c.style.strokeDashoffset = String(326.7 * (1 - v / 100));
  c.style.stroke = v >= 75 ? 'var(--ok)' : v >= 50 ? 'var(--warn)' : 'var(--hot)';
}
const color = (s) => (s >= 0.75 ? 'var(--ok)' : s >= 0.45 ? 'var(--warn)' : 'var(--hot)');
const partsHtml = (parts) => parts.map((p) => `<div class="p"><span class="n">${esc(p.label)}</span><span class="val">${esc(p.value)}</span><span class="m"><i style="width:${Math.round(clamp(p.score) * 100)}%;background:${color(p.score)}"></i></span></div>`).join('');

function post() {
  const a = S.a;
  const bestThumb = S.thumbs ? S.thumbs[0].score : Math.max(...a.frames.map((f) => f.thumb));
  return postScore({
    hook: a.hook.score, duration: a.duration, aspect: a.aspect, captions: !!(S.words && S.words.length),
    thumb: bestThumb, cutsPerMin: a.cutsPerMin, caption: $('#caption').value, platform: $('#platform').value,
  });
}

function report() {
  const a = S.a; if (!a) return;
  const p = post();
  $('#report').hidden = false;
  ring($('#ringHook'), a.hook.score); ring($('#ringPost'), p.score);
  $('#meta').innerHTML = [
    `${a.width}×${a.height} · ${a.duration.toFixed(1)} s`,
    `${a.cuts.length} cuts · ${a.cutsPerMin.toFixed(1)}/min`,
    `faces: ${a.facesAvailable ? (a.features.faceAt == null ? 'none' : 'first at ' + a.features.faceAt + ' s') : 'detector off'}`,
    `on-screen text: ${a.ocrAvailable ? (a.hookText.length ? esc(a.hookText.slice(0, 6).join(' ')) : 'none') : 'OCR off'}`,
    `audio: ${a.audio ? 'decoded' : 'none / not decodable'}`,
  ].join('<br>');
  $('#hookParts').innerHTML = partsHtml(a.hook.parts);
  $('#postParts').innerHTML = partsHtml(p.parts);
  // Fix-first list: biggest weighted gap first, across both.
  const all = [...a.hook.parts, ...p.parts.filter((x) => x.key !== 'hook')].map((x) => ({ ...x, gap: x.weight * (1 - clamp(x.score)) }))
    .filter((x) => x.gap > 1).sort((x, y) => y.gap - x.gap).slice(0, 5);
  $('#fixes').innerHTML = all.length ? all.map((x) => `<li><b>${esc(x.label)}</b>: ${esc(x.tip)}</li>`).join('') : '<li>Nothing major. Post it and test two hooks.</li>';
  // Strip.
  $('#strip').innerHTML = a.frames.filter((f) => f.t <= 3 && f.image).map((f) => {
    const cls = [f.faces.length ? 'face' : '', a.cuts.includes(f.t) ? 'cut' : ''].join(' ');
    return `<figure class="${cls}"><img src="${f.image}" alt="frame at ${f.t}s"/><figcaption>${f.t.toFixed(2)}s${f.faces.length ? ' · face' : ''}${a.cuts.includes(f.t) ? ' · cut' : ''}</figcaption></figure>`;
  }).join('');
  drawLoud();
  renderSignals(p);
  $('#palette').innerHTML = a.palette.map((c) => `<div style="background:${c.hex};flex:${c.share}">${c.hex}</div>`).join('');
  const acc = a.palette.find((c) => { const [r, g, b] = c.rgb; return Math.max(r, g, b) - Math.min(r, g, b) > 60; });
  $('#paletteNote').textContent = acc ? `Accent ${acc.hex} picked for captions and the progress bar in Export.` : 'Muted palette: a bold accent in the hook text will pop.';
  if (acc) $('#xAccent').value = acc.hex;
}
$('#caption').addEventListener('input', () => S.a && report());
$('#platform').addEventListener('change', () => S.a && report());

function drawLoud() {
  const c = $('#loud'), a = S.a; const w = (c.width = c.clientWidth * devicePixelRatio), h = (c.height = 90 * devicePixelRatio);
  const g = c.getContext('2d'); g.clearRect(0, 0, w, h);
  if (!a.curve.length) { g.fillStyle = '#666'; g.font = `${12 * devicePixelRatio}px Inter`; g.fillText('No audio track', 10, h / 2); return; }
  const x3 = (3 / a.duration) * w;
  g.fillStyle = 'rgba(255,45,85,0.12)'; g.fillRect(0, 0, x3, h);
  g.strokeStyle = '#ff7a18'; g.lineWidth = 1.5 * devicePixelRatio; g.beginPath();
  a.curve.forEach((db, i) => { const x = (i / a.curve.length) * w, y = h - clamp((db + 60) / 60) * h; i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke();
  g.fillStyle = '#9a9aab'; g.font = `${10 * devicePixelRatio}px JetBrains Mono`; g.fillText('first 3 s', 4, 12 * devicePixelRatio);
}

/* ───────────── thumbnails ───────────── */
function renderThumbs() {
  const a = S.a; if (!a) return;
  const list = a.frames.filter((f) => f.image).map((f, i) => ({ f, score: S.clip ? Math.round(0.5 * f.thumb + 50 * S.clip[i]) : f.thumb }))
    .sort((x, y) => y.score - x.score);
  S.thumbs = list;
  $('#thumbGrid').innerHTML = list.map((x, i) => `<figure class="${i === 0 ? 'top' : ''}"><img src="${x.f.image}" alt="cover candidate"/><figcaption><b>${x.score}</b><span>${x.f.t.toFixed(2)} s${x.f.faces.length ? ' · face' : ''}</span><a download="cover-${x.f.t.toFixed(2)}s.jpg" href="${x.f.image}">save</a></figcaption></figure>`).join('');
  report();
}
$('#clipBtn').onclick = async () => {
  if (!S.a) return show('studio');
  const b = $('#clipBtn'); b.disabled = true;
  try {
    const imgs = S.a.frames.filter((f) => f.image).map((f) => f.image);
    S.clip = await clipAppeal(imgs, (m) => ($('#clipStatus').textContent = m));
    $('#clipStatus').textContent = `CLIP reranked ${imgs.length} frames on ${aiDevice()}.`;
    renderThumbs();
  } catch (e) { console.error(e); $('#clipStatus').textContent = `CLIP unavailable here (${e.message}). Heuristic ranking kept.`; }
  b.disabled = false;
};

/* ───────────── export ───────────── */
$('#asrBtn').onclick = async () => {
  if (!S.a) return show('studio');
  if (!S.a.audio) { $('#asrStatus').textContent = 'No decodable audio in this clip.'; return; }
  const b = $('#asrBtn'); b.disabled = true;
  try {
    const r = await transcribe(S.a.audio.pcm16k, (m) => ($('#asrStatus').textContent = m));
    S.words = r.words;
    $('#transcript').value = r.words.map((w) => w.text).join(' ');
    $('#asrStatus').textContent = `${r.words.length} words, timed, on ${aiDevice()}. Edit the text if Whisper misheard; timings are kept word for word.`;
    report();
  } catch (e) { console.error(e); $('#asrStatus').textContent = `Whisper unavailable here (${e.message}).`; }
  b.disabled = false;
};

/** Captions from the (possibly edited) transcript, keeping Whisper's timings by word index. */
function captionCards() {
  if (!S.words) return [];
  const edited = $('#transcript').value.trim().split(/\s+/).filter(Boolean);
  const words = S.words.map((w, i) => ({ ...w, text: edited[i] ?? w.text }));
  return chunkCaptions(words);
}

function exportOpts(record) {
  const size = +$('#xSize').value;
  return {
    record, width: size, height: Math.round((size * 16) / 9),
    reframe: $('#xReframe').checked, blurFaces: $('#xBlur').checked, skeleton: $('#xSkel').checked, skeletonOnly: $('#xSkelOnly').checked,
    progressBar: $('#xBar').checked, hookText: $('#xHook').value.trim(), accent: $('#xAccent').value, watermark: $('#xMark').value.trim(),
    captions: captionCards(),
  };
}

async function doRender(record) {
  if (!S.file) return show('studio');
  S.job?.stop();
  $('#dl').hidden = true;
  const st = $('#renderStatus');
  st.textContent = record ? 'Rendering in real time. Keep this tab open…' : 'Previewing…';
  S.job = renderClip(S.file, $('#out'), exportOpts(record), (f) => (st.textContent = `${record ? 'Rendering' : 'Preview'} ${Math.round(f * 100)}%`));
  document.body.dataset.busy = '1';
  try {
    const blob = await S.job.done;
    if (blob) {
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const a = $('#dl'); a.href = URL.createObjectURL(blob); a.download = `${S.file.name.replace(/\.[^.]+$/, '')}-viralx.${ext}`; a.hidden = false;
      st.textContent = `Done: ${(blob.size / 1e6).toFixed(1)} MB ${ext.toUpperCase()}.${ext === 'webm' ? ' Instagram prefers MP4; Safari and recent Chrome record MP4 directly.' : ''}`;
      a.click();
    } else st.textContent = 'Preview finished.';
  } catch (e) { console.error(e); st.textContent = `Render failed: ${e.message}`; } finally { delete document.body.dataset.busy; }
}
$('#renderBtn').onclick = () => doRender(true);
$('#previewBtn').onclick = () => doRender(false);
$('#stopBtn').onclick = () => S.job?.stop();
$('#xSkelOnly').onchange = (e) => { if (e.target.checked) $('#xSkel').checked = true; };

/* ───────────── hooks ───────────── */
function hookCard(h) {
  return `<div class="h"><div class="tag">${esc(h.pattern || h.type)}</div><div class="t">${esc(h.text)}</div>${h.why ? `<div class="y">${esc(h.why)}</div>` : ''}<button class="btn ghost" data-use="${esc(h.text)}">Use as on-screen hook</button></div>`;
}
$('#hookOut').addEventListener('click', (e) => {
  const b = e.target.closest('[data-use]'); if (!b) return;
  $('#xHook').value = b.dataset.use.split(/\s+/).slice(0, 8).join(' '); b.textContent = 'Set in Export ✓';
});
$('#tplBtn').onclick = () => {
  const hs = fillHooks($('#topic').value, nicheSel.value);
  const tags = hashtags(nicheSel.value, $('#topic').value.split(/\s+/));
  $('#hookOut').innerHTML = hs.map(hookCard).join('') + `<h3>Hashtags</h3><pre>${esc(tags.join(' '))}</pre>`;
};
$('#apiKey').value = store.get('anthropicKey');
$('#forgetKey').onclick = () => { $('#apiKey').value = ''; try { localStorage.removeItem('viralx.anthropicKey'); } catch { /* */ } $('#claudeStatus').textContent = 'Key removed from this browser.'; };
$('#claudeBtn').onclick = async () => {
  const key = $('#apiKey').value.trim();
  if (!key) { $('#claudeStatus').textContent = 'Paste an Anthropic API key first (console.anthropic.com → API keys).'; return; }
  store.set('anthropicKey', key);
  const b = $('#claudeBtn'); b.disabled = true; $('#claudeStatus').textContent = 'Claude is reading the analysis and writing…';
  const { writeHooks, explain } = await import('./claude.js');
  try {
    const a = S.a;
    const r = await writeHooks({
      apiKey: key, topic: $('#topic').value, niche: niche().label, audience: $('#audience').value, platform: $('#platform').selectedOptions[0].text,
      transcript: $('#transcript').value,
      analysis: a ? {
        durationSec: +a.duration.toFixed(1), aspect: +a.aspect.toFixed(2), hookScore: a.hook.score, postScore: post().score,
        hookParts: a.hook.parts.map((p) => ({ part: p.label, score: +clamp(p.score).toFixed(2), measured: p.value })),
        onScreenText: a.hookText, cutsPerMin: +a.cutsPerMin.toFixed(1), draftCaption: $('#caption').value,
        signals: a.timeline.totals, attentionDips: a.dips.map((d) => `${d.from.toFixed(1)}-${d.to.toFixed(1)}s`),
        shotSizes: a.frames.map((f) => f.shot.code).join(' '), dutchFrames: a.frames.filter((f) => f.dutch).length,
      } : null,
    });
    $('#hookOut').innerHTML = r.hooks.map(hookCard).join('')
      + `<h3>On-screen text</h3>${hookCard({ pattern: 'Burn-in', text: r.onScreenText })}`
      + `<h3>Caption</h3><pre>${esc(r.caption)}\n\n${esc(r.hashtags.join(' '))}</pre><button class="btn ghost" id="useCap">Use caption</button>`
      + `<h3>Re-edit plan</h3><pre>${esc(r.shotList.join('\n'))}</pre><h3>Why</h3><p>${esc(r.reasoning)}</p>`;
    $('#useCap').onclick = () => { $('#caption').value = `${r.caption}\n\n${r.hashtags.join(' ')}`; S.a && report(); show('studio'); };
    $('#claudeStatus').textContent = `Written by ${r.model} · ${r.usage.input_tokens + r.usage.output_tokens} tokens.`;
  } catch (e) { console.error(e); $('#claudeStatus').textContent = explain(e); }
  b.disabled = false;
};

/* ───────────── comments ───────────── */
$('#moodBtn').onclick = async () => {
  const lines = $('#commentsIn').value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 500);
  if (!lines.length) return;
  const b = $('#moodBtn'); b.disabled = true;
  let labels, model = 'built-in lexicon';
  if ($('#moodModel').checked) {
    try { const r = await classify(lines, (m) => ($('#moodStatus').textContent = m)); labels = r.labels; model = r.model; }
    catch (e) { console.warn(e); $('#moodStatus').textContent = `Model unavailable (${e.message}); using the lexicon.`; }
  }
  labels ||= lines.map(lexSentiment);
  const n = { positive: 0, neutral: 0, negative: 0 }; labels.forEach((l) => n[l]++);
  const pct = (k) => Math.round((100 * n[k]) / lines.length);
  const qs = lines.filter((l) => /\?|where|how|price|buy|cost/i.test(l));
  $('#moodStatus').textContent = `${lines.length} comments read with ${model}.`;
  $('#moodOut').innerHTML = `<div class="mood">${['positive', 'neutral', 'negative'].map((k) => `<div class="${k}" style="flex:${n[k] || 0.0001}"></div>`).join('')}</div>
    <p><b>${pct('positive')}%</b> positive · <b>${pct('neutral')}%</b> neutral · <b>${pct('negative')}%</b> negative</p>
    <h3>Make next</h3><ul>
      ${qs.length ? `<li><b>${qs.length} questions</b> in the comments. Answer the top one in a reply video ("Replying to @…"); these get some of the highest retention.</li>` : ''}
      ${n.negative ? `<li><b>Address the objection</b> head-on in a follow-up: "${esc(lines[labels.indexOf('negative')]).slice(0, 90)}"${nicheSel.value === 'care-tech' ? '. For care-tech that is usually privacy, so show the skeleton-only view.' : ''}</li>` : ''}
      ${n.positive ? '<li><b>Pin a positive comment</b> that restates the benefit, and reuse its words as your next hook.</li>' : ''}
    </ul>
    ${lines.map((l, i) => `<div class="cm"><i class="${labels[i]}">${labels[i]}</i>${esc(l)}</div>`).join('')}`;
  b.disabled = false;
};

/* ───────────── trends (YouTube Data API v3) ───────────── */
$('#ytKey').value = store.get('ytKey');
$('#ytBtn').onclick = async () => {
  const key = $('#ytKey').value.trim(); const q = $('#ytQ').value.trim();
  if (!key) { $('#ytStatus').textContent = 'Paste a YouTube Data API key first.'; return; }
  store.set('ytKey', key);
  const b = $('#ytBtn'); b.disabled = true; $('#ytStatus').textContent = 'Searching…';
  try {
    const after = new Date(Date.now() - 7 * 86400000).toISOString();
    const s = await (await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&order=viewCount&maxResults=25&publishedAfter=${after}&q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`)).json();
    if (s.error) throw new Error(s.error.message);
    const ids = s.items.map((i) => i.id.videoId).join(',');
    const d = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails&id=${ids}&key=${encodeURIComponent(key)}`)).json();
    if (d.error) throw new Error(d.error.message);
    const rows = d.items.map((v) => ({
      id: v.id, title: v.snippet.title, ch: v.snippet.channelTitle, views: +(v.statistics.viewCount || 0), likes: +(v.statistics.likeCount || 0),
      comments: +(v.statistics.commentCount || 0), vpd: velocity(+(v.statistics.viewCount || 0), v.snippet.publishedAt),
    })).sort((a, b) => b.vpd - a.vpd);
    const pats = titlePatterns(rows.map((r) => r.title));
    const fmt = (n) => n.toLocaleString();
    $('#ytOut').innerHTML = `<h3>Title patterns in the top ${rows.length}</h3><div class="parts">${pats.map((p) => `<div class="p"><span class="n">${esc(p.pattern)}</span><span class="val">${Math.round(p.share * 100)}%</span><span class="m"><i style="width:${p.share * 100}%;background:var(--hot2)"></i></span></div>`).join('')}</div>
      <h3>Rising this week</h3><div class="tablewrap"><table><tr><th>Title</th><th>Views/day</th><th>Views</th><th>Eng.</th></tr>
      ${rows.map((r) => `<tr><td><a href="https://youtube.com/shorts/${esc(r.id)}" target="_blank" rel="noopener">${esc(r.title)}</a><br><span class="fine">${esc(r.ch)}</span></td><td class="num">${fmt(r.vpd)}</td><td class="num">${fmt(r.views)}</td><td class="num">${r.views ? (((r.likes + r.comments) / r.views) * 100).toFixed(1) + '%' : '–'}</td></tr>`).join('')}</table></div>`;
    $('#ytStatus').textContent = `${rows.length} Shorts from the last 7 days.`;
  } catch (e) { $('#ytStatus').textContent = `YouTube API: ${e.message}`; }
  b.disabled = false;
};

/* ───────────── schedule ───────────── */
const mins = (id) => { const [h, m] = $(id).value.split(':').map(Number); return h * 60 + m; };
function plan() {
  const slots = ['#s1', '#s2', '#s3'].map(mins).sort((a, b) => a - b);
  return postingPlan(new Date(), +$('#days').value || 7, slots);
}
$('#planBtn').onclick = () => {
  const p = plan(); const by = new Map();
  p.forEach((d) => { const k = d.toDateString(); by.set(k, [...(by.get(k) || []), d]); });
  $('#planOut').innerHTML = [...by].map(([k, ds]) => `<div class="d"><b>${esc(k)}</b>${ds.map((d) => `<div>${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · post</div>`).join('')}</div>`).join('');
};
$('#icsBtn').onclick = () => {
  const tags = hashtags(nicheSel.value, []).join(' ');
  const ics = toICS(plan().map((at, i) => ({ at, title: `Post #${i + 1} · ${niche().label}`, note: `Hook first 3 s · captions on · 9:16\n${tags}` })));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'viralx-posting-plan.ics'; a.click();
};

/* ───────────── stack ───────────── */
let stackDone = false;
async function renderStack() {
  if (stackDone) return; stackDone = true;
  try {
    const s = await (await fetch(new URL('../data/stack.json', import.meta.url))).json();
    $('#stackOut').innerHTML = `<p class="fine">${esc(s.note)} Checked ${esc(s.checked)}.</p>`
      + s.requested.map((r) => `<div class="stk"><span class="st ${r.status}">${r.status}</span><span class="r">${r.exists ? esc(r.repo) : `<s>${esc(r.repo)}</s> · not on GitHub`}</span><span class="w">${esc(r.role)}: ${esc(r.why)}</span><span class="x">→ ${esc(r.with)}</span></div>`).join('')
      + `<h3>Added</h3>` + s.added.map((r) => `<div class="stk"><span class="st installed">added</span><span class="r">${esc(r.repo)}</span><span class="w">${esc(r.what)}</span><span></span></div>`).join('');
  } catch (e) { $('#stackOut').textContent = `Could not load stack.json: ${e.message}`; }
  const gpu = !!navigator.gpu;
  const rec = window.MediaRecorder ? (MediaRecorder.isTypeSupported('video/mp4') ? 'MP4' : 'WebM') : 'none';
  $('#engines').innerHTML = [
    ['MediaPipe Tasks Vision', 'BlazeFace + Pose Landmarker lite · vendored'],
    ['Tesseract.js 5', 'English LSTM · vendored'],
    ['CLIP ViT-B/32', MODELS.clip],
    ['Sentiment', MODELS.sentiment],
    ['Whisper', MODELS.whisper],
    ['Claude', 'claude-opus-5-5 · your key'],
    ['WebGPU', gpu ? 'available' : 'not available (WASM fallback)'],
    ['Recorder', rec],
  ].map(([k, v]) => `<div><b>${esc(k)}</b><i>${esc(v)}</i></div>`).join('');
}

/* ───────────── signal dashboard ───────────── */
function renderSignals(p) {
  const a = S.a, T = a.timeline;
  const cards = [...SIGNALS.map((g) => ({ ...g, v: T.totals[g.key], trend: T.trend[g.key] })),
    { key: 'hook', label: 'Hook', v: a.hook.score, trend: null, explain: 'The first 3 seconds, scored on motion, cuts, an early face, on-screen text, sound onset, loudness, exposure, colour and sharpness. The full breakdown is below.' }];
  $('#cards').innerHTML = cards.map((c) => `<div class="glass-card sig" data-k="${c.key}"><h4>${esc(c.label)}</h4>
    <div class="val">${c.v}<small>/100</small></div><div class="m"><i style="width:${c.v}%"></i></div>
    <div class="foot2"><span>${c.v}%</span>${c.trend == null ? '<span class="chip">first 3 s</span>' : `<span class="chip ${c.trend > 2 ? 'up' : c.trend < -2 ? 'down' : ''}" title="last third vs first third">${c.trend > 0 ? '+' : ''}${c.trend} end vs start</span>`}</div>
    <button class="link" data-explain>explain ◇</button><p class="explain">${esc(c.explain)}</p></div>`).join('');
  drawHeat();
  $('#dips').innerHTML = a.dips.length
    ? a.dips.map((d) => `<li><b>${d.from.toFixed(1)}–${d.to.toFixed(1)} s</b>: attention sags. Cut, punch in 120%, or pop text here. <button class="link" data-seek="${d.from}">watch</button></li>`).join('')
    : '<li>No sustained dips. Attention holds through the clip.</li>';
  const dutch = a.frames.filter((f) => f.dutch).length;
  $('#dna').innerHTML = a.frames.map((f) => `<span class="${f.shot.code}${f.dutch ? ' dutch' : ''}" title="${f.t.toFixed(1)} s · ${esc(f.shot.label)}${f.dutch ? ` · dutch ${f.tilt.tilt}°` : ''}">${f.shot.code}</span>`).join('')
    + `<p class="fine" style="width:100%">Shot size from face size, ${dutch ? `<b>${dutch}</b> dutch-angle frame${dutch > 1 ? 's' : ''} found (outlined)` : 'no dutch angles found'}. Camera height can't be read reliably from one frame, so it's left out.</p>`;
  $('#recs').innerHTML = recommend(a.frames.map((f) => f.shot), dutch).map((r) => {
    const t = TECHNIQUES.find((x) => x.id === r.id);
    return `<div class="rec"><div><b>${esc(t.name)}</b> <span class="chip">${esc(t.feeling)}</span><p>${esc(r.why)}</p></div><button class="btn glass sm" data-tech="${t.id}">See it in 3D</button></div>`;
  }).join('');
}

function drawHeat() {
  const a = S.a; if (!a) return;
  const c = $('#heat'), dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  c.width = w * dpr; c.height = h * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
  const rows = SIGNALS, L = Math.min(96, w * 0.24), top = 8, bottom = 22, rh = (h - top - bottom) / rows.length;
  const T = a.timeline, n = T.times.length, cw = (w - L - 8) / n;
  g.font = '10px "JetBrains Mono", monospace'; g.textBaseline = 'middle';
  rows.forEach((r, i) => {
    g.fillStyle = '#a597ad'; g.fillText(r.label.toUpperCase(), 4, top + rh * (i + 0.5));
    T.rows[r.key].forEach((v, j) => {
      const x = L + j * cw, y = top + rh * i + 2;
      g.fillStyle = `rgba(255, ${Math.round(79 + 120 * v)}, ${Math.round(216 + 30 * v)}, ${0.08 + 0.9 * v})`;
      g.fillRect(x + 0.5, y, Math.max(1, cw - 1), rh - 4);
    });
  });
  g.fillStyle = '#6c5f73';
  const step = a.duration > 40 ? 10 : a.duration > 12 ? 4 : 1;
  for (let s = 0; s <= a.duration; s += step) g.fillText(`${s}s`, L + (s / a.duration) * (w - L - 8) - 4, h - 9);
  // playhead
  const t = $('#player').currentTime || 0, x = L + (t / a.duration) * (w - L - 8);
  g.strokeStyle = '#ffffff'; g.shadowColor = '#ff4fd8'; g.shadowBlur = 10; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(x, top); g.lineTo(x, h - bottom); g.stroke(); g.shadowBlur = 0;
  S.heatGeom = { L, w };
}
$('#heat').addEventListener('click', (e) => {
  if (!S.a || !S.heatGeom) return;
  const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left;
  const t = clamp((x - S.heatGeom.L) / (S.heatGeom.w - S.heatGeom.L - 8)) * S.a.duration;
  $('#player').currentTime = t; drawHeat();
});
$('#player').addEventListener('timeupdate', drawHeat);
$('#player').addEventListener('seeked', drawHeat);
addEventListener('resize', () => S.a && drawHeat());
document.addEventListener('click', (e) => {
  const ex = e.target.closest('[data-explain]'); if (ex) ex.closest('.sig').classList.toggle('open');
  const sk = e.target.closest('[data-seek]'); if (sk) { const v = $('#player'); v.currentTime = +sk.dataset.seek; v.play().catch(() => {}); v.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  const te = e.target.closest('[data-tech]'); if (te) { show('lab'); selectTech(te.dataset.tech); $('#lab').scrollIntoView({ behavior: 'smooth' }); }
  const z = e.target.closest('.zoomable img'); if (z) { const lb = $('#lightbox'); lb.querySelector('img').src = z.src; lb.querySelector('img').alt = z.alt; lb.hidden = false; }
});
$('#lightbox').addEventListener('click', (e) => { e.currentTarget.hidden = true; });
addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#lightbox').hidden = true; });

/* ───────────── camera lab ───────────── */
let lab = null, labTech = TECHNIQUES[0].id;
$('#techGrid').innerHTML = TECHNIQUES.map((t, i) => `<button class="tech" data-pick="${t.id}"><span class="no">${String(i + 1).padStart(2, '0')}/${TECHNIQUES.length}${t.n ? ' · ' + esc(t.n) : ''}</span><b>${esc(t.name)}</b><span class="feel">${esc(t.feeling)}</span><span class="lens">${esc(t.lens)} · ${esc(t.height)}</span></button>`).join('');
$('#techGrid').addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) { selectTech(b.dataset.pick); $('.labstage').scrollIntoView({ behavior: 'smooth', block: 'center' }); } });
function selectTech(id) {
  labTech = id; const t = TECHNIQUES.find((x) => x.id === id);
  document.querySelectorAll('.tech').forEach((b) => b.classList.toggle('on', b.dataset.pick === id));
  $('#techDetail').innerHTML = `${t.es ? `<div class="es">${esc(t.es)}</div>` : ''}<h3>${esc(t.name)}</h3>
    <div class="specs"><span class="chip">Emotional trigger: ${esc(t.feeling)}</span><span class="chip">Lens ${esc(t.lens)}</span><span class="chip">Height ${esc(t.height)}</span><span class="chip">${esc(t.fps)}</span><span class="chip">180° line: ${t.keepLine ? 'kept' : 'crossed on purpose'}</span></div>
    <ul>${t.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul><p class="phone-tip"><b>On your phone:</b> ${esc(t.phone)}</p>`;
  lab?.select(id);
}
selectTech(labTech);
async function mountLabOnce() {
  if (lab) return;
  try {
    const { mountLab } = await import('./camlab.js');
    const lbl = $('#insetLabel');
    lab = mountLab($('#labcanvas'), $('#hud'), ({ inset }) => { lbl.style.left = `${inset.x + 8}px`; lbl.style.top = `${inset.y + 6}px`; $('#labScrub').value = Math.round(lab ? lab.t * 1000 : 0); });
    lab.select(labTech);
  } catch (e) { console.error(e); $('#hud').innerHTML = `<i>3D needs WebGL, which isn't available here (${esc(e.message)}).</i>`; }
}
$('#labPlay').onclick = () => { if (!lab) return; const p = lab.play(); $('#labPlay').textContent = p ? '❚❚' : '▶'; $('#labPlay').setAttribute('aria-label', p ? 'Pause' : 'Play'); };
$('#labScrub').addEventListener('input', (e) => { if (!lab) return; lab.play(false); $('#labPlay').textContent = '▶'; lab.seek(e.target.value / 1000); });
$('#labSpeed').onchange = (e) => lab?.speed(+e.target.value);

/* ───────────── hero ───────────── */
import('./hero3d.js').then((m) => m.mountHero($('#hero'))).catch((e) => console.warn('hero 3D unavailable', e));

show(store.get('tab', 'studio'));
window.__viralx = S;

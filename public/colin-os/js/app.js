/**
 * COLIN OS interface: tabs, the team pipeline, Closer, Calendar, Analyst, Guardian and Settings.
 * @module colin-os/app
 */
import { PROFILE, LANES, checkCompliance, withDisclosure, classifyLead, affiliateLink, weekPlan, toICS, postMetrics } from './core.js';
import { AGENTS, runAgent, runPipeline, getKey, setKey, explain } from './agents.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const list = (xs, tag = 'ul') => `<${tag}>${(xs || []).map((x) => `<li>${esc(x)}</li>`).join('')}</${tag}>`;
const card = (title, body, copy) => `<div class="card">${copy != null ? `<button class="btn ghost copy" data-copy="${esc(copy)}">Copy</button>` : ''}<h4>${esc(title)}</h4>${body}</div>`;

// Discount code persists per browser.
try { PROFILE.partner.code = localStorage.getItem('colin-os.code') || ''; } catch { /* private mode */ }

/* ── Tabs ───────────────────────────────────────────── */
function show(tab) {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('on', p.dataset.panel === tab));
}
$('tabs').addEventListener('click', (e) => { if (e.target.dataset.tab) show(e.target.dataset.tab); });
document.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', () => show(a.dataset.go)));
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-copy]');
  if (!t) return;
  navigator.clipboard?.writeText(t.dataset.copy).then(() => { t.textContent = 'Copied'; setTimeout(() => { t.textContent = 'Copy'; }, 1200); });
});

function keynote() {
  $('keynote').innerHTML = getKey()
    ? '<b>● Live</b> · agents run on Claude with your key.'
    : '<b class="off">● Offline drafts</b> · add an Anthropic key in Settings to make the agents write fresh, tailored work.';
}

/* ── Roster ─────────────────────────────────────────── */
$('roster').innerHTML = Object.values(AGENTS).map((a) => `<li><b>${a.icon} ${esc(a.name)}</b><span>${esc(a.role)}</span></li>`).join('');
$('lane-select').innerHTML = `<option value="">All lanes</option>${Object.entries(LANES).map(([k, l]) => `<option value="${k}">${esc(l.label)}</option>`).join('')}`;

/* ── Team pipeline ──────────────────────────────────── */
const STEPS = ['scout', 'script', 'caption', 'compliance'];
function drawPipeline(state = {}) {
  $('pipeline').innerHTML = STEPS.map((id) => `<li data-state="${state[id] || ''}"><b>${AGENTS[id].icon} ${esc(AGENTS[id].name)}</b>${esc(AGENTS[id].role)}<br></li>`).join('');
}
drawPipeline();

function renderTeam(o) {
  const parts = [];
  if (o.scout) {
    const angles = o.scout.angles || [];
    parts.push(card('Scout · angles', `<ol>${angles.map((a) => typeof a === 'string' ? `<li>${esc(a)}</li>` : `<li><b>${esc(a.title)}</b> <span class="pill gold">${esc(a.format)}</span><br><small>${esc(a.why)}</small></li>`).join('')}</ol>${o.scout.avoid?.length ? `<p><b>Avoid:</b> ${esc(o.scout.avoid.join(' · '))}</p>` : ''}`));
  }
  if (o.script) {
    const s = o.script;
    const beats = (s.beats || []).map((b) => typeof b === 'string' ? `<li>${esc(b)}</li>` : `<li><b>${esc(b.t)}</b> ${esc(b.say)} <small>· ${esc(b.shot)}</small></li>`).join('');
    const hooks = s.hooks || (s.hook ? [s.hook] : []);
    parts.push(card('Scriptwriter · Reel', `${s.angle ? `<p><b>${esc(s.angle)}</b></p>` : ''}<p>Hooks:</p>${list(hooks)}<p>Script:</p><ol>${beats}</ol><p>On screen: <b>${esc(s.onScreen)}</b></p>${s.cta ? `<p>CTA: ${esc(s.cta)}</p>` : ''}`,
      [hooks[0], ...(s.beats || []).map((b) => typeof b === 'string' ? b : `${b.t} ${b.say}`)].join('\n')));
  }
  if (o.compliance) {
    const c = o.compliance;
    const pill = c.verdict === 'do-not-post' ? 'bad' : c.scan?.ok ? 'ok' : 'warn';
    const tags = (o.caption?.hashtags || []).join(' ');
    const full = `${c.caption}\n\n${tags}`;
    parts.push(card('Ready to post · caption', `<p><span class="pill ${pill}">Guardian: ${esc(c.verdict)}</span><span class="pill gold">Score ${c.scan?.score ?? '–'}</span></p><pre>${esc(full)}</pre>${c.firstComment ? `<p><b>First comment:</b> ${esc(c.firstComment)}</p>` : ''}${o.caption?.storyLine ? `<p><b>Story sticker:</b> ${esc(o.caption.storyLine)}</p>` : ''}${c.changes?.length ? `<p>Guardian changed:</p>${list(c.changes)}` : ''}${flagsHtml(c.scan?.flags)}`, full));
  }
  $('team-out').innerHTML = parts.join('');
}

$('brief').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const brief = { topic: f.get('topic'), lane: f.get('lane'), campaign: f.get('campaign'), notes: f.get('notes'), promote: f.get('promote') === 'on' };
  const btn = e.target.querySelector('button'); btn.disabled = true;
  const state = {}; const out = {};
  $('team-out').innerHTML = '';
  try {
    await runPipeline(brief, (id, s, o) => { state[id] = s; drawPipeline(state); if (s === 'done') { out[id] = o; renderTeam(out); } });
  } catch (err) {
    $('team-out').insertAdjacentHTML('beforeend', `<p class="err">${esc(explain(err))}</p>`);
  } finally { btn.disabled = false; }
});

/* ── Closer ─────────────────────────────────────────── */
$('dm-go').addEventListener('click', async () => {
  const message = $('dm-in').value.trim();
  if (!message) return;
  const lead = classifyLead(message);
  const laneName = LANES[lead.lane]?.label || 'General';
  const head = `<p><span class="pill gold">Lane: ${esc(laneName)}</span><span class="pill ${lead.intent === 'hot' ? 'ok' : lead.intent === 'warm' ? 'warn' : 'bad'}">Intent: ${lead.intent}</span></p>`;
  $('dm-out').innerHTML = card('Routing', head + '<p>Writing reply…</p>');
  $('dm-go').disabled = true;
  try {
    const r = await runAgent('dm', { message, lane: LANES[lead.lane] ? lead.lane : 'general', intent: lead.intent });
    const scan = checkCompliance(r.reply, { promotesPartner: /optimum|\/a\/colin-cook/i.test(r.reply) });
    $('dm-out').innerHTML = card('Routing', head) + card('Reply', `<pre>${esc(r.reply)}</pre>${flagsHtml(scan.flags)}`, r.reply)
      + (r.followUp ? card('Follow-up (48h, if no answer)', `<pre>${esc(r.followUp)}</pre>`, r.followUp) : '')
      + (r.qualifyQuestions ? card('Qualify', list(r.qualifyQuestions) + `<p><b>Next step:</b> ${esc(r.nextStep)}</p>`) : '');
  } catch (err) { $('dm-out').insertAdjacentHTML('beforeend', `<p class="err">${esc(explain(err))}</p>`); } finally { $('dm-go').disabled = false; }
});

/* ── Calendar ───────────────────────────────────────── */
let plan = [];
function drawCal() {
  plan = weekPlan(new Date(), { hour: +$('cal-hour').value || 18 });
  $('cal-out').innerHTML = plan.map((p) => `<div class="day"><b>${p.day} ${p.date.getMonth() + 1}/${p.date.getDate()}</b><small>${esc(p.pillar)} · ${esc(p.format)} · ${esc(LANES[p.lane]?.label || 'Everyone')}</small>${esc(p.idea)}${p.pillar === 'Partner' ? '<br><span class="pill warn">#ad required</span>' : ''}</div>`).join('');
}
$('cal-hour').addEventListener('change', drawCal);
$('cal-ics').addEventListener('click', () => {
  const blob = new Blob([toICS(plan)], { type: 'text/calendar' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'colin-os-week.ics' });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});
drawCal();

/* ── Analyst ────────────────────────────────────────── */
$('metrics').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const m = postMetrics(f);
  const rates = `<ul><li>Engagement ${m.engagementRate}%</li><li>Shares ${m.shareRate}% · Saves ${m.saveRate}%</li><li>Follows ${m.followRate}% · Link clicks ${m.clickRate}%</li>${m.retention != null ? `<li>Retention ${m.retention}%</li>` : ''}</ul>`;
  $('an-out').innerHTML = card('Numbers', rates) + card('Quick read', list(m.notes));
  if (!getKey()) return;
  try {
    const r = await runAgent('analyst', { topic: f.topic, metrics: m });
    $('an-out').insertAdjacentHTML('beforeend', card('Analyst', `<p>${esc(r.diagnosis)}</p><p><b>Keep</b></p>${list(r.keep)}<p><b>Change</b></p>${list(r.change)}<p><b>Next week's experiments</b></p>${list(r.experiments, 'ol')}`));
  } catch (err) { $('an-out').insertAdjacentHTML('beforeend', `<p class="err">${esc(explain(err))}</p>`); }
});

/* ── Guardian ───────────────────────────────────────── */
function flagsHtml(flags = []) {
  if (!flags.length) return '<p><span class="pill ok">No flags</span></p>';
  return flags.map((f) => `<div class="flag ${f.level}"><b>${f.level === 'block' ? 'Fix before posting' : 'Review'}</b> · <code>${esc(f.match)}</code><br>${esc(f.fix)}</div>`).join('');
}
$('g-go').addEventListener('click', () => {
  const r = checkCompliance($('g-in').value);
  $('g-out').innerHTML = card('Result', `<p><span class="pill ${r.ok ? 'ok' : 'bad'}">${r.ok ? 'OK to post' : 'Do not post yet'}</span><span class="pill gold">Score ${r.score}</span></p>${flagsHtml(r.flags)}`);
});
$('g-fix').addEventListener('click', () => { $('g-in').value = withDisclosure($('g-in').value); $('g-go').click(); });

/* ── Settings ───────────────────────────────────────── */
$('key').value = getKey() ? '••••••••' : '';
$('key-save').addEventListener('click', () => { const v = $('key').value.trim(); if (v && !v.startsWith('•')) setKey(v); $('key').value = getKey() ? '••••••••' : ''; keynote(); });
$('key-clear').addEventListener('click', () => { setKey(''); $('key').value = ''; keynote(); });
$('code').value = PROFILE.partner.code;
$('code').addEventListener('change', () => { PROFILE.partner.code = $('code').value.trim(); try { localStorage.setItem('colin-os.code', PROFILE.partner.code); } catch { /* private */ } });
$('profile').innerHTML = [
  ['Handle', `@${PROFILE.handle}`], ['Offer', PROFILE.offer], ['Partner', `${PROFILE.partner.name} (affiliate)`],
  ['Lanes', Object.values(LANES).map((l) => l.label).join(' · ')], ['Voice', PROFILE.voice],
].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
const utm = () => { $('utm-out').textContent = affiliateLink(PROFILE.partner.url, { content: $('utm-content').value || 'bio' }); };
$('utm-content').addEventListener('input', utm); utm();

keynote();

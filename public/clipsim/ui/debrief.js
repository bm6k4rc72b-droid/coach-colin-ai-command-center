import { i18n } from './i18n.js';

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Debrief: the case summary and a few specific, actionable tips drawn from
// what actually happened: rupture-risk events, the clip result, occlusion
// time, blood loss, MEP and injuries.
export class Debrief {
  constructor(el, ctx) {
    this.el = el; this.ctx = ctx;
    el.querySelector('#db-close').onclick = () => this.hide();
    el.querySelector('#db-restart').onclick = () => location.reload();
    i18n.onChange(() => { if (!el.classList.contains('hidden')) this.show(); });
  }
  hide() { this.el.classList.add('hidden'); }

  summary() {
    const c = this.ctx, s = c.state, st = c.stats, v = c.vitals.record;
    const occl = st.tempOcclusion + (s.tempClipOn ? s.time - s.tempClipStart : 0);
    const ev = s.clipEval;
    // Top rupture-risk reasons by accumulated amount.
    const byReason = {};
    for (const e of c.risk.events) byReason[e.reason] = (byReason[e.reason] || 0) + e.amount;
    const topRisk = Object.entries(byReason).sort((a, b) => b[1] - a[1]);
    return {
      time: s.time - (s.startTime || 0), ebl: c.bleeding.totalLoss, occl, ruptured: !!s.ruptured,
      ev, minMep: v.minMep, minMap: v.minMap, mepAlerts: v.mepAlerts, hypotension: v.hypotension,
      injuries: st.injuries, topRisk, riskPeak: c.risk.peak, stagesDone: c.stages.done.filter(Boolean).length,
      icgAfterClip: c.stages.lastClipTime !== null && (c.stages.facts.icg ?? -1) >= c.stages.lastClipTime,
      endoscope: st.endoscopeUses > 0, tempUsed: occl > 0 || s.tempClipOn, demo: !!s.demoUsed,
      retraction: c.vitals.retractionHeavyT,
    };
  }

  // Rules, highest priority first. Each returns [key, vars] or null.
  tips(m) {
    const t = [];
    const add = (key, vars = {}) => t.push([key, vars]);
    if (m.ruptured) add(m.tempUsed ? 'tip.ruptureRecovered' : 'tip.ruptureNoProximal');
    const top = m.topRisk[0]?.[0];
    if (top && m.riskPeak > 0.25) add('tip.risk.' + top, { pct: Math.round(m.riskPeak * 100) });
    if (m.ev) {
      if (m.ev.grade === 'branchOcclusion') add(!m.ev.pcomPatent ? 'tip.pcom' : !m.ev.achaPatent ? 'tip.acha' : 'tip.branch');
      else if (m.ev.grade === 'stenosis') add('tip.stenosis', { pct: Math.round(m.ev.icaNarrowing * 100) });
      else if (m.ev.grade === 'incomplete') add('tip.incomplete', { pct: Math.round(m.ev.neckClosure * 100) });
      else if (m.ev.grade === 'residual') add('tip.residual', { mm: m.ev.residualNeck.toFixed(1) });
    } else if (m.stagesDone >= 4) add('tip.noClip');
    if (m.occl > 300) add('tip.tempLong', { t: fmt(m.occl) });
    if (m.minMep < 50) add('tip.mep', { pct: Math.round(m.minMep) });
    if (m.injuries.length) add('tip.injury', { list: [...new Set(m.injuries.map((i) => i18n.t('part.' + i.part)))].join(', ') });
    if (m.ev && !m.icgAfterClip) add('tip.icg');
    if (m.ev && !m.endoscope) add('tip.endoscope');
    if (m.ebl > 300) add('tip.ebl', { ml: Math.round(m.ebl) });
    if (m.retraction > 45) add('tip.retraction');
    if (!t.length) add('tip.excellent');
    if (t.length < 3) add('tip.generic');
    return t.slice(0, 5);
  }

  show() {
    const m = this.summary(), el = this.el, q = (id) => el.querySelector('#' + id);
    const set = (id, txt, cls = '') => { const e = q(id); e.textContent = txt; e.className = cls; };
    set('db-time', fmt(m.time));
    set('db-ebl', `${Math.round(m.ebl)} ml`, m.ebl > 300 ? 'bad' : m.ebl > 100 ? 'warn' : 'ok');
    set('db-occl', m.occl > 0 ? fmt(m.occl) : '—', m.occl > 300 ? 'bad' : m.occl > 180 ? 'warn' : 'ok');
    set('db-rupture', i18n.t(m.ruptured ? 'db.yes' : 'db.no'), m.ruptured ? 'bad' : 'ok');
    const grade = m.ev ? m.ev.grade : 'none';
    set('db-clip', i18n.t('grade.' + grade), grade === 'ideal' ? 'ok' : grade === 'none' ? 'warn' : 'bad');
    set('db-mep', `${Math.round(m.minMep)} %`, m.minMep < 50 ? 'bad' : m.minMep < 75 ? 'warn' : 'ok');
    set('db-map', `${Math.round(m.minMap)} mmHg`, m.minMap < 60 ? 'bad' : m.minMap < 70 ? 'warn' : 'ok');
    set('db-stages', `${m.stagesDone}/6`, m.stagesDone === 6 ? 'ok' : 'warn');

    // Clip detail: the checks the grading performed.
    const d = q('db-clipdetail');
    d.innerHTML = '';
    if (m.ev) {
      const rows = [
        ['db.neck', `${Math.round(m.ev.neckClosure * 100)} %`, m.ev.neckClosure >= 0.95],
        ['db.residual', `${Math.max(0, m.ev.residualNeck).toFixed(1)} mm`, m.ev.residualNeck <= 1.2],
        ['db.ica', `${Math.round(m.ev.icaNarrowing * 100)} %`, m.ev.icaNarrowing <= 0.35],
        ['db.pcom', i18n.t(m.ev.pcomPatent ? 'db.open' : 'db.closed'), m.ev.pcomPatent],
        ['db.acha', i18n.t(m.ev.achaPatent ? 'db.open' : 'db.closed'), m.ev.achaPatent],
      ];
      for (const [k, val, ok] of rows) {
        const li = document.createElement('li');
        li.className = ok ? 'ok' : 'bad';
        li.innerHTML = `<span class="ic">${ok ? '✓' : '✕'}</span><span></span><b class="mono"></b>`;
        li.children[1].textContent = i18n.t(k); li.children[2].textContent = val;
        d.appendChild(li);
      }
    }

    // Case score: a simple, transparent composite, shown with how it is made up.
    let score = 100;
    if (m.ruptured) score -= 20;
    if (!m.ev) score -= 30; else if (m.ev.grade !== 'ideal') score -= m.ev.grade === 'residual' ? 10 : 25;
    score -= Math.min(15, Math.max(0, m.occl - 300) / 20);
    score -= Math.min(15, Math.max(0, m.ebl - 100) / 30);
    score -= m.minMep < 50 ? 10 : 0;
    score -= Math.min(20, m.injuries.length * 8);
    score -= (6 - m.stagesDone) * 3;
    score = Math.max(0, Math.round(score));
    q('db-score').textContent = score;
    q('db-ring').style.setProperty('--p', score);

    const tips = q('db-tips');
    tips.innerHTML = '';
    for (const [key, vars] of this.tips(m)) {
      const li = document.createElement('li');
      li.textContent = i18n.t(key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
      tips.appendChild(li);
    }
    q('db-demo').classList.toggle('hidden', !m.demo);
    el.classList.remove('hidden');
  }
}

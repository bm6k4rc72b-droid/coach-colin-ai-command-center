/** Tab 1 — the AI / software / sensor stack you can use today, a pipeline diagram and a latency budget. */
import { budget, STAGES, TECH, type Category } from '../core/techStack';
import { state } from '../core/store';
import { esc } from './dom';

const CATS: Category[] = ['Perception AI', 'Generative AI', '3D scene AI', 'AI that builds the software', 'Sensors (the other side)', 'Physical cloaks'];

const PIPELINE_SVG = `
<svg class="pipeline" viewBox="0 0 900 170" role="img" aria-label="Software cloak pipeline">
  <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#67e8f9"/></marker></defs>
  <g font-size="13" fill="#dde8f0" text-anchor="middle">
    ${[
      ['Camera', 'webcam / synthetic', 20],
      ['Segment', 'MediaPipe (AI)', 190],
      ['Refine mask', 'threshold · dilate · feather', 360],
      ['Composite', 'clean plate / shimmer', 530],
      ['Output', 'what viewers see', 700],
    ]
      .map(
        ([t, s, x]) => `<g transform="translate(${x},30)"><rect width="150" height="64" rx="10" fill="#0f1620" stroke="rgba(103,232,249,.5)"/>
        <text x="75" y="28" font-weight="700">${t}</text><text x="75" y="48" font-size="11" fill="#86a0b4">${s}</text></g>`,
      )
      .join('')}
    ${[170, 340, 510, 680].map((x) => `<line x1="${x}" y1="62" x2="${x + 18}" y2="62" stroke="#67e8f9" stroke-width="2" marker-end="url(#ar)"/>`).join('')}
    <path d="M775 94 V140 H600" fill="none" stroke="#a78bfa" stroke-width="2" stroke-dasharray="5 4" marker-end="url(#ar)"/>
    <g transform="translate(440,118)"><rect width="160" height="44" rx="10" fill="#140f24" stroke="#a78bfa"/>
      <text x="80" y="20" font-weight="700">Red team</text><text x="80" y="36" font-size="11" fill="#86a0b4">COCO-SSD person detector</text></g>
    <text x="105" y="140" font-size="11" fill="#86a0b4" text-anchor="start">Clean plate = a stored frame of the empty scene</text>
  </g>
</svg>`;

export function renderStack(root: HTMLElement): void {
  const byCat = CATS.map((c) => {
    const items = TECH.filter((t) => t.category === c);
    return `<div data-cat="${esc(c)}"><div class="cat-title">${esc(c)}</div><div class="grid cols-3">${items
      .map(
        (t) => `<article class="card tech">
          <span class="pill m-${t.maturity}">${t.maturity}</span>
          <h4>${t.link ? `<a href="${t.link}" target="_blank" rel="noopener">${esc(t.name)}</a>` : esc(t.name)}</h4>
          <div>${esc(t.what)}</div>
          <dl><dt>Cloak use</dt><dd>${esc(t.cloakUse)}</dd><dt>Limits</dt><dd>${esc(t.limits)}</dd><dt>Runs on</dt><dd>${esc(t.runsOn)}</dd></dl>
          ${t.inLab ? `<div class="inlab">● In this lab: ${esc(t.inLab)}</div>` : ''}
        </article>`,
      )
      .join('')}</div></div>`;
  }).join('');

  root.innerHTML = `
    <h2>The AI stack behind "invisibility"</h2>
    <p class="lede">Software cloaks are real, but they work on video, not on the world. Each card says what the
      technology does, how a cloak would use it, where it breaks, and whether you can use it today.
      Cards marked <span class="inlab">● In this lab</span> run live in the next tabs.</p>
    <div class="card"><h3>How a software cloak works</h3>${PIPELINE_SVG}</div>
    <div class="grid cols-2" style="margin-top:12px">
      <div class="card" id="budget"><h3>Real-time budget: can it run live?</h3>
        <p class="muted" style="margin-top:0">Pick pipeline stages. Live video at 30 fps leaves 33 ms per frame for everything.</p>
        <div class="stagepick">${STAGES.map(
          (s) => `<label><input type="checkbox" data-stage="${s.id}" ${state.budget.includes(s.id) ? 'checked' : ''}/> ${esc(s.name)} <span class="muted mono">~${s.ms} ms</span></label>`,
        ).join('')}</div>
        <div id="budget-out" style="margin-top:10px"></div>
      </div>
      <div class="card"><h3>Where an AI assistant fits</h3>
        <p>Language models like Claude are not inside the frame loop — they are far too slow for 33 ms. They are
          very good at the parts around it: wiring up MediaPipe and TensorFlow.js, writing the compositing maths,
          writing unit tests, tuning parameters and explaining results. This lab was built that way.</p>
        <p class="muted">The per-frame work is done by small, specialised vision models running on your own device.</p>
      </div>
    </div>
    ${byCat}`;

  const upd = () => {
    const b = budget(state.budget);
    const pct = Math.min(100, (b.totalMs / 100) * 100);
    root.querySelector('#budget-out')!.innerHTML = `
      <div class="kv"><b>Latency</b><span>${Math.round(b.totalMs)} ms / frame</span><b>Frame rate</b><span>${
        Number.isFinite(b.fps) ? b.fps.toFixed(1) : '—'
      } fps</span><b>Cloak quality</b><span>${Math.round(b.quality * 100)}%</span></div>
      <div class="bar ${b.realtime ? 'good' : ''}" style="margin:8px 0" title="0–100 ms"><i style="width:${pct}%"></i></div>
      <div class="${b.realtime ? 'o-ok' : 'o-upset'}">${esc(b.verdict)}</div>`;
  };
  root.querySelectorAll<HTMLInputElement>('[data-stage]').forEach((cb) =>
    cb.addEventListener('change', () => {
      const id = cb.dataset.stage!;
      state.budget = cb.checked ? [...state.budget, id] : state.budget.filter((x) => x !== id);
      upd();
    }),
  );
  upd();
}

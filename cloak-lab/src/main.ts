/** Bootstrap: tabs, views, the guided tour and the frame loop. */
import './style.css';
import { state } from './core/store';
import { TOUR, TourRunner, type Tab, type TourActions } from './core/tour';
import { CloakView } from './ui/cloakView';
import { $, esc } from './ui/dom';
import { EmpView } from './ui/empView';
import { renderQuiz } from './ui/quizView';
import { SpectrumView } from './ui/spectrumView';
import { renderStack } from './ui/stackView';

renderStack($('#tab-stack'));
const cloak = new CloakView($('#tab-cloak'));
const spectrum = new SpectrumView($('#tab-spectrum'));
const emp = new EmpView($('#tab-emp'));
renderQuiz($('#tab-quiz'));

let highlighted: Element | null = null;

function goto(tab: Tab): void {
  state.tab = tab;
  document.querySelectorAll<HTMLElement>('.tab').forEach((s) => s.classList.toggle('active', s.id === `tab-${tab}`));
  document.querySelectorAll<HTMLButtonElement>('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  cloak.active = tab === 'cloak';
  spectrum.active = tab === 'spectrum';
  emp.active = tab === 'emp';
  if (tab === 'quiz') renderQuiz($('#tab-quiz'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const actions: TourActions = {
  goto,
  useSynthetic: () => cloak.useSynthetic(),
  capturePlate: () => cloak.capturePlate(),
  setCloakMode: (m) => cloak.setMode(m),
  setLightingDrift: (on) => cloak.setLightingDrift(on),
  setRedTeam: (on) => cloak.setRedTeam(on),
  setLoadout: (l) => spectrum.setLoadout(l),
  setLight: (l) => spectrum.setLight(l),
  runSpectrum: () => spectrum.run(),
  setThreat: (t) => emp.setThreat(t),
  setProtection: (id, p) => emp.setProtection(id, p),
  pulse: () => emp.pulse(),
  cloakEmpTest: () => cloak.empTest(),
  highlight: (sel) => {
    highlighted?.classList.remove('highlight');
    highlighted = sel ? document.querySelector(sel) : null;
    if (highlighted) {
      highlighted.classList.add('highlight');
      highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  },
};

const tour = new TourRunner(actions);
let tourPaused = false;
const bar = $('#tourbar');

function drawTourBar(): void {
  const st = tour.step;
  bar.classList.toggle('hidden', !st);
  if (!st) return;
  const frac = Math.min(1, tour.elapsed / st.seconds);
  bar.innerHTML = `<div class="t-head"><span class="badge">TOUR ${tour.index + 1}/${TOUR.length}</span><strong>${esc(st.title)}</strong>
      <button data-t="prev" aria-label="Previous">◀</button><button data-t="pause">${tourPaused ? '▶' : '❚❚'}</button>
      <button data-t="next" aria-label="Next">▶▶</button><button data-t="stop">✕</button></div>
    <div style="margin-top:6px">${esc(st.text)}</div>
    <div class="progress"><i style="width:${frac * 100}%"></i></div>`;
}

bar.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-t]');
  if (!b) return;
  const t = b.dataset.t;
  if (t === 'prev') tour.prev();
  if (t === 'next') tour.next();
  if (t === 'pause') tourPaused = !tourPaused;
  if (t === 'stop') tour.stop();
  drawTourBar();
});

function startTour(): void {
  $('#start').classList.add('hidden');
  tourPaused = false;
  tour.start();
  drawTourBar();
}

document.querySelectorAll<HTMLButtonElement>('#tabs [data-tab]').forEach((b) => b.addEventListener('click', () => goto(b.dataset.tab as Tab)));
$('#tour-btn').addEventListener('click', startTour);

$('#start').innerHTML = `<div class="card" role="dialog" aria-labelledby="st-title">
  <h2 id="st-title">Cloak Lab</h2>
  <p>How close can today's technology get to an invisibility cloak — and why do the other sensors still see you?
    Real AI models run in this page; the physics is simplified but honest.</p>
  <div class="disclaimer"><strong>Educational demonstration.</strong> Software cloaks only alter video; they do not hide anyone in
    the real world. The EMP section is defensive and conceptual — it teaches protection, not how to create pulses.
    Not a tool for evading lawful surveillance. Webcam video is processed locally and never uploaded.</div>
  <ol>
    <li><strong>AI Stack</strong> — what's real today, what is research, what is fiction, and a live-video latency budget.</li>
    <li><strong>Live Cloak</strong> — segmentation + clean-plate compositing with a red-team person detector.</li>
    <li><strong>Spectrum Lab</strong> — visible, thermal, radar, acoustic and Wi-Fi sensing vs your loadout.</li>
    <li><strong>EMP Lab</strong> — harden the cloak's electronics and test them.</li>
    <li><strong>Quiz</strong> — check what you learned.</li>
  </ol>
  <div class="row" style="margin-top:14px"><button class="primary" id="st-tour">▶ Start the guided tour</button><button id="st-free">Explore freely</button></div>
</div>`;
$('#st-tour').addEventListener('click', startTour);
$('#st-free').addEventListener('click', () => $('#start').classList.add('hidden'));

goto('stack');

let last = performance.now();
let barTimer = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  cloak.update(dt);
  spectrum.update(dt);
  const before = tour.index;
  tour.update(dt, tourPaused);
  barTimer += dt;
  if (tour.index !== before || barTimer > 0.2) {
    barTimer = 0;
    drawTourBar();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as unknown as Record<string, unknown>).__cloak = { state, cloak, spectrum, emp, tour };

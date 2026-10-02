/** App shell: source + settings, preview player, feature timeline, picks, tech explainer, tour. */
import './style.css';
import { ObjectScorer } from './ai/detector';
import { DECOYS, MOMENTS } from './core/demo';
import { DEFAULT_PICK, DEFAULT_WEIGHTS, evaluate, pick, reelLength, score, type Features, type Fusion, type PickOptions, type Scored, type Segment, type Weights } from './core/highlights';
import { TOUR, TourRunner, type TourActions } from './core/tour';
import { analyze } from './media/analyze';
import { Player } from './media/player';
import { demoSource, fileSource, type Source } from './media/source';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

const player = new Player($('#view') as HTMLCanvasElement);
const detector = new ObjectScorer();
let src: Source | null = null;
let features: Features | null = null;
let scored: Scored | null = null;
let segs: Segment[] = [];
let weights: Weights = { ...DEFAULT_WEIGHTS };
let fusion: Fusion = 'agree';
let opts: PickOptions = { ...DEFAULT_PICK };
let useObjects = false;
let job = 0;
let exporting = false;

// ------------------------------------------------------------ left panel --
const W_SLIDERS: [keyof Weights, string][] = [
  ['audio', 'Loudness'],
  ['motion', 'Motion'],
  ['cuts', 'Scene cuts'],
  ['objects', 'Objects'],
];
const P_SLIDERS: [keyof PickOptions, string, number, number, number, (v: number) => string][] = [
  ['target', 'Reel length', 10, 90, 5, (v) => `${v} s`],
  ['pre', 'Build-up', 0, 8, 0.5, (v) => `${v} s`],
  ['post', 'Reaction', 0, 8, 0.5, (v) => `${v} s`],
  ['minGap', 'Min gap', 2, 20, 1, (v) => `${v} s`],
  ['relative', 'Min score', 0, 0.9, 0.05, (v) => `${Math.round(v * 100)}%`],
];

function renderLeft(): void {
  $('#left').innerHTML = `
    <div id="source"><h3>Video</h3>
      <div class="chips"><button id="demo-btn">Demo match</button><label class="chips"><button id="file-btn" type="button">Load your video…</button><input id="file" type="file" accept="video/*" /></label></div>
      <p class="hint" id="src-name"></p>
      <label class="toggle"><input type="checkbox" id="obj-toggle" /> Object detection (COCO-SSD, ~6 MB)</label>
      <p class="hint" id="obj-status">Off. Adds an "objects" feature: people, balls, boards, bikes.</p>
      <p class="hint">Videos are decoded in your browser and never uploaded.</p>
    </div>
    <div id="weights" style="margin-top:12px"><h3>Feature weights</h3>
      ${W_SLIDERS.map(([k, n]) => `<label class="slider">${n}<input type="range" data-w="${k}" min="0" max="1" step="0.05"/><span></span></label>`).join('')}
      <div class="chips" style="margin-top:6px" id="fusion"><button data-fu="sum">Weighted sum</button><button data-fu="agree">Require agreement</button></div>
      <p class="hint" id="fusion-hint"></p>
    </div>
    <div id="pick" style="margin-top:12px"><h3>Picking</h3>
      ${P_SLIDERS.map(([k, n, mn, mx, st]) => `<label class="slider">${n}<input type="range" data-p="${k}" min="${mn}" max="${mx}" step="${st}"/><span></span></label>`).join('')}
    </div>`;
  $('#demo-btn').addEventListener('click', () => manual(loadDemo));
  $('#file-btn').addEventListener('click', () => ($('#file') as HTMLInputElement).click());
  $('#file').addEventListener('change', () => {
    const f = ($('#file') as HTMLInputElement).files?.[0];
    if (f) manual(() => void loadFile(f));
  });
  $('#obj-toggle').addEventListener('change', () => manual(() => void toggleObjects(($('#obj-toggle') as HTMLInputElement).checked)));
  $('#left').querySelectorAll<HTMLInputElement>('[data-w]').forEach((i) => i.addEventListener('input', () => manual(() => setWeights({ ...weights, [i.dataset.w!]: Number(i.value) }))));
  $('#left').querySelectorAll<HTMLButtonElement>('[data-fu]').forEach((b) => b.addEventListener('click', () => manual(() => setFusion(b.dataset.fu as Fusion))));
  $('#left').querySelectorAll<HTMLInputElement>('[data-p]').forEach((i) => i.addEventListener('input', () => manual(() => setPick({ [i.dataset.p!]: Number(i.value) }))));
}

function syncLeft(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-fu]').forEach((b) => b.classList.toggle('on', b.dataset.fu === fusion));
  $('#demo-btn').classList.toggle('on', src?.kind === 'demo');
  $('#src-name').textContent = src ? `${src.name} · ${mmss(src.duration)}` : '';
  $('#fusion-hint').textContent =
    fusion === 'sum' ? 'Sum: any one strong feature can make a moment score high.' : 'Agreement: the features must agree — loud AND moving — to score high.';
  document.querySelectorAll<HTMLInputElement>('[data-w]').forEach((i) => {
    const v = weights[i.dataset.w as keyof Weights];
    i.value = String(v);
    i.nextElementSibling!.textContent = v.toFixed(2);
  });
  document.querySelectorAll<HTMLInputElement>('[data-p]').forEach((i) => {
    const s = P_SLIDERS.find((p) => p[0] === i.dataset.p)!;
    const v = opts[s[0]];
    i.value = String(v);
    i.nextElementSibling!.textContent = s[5](v);
  });
  const st = { idle: 'Off. Adds an "objects" feature: people, balls, boards, bikes.', loading: 'Loading TensorFlow.js and the model…', ready: 'Ready — runs on every sampled frame.', error: `Could not load: ${detector.error}` };
  $('#obj-status').textContent = useObjects ? st[detector.status] : st.idle;
}

// ----------------------------------------------------------- right panel --
const TECH: [string, 'here' | 'pro', string][] = [
  ['Web Audio API · loudness', 'here', 'decodeAudioData turns the file into samples; RMS over 50 ms windows, in decibels, tracks crowd noise and commentary energy.'],
  ['Frame differencing · motion', 'here', 'Each sampled frame shrinks to 96×54 greyscale. The mean pixel change between frames measures action and camera shake.'],
  ['Luma histograms · scene cuts', 'here', 'A sudden histogram jump, above an adaptive threshold, marks a change of shot. Broadcasts cut to replays right after big plays.'],
  ['TensorFlow.js COCO-SSD · objects', 'here', 'A MobileNet object detector (80 classes) runs on your GPU through WebGL and counts people, balls, boards and bikes.'],
  ['MediaRecorder · export', 'here', 'The reel plays into a canvas; captureStream() and the audio graph are recorded into a .webm file locally.'],
  ['Whisper · speech-to-text', 'pro', 'Transcribes commentary, so "what a goal!" or your friend shouting becomes a searchable signal. It runs in the browser with transformers.js, or via an API.'],
  ['CLIP / SigLIP · text search', 'pro', 'Embeds frames and text into one space, so you can ask for "a slam dunk" or "the cake" and get the matching moments.'],
  ['YAMNet / AST · sound events', 'pro', 'Audio classifiers that tell cheering, applause, music and speech apart. They would have rejected our advert by its sound alone.'],
  ['Pose estimation · MediaPipe', 'pro', 'Body keypoints spot jumps, kicks and celebrations, even when the camera is shaking.'],
  ['LLMs · editing decisions', 'pro', 'Given the transcript and detected events, a language model can order clips into a story and write titles and captions.'],
  ['ffmpeg.wasm · exact cuts', 'pro', 'Frame-accurate trimming and MP4 output without re-recording in real time.'],
];

function renderRight(): void {
  let card = '<p class="hint">Load the demo or a video to see its highlights.</p>';
  if (features && scored) {
    const evalHtml =
      src?.kind === 'demo'
        ? (() => {
            const e = evaluate(segs, MOMENTS, DECOYS);
            return `<div class="score"><div class="ring">${e.found}/${e.total}</div><div><strong class="${e.found === e.total && !e.fooledBy.length ? 'pass' : 'close'}">
              ${e.found === e.total && !e.fooledBy.length ? 'All highlights, no traps' : e.fooledBy.length ? `Fooled by: ${esc(e.fooledBy.map((d) => d.label.split(' (')[0]).join(', '))}` : 'Missed some highlights'}</strong>
              <div class="hint">${e.missed.length ? `Missed: ${esc(e.missed.map((m) => `${m.label} @${mmss(m.t)}`).join(', '))}. ` : ''}${e.falsePicks} wrong pick${e.falsePicks === 1 ? '' : 's'}.</div></div></div>`;
          })()
        : '';
    card = `${evalHtml}<p class="hint">${segs.length} clips · reel ${reelLength(segs).toFixed(1)} s of ${mmss(features.duration)}${features.audio ? '' : ' · no audio track found'}</p>
      ${segs
        .map(
          (s, i) => `<div class="seg"><strong>#${i + 1}</strong><span class="mono">${mmss(s.start)}–${mmss(s.end)} · ${Math.round(s.score * 100)}</span>
          <button data-seg="${i}" aria-label="Play clip ${i + 1}">▶</button><div class="why">${esc(s.reasons.join(' · '))}</div></div>`,
        )
        .join('')}`;
  }
  $('#right').innerHTML = `<div id="score-card"><h3>Highlights</h3>${card}</div>
    <div id="tech" style="margin-top:14px"><h3>The AI & media tech</h3>
    ${TECH.map(([n, k, d]) => `<div class="tech"><strong>${esc(n)}</strong><span class="tag ${k}">${k === 'here' ? 'USED HERE' : 'PRO TOOLS'}</span><p>${esc(d)}</p></div>`).join('')}</div>`;
  $('#right').querySelectorAll<HTMLButtonElement>('[data-seg]').forEach((b) =>
    b.addEventListener('click', () => manual(() => player.playReel([segs[Number(b.dataset.seg)]]))),
  );
}

// -------------------------------------------------------------- timeline --
function drawTimeline(): void {
  const c = $('#timeline') as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  g.fillStyle = '#0a0b0e';
  g.fillRect(0, 0, W, H);
  if (!features || !scored || !src) {
    g.fillStyle = '#8b93a1';
    g.font = '22px sans-serif';
    g.fillText('No video analysed yet', 24, H / 2);
    return;
  }
  const L = 110;
  const D = features.duration;
  const X = (t: number) => L + (t / D) * (W - L - 10);
  const rows: [string, number[] | null, string][] = [
    ['Loudness', features.audio ? scored.audio : null, '#60a5fa'],
    ['Motion', scored.motion, '#fb923c'],
    ['Cuts', null, '#e5e7eb'],
    ['Objects', features.objects ? scored.objects : null, '#c084fc'],
    ['Score', scored.score, '#4ade80'],
  ];
  const rh = (H - 36) / rows.length;
  for (const s of segs) {
    g.fillStyle = 'rgba(251,146,60,0.22)';
    g.fillRect(X(s.start), 0, X(s.end) - X(s.start), H - 30);
  }
  if (src.kind === 'demo')
    for (const d of DECOYS) {
      g.fillStyle = 'rgba(148,163,184,0.13)';
      g.fillRect(X(d.t0), H - 30, X(d.t1) - X(d.t0), 30);
      g.fillStyle = '#94a3b8';
      g.font = '15px sans-serif';
      g.fillText(d.label.split(' (')[0], X(d.t0) + 3, H - 9);
    }
  g.font = '17px sans-serif';
  rows.forEach(([name, data, col], r) => {
    const y0 = r * rh + 4;
    g.fillStyle = '#8b93a1';
    g.fillText(name, 8, y0 + rh / 2 + 5);
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.beginPath();
    g.moveTo(L, y0 + rh - 2);
    g.lineTo(W, y0 + rh - 2);
    g.stroke();
    if (name === 'Cuts') {
      g.strokeStyle = col;
      g.lineWidth = 2;
      features!.cuts.forEach((cut, i) => {
        if (!cut) return;
        g.beginPath();
        g.moveTo(X(i * features!.step), y0 + 4);
        g.lineTo(X(i * features!.step), y0 + rh - 6);
        g.stroke();
      });
      g.lineWidth = 1;
      return;
    }
    if (!data) {
      g.fillStyle = '#4b5563';
      g.fillText(name === 'Objects' ? 'off' : 'none', L + 6, y0 + rh / 2 + 5);
      return;
    }
    g.beginPath();
    g.moveTo(X(0), y0 + rh - 4);
    data.forEach((v, i) => g.lineTo(X(i * features!.step), y0 + rh - 4 - v * (rh - 10)));
    g.lineTo(X((data.length - 1) * features!.step), y0 + rh - 4);
    g.closePath();
    g.fillStyle = col + (name === 'Score' ? '66' : '40');
    g.fill();
    g.strokeStyle = col;
    g.lineWidth = name === 'Score' ? 2 : 1.4;
    g.stroke();
    g.lineWidth = 1;
  });
  if (src.kind === 'demo')
    for (const m of MOMENTS) {
      const x = X(m.t);
      g.fillStyle = '#4ade80';
      g.beginPath();
      g.moveTo(x, H - 26);
      g.lineTo(x - 7, H - 12);
      g.lineTo(x + 7, H - 12);
      g.fill();
    }
  g.strokeStyle = '#ffffff';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(X(player.t), 0);
  g.lineTo(X(player.t), H);
  g.stroke();
  g.lineWidth = 1;
}

$('#timeline').addEventListener('click', (e) => {
  if (!features || !src) return;
  const c = e.currentTarget as HTMLCanvasElement;
  const r = c.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * c.width;
  const t = ((x - 110) / (c.width - 120)) * features.duration;
  if (t >= 0) manual(() => void player.seek(t));
});

// --------------------------------------------------------------- actions --
function recompute(): void {
  if (!features) {
    scored = null;
    segs = [];
  } else {
    scored = score(features, weights, fusion);
    segs = pick(scored, features, opts);
  }
  syncLeft();
  renderRight();
}
function setWeights(w: Weights): void {
  weights = { ...w };
  recompute();
}
function setFusion(f: Fusion): void {
  fusion = f;
  recompute();
}
function setPick(p: Partial<PickOptions>): void {
  opts = { ...opts, ...p };
  recompute();
}

function busy(label: string | null, frac = 0): void {
  $('#busy').classList.toggle('hidden', label === null);
  if (label !== null) {
    $('#busy-label').textContent = label;
    $('#busy-bar').style.width = `${Math.round(frac * 100)}%`;
  }
}

async function runAnalysis(): Promise<void> {
  if (!src) return;
  const my = ++job;
  player.stop();
  features = null;
  recompute();
  if (useObjects) {
    busy('Loading object detector…');
    await detector.load();
    syncLeft();
  }
  const f = await analyze(src, useObjects && detector.status === 'ready' ? detector : null, (p, l) => my === job && busy(`Analysing · ${l}`, p), () => my !== job);
  if (my !== job) return;
  busy(null);
  features = f;
  recompute();
  void player.seek(0);
}

function setSource(s: Source): void {
  src?.dispose();
  src = s;
  player.setSource(s);
  void runAnalysis();
}
function loadDemo(): void {
  setSource(demoSource(player.ac));
}
async function loadFile(f: File): Promise<void> {
  try {
    busy('Opening video…');
    setSource(await fileSource(f));
  } catch (e) {
    busy(null);
    alert(e instanceof Error ? e.message : String(e));
  }
}
async function toggleObjects(on: boolean): Promise<void> {
  useObjects = on;
  if (!on) weights = { ...weights, objects: 0 };
  else if (weights.objects === 0) weights = { ...weights, objects: 0.3 };
  syncLeft();
  await runAnalysis();
}

$('#play-btn').addEventListener('click', () => manual(() => (player.playing ? player.pause() : player.play())));
$('#reel-btn').addEventListener('click', () => manual(() => player.playReel(segs)));
$('#export-btn').addEventListener('click', () =>
  manual(async () => {
    if (!segs.length || exporting) return;
    exporting = true;
    try {
      const blob = await player.exportReel(segs, (p) => busy(`Recording reel… ${Math.round(p * 100)}%`, p));
      busy(null);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `highlights-${(src?.name ?? 'reel').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_')}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    } catch (e) {
      busy(null);
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      exporting = false;
    }
  }),
);

// ----------------------------------------------------------------- tour --
let highlighted: Element | null = null;
const actions: TourActions = {
  loadDemo: () => {
    if (src?.kind !== 'demo' || !features) loadDemo();
  },
  setWeights,
  setFusion,
  setPick,
  playReel: () => player.playReel(segs),
  stopPlayback: () => player.stop(),
  highlight: (sel) => {
    highlighted?.classList.remove('highlight');
    highlighted = sel ? document.querySelector(sel) : null;
    highlighted?.classList.add('highlight');
  },
};
const tour = new TourRunner(actions);
let paused = false;
let applying = false;
function stopTourIfManual(): void {
  if (tour.active && !applying) {
    tour.stop();
    drawTour();
  }
}
function manual(fn: () => void): void {
  void player.ac.resume();
  stopTourIfManual();
  fn();
}
const origNext = tour.next.bind(tour);
tour.next = () => {
  applying = true;
  origNext();
  applying = false;
};

function drawTour(): void {
  const st = tour.step;
  const bar = $('#tourbar');
  bar.classList.toggle('hidden', !st);
  if (!st) return;
  bar.innerHTML = `<div class="t-head"><span class="badge">TOUR ${tour.index + 1}/${TOUR.length}</span><strong>${esc(st.title)}</strong>
    <button data-tb="prev" aria-label="Previous">◀</button><button data-tb="pause" aria-label="Pause">${paused ? '▶' : '❚❚'}</button><button data-tb="next" aria-label="Next">▶▶</button><button data-tb="stop" aria-label="Stop tour">✕</button></div>
    <div style="margin-top:6px">${esc(st.text)}</div><div class="progress"><i style="width:${Math.min(100, (tour.elapsed / st.seconds) * 100)}%"></i></div>`;
}
$('#tourbar').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tb]');
  if (!b) return;
  const k = b.dataset.tb;
  if (k === 'prev') {
    applying = true;
    tour.prev();
    applying = false;
  }
  if (k === 'next') tour.next();
  if (k === 'pause') paused = !paused;
  if (k === 'stop') tour.stop();
  drawTour();
});

function startTour(): void {
  void player.ac.resume();
  $('#start').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  paused = false;
  tour.start();
  drawTour();
}
$('#tour-btn').addEventListener('click', startTour);

$('#start').innerHTML = `<div class="panel" role="dialog" aria-labelledby="st">
  <h2 id="st">HIGHLIGHT CUTTER</h2>
  <p>Find the best moments of a video automatically and cut them into a reel. Then see exactly how it decided:
  loudness, motion, scene cuts and an optional AI object detector, each scored second by second.</p>
  <div class="note">Everything runs in your browser and nothing is uploaded. Start with the demo match: it has an answer key
  (five real highlights and two traps), so you can watch each technique succeed or get fooled.</div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"><button class="primary" id="st-tour">▶ Guided tour</button><button id="st-free">Explore the demo</button></div>
</div>`;
$('#st-tour').addEventListener('click', startTour);
$('#st-free').addEventListener('click', () => {
  $('#start').classList.add('hidden');
  manual(loadDemo);
});

renderLeft();
syncLeft();
renderRight();

let last = performance.now();
let uiT = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  player.tick();
  const before = tour.index;
  tour.update(dt, paused);
  uiT += dt;
  if (before !== tour.index || uiT > 0.1) {
    uiT = 0;
    drawTimeline();
    drawTour();
    $('#clock').textContent = `${mmss(player.t)} / ${mmss(src?.duration ?? 0)}${player.reel ? ` · clip ${player.reelIndex + 1}/${player.reel.length}` : ''}`;
    $('#play-btn').textContent = player.playing ? '❚❚' : '▶';
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as unknown as Record<string, unknown>).__cut = { player, tour, get segs() { return segs; }, get features() { return features; }, setWeights, setFusion, loadDemo };

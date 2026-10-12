/**
 * COLIN Dermal Technologies — the skin-care room behind the face scan.
 *
 * Laid over the chamber like the Black Lab, but built for a phone's memory:
 * plain DOM and 2D canvases, the owner's three dermal plates behind, only
 * the current panel's neighbours given their photograph. Eight panels guide
 * the visitor from what the camera saw, to what bothers them, to what helps
 * (strongest evidence first), and then through the peptides themselves —
 * where they act in the skin, how far a molecule that size can get, and
 * what the trials actually showed.
 *
 * The maths lives in dermal.js and is drawn exactly: concentration
 * profiles are erfc(x / 2√(Dt)), the permeability chart is Potts–Guy, the
 * collagen curve is Shuster's ~1% a year.
 *
 * @module astra/showcase/dermlab
 */

import {
  AGEING_FACTS, CONCERNS, GRADES, LAYERS, SC_UM, SKIN_PEPTIDES,
  collagenShare, concentration, erfcInv, lagTime, logKp, mwOf, prettyFormula, rankConcerns, reach, solutionsFor,
} from './dermal.js';

const LITE = matchMedia('(max-width: 820px)').matches || /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
const DPR = Math.min(window.devicePixelRatio || 1, LITE ? 1.25 : 2);
const PINK = '#ff5fa8';
const CYAN = '#38e1ff';
const GOLD = '#f0b75a';
const TEXT = '#e8eef8';
const DIM = 'rgba(232, 238, 248, 0.55)';

export const DERM_PLATES = {
  lab: '../assets/showcase/derm-lab.webp',
  regen: '../assets/showcase/derm-regen.webp',
  scan: '../assets/showcase/derm-scan.webp',
};

export const DERM_PANELS = [
  { id: 'report', plate: 'scan', kicker: '01 · Scan report', colin: 'Here is what the camera noticed. A camera, mind, not a dermatologist. Light and make-up move every number.' },
  { id: 'pain', plate: 'scan', kicker: '02 · Your pain points', colin: 'Now tell me what actually bothers you. Your answer outranks my camera.' },
  { id: 'solutions', plate: 'regen', kicker: '03 · What helps', colin: 'What helps, strongest evidence first. You will notice the cheapest thing on this list is also the best studied.' },
  { id: 'layers', plate: 'lab', kicker: '04 · Skin layers · peptide binding', colin: 'Your skin, in layers. Pick a peptide and watch how far it gets. Spoiler: the barrier is very good at its job.' },
  { id: 'penetration', plate: 'lab', kicker: '05 · Penetration lab', colin: 'The penetration lab. Size is destiny: every hundred daltons slows diffusion by a factor of four.' },
  { id: 'dossier', plate: 'regen', kicker: '06 · Peptide dossier', colin: 'The peptide dossier. What each one is, what it does in a dish, and what it did in people.' },
  { id: 'time', plate: 'regen', kicker: '07 · Collagen, sun & time', colin: 'Collagen falls about one percent a year. The sun does most of the visible damage. Sunscreen is dull, and it works.' },
  { id: 'exit', plate: 'scan', kicker: '08 · Your summary', colin: 'Your summary. Take it to a dermatologist if anything worries you. I am a hologram; they have a licence.' },
];

/* ------------------------------------------------------------- helpers */

function el(tag, attrs = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of [].concat(kids)) if (kid != null && kid !== false) n.append(kid);
  return n;
}

function sizeCanvas(canvas, cssW, cssH) {
  canvas.width = Math.round(cssW * DPR);
  canvas.height = Math.round(cssH * DPR);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  return ctx;
}

const gradeBadge = (g) => el('span', { class: `dl-grade g-${g}`, title: GRADES[g].note, text: `${g} · ${GRADES[g].label}` });
const concernById = (id) => CONCERNS.find((c) => c.id === id);
const peptideById = (id) => SKIN_PEPTIDES.find((p) => p.id === id);

/* ------------------------------------------------------- the hologram face */

/**
 * The visitor's snapshot as a hologram: luminance mapped onto a cyan–pink
 * ramp, edges (Sobel magnitude) traced in light, scanlines over it. Drawn
 * once into a canvas; the snapshot itself is not kept anywhere else.
 */
function hologramFace(snapshot) {
  const w = snapshot.width;
  const h = snapshot.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  const src = snapshot.getContext('2d').getImageData(0, 0, w, h);
  const d = src.data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) lum[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
  const img = ctx.createImageData(w, h);
  const o = img.data;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const at = (dx, dy) => lum[Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))];
      const gx = -at(-1, -1) - 2 * at(-1, 0) - at(-1, 1) + at(1, -1) + 2 * at(1, 0) + at(1, 1);
      const gy = -at(-1, -1) - 2 * at(0, -1) - at(1, -1) + at(-1, 1) + 2 * at(0, 1) + at(1, 1);
      const edge = Math.min(1, Math.hypot(gx, gy) * 1.6);
      const l = lum[i];
      const scan = y % 3 === 0 ? 0.55 : 1;
      // Cyan in the shadows, pink in the highlights, edges in white light.
      o[i * 4] = Math.min(255, (40 + 215 * l * l + 200 * edge) * scan);
      o[i * 4 + 1] = Math.min(255, (120 * l + 90 * (1 - l) * l * 2 + 190 * edge) * scan);
      o[i * 4 + 2] = Math.min(255, (190 + 60 * l + 120 * edge) * scan);
      o[i * 4 + 3] = Math.round(255 * Math.min(1, 0.25 + l * 0.9 + edge));
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/* --------------------------------------------------------- the panels */

function reportPanel(ctx) {
  const { report, snapshot, via } = ctx.entry;
  const body = [];
  if (report && snapshot) {
    const face = hologramFace(snapshot);
    face.className = 'dl-face';
    face.setAttribute('aria-label', 'Your scan as a hologram');
    body.push(el('div', { class: 'dl-face-wrap' }, [face, el('div', { class: 'dl-face-sweep' })]));
  }
  if (report) {
    body.push(el('p', { class: 'dl-note', text: `Reading quality: ${report.quality.confidence}${report.quality.issues.length ? ` — ${report.quality.issues.join(', ')}` : ''}. Scores are how much the camera noticed (0–100) on fixed scales, not a diagnosis.` }));
    body.push(el('div', { class: 'dl-meters' }, report.flags.map((f) => el('button', {
      class: `dl-meter${f.score >= 50 ? ' hot' : ''}`, type: 'button', title: f.detail,
      onclick: () => { ctx.focus(f.concern); ctx.goto(2); },
    }, [
      el('span', { class: 'dl-meter-label', text: f.label }),
      el('span', { class: 'dl-bar' }, [el('i', { style: `width:${f.score}%` })]),
      el('b', { text: String(f.score) }),
      el('small', { text: f.detail }),
    ]))));
    body.push(el('p', { class: 'dl-cite', text: 'Measured on this device: CIELAB lightness and a*, an erythema index 100·log₁₀(R/G) (after Dawson et al. 1980), specular share, and band-pass texture. Wrinkle depth and collagen cannot be seen by a phone camera, so they are not scored.' }));
  } else {
    body.push(el('p', { text: via === 'questionnaire' ? 'You came in by questionnaire, so there is no camera reading — go straight to your pain points.' : 'No reading.' }));
  }
  return [el('h2', { text: report ? 'What the camera noticed' : 'Welcome to the dermal wing' }), ...body,
    el('button', { class: 'dl-btn', type: 'button', text: 'Next: what bothers you? →', onclick: () => ctx.goto(1) })];
}

function painPanel(ctx) {
  const flagged = new Set((ctx.entry.report?.flags || []).filter((f) => f.score >= 50).map((f) => f.concern));
  const list = el('ol', { class: 'dl-ranked' });
  const render = () => {
    const ranked = rankConcerns([...ctx.chosen], ctx.entry.report?.flags || []);
    list.replaceChildren(...(ranked.length ? ranked.map((id) => {
      const c = concernById(id);
      return el('li', {}, [el('button', { class: 'dl-link', type: 'button', onclick: () => { ctx.focus(id); ctx.goto(2); } }, [
        el('b', { text: `${c.icon} ${c.name}` }),
        el('span', { text: ctx.chosen.has(id) ? 'you said' : 'camera flagged' }),
      ])]);
    }) : [el('li', { class: 'dl-empty', text: 'Pick at least one above.' })]));
    ctx.onChosen();
  };
  const chips = el('div', { class: 'dl-chips' }, CONCERNS.map((c) => {
    const b = el('button', { class: `dl-chip${flagged.has(c.id) ? ' flagged' : ''}`, type: 'button', 'aria-pressed': String(ctx.chosen.has(c.id)), text: `${c.icon} ${c.name}` });
    b.addEventListener('click', () => {
      if (ctx.chosen.has(c.id)) ctx.chosen.delete(c.id); else ctx.chosen.add(c.id);
      b.setAttribute('aria-pressed', String(ctx.chosen.has(c.id)));
      render();
    });
    return b;
  }));
  ctx.renderPain = render;
  render();
  return [
    el('h2', { text: 'What bothers you most?' }),
    el('p', { text: 'Tap everything that applies. A glowing outline means the camera noticed it too. Your ranking: what you pick comes first.' }),
    chips,
    list,
  ];
}

function solutionsPanel(ctx) {
  const title = el('h2');
  const why = el('p');
  const tabs = el('div', { class: 'dl-tabs' });
  const list = el('ol', { class: 'dl-options' });
  const render = () => {
    const ranked = rankConcerns([...ctx.chosen], ctx.entry.report?.flags || []);
    const ids = ranked.length ? [...ranked] : ['lines'];
    if (ctx.current && !ids.includes(ctx.current)) ids.unshift(ctx.current);
    if (!ids.includes(ctx.current)) ctx.current = ids[0];
    tabs.replaceChildren(...ids.map((id) => el('button', { class: 'dl-tab', type: 'button', 'aria-pressed': String(id === ctx.current), text: concernById(id).name, onclick: () => { ctx.focus(id); } })));
    const c = concernById(ctx.current);
    title.textContent = `${c.icon} ${c.name}`;
    why.textContent = c.why;
    list.replaceChildren(...solutionsFor(c.id).map((o) => el('li', { class: `dl-option ${o.kind}` }, [
      el('div', { class: 'dl-option-head' }, [el('b', { text: o.name }), gradeBadge(o.grade)]),
      o.inci ? el('small', { class: 'dl-inci', text: o.inci }) : null,
      el('p', { text: o.how }),
      el('small', { text: o.cite }),
      o.kind === 'peptide' ? el('button', { class: 'dl-link small', type: 'button', text: 'See it in the skin →', onclick: () => { ctx.pick(o.id); ctx.goto(3); } }) : null,
    ])));
  };
  ctx.renderSolutions = render;
  render();
  return [title, tabs, why, list, el('p', { class: 'dl-cite', text: 'Grades: A strong (several RCTs) · B moderate · C limited (small or sponsor-run trials) · D early (lab or manufacturer data). Educational only — no products, doses or routines are recommended here.' })];
}

/** The cross-section with a peptide diffusing in. */
function layersPanel(ctx) {
  const canvas = el('canvas', { class: 'dl-chart tall', 'aria-label': 'Skin cross-section with peptide concentration by depth' });
  const pick = el('div', { class: 'dl-chips small' });
  const hours = el('input', { type: 'range', min: '0', max: '100', value: '62', 'aria-label': 'Time since applying' });
  const readout = el('p', { class: 'dl-mono' });
  const where = el('p', { class: 'dl-note' });
  const renderPick = () => pick.replaceChildren(...SKIN_PEPTIDES.map((p) => el('button', { class: 'dl-chip', type: 'button', 'aria-pressed': String(p.id === ctx.peptide), text: p.name, onclick: () => ctx.pick(p.id) })));
  // Time slider on a log scale: 6 minutes to 7 days.
  const tHours = () => 0.1 * 10 ** ((Number(hours.value) / 100) * Math.log10(168 / 0.1));
  const draw = (t) => {
    const p = peptideById(ctx.peptide);
    const mw = mwOf(p);
    const T = tHours();
    const box = canvas.getBoundingClientRect();
    const W = Math.max(260, box.width || 320);
    const H = Math.max(200, box.height || 240);
    const g = sizeCanvas(canvas, W, H);
    // Depth axis is piecewise: the stratum corneum gets a third of the
    // height so its 15 µm can be seen at all next to the dermis.
    const bands = [
      { layer: LAYERS[0], y0: 0, y1: 0.3 },
      { layer: LAYERS[1], y0: 0.3, y1: 0.52 },
      { layer: LAYERS[2], y0: 0.52, y1: 0.86 },
      { layer: LAYERS[3], y0: 0.86, y1: 1 },
    ];
    const toY = (um) => {
      for (const b of bands) if (um <= b.layer.to) return H * (b.y0 + (b.y1 - b.y0) * ((um - b.layer.from) / (b.layer.to - b.layer.from)));
      return H;
    };
    const colours = ['rgba(255,200,170,0.32)', 'rgba(255,95,168,0.24)', 'rgba(255,150,120,0.16)', 'rgba(200,60,80,0.18)'];
    bands.forEach((b, i) => {
      g.fillStyle = colours[i];
      g.fillRect(0, H * b.y0, W, H * (b.y1 - b.y0));
      g.fillStyle = DIM;
      g.font = '600 10px ui-monospace, Menlo, monospace';
      g.textAlign = 'right';
      g.fillText(`${b.layer.name.toUpperCase()} · ${b.layer.from}–${b.layer.to} µm`, W - 6, H * b.y0 + 13);
    });
    // Collagen fibres in the dermis.
    g.strokeStyle = 'rgba(56,225,255,0.35)';
    g.lineWidth = 1;
    for (let k = 0; k < 9; k += 1) {
      g.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const y = H * (0.56 + k * 0.032) + Math.sin(x / 26 + k * 1.7 + t * 0.4) * 4;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    // The concentration profile C/C0 = erfc(x / 2√(Dt)), as a glow and a line.
    const target = LAYERS.find((l) => l.id === p.target);
    g.beginPath();
    for (let py = 0; py <= H; py += 2) {
      let um = 0;
      for (const b of bands) if (py / H <= b.y1) { um = b.layer.from + ((py / H - b.y0) / (b.y1 - b.y0)) * (b.layer.to - b.layer.from); break; }
      const c = concentration(mw, um, T);
      const x = 24 + c * (W * 0.55);
      if (py === 0) g.moveTo(x, py); else g.lineTo(x, py);
      if (c > 0.01) {
        g.fillStyle = `rgba(240,183,90,${0.5 * c})`;
        g.fillRect(0, py, W, 2);
      }
    }
    g.strokeStyle = GOLD;
    g.lineWidth = 2;
    g.stroke();
    g.lineWidth = 1;
    g.fillStyle = GOLD;
    g.font = '600 10px ui-monospace, Menlo, monospace';
    g.textAlign = 'left';
    g.fillText('C/C₀ →', 24, H - 6);
    g.fillText('0', 20, 11);
    g.fillText('1', 24 + W * 0.55 - 3, 11);
    // Molecules: each dot sits at the depth where C/C₀ has fallen to its
    // level u, x = 2√(Dt)·erfc⁻¹(u), so they crowd where the drug is.
    const delta = reach(mw, T);
    for (let k = 0; k < 70; k += 1) {
      const u = 0.004 + 0.992 * ((k * 0.6180339887) % 1);
      const um = Math.min(LAYERS[3].to, delta * erfcInv(u));
      const y = toY(um);
      const x = ((k * 97.13) % 1000) / 1000 * W;
      g.fillStyle = um < SC_UM ? GOLD : PINK;
      g.beginPath();
      g.arc(x, y + Math.sin(t * 2 + k) * 1.2, 2.2, 0, Math.PI * 2);
      g.fill();
    }
    // Where it is supposed to act.
    const ty = toY((target.from + Math.min(target.to, target.from + 200)) / 2);
    g.strokeStyle = CYAN;
    g.setLineDash([4, 4]);
    g.strokeRect(10, ty - 12, W - 20, 24);
    g.setLineDash([]);
    g.fillStyle = CYAN;
    g.textAlign = 'left';
    g.font = '700 11px system-ui, sans-serif';
    g.fillText(`${p.name} target: ${target.name.toLowerCase()}`, 16, ty + 4);
    const r = reach(mw, T);
    const atTarget = concentration(mw, target.from, T);
    const hr = T < 1 ? `${Math.round(T * 60)} min` : T < 48 ? `${T.toFixed(1)} h` : `${(T / 24).toFixed(1)} days`;
    readout.textContent = `Gold line: concentration C/C₀ by depth. ${p.name}: MW ${mw.toFixed(1)} Da · after ${hr}: typical reach 2√(Dt) = ${r < 0.1 ? r.toExponential(1) : r.toFixed(2)} µm · C/C₀ at the ${target.name.toLowerCase()} = ${atTarget < 1e-4 ? atTarget.toExponential(1) : atTarget.toFixed(4)} · lag time across the barrier ${fmtHours(lagTime(mw))}`;
    where.textContent = p.target === 'muscle'
      ? `${p.name} is meant to act on the nerve–muscle junction, under the whole skin. On passive diffusion alone almost none would arrive; real formulations, hair follicles and a damaged barrier offer shortcuts, which is why only trials can say if it works.`
      : `${p.name} is meant to signal fibroblasts in the dermis. ${mwOf(p) < 500 ? 'Under 500 Da, it is small enough to cross the barrier slowly on its own.' : 'Over 500 Da, it needs help from its formulation to get through.'}`;
  };
  ctx.drawLayers = draw;
  ctx.renderLayersPick = renderPick;
  hours.addEventListener('input', () => draw(performance.now() / 1000));
  renderPick();
  return [
    el('h2', { text: 'How far does it get?' }),
    pick,
    canvas,
    el('label', { class: 'dl-slider' }, [el('span', { text: 'Time on skin: 6 min → 7 days (log scale)' }), hours]),
    readout,
    where,
    el('p', { class: 'dl-cite', text: 'Model: C/C₀ = erfc(x / 2√(Dt)), with D from the size term of Potts & Guy (Pharm Res 1992) and a 15 µm stratum corneum. A teaching model fitted to small molecules — formulation changes everything.' }),
  ];
}

function fmtHours(h) {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  if (h < 24 * 365) return `${(h / 24).toFixed(0)} days`;
  return `${(h / 24 / 365).toFixed(1)} years`;
}

function penetrationPanel(ctx) {
  const canvas = el('canvas', { class: 'dl-chart', 'aria-label': 'Permeability against molecular weight' });
  const logP = el('input', { type: 'range', min: '-5', max: '5', step: '0.5', value: '0', 'aria-label': 'Lipophilicity, log P' });
  const lpOut = el('b', { text: 'log P = 0' });
  const table = el('table', { class: 'dl-table' });
  const draw = () => {
    const lp = Number(logP.value);
    lpOut.textContent = `log P = ${lp > 0 ? '+' : ''}${lp}`;
    const box = canvas.getBoundingClientRect();
    const W = Math.max(260, box.width || 320);
    const H = Math.max(170, box.height || 200);
    const g = sizeCanvas(canvas, W, H);
    const x0 = 34;
    const x1 = W - 10;
    const y0 = 10;
    const y1 = H - 24;
    const X = (mw) => x0 + ((mw - 200) / (1200 - 200)) * (x1 - x0);
    const Y = (lk) => y0 + ((-1 - lk) / (-1 + 12)) * (y1 - y0);
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.fillStyle = DIM;
    g.font = '10px ui-monospace, Menlo, monospace';
    for (let lk = -2; lk >= -12; lk -= 2) {
      g.beginPath(); g.moveTo(x0, Y(lk)); g.lineTo(x1, Y(lk)); g.stroke();
      g.textAlign = 'right'; g.fillText(String(lk), x0 - 4, Y(lk) + 3);
    }
    for (let mw = 200; mw <= 1200; mw += 200) { g.textAlign = 'center'; g.fillText(String(mw), X(mw), H - 8); }
    // The 500 Dalton rule.
    g.strokeStyle = PINK;
    g.setLineDash([5, 4]);
    g.beginPath(); g.moveTo(X(500), y0); g.lineTo(X(500), y1); g.stroke();
    g.setLineDash([]);
    g.fillStyle = PINK;
    g.textAlign = 'left';
    g.fillText('500 Da rule', X(500) + 4, y0 + 10);
    // Potts–Guy line at the chosen log P.
    g.strokeStyle = CYAN;
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(X(200), Y(logKp(200, lp))); g.lineTo(X(1200), Y(logKp(1200, lp))); g.stroke();
    g.lineWidth = 1;
    // Each peptide at its own estimated log P (dot) and on the line (ring).
    const labelled = [];
    for (const p of SKIN_PEPTIDES) {
      const mw = mwOf(p);
      // Two peptides of nearly the same size: put the second label below.
      const below = labelled.some((m) => Math.abs(m - mw) < 60);
      labelled.push(mw);
      g.fillStyle = GOLD;
      g.beginPath(); g.arc(X(mw), Y(Math.max(-12, logKp(mw, p.logP))), 4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = TEXT;
      g.beginPath(); g.arc(X(mw), Y(Math.max(-12, logKp(mw, lp))), 3, 0, Math.PI * 2); g.stroke();
      g.fillStyle = TEXT;
      g.textAlign = 'center';
      g.fillText(p.name, X(mw), Y(Math.max(-12, logKp(mw, p.logP))) + (below ? 16 : -8));
    }
    g.save();
    g.translate(10, (y0 + y1) / 2);
    g.rotate(-Math.PI / 2);
    g.textAlign = 'center';
    g.fillStyle = DIM;
    g.fillText('log₁₀ Kp (cm/h)', 0, 0);
    g.restore();
    table.replaceChildren(
      el('tr', {}, ['Peptide', 'MW (Da)', 'log Kp*', 'Lag time', 'Reach in 8 h'].map((h) => el('th', { text: h }))),
      ...SKIN_PEPTIDES.map((p) => {
        const mw = mwOf(p);
        const r = reach(mw, 8);
        return el('tr', {}, [p.name, mw.toFixed(2), logKp(mw, p.logP).toFixed(2), fmtHours(lagTime(mw)), `${r < 0.1 ? r.toExponential(1) : r.toFixed(2)} µm`].map((v) => el('td', { text: v })));
      }),
    );
  };
  logP.addEventListener('input', draw);
  ctx.drawPenetration = draw;
  return [
    el('h2', { text: 'Size is destiny' }),
    el('p', { class: 'dl-mono', text: 'log₁₀ Kp = −2.72 + 0.71·log P − 0.0061·MW' }),
    el('p', { text: 'Kp is how fast a molecule crosses the barrier. Each extra 100 Da multiplies it by 10^−0.61 ≈ 0.25 — a quarter. Lipophilicity (log P) helps, which is why many cosmetic peptides wear a palmitoyl tail. Gold dots: each peptide at an estimated log P. Rings: all of them at the slider\'s log P.' }),
    canvas,
    el('label', { class: 'dl-slider' }, [lpOut, logP]),
    table,
    el('p', { class: 'dl-cite', text: '*At the estimated log P (illustrative; measured values for these peptides are scarce). MW computed from each formula with IUPAC atomic weights. Lag time h²/6D and reach 2√(Dt) use D from Potts–Guy\'s size term. Potts & Guy, Pharm Res 1992; Bos & Meinardi, Exp Dermatol 2000.' }),
  ];
}

function dossierPanel(ctx) {
  const cards = SKIN_PEPTIDES.map((p) => el('details', { class: 'dl-dossier', id: `dl-p-${p.id}` }, [
    el('summary', {}, [el('b', { text: p.name }), el('span', { text: p.inci }), gradeBadge(p.grade)]),
    el('div', { class: 'dl-rows' }, [
      ['Sequence', p.sequence], ['Formula', prettyFormula(p.formula)], ['Molecular weight', `${mwOf(p).toFixed(2)} Da`],
      ['Family', p.family], ['Acts in', LAYERS.find((l) => l.id === p.target).name],
    ].map(([k, v]) => el('div', { class: 'dl-row' }, [el('span', { text: k }), el('b', { text: v })]))),
    el('p', { text: p.mechanism }),
    el('p', { class: 'dl-note', text: `Evidence: ${p.evidence}` }),
    el('p', { class: 'dl-cant', text: `What it can't claim: ${p.cant}` }),
    el('small', { class: 'dl-cite', text: p.cite }),
    el('button', { class: 'dl-link small', type: 'button', text: 'Watch it in the skin →', onclick: () => { ctx.pick(p.id); ctx.goto(3); } }),
  ]));
  return [
    el('h2', { text: 'The peptides, honestly' }),
    el('p', { text: 'Cosmetic peptides fall into three families: signal peptides (ask fibroblasts for more matrix), carrier peptides (deliver copper), and neurotransmitter-inhibiting ones (try to quieten expression lines). Tap one to open its file.' }),
    ...cards,
    el('p', { class: 'dl-cite', text: 'Reviews: Gorouhi & Maibach, Int J Cosmet Sci 2009; Lupo & Cole, Dermatol Ther 2007; Schagen, Cosmetics 2017.' }),
  ];
}

function timePanel(ctx) {
  const canvas = el('canvas', { class: 'dl-chart', 'aria-label': 'Skin collagen against age' });
  const age = el('input', { type: 'range', min: '20', max: '80', value: '40', 'aria-label': 'Age' });
  const out = el('p', { class: 'dl-mono' });
  const draw = () => {
    const a = Number(age.value);
    const box = canvas.getBoundingClientRect();
    const W = Math.max(260, box.width || 320);
    const H = Math.max(150, box.height || 170);
    const g = sizeCanvas(canvas, W, H);
    const X = (yr) => 30 + ((yr - 20) / 60) * (W - 40);
    const Y = (share) => 10 + (1 - share) * (H - 34);
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.fillStyle = DIM;
    g.font = '10px ui-monospace, Menlo, monospace';
    for (const s of [1, 0.75, 0.5, 0.25]) { g.beginPath(); g.moveTo(30, Y(s)); g.lineTo(W - 10, Y(s)); g.stroke(); g.textAlign = 'right'; g.fillText(`${s * 100}%`, 27, Y(s) + 3); }
    for (let yr = 20; yr <= 80; yr += 10) { g.textAlign = 'center'; g.fillText(String(yr), X(yr), H - 8); }
    const grad = g.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, CYAN);
    grad.addColorStop(1, PINK);
    g.strokeStyle = grad;
    g.lineWidth = 2.5;
    g.beginPath();
    for (let yr = 20; yr <= 80; yr += 1) { const y = Y(collagenShare(yr)); if (yr === 20) g.moveTo(X(yr), y); else g.lineTo(X(yr), y); }
    g.stroke();
    g.fillStyle = GOLD;
    g.beginPath(); g.arc(X(a), Y(collagenShare(a)), 5, 0, Math.PI * 2); g.fill();
    out.textContent = `At ${a}: ≈${Math.round(collagenShare(a) * 100)}% of the skin collagen at 20 (1 − 0.01 × (${a} − 20)) — a straight-line approximation of Shuster 1975.`;
  };
  age.addEventListener('input', draw);
  ctx.drawTime = draw;
  return [
    el('h2', { text: 'Collagen, sun & time' }),
    canvas,
    el('label', { class: 'dl-slider' }, [el('span', { text: 'Age' }), age]),
    out,
    el('div', { class: 'dl-facts' }, AGEING_FACTS.map((f) => el('div', { class: 'dl-fact' }, [el('b', { text: f.value }), el('span', { text: f.label }), el('small', { text: f.cite })]))),
    el('p', { class: 'dl-note', text: 'The biggest lever is the least exciting: most visible facial ageing tracks sun exposure, and daily sunscreen measurably slowed it in a randomised trial. Peptides are, at best, a supporting act.' }),
  ];
}

function exitPanel(ctx) {
  const summary = el('div', { class: 'dl-summary' });
  ctx.renderSummary = () => {
    const ranked = rankConcerns([...ctx.chosen], ctx.entry.report?.flags || []);
    summary.replaceChildren(...(ranked.length ? ranked.map((id) => {
      const c = concernById(id);
      const best = solutionsFor(id)[0];
      const peptides = solutionsFor(id).filter((o) => o.kind === 'peptide');
      return el('div', { class: 'dl-sum' }, [
        el('b', { text: `${c.icon} ${c.name}` }),
        el('p', { text: `Best evidence: ${best.name} (${best.grade}).${peptides.length ? ` Peptides studied: ${peptides.map((p) => `${p.name.split(' (')[0]} (${p.grade})`).join(', ')}.` : ''}` }),
      ]);
    }) : [el('p', { text: 'No pain points picked — go back to panel 2.' })]));
  };
  ctx.renderSummary();
  return [
    el('h2', { text: 'Your summary' }),
    summary,
    el('p', { class: 'dl-note', text: 'Educational, not medical advice. Anything that changes, bleeds, itches or worries you is for a dermatologist, not a camera.' }),
    el('div', { class: 'dl-actions' }, [
      el('button', { class: 'dl-btn', type: 'button', text: '↺ Scan again', onclick: () => ctx.rescan() }),
      el('button', { class: 'dl-btn ghost', type: 'button', text: '← Back to the chamber', onclick: () => ctx.exit() }),
    ]),
  ];
}

const BUILDERS = { report: reportPanel, pain: painPanel, solutions: solutionsPanel, layers: layersPanel, penetration: penetrationPanel, dossier: dossierPanel, time: timePanel, exit: exitPanel };

/* ------------------------------------------------------------- the room */

export class DermalLab {
  constructor({ say, stop, reduced, onClose, onRescan }) {
    Object.assign(this, { sayHook: say, stop, reduced, onClose, onRescan });
    this.root = null;
  }

  /**
   * Open the room.
   *
   * @param {{ report: object|null, snapshot: HTMLCanvasElement|null, via: string }} entry How they got in.
   */
  open(entry) {
    if (this.root) return;
    const ctx = {
      entry,
      chosen: new Set(),
      current: null,
      peptide: 'ghkcu',
      goto: (i) => this.goto(i),
      focus: (id) => { ctx.current = id; ctx.renderSolutions?.(); },
      pick: (id) => { ctx.peptide = id; ctx.renderLayersPick?.(); ctx.drawLayers?.(performance.now() / 1000); },
      onChosen: () => { ctx.renderSolutions?.(); ctx.renderSummary?.(); },
      rescan: () => { this.close(); this.onRescan?.(); },
      exit: () => this.close(),
    };
    this.ctx = ctx;
    this.panel = -1;
    const plates = el('div', { class: 'dl-plates' }, DERM_PANELS.map((p) => el('div', { class: 'dl-plate', 'data-src': DERM_PLATES[p.plate] })));
    const track = el('main', { class: 'dl-track', 'aria-label': 'Dermal technologies' });
    const dots = el('nav', { class: 'dl-dots', 'aria-label': 'Sections' });
    const caption = el('p', { class: 'dl-caption', 'aria-live': 'polite' });
    DERM_PANELS.forEach((p, i) => {
      track.append(el('section', { class: 'dl-sec', 'data-i': String(i) }, [
        el('div', { class: 'dl-card' }, [el('p', { class: 'dl-kicker', text: p.kicker }), ...BUILDERS[p.id](ctx)]),
      ]));
      dots.append(el('button', { class: 'dot', type: 'button', 'aria-label': p.kicker, title: p.kicker, onclick: () => this.goto(i) }));
    });
    this.root = el('div', { class: 'dermlab', role: 'dialog', 'aria-label': 'COLIN Dermal Technologies' }, [
      plates,
      el('div', { class: 'dl-doors', 'aria-hidden': 'true' }, [el('i'), el('i')]),
      el('div', { class: 'dl-vignette' }),
      el('header', { class: 'dl-hud' }, [
        el('span', { class: 'dl-brand' }, [el('b', { text: 'COLIN' }), ' DERMAL TECHNOLOGIES']),
        el('span', { class: 'dl-meta', text: entry.report ? `SCAN ${entry.report.quality.confidence.toUpperCase()} · ${new Date().toLocaleDateString()}` : 'ENTRY BY QUESTIONNAIRE' }),
        el('button', { class: 'dl-leave', type: 'button', text: '← Chamber', onclick: () => this.close() }),
      ]),
      track,
      el('div', { class: 'dl-colin' }, [el('span', { class: 'dl-face-icon', 'aria-hidden': 'true' }), el('div', {}, [el('p', { class: 'dl-name', text: 'Colin · dermal guide' }), caption])]),
      el('button', { class: 'nav-arrow prev dl-prev', type: 'button', 'aria-label': 'Previous', text: '‹', onclick: () => this.goto(this.panel - 1) }),
      el('button', { class: 'nav-arrow next dl-next', type: 'button', 'aria-label': 'Next', text: '›', onclick: () => this.goto(this.panel + 1) }),
      dots,
      el('p', { class: 'dl-fine', text: 'Educational · not medical advice · no products or doses · camera analysed on-device' }),
    ]);
    document.body.append(this.root);
    document.body.classList.add('lab-open');
    Object.assign(this, { track, caption, plates: [...plates.children], dots: [...dots.children] });
    this.onScroll = () => {
      const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      if (i !== this.panel) this.arrive(i);
    };
    track.addEventListener('scroll', this.onScroll, { passive: true });
    this.onResize = () => this.redraw();
    addEventListener('resize', this.onResize);
    this.onKey = (e) => {
      if (e.key === 'ArrowRight') this.goto(this.panel + 1);
      else if (e.key === 'ArrowLeft') this.goto(this.panel - 1);
      else if (e.key === 'Escape') this.close();
    };
    addEventListener('keydown', this.onKey);
    requestAnimationFrame(() => this.root?.classList.add('on'));
    this.arrive(0);
    // Only the layers panel animates; it runs only while it is on screen.
    const loop = (now) => {
      if (!this.root) return;
      this.raf = requestAnimationFrame(loop);
      if (this.panel === 3 && !this.reduced && now - (this.last || 0) > 50) { this.last = now; ctx.drawLayers(now / 1000); }
    };
    this.raf = requestAnimationFrame(loop);
  }

  say(text) {
    if (this.caption) this.caption.textContent = text;
    this.sayHook?.(text);
  }

  goto(i) {
    const k = Math.max(0, Math.min(DERM_PANELS.length - 1, i));
    this.track.scrollTo({ left: k * this.track.clientWidth, behavior: this.reduced ? 'auto' : 'smooth' });
    setTimeout(() => {
      if (this.root && this.panel !== k) {
        this.track.style.scrollBehavior = 'auto';
        this.track.scrollLeft = k * this.track.clientWidth;
        this.track.style.scrollBehavior = '';
        this.arrive(k);
      }
    }, 1200);
  }

  arrive(i) {
    this.panel = i;
    this.plates.forEach((p, k) => {
      p.classList.toggle('on', k === i);
      const want = Math.abs(k - i) <= (LITE ? 0 : 1) ? `url("${p.dataset.src}")` : 'none';
      if (p.style.backgroundImage !== want) p.style.backgroundImage = want;
    });
    this.dots.forEach((d, k) => d.classList.toggle('on', k === i));
    this.redraw();
    clearTimeout(this.sayTimer);
    this.sayTimer = setTimeout(() => this.say(DERM_PANELS[i].colin), 350);
  }

  redraw() {
    const c = this.ctx;
    if (!c) return;
    if (this.panel === 3) c.drawLayers(performance.now() / 1000);
    if (this.panel === 4) c.drawPenetration();
    if (this.panel === 6) c.drawTime();
  }

  close() {
    if (!this.root) return;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.sayTimer);
    removeEventListener('resize', this.onResize);
    removeEventListener('keydown', this.onKey);
    this.stop?.();
    this.root.remove();
    this.root = null;
    this.ctx = null;
    document.body.classList.remove('lab-open');
    this.onClose?.();
  }
}

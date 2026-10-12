/**
 * Living pictures: the user's key art for five stations, made animated and
 * interactive inside each station's card.
 *
 * Each picture sits in a stage that drifts with a finger, the mouse or the
 * phone's tilt, under an SVG layer of moving light — lasers, scan beams,
 * pulsing organs, flowing threads, floating orbs — and a set of tap-points
 * placed on the things drawn in the picture. Tapping one drives the station's
 * real tool: a caption bubble is fact-checked, an organ lists the compounds
 * studied there, a glass dome loads a compound on to the balance, a peptide
 * plate lights its threads, an orb gives that reviewer the floor.
 *
 * Where a picture prints numbers of its own (confidence 60.2%, 98% optimal),
 * the scene lays the library's live figures over them, or says plainly that
 * the picture is an illustration.
 *
 * @module astra/showcase/scenes
 */

import { PEPTIDES } from '../js/data/peptides.js';
import { REVIEWERS } from '../js/reviewers.js';
import { READINGS, SUBJECTS } from './sections.js';
import { el, fill } from './cards.js';
import { CAPTIONS, SYSTEM_LABEL, compoundsFor } from './wing.js';
import { gavelSound } from './cards3.js';

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};
const pct = (n) => `${Math.round(n * 100)}%`;
const reading = (id) => READINGS.find((r) => r.id === id);
const nameOf = (id) => SUBJECTS.find((s) => s.id === id)?.name || id;

/* ------------------------------------------------------------ the scenes */

/** Captions written in the influencer picture's speech bubbles. */
export const PICTURE_CAPTIONS = [
  'Just vibing on this cliff! SAFE & NATURAL!',
  'This product healed my acne in 24h!!! #miracle #ad',
  'Only 100 left!! Buy now link in bio!!! #miracle #ad',
];

/**
 * Scene definitions. Positions are fractions of the picture's width (x) and
 * height (y), read off the artwork.
 */
export const SCENES = {
  roast: {
    plate: 'influencer', size: [1952, 1280],
    note: 'Tap a caption bubble to put it on trial, the gavel for the verdict, or the influencer for another post.',
    spots: [
      { id: 'cap0', x: 0.19, y: 0.63, label: 'Caption: “SAFE & NATURAL!”' },
      { id: 'cap1', x: 0.535, y: 0.645, label: 'Caption: “healed my acne in 24h”' },
      { id: 'cap2', x: 0.845, y: 0.45, label: 'Caption: “Only 100 left!!”' },
      { id: 'gavel', x: 0.41, y: 0.45, label: 'Judge Colin’s gavel — the verdict' },
      { id: 'influencer', x: 0.735, y: 0.72, label: 'The influencer — another post' },
    ],
  },
  scan: {
    plate: 'holoscan', size: [1280, 1920],
    note: 'Tap an organ or a panel. An illustration — it is not scanning you.',
    spots: [
      { id: 'nervous', x: 0.5, y: 0.148, label: 'Brain — nervous system' },
      { id: 'endocrine', x: 0.5, y: 0.222, label: 'Neck glands — endocrine' },
      { id: 'cardiovascular', x: 0.525, y: 0.29, label: 'Heart — cardiovascular' },
      { id: 'immune', x: 0.4, y: 0.27, label: 'Lymph nodes — immune' },
      { id: 'metabolic', x: 0.44, y: 0.39, label: 'Liver and fat — metabolic' },
      { id: 'gastrointestinal', x: 0.52, y: 0.45, label: 'Gut — gastrointestinal' },
      { id: 'musculoskeletal', x: 0.43, y: 0.65, label: 'Knee — musculoskeletal' },
      { id: 'musculoskeletal', x: 0.574, y: 0.65, label: 'Knee — musculoskeletal', key: 'knee2' },
      { id: 'integumentary', x: 0.335, y: 0.53, label: 'Hand — skin', key: 'hand' },
      { id: 'nervous', x: 0.15, y: 0.395, label: 'Neural activity panel', key: 'p1' },
      { id: 'cardiovascular', x: 0.15, y: 0.448, label: 'Cardio panel', key: 'p2' },
      { id: 'gastrointestinal', x: 0.15, y: 0.502, label: 'Digestive panel', key: 'p3' },
      { id: 'musculoskeletal', x: 0.845, y: 0.403, label: 'Skeletal and joint panel', key: 'p4' },
    ],
  },
  compare: {
    plate: 'comparison', size: [1440, 960],
    note: 'Tap a glass dome to load another compound, the pivot to swap, the result panel for the verdict.',
    spots: [
      { id: 'left', x: 0.274, y: 0.31, label: 'Left dome — next compound' },
      { id: 'right', x: 0.753, y: 0.42, label: 'Right dome — next compound' },
      { id: 'pivot', x: 0.505, y: 0.36, label: 'Pivot — swap the pans' },
      { id: 'result', x: 0.5, y: 0.9, label: 'Comparison result — the verdict' },
    ],
  },
  map: {
    plate: 'showmap', size: [1920, 1280],
    note: 'Tap a peptide to light its threads, or a body system to see what touches it.',
    spots: [
      { id: 'semaglutide', x: 0.5, y: 0.184, kind: 'peptide' },
      { id: 'retatrutide', x: 0.755, y: 0.27, kind: 'peptide' },
      { id: 'tirzepatide', x: 0.862, y: 0.437, kind: 'peptide' },
      { id: 'tesamorelin', x: 0.852, y: 0.6, kind: 'peptide' },
      { id: 'ghk-cu', x: 0.734, y: 0.78, kind: 'peptide' },
      { id: 'selank', x: 0.5, y: 0.867, kind: 'peptide' },
      { id: 'semax', x: 0.268, y: 0.78, kind: 'peptide' },
      { id: 'cjc-1295', x: 0.159, y: 0.65, kind: 'peptide' },
      { id: 'ipamorelin', x: 0.133, y: 0.515, kind: 'peptide' },
      { id: 'bpc-157', x: 0.161, y: 0.375, kind: 'peptide' },
      { id: 'kpv', x: 0.26, y: 0.25, kind: 'peptide' },
      { id: 'nervous', x: 0.5, y: 0.3, kind: 'system', label: 'Neuro / nervous system' },
      { id: 'endocrine', x: 0.614, y: 0.333, kind: 'system', label: 'Endocrine / metabolic' },
      { id: 'cardiovascular', x: 0.672, y: 0.47, kind: 'system', label: 'Cardiovascular' },
      { id: 'respiratory', x: 0.661, y: 0.594, kind: 'system', label: 'Respiratory' },
      { id: 'renal', x: 0.578, y: 0.688, kind: 'system', label: 'Renal / kidney' },
      { id: 'hepatic', x: 0.5, y: 0.703, kind: 'system', label: 'Hepatic / liver' },
      { id: 'immune', x: 0.414, y: 0.688, kind: 'system', label: 'Immune / lymphatic' },
      { id: 'gastrointestinal', x: 0.339, y: 0.594, kind: 'system', label: 'Digestive / GI' },
      { id: 'integumentary', x: 0.328, y: 0.47, kind: 'system', label: 'Skin' },
      { id: 'musculoskeletal', x: 0.396, y: 0.336, kind: 'system', label: 'Connective tissue' },
    ],
  },
  debate: {
    plate: 'debateroom', size: [2240, 1120],
    note: 'Tap an orb or a chair to give that reviewer the floor, the diamond for the verdict, the brain for a new subject, the podium to hear them all.',
    spots: [
      { id: 'r0', x: 0.325, y: 0.48, label: REVIEWERS[0].name, k: 0 },
      { id: 'r1', x: 0.42, y: 0.33, label: REVIEWERS[1].name, k: 1 },
      { id: 'r2', x: 0.57, y: 0.64, label: REVIEWERS[2].name, k: 2 },
      { id: 'r3', x: 0.7, y: 0.5, label: REVIEWERS[3].name, k: 3 },
      { id: 'c0', x: 0.145, y: 0.78, label: `${REVIEWERS[0].name}’s chair`, k: 0 },
      { id: 'c1', x: 0.27, y: 0.69, label: `${REVIEWERS[1].name}’s chair`, k: 1 },
      { id: 'c2', x: 0.725, y: 0.69, label: `${REVIEWERS[2].name}’s chair`, k: 2 },
      { id: 'c3', x: 0.88, y: 0.78, label: `${REVIEWERS[3].name}’s chair`, k: 3 },
      { id: 'diamond', x: 0.5, y: 0.53, label: 'The diamond — the panel’s verdict' },
      { id: 'brain', x: 0.61, y: 0.25, label: 'The brain — a new subject' },
      { id: 'podium', x: 0.5, y: 0.77, label: 'The podium — Colin reads the whole debate' },
    ],
  },
};

/** Systems drawn on the map's ring that the library does not cover. */
const UNCOVERED = new Set(['respiratory', 'renal', 'hepatic']);

/* -------------------------------------------------------------- effects */

/** Moving light for each scene. Returns per-frame `update(state)`. */
const FX = {
  roast(layer, W, H, scene) {
    // Marquee bulbs round the sign, blinking in a chase.
    const bulbs = svg('g', { class: 'fx-bulbs' });
    const [x0, x1, y0, y1] = [0.245 * W, 0.735 * W, 0.135 * H, 0.235 * H];
    let n = 0;
    for (let x = x0; x <= x1; x += 22) { bulbs.append(svg('circle', { cx: x, cy: y0, r: 3.2, style: `--i:${n++}` })); bulbs.append(svg('circle', { cx: x, cy: y1, r: 3.2, style: `--i:${n++}` })); }
    layer.append(bulbs);
    // Two camera lasers that lock on to whichever caption is on trial.
    const cams = [[0.105 * W, 0.51 * H], [0.917 * W, 0.31 * H]];
    const lasers = cams.map(([x, y]) => { const l = svg('line', { class: 'fx-laser', x1: x, y1: y, x2: x, y2: y }); layer.append(l); return l; });
    // The three "LINE — VERIFYING" boxes light as Colin reads each line.
    const boxes = [[0.36, 0.64, 0.155, 0.13], [0.285, 0.795, 0.19, 0.13], [0.546, 0.83, 0.165, 0.12]].map(([cx, cy, w, h]) => {
      const r = svg('rect', { class: 'fx-box', x: (cx - w / 2) * W, y: (cy - h / 2) * H, width: w * W, height: h * H, rx: 8 });
      layer.append(r);
      return r;
    });
    const sweep = svg('rect', { class: 'fx-sweep', x: 0, y: 0, width: 0.16 * W, height: 6, rx: 3 });
    layer.append(sweep);
    return (state, t) => {
      const target = scene.spots.find((s) => s.id === `cap${scene.active ?? -1}`);
      lasers.forEach((l) => {
        l.setAttribute('x2', target ? target.x * W : l.getAttribute('x1'));
        l.setAttribute('y2', target ? target.y * H : l.getAttribute('y1'));
        l.classList.toggle('on', Boolean(target));
      });
      boxes.forEach((b, i) => b.classList.toggle('on', state.roastLine === i || (state.roastLine === -1 && state.roast && i < Math.min(3, state.roast.lines.length) && scene.active != null)));
      if (target) {
        const k = (t * 0.9) % 1;
        sweep.setAttribute('x', target.x * W - 0.08 * W);
        sweep.setAttribute('y', (target.y - 0.06 + k * 0.12) * H);
      }
      sweep.style.opacity = target ? 1 : 0;
    };
  },

  scan(layer, W, H, scene) {
    // A scan beam sweeping head to toe over the figure.
    const beam = svg('rect', { class: 'fx-beam', x: 0.28 * W, y: 0.1 * H, width: 0.44 * W, height: 0.012 * H });
    layer.append(beam);
    // A pulse on every organ; the chosen system's pulses go bright.
    const rings = scene.spots.filter((s) => !s.key || s.key === 'knee2' || s.key === 'hand').map((s) => {
      const c = svg('circle', { class: 'fx-pulse', cx: s.x * W, cy: s.y * H, r: 0.035 * W, style: `--d:${(s.y * 3) % 1}` });
      layer.append(c);
      return { c, id: s.id };
    });
    return (state, t) => {
      const k = (t * 0.22) % 1;
      beam.setAttribute('y', (0.1 + k * 0.78) * H);
      rings.forEach(({ c, id }) => c.classList.toggle('on', state.scanSystem === id));
    };
  },

  compare(layer, W, H, scene, stage) {
    // The picture prints its own scores (60.2%, 78.4%); cover them with the
    // library's live figures for whatever is actually on each pan.
    const labels = [[0.278, 0.6], [0.728, 0.76]].map(([x, y]) => {
      const tag = el('div', { class: 'scene-label', style: `left:${x * 100}%;top:${y * 100}%` });
      stage.append(tag);
      return tag;
    });
    let lastKey = '';
    // A beam through the pivot that tilts towards the heavier evidence.
    const beam = svg('line', { class: 'fx-tilt', x1: 0.3 * W, y1: 0.36 * H, x2: 0.71 * W, y2: 0.36 * H });
    layer.append(beam);
    const glows = [[0.274, 0.31], [0.753, 0.42]].map(([x, y]) => { const g = svg('circle', { class: 'fx-dome', cx: x * W, cy: y * H, r: 0.11 * W }); layer.append(g); return g; });
    // Bubbles rising inside each dome.
    for (const [x, y] of [[0.274, 0.31], [0.753, 0.42]]) {
      for (let i = 0; i < 6; i += 1) layer.append(svg('circle', { class: 'fx-bubble', cx: (x - 0.05 + i * 0.02) * W, cy: (y + 0.08) * H, r: 2 + (i % 3), style: `--i:${i}` }));
    }
    let tilt = 0;
    return (state) => {
      const c = state.compare;
      const target = c ? Math.max(-1, Math.min(1, (c.right.score - c.left.score) * 2.5)) * 0.18 : 0;
      tilt += (target - tilt) * 0.08;
      const cx = 0.505 * W;
      const cy = 0.36 * H;
      const half = 0.205 * W;
      beam.setAttribute('x1', cx - Math.cos(tilt) * half); beam.setAttribute('y1', cy - Math.sin(tilt) * half);
      beam.setAttribute('x2', cx + Math.cos(tilt) * half); beam.setAttribute('y2', cy + Math.sin(tilt) * half);
      const winner = c ? (c.left.score > c.right.score ? 0 : c.right.score > c.left.score ? 1 : -1) : -1;
      glows.forEach((g, i) => g.classList.toggle('on', i === winner));
      const key = c ? `${c.left.name}|${c.right.name}|${winner}` : '';
      if (c && key !== lastKey) {
        lastKey = key;
        [c.left, c.right].forEach((side, i) => fill(labels[i], [
          el('b', { text: side.name }),
          el('span', { text: `Evidence ${pct(side.score)}` }),
          el('em', { class: i === winner ? 'up' : 'down', text: i === winner ? '▲ heavier' : winner === -1 ? '= level' : '▼ lighter' }),
        ]));
      }
    };
  },

  map(layer, W, H, scene) {
    // A golden thread from every plate to the core, with pulses flowing in.
    const cx = 0.5 * W;
    const cy = 0.5 * H;
    const threads = scene.spots.filter((s) => s.kind === 'peptide').map((s) => {
      const mx = (s.x * W + cx) / 2 + (s.y - 0.5) * 60;
      const my = (s.y * H + cy) / 2 - (s.x - 0.5) * 60;
      const p = svg('path', { class: 'fx-thread', d: `M${s.x * W},${s.y * H} Q${mx},${my} ${cx},${cy}`, style: `--i:${s.x + s.y}` });
      layer.append(p);
      return { p, id: s.id };
    });
    // Links from the chosen peptide to each system it touches.
    const links = svg('g', { class: 'fx-links' });
    layer.append(links);
    const core = svg('circle', { class: 'fx-core', cx, cy, r: 0.07 * W });
    layer.append(core);
    let shown = null;
    return (state) => {
      const id = scene.active;
      threads.forEach(({ p, id: pid }) => p.classList.toggle('on', pid === id));
      if (id !== shown) {
        shown = id;
        links.replaceChildren();
        const peptide = PEPTIDES.find((p) => p.id === id);
        const from = scene.spots.find((s) => s.id === id && s.kind === 'peptide');
        if (peptide && from) {
          for (const sys of peptide.systems) {
            const to = scene.spots.find((s) => s.kind === 'system' && (s.id === sys || (sys === 'metabolic' && s.id === 'endocrine')));
            if (to) links.append(svg('line', { class: 'fx-link', x1: from.x * W, y1: from.y * H, x2: to.x * W, y2: to.y * H }));
          }
        }
      }
    };
  },

  debate(layer, W, H, scene) {
    // Each reviewer's orb floats; the one with the floor gets a ring and a
    // beam to the diamond.
    const orbs = scene.spots.filter((s) => s.id.startsWith('r')).map((s) => {
      const g = svg('g', { class: 'fx-orb', style: `--i:${s.k}` });
      g.append(svg('circle', { cx: s.x * W, cy: s.y * H, r: 0.045 * W, fill: REVIEWERS[s.k].accent }));
      const ring = svg('circle', { class: 'fx-ring', cx: s.x * W, cy: s.y * H, r: 0.058 * W, stroke: REVIEWERS[s.k].accent });
      g.append(ring);
      layer.append(g);
      const beam = svg('line', { class: 'fx-floor', x1: s.x * W, y1: s.y * H, x2: 0.5 * W, y2: 0.53 * H, stroke: REVIEWERS[s.k].accent });
      layer.append(beam);
      return { g, beam, k: s.k };
    });
    for (let i = 0; i < 24; i += 1) layer.append(svg('circle', { class: 'fx-spark', cx: (0.3 + ((i * 37) % 40) / 100) * W, cy: (0.15 + ((i * 53) % 60) / 100) * H, r: 1.6, style: `--i:${i}` }));
    layer.append(svg('rect', { class: 'fx-rays', x: 0.42 * W, y: 0, width: 0.16 * W, height: 0.7 * H }));
    return (state) => {
      const k = state.debate?.speaker ?? -1;
      orbs.forEach((o) => { o.g.classList.toggle('on', o.k === k); o.beam.classList.toggle('on', o.k === k); });
    };
  },
};

/* --------------------------------------------------------------- actions */

function act(id, spot, scene, ctx) {
  const { state, api, hooks, out } = ctx;
  const tell = (title, text) => fill(out, [el('b', { text: title }), text ? document.createTextNode(` — ${text}`) : null]);
  switch (id) {
    case 'roast': {
      if (spot.id.startsWith('cap')) {
        scene.active = Number(spot.id.slice(3));
        api.roast?.(PICTURE_CAPTIONS[scene.active]);
        tell(`On trial: “${PICTURE_CAPTIONS[scene.active]}”`, 'Colin reads it, then checks it line by line.');
      } else if (spot.id === 'gavel') {
        gavelSound(0);
        const r = state.roast;
        if (r) { tell(`Honesty score ${r.score}/100`, r.score > 70 ? 'respectable' : r.score > 40 ? 'could do better' : 'dear oh dear'); hooks.say(`Honesty score: ${r.score} out of 100. ${r.score > 70 ? 'Respectable.' : r.score > 40 ? 'Could do better.' : 'Dear oh dear.'}`); }
        else tell('Order!', 'put a caption on trial first.');
      } else {
        const caption = CAPTIONS[(scene.influencer = ((scene.influencer ?? -1) + 1) % CAPTIONS.length)];
        scene.active = null;
        api.roast?.(caption);
        tell('The influencer posts again', caption);
      }
      break;
    }
    case 'scan': {
      api.scan?.(spot.id);
      const list = compoundsFor(spot.id);
      tell(SYSTEM_LABEL[spot.id] || spot.id, list.length ? `${list.length} compound${list.length > 1 ? 's' : ''} studied here: ${list.slice(0, 4).map((r) => `${r.name} ${pct(r.score)}`).join(', ')}` : 'no compound in the library targets this system.');
      break;
    }
    case 'compare': {
      const [l, r] = api.compareSides?.() || ['bpc-157', 'semaglutide'];
      const peptides = PEPTIDES.map((p) => p.id);
      const next = (cur, avoid) => { let i = peptides.indexOf(cur); do { i = (i + 1) % peptides.length; } while (peptides[i] === avoid); return peptides[i]; };
      if (spot.id === 'left') api.compare?.(next(l, r), r);
      else if (spot.id === 'right') api.compare?.(l, next(r, l));
      else if (spot.id === 'pivot') api.compare?.(r, l);
      const v = state.compareResult?.verdict;
      if (spot.id === 'result' && v) hooks.say(v.headline);
      if (v) tell(v.headline, 'evidence weight, not effect size.');
      break;
    }
    case 'map': {
      if (spot.kind === 'peptide') {
        scene.active = spot.id;
        api.map?.(spot.id);
        const r = reading(spot.id);
        const p = PEPTIDES.find((x) => x.id === spot.id);
        tell(`${nameOf(spot.id)} · ${pct(r.score)} ${r.band.label}`, `touches ${p.systems.map((s) => SYSTEM_LABEL[s] || s).join(', ')}.`);
      } else if (UNCOVERED.has(spot.id)) {
        tell(spot.label, 'no compound in the graded library targets this system. The map shows the gap rather than hiding it.');
      } else {
        const ids = spot.id === 'endocrine' ? ['endocrine', 'metabolic'] : [spot.id];
        const list = [...new Map(ids.flatMap(compoundsFor).map((r) => [r.id, r])).values()];
        tell(spot.label, `${list.map((r) => `${r.name} ${pct(r.score)}`).join(', ')}.`);
      }
      break;
    }
    case 'debate': {
      if (spot.k !== undefined) {
        api.debateSpeak?.(spot.k);
        const o = state.debateResult?.opinions[spot.k];
        if (o) tell(`${o.reviewer.name} · ${o.position}`, o.reviewer.focus);
      } else if (spot.id === 'diamond') {
        api.debateVerdict?.();
        tell('The panel’s verdict', state.debateResult?.consensus.verdict);
      } else if (spot.id === 'brain') {
        const ids = PEPTIDES.map((p) => p.id);
        const next = ids[(ids.indexOf(api.debateSubject?.()) + 1) % ids.length];
        api.debate?.(next);
        tell(`New subject: ${nameOf(next)}`, 'the panel reconvenes.');
      } else {
        api.debateAloud?.();
        tell('Colin reads the whole debate', 'tap the podium again to stop.');
      }
      break;
    }
    default:
  }
}

/* ----------------------------------------------------------- the builder */

/**
 * Build a station's living picture.
 *
 * @param {string} id Station id.
 * @param {{ state: object, api: object, hooks: object, src: string }} ctx Wiring; `src` is the picture URL.
 * @returns {{ node: HTMLElement, update: Function }|null} The scene, or null if the station has none.
 */
export function buildScene(id, ctx) {
  const scene = SCENES[id];
  if (!scene) return null;
  const [w, h] = scene.size;
  const W = 1000;
  const H = (1000 * h) / w;
  const layer = svg('svg', { class: 'scene-fx', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const stage = el('div', { class: 'scene-stage' });
  const update = FX[id](layer, W, H, scene, stage);
  const out = el('p', { class: 'scene-out', 'aria-live': 'polite', text: scene.note });
  const spots = scene.spots.map((spot) => {
    const label = spot.label || (spot.kind === 'peptide' ? `${nameOf(spot.id)} — light its threads` : spot.id);
    return el('button', {
      class: `scene-spot${spot.kind === 'system' ? ' small' : ''}`, type: 'button', 'aria-label': label, title: label,
      style: `left:${(spot.x * 100).toFixed(2)}%;top:${(spot.y * 100).toFixed(2)}%`,
      onclick: (e) => { e.stopPropagation(); act(id, spot, scene, { ...ctx, out }); },
    }, [el('span', { class: 'scene-tip', text: label })]);
  });
  stage.prepend(el('div', { class: 'scene-img', 'data-src': ctx.src }), layer);
  stage.append(...spots);
  const node = el('figure', { class: `scene scene-${id}`, style: `--ar:${(w / h).toFixed(4)}` }, [
    el('div', { class: 'scene-frame' }, [stage]),
    out,
  ]);
  return {
    node,
    update(state, t) {
      node.style.setProperty('--lx', state.lookX.toFixed(3));
      node.style.setProperty('--ly', state.lookY.toFixed(3));
      update(state, t);
    },
  };
}

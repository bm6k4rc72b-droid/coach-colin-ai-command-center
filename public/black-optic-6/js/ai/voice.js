/**
 * Voice commands for the rancher holding the phone: "Show me all horses near
 * the north gate." Speech is transcribed on the device (Moonshine or Whisper
 * through transformers.js); this module turns the words into something the
 * detectors can run, and filters what they find by where it is.
 *
 * The grammar is deliberately small and predictable — a radio-style command
 * set, not a chatbot:
 *
 *   show | find | where are | highlight   X [relation Y]
 *   count | how many                      X [relation Y]
 *   lock (on) | track | follow            X
 *   describe | what do you see | what's happening
 *   stop | cancel | clear
 *
 * relations: near / by / next to / at / around, left of, right of, in front
 * of, behind / beyond, above / on, below / under.
 *
 * "near" is measured in the frame: a find is near the anchor when the gap
 * between their boxes is under one anchor-width (a gate-width from the gate),
 * or in metres on the ground plane when the camera is calibrated. A compass
 * word ("north gate") cannot be resolved from one camera's picture, so it is
 * kept as a name and reported, never silently invented.
 *
 * @module black-optic-6/ai/voice
 */

const IRREGULAR = Object.freeze({
  sheep: 'sheep', deer: 'deer', cattle: 'cow', cows: 'cow', oxen: 'ox', geese: 'goose', mice: 'mouse', men: 'man', women: 'woman',
  people: 'person', persons: 'person', children: 'child', wolves: 'wolf', calves: 'calf', knives: 'knife', ponies: 'pony', bison: 'bison',
  fish: 'fish', trucks: 'truck', horses: 'horse', boxes: 'box', buses: 'bus', fences: 'fence',
});

/** Singular of a noun (enough for ranch vocabulary). */
export function singular(word) {
  const w = String(word).toLowerCase();
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (/(ss|us|is)$/.test(w)) return w;
  if (/ies$/.test(w) && w.length > 4) return `${w.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w) && w.length > 3) return w.slice(0, -1);
  return w;
}

/** Singularise the head noun (last word) of a phrase. */
export function singularPhrase(phrase) {
  const words = phrase.trim().split(/\s+/);
  words[words.length - 1] = singular(words[words.length - 1]);
  return words.join(' ');
}

const RELATIONS = [
  ['near', /\b(?:near|by|next to|close to|around|at|beside)\b/],
  ['left', /\b(?:left of|to the left of)\b/],
  ['right', /\b(?:right of|to the right of)\b/],
  ['front', /\b(?:in front of)\b/],
  ['behind', /\b(?:behind|beyond|past)\b/],
  ['above', /\b(?:above|on top of|on)\b/],
  ['below', /\b(?:below|under|beneath)\b/],
];
const COMPASS = /\b(north|south|east|west|northeast|northwest|southeast|southwest|front|back|main|side|top|bottom)\b/;
const FILLER = /\b(?:me|all|the|any|every|of|some|please|a|an|my|our|there|that|those|these|is|are)\b/g;

function clean(phrase) {
  return phrase.replace(FILLER, ' ').replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Parse a transcript into a command.
 *
 * @param {string} text
 * @returns {{action: 'show'|'count'|'lock'|'describe'|'stop'|'unknown', target: string|null,
 *   relation: string|null, anchor: string|null, qualifier: string|null, text: string}}
 */
export function parseCommand(text) {
  const t = String(text ?? '').toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  const out = { action: 'unknown', target: null, relation: null, anchor: null, qualifier: null, text: t };
  if (!t) return out;
  if (/^(?:stop|cancel|clear|never ?mind|reset)\b/.test(t)) return { ...out, action: 'stop' };
  if (/\b(?:describe|what do you see|what(?:'s| is) (?:happening|going on|there)|tell me what)\b/.test(t)) return { ...out, action: 'describe' };
  let rest = null;
  let m;
  if ((m = /^(?:(?:hey|ok|okay)\s+\w+\s+)?(?:show(?: me)?|find|where (?:are|is)|highlight|look for|spot)\s+(.+)$/.exec(t))) { out.action = 'show'; rest = m[1]; }
  else if ((m = /^(?:count|how many)\s+(.+?)(?:\s+(?:are there|do you see|can you see))?$/.exec(t))) { out.action = 'count'; rest = m[1]; }
  else if ((m = /^(?:lock(?: on(?:to)?)?|track|follow|watch)\s+(.+)$/.exec(t))) { out.action = 'lock'; rest = m[1]; }
  if (!rest) return out;
  // Split "X <relation> Y" at the first relation word.
  let cut = null;
  for (const [name, re] of RELATIONS) {
    const r = re.exec(rest);
    if (r && (cut === null || r.index < cut.index)) cut = { name, index: r.index, len: r[0].length };
  }
  let target = rest; let anchor = null;
  if (cut) { target = rest.slice(0, cut.index); anchor = rest.slice(cut.index + cut.len); out.relation = cut.name; }
  target = clean(target);
  if (anchor !== null) {
    anchor = clean(anchor);
    const q = COMPASS.exec(anchor);
    if (q) { out.qualifier = q[1]; anchor = anchor.replace(COMPASS, ' ').replace(/\s+/g, ' ').trim(); }
    out.anchor = anchor ? singularPhrase(anchor) : null;
    if (!out.anchor) out.relation = null;
  }
  out.target = target ? singularPhrase(target) : null;
  if (!out.target) out.action = 'unknown';
  return out;
}

/** The NanoOWL tree prompt that finds a command's target (and its anchor, if any). */
export function treePromptFor(cmd) {
  const a = (w) => (/^[aeiou]/.test(w) ? `an ${w}` : `a ${w}`);
  const labels = [cmd.target, cmd.anchor].filter(Boolean).map(a);
  return `[${labels.join(', ')}]`;
}

const gap = (a, b) => {
  const dx = Math.max(0, Math.max(a[0], b[0]) - Math.min(a[0] + a[2], b[0] + b[2]));
  const dy = Math.max(0, Math.max(a[1], b[1]) - Math.min(a[1] + a[3], b[1] + b[3]));
  return Math.hypot(dx, dy);
};
const centre = (b) => [b[0] + b[2] / 2, b[1] + b[3] / 2];

/**
 * Keep the finds that satisfy the command's relation to its anchor.
 *
 * @param {{box: number[], cls: string, score: number}[]} dets Detections, cls matching the tree labels.
 * @param {object} cmd From parseCommand.
 * @param {object} [options]
 * @param {(box: number[]) => number[]|null} [options.ground] Box foot → ground metres [x, y], when calibrated.
 * @param {number} [options.nearMetres=10]
 * @returns {{kept: object[], anchors: object[], note: string}}
 */
export function applyRelation(dets, cmd, { ground = null, nearMetres = 10 } = {}) {
  const isTarget = (d) => d.cls.replace(/^an? /, '') === cmd.target;
  const targets = dets.filter(isTarget);
  if (!cmd.relation || !cmd.anchor) return { kept: targets, anchors: [], note: `${targets.length} ${cmd.target}${targets.length === 1 ? '' : 's'} in view.` };
  const anchors = dets.filter((d) => d.cls.replace(/^an? /, '') === cmd.anchor);
  const name = `${cmd.qualifier ? `${cmd.qualifier} ` : ''}${cmd.anchor}`;
  if (!anchors.length) return { kept: [], anchors, note: `No ${cmd.anchor} in view, so nothing can be "${cmd.relation}" it.` };
  const ok = (d) => anchors.some((g) => {
    const [dx, dy] = centre(d.box); const [gx, gy] = centre(g.box);
    switch (cmd.relation) {
      case 'near': {
        const a = ground?.(d.box); const b = ground?.(g.box);
        if (a && b) return Math.hypot(a[0] - b[0], a[1] - b[1]) <= nearMetres;
        return gap(d.box, g.box) <= Math.max(g.box[2], g.box[3]);
      }
      case 'left': return dx < g.box[0];
      case 'right': return dx > g.box[0] + g.box[2];
      case 'above': return dy < g.box[1];
      case 'below': return dy > g.box[1] + g.box[3];
      case 'front': return d.box[1] + d.box[3] > g.box[1] + g.box[3];
      case 'behind': return d.box[1] + d.box[3] < g.box[1] + g.box[3];
      default: return false;
    }
  });
  const kept = targets.filter(ok);
  let note = `${kept.length} of ${targets.length} ${cmd.target}${targets.length === 1 ? '' : 's'} ${cmd.relation === 'near' ? 'near' : cmd.relation} ${anchors.length > 1 ? `the ${anchors.length} ${cmd.anchor}s` : `the ${cmd.anchor}`}.`;
  if (cmd.qualifier) note += ` "${name}": one camera cannot tell ${cmd.qualifier} from the picture, so every ${cmd.anchor} in view counts.`;
  return { kept, anchors, note };
}

/**
 * Resample mono audio to 16 kHz (what Whisper and Moonshine expect), linear
 * interpolation.
 */
export function resampleTo16k(samples, rate) {
  if (rate === 16000) return Float32Array.from(samples);
  const n = Math.floor((samples.length * 16000) / rate);
  const out = new Float32Array(n);
  const k = rate / 16000;
  for (let i = 0; i < n; i += 1) {
    const x = i * k; const i0 = Math.floor(x); const i1 = Math.min(samples.length - 1, i0 + 1); const t = x - i0;
    out[i] = samples[i0] * (1 - t) + samples[i1] * t;
  }
  return out;
}

/** Florence-2 task tokens used by the console. */
export const FLORENCE_TASKS = Object.freeze({
  caption: '<CAPTION>', detailed: '<DETAILED_CAPTION>', more: '<MORE_DETAILED_CAPTION>', objects: '<OD>', ground: '<CAPTION_TO_PHRASE_GROUNDING>',
});

/**
 * Florence-2's post-processed boxes ({bboxes: [[x1, y1, x2, y2]], labels}) as
 * the console's detections ([x, y, w, h] in frame pixels). Captions have no
 * boxes and give [].
 *
 * @param {object} parsed The value of post_process_generation's result for the task.
 * @returns {{box: number[], cls: string, score: null}[]}
 */
export function florenceDets(parsed) {
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.bboxes)) return [];
  return parsed.bboxes.map((b, i) => ({
    box: [b[0], b[1], Math.max(0, b[2] - b[0]), Math.max(0, b[3] - b[1])],
    cls: String(parsed.labels?.[i] ?? '').replace(/<\/?s>/g, '').trim() || 'object',
    score: null, // Florence-2 generates boxes as text; it gives no confidence.
  }));
}

/** A task token plus its text input, the form Florence-2's processor expects. */
export function florencePrompt(task, phrase = '') {
  const token = FLORENCE_TASKS[task] ?? task;
  return token === FLORENCE_TASKS.ground ? `${token}${phrase.trim()}` : token;
}

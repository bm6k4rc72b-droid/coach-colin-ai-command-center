/**
 * THE HOLLYWOOD SECRET — the 72-Hour Deflate.
 *
 * A station in the chamber and a room behind it. Entry is a studio
 * security check: a digital fingerprint (press and hold) and one honest
 * question — why isn't the fat coming off? Then the film leader counts
 * down, the clapper snaps, the curtains part, and the visitor is on a
 * closed set: black and gold, marquee bulbs, sweeping spotlights,
 * letterbox bars and film grain, CLASSIFIED stamped over the call sheet.
 *
 * Inside, Colin plays casting director. He reads the visitor's answer back
 * to them as a diagnosis, walks the 72-hour call sheet from Coach Colin's
 * guide, and keeps asking the one question that matters — what are you
 * actually doing to get there? — then scores the plan against the seven
 * pillars precision coaching runs at once. The pitch for Coach Colin is
 * made from the visitor's own answers, and it stays honest: three days
 * move water, gas, transit and glycogen; fat moves over weeks.
 *
 * Educational. Nothing here is medical advice; the fingerprint is
 * simulated and nothing the visitor types leaves the device.
 *
 * @module astra/showcase/hollywood
 */

import { el } from './cards.js';
import { thumbScanner } from './vault.js';
import { beep } from './sfx.js';

/** Coach Colin's 72-Hour Deflate guide (the claude.ai artifact). */
export const GUIDE_URL = 'https://claude.ai/code/artifact/6c696f03-d030-441a-be4c-5b9c4cfa0df2';

/**
 * Where "Hire Coach Colin" goes. Set this to the booking page, DM link or
 * application form; until then the button opens the guide, whose report-back
 * section is how clients reach him.
 */
export const COACHING_URL = GUIDE_URL;

/* --------------------------------------------------------------- the data */

/** The entry question's answers, and what each one usually means. */
export const PAIN_POINTS = [
  {
    id: 'clean',
    label: 'I eat clean, but the scale won\'t budge',
    headline: 'Clean is not the same as calibrated.',
    likely: [
      'Healthy food still carries calories — oils, nuts, smoothies and "just a bite" add up without a number on them.',
      'Short sleep and stress raise the hormones that make you hold water, so real fat loss can hide under fluid for weeks.',
      'The scale is a noisy instrument: a salty meal or a hard workout can mask a pound of fat lost.',
    ],
    deflate: 'The 72-hour deflate strips the water and gas off the top, so you can finally see what the fat is doing underneath.',
    coaching: 'Coaching puts a real number on "clean": your intake, your deficit, adjusted every week from your own trend line.',
  },
  {
    id: 'bloat',
    label: 'I\'m always bloated and puffy',
    headline: 'That softness may not be fat at all.',
    likely: [
      'Gas from carbonation, sugar alcohols, gum and straws — four things most "healthy" routines are full of.',
      'Slow transit: too little fluid, a fibre flood, or eating late leaves volume sitting in the gut.',
      'The sodium–potassium balance: slashing salt can backfire; raising potassium around sensible salt helps fluid move.',
    ],
    deflate: 'This is exactly what the 72-hour deflate was built for — water, gas and transit move in days, not months.',
    coaching: 'Coaching finds your triggers, so flat stops being a weekend project and becomes how you live.',
  },
  {
    id: 'rebound',
    label: 'I lose it, then it comes right back',
    headline: 'The diet ended. The habits never started.',
    likely: [
      'Crash phases drop water and glycogen fast — and they come straight back the moment you eat normally.',
      'Too little protein during a cut costs muscle, which lowers what you can eat to maintain.',
      'No plan for after: most programmes have a start line and no maintenance phase.',
    ],
    deflate: 'The deflate shows you which part of a fast drop was water — so you stop mistaking it for fat you then "regain".',
    coaching: 'Coaching builds the exit: a reverse into maintenance so the result is still there in six months.',
  },
  {
    id: 'glp1',
    label: 'I\'m on a GLP-1 and I\'ve stalled',
    headline: 'The medication turns the volume down. It doesn\'t write the plan.',
    likely: [
      'Eating so little that protein falls short — muscle goes, metabolism slows, the stall arrives.',
      'Slowed digestion plus low fluid and fibre: bloat and constipation that look like no progress.',
      'Plateaus are normal; adjusting doses is your prescriber\'s call, but food, training and habits are yours.',
    ],
    deflate: 'The guide was written for clients on GLP-1 medication: mineral balance, the fibre ladder, transit, protein first.',
    coaching: 'Coach Colin is a GLP-1 specialist: protein targets, strength training and the habits that last after the medication.',
  },
  {
    id: 'what',
    label: 'I honestly don\'t know what to eat',
    headline: 'You don\'t need more information. You need a script.',
    likely: [
      'Conflicting advice — keto, fasting, "clean eating" — so nothing is followed long enough to work.',
      'No protein anchor at meals, so hunger runs the day.',
      'Decision fatigue: every meal is a new negotiation.',
    ],
    deflate: 'The guide gives you three days of rules simple enough to follow without thinking: protein, then colour, then starch.',
    coaching: 'Coaching turns that into a plan built around food you actually like, with numbers that fit your body.',
  },
  {
    id: 'consistency',
    label: 'I start strong and fall off by Wednesday',
    headline: 'Motivation is the opening scene. Systems carry the film.',
    likely: [
      'Plans that rely on willpower fail on the first bad day.',
      'No if-then plans for the moments that always derail you — the office treats, the late night, the weekend.',
      'Nobody checking in, so one slip quietly becomes a lost week.',
    ],
    deflate: 'The guide\'s behaviour section is built for this: change the noun, write the if-then, move the object, not your willpower.',
    coaching: 'Coaching is the accountability the plan is missing: a weekly check-in, numbers reviewed, the plan adjusted before you drift.',
  },
];

/**
 * What the visitor might already be doing. Each maps to one of the seven
 * pillars precision coaching runs together.
 */
export const PILLARS = [
  { id: 'numbers', label: 'Calibrated intake', why: 'A known deficit, from your own trend — not a guess.' },
  { id: 'protein', label: 'Protein target', why: 'Enough at every meal to keep muscle and kill hunger.' },
  { id: 'training', label: 'Strength training', why: 'Tells your body to keep muscle while fat goes.' },
  { id: 'steps', label: 'Daily movement', why: 'Steps burn more each week than most workouts.' },
  { id: 'recovery', label: 'Sleep & stress', why: 'Short sleep raises hunger and water retention.' },
  { id: 'measure', label: 'Weekly measurement', why: 'Waist, weight trend and photos, so decisions use data.' },
  { id: 'accountability', label: 'Accountability', why: 'Someone who notices a slip before it becomes a month.' },
];

export const DOING = [
  { id: 'counting', label: 'Counting calories or macros', pillar: 'numbers' },
  { id: 'protein', label: 'Eating protein at every meal', pillar: 'protein' },
  { id: 'lifting', label: 'Lifting weights 2–4× a week', pillar: 'training' },
  { id: 'cardio', label: 'Cardio or classes', pillar: 'steps' },
  { id: 'walking', label: 'Hitting a daily step goal', pillar: 'steps' },
  { id: 'sleep', label: 'Sleeping 7+ hours', pillar: 'recovery' },
  { id: 'weighing', label: 'Tracking weight and waist weekly', pillar: 'measure' },
  { id: 'coach', label: 'Working with a coach', pillar: 'accountability' },
  { id: 'glp1', label: 'Taking a GLP-1 medication', pillar: null },
  { id: 'diet', label: 'Following a diet (keto, fasting…)', pillar: null },
  { id: 'nothing', label: 'Honestly? Nothing consistent', pillar: null },
];

/** Words in the visitor's own description that mean a pillar is covered. */
const PILLAR_WORDS = {
  numbers: /\b(calorie|calories|kcal|macro|macros|track(ing)?|myfitnesspal|log(ging)?|deficit|count(ing)?)\b/i,
  protein: /\b(protein|chicken|eggs?|whey|shakes?|greek yogh?urt)\b/i,
  training: /\b(lift(ing)?|weights?|gym|strength|resistance|squats?|deadlifts?|train(ing)?|workouts?)\b/i,
  steps: /\b(walk(ing)?|steps|run(ning)?|cardio|cycling|bike|spin|swim(ming)?|hiit|classes?|treadmill)\b/i,
  recovery: /\b(sleep(ing)?|bed ?time|rest|stress|meditat\w*|8 hours|7 hours)\b/i,
  measure: /\b(weigh(ing)?|scale|tape|waist|measure(ments?)?|progress photos?|photos?)\b/i,
  accountability: /\b(coach(ing)?|trainer|pt|accountability|check[- ]?ins?|nutritionist|dietitian)\b/i,
};

/**
 * Score a plan against the seven pillars.
 *
 * @param {string[]} doingIds Chips the visitor picked.
 * @param {string} [text] Their own description.
 * @returns {{ covered: string[], missing: object[], score: number, verdict: string }} The read-out.
 */
export function assessPlan(doingIds = [], text = '') {
  const covered = new Set();
  const nothing = doingIds.includes('nothing');
  for (const id of doingIds) {
    const d = DOING.find((x) => x.id === id);
    if (d?.pillar) covered.add(d.pillar);
  }
  if (text && !/^\s*(nothing|not much|idk|no idea|none)\s*\.?\s*$/i.test(text)) {
    for (const [pillar, re] of Object.entries(PILLAR_WORDS)) if (re.test(text)) covered.add(pillar);
    // "I sleep five hours" mentions sleep but is the problem, not the pillar.
    const hours = text.match(/sleep\w*\D{0,20}?(\d+(?:\.\d+)?)\s*(?:h|hours?|hrs?)\b/i) || text.match(/(\d+(?:\.\d+)?)\s*(?:h|hours?|hrs?)\s+(?:of\s+)?sleep/i);
    if (hours && Number(hours[1]) < 7 && !doingIds.includes('sleep')) covered.delete('recovery');
  }
  const missing = PILLARS.filter((p) => !covered.has(p.id));
  const score = covered.size;
  let verdict;
  if (nothing || score === 0) verdict = 'No script, no schedule, no director. That isn\'t a lack of discipline — it\'s a lack of a plan. This is exactly where precise coaching starts.';
  else if (score <= 2) verdict = `You're running ${score} of 7. That's effort without a structure — which is why it feels hard and moves slowly.`;
  else if (score <= 4) verdict = `You're running ${score} of 7. More than most — and the missing pillars are exactly where results stall.`;
  else if (score <= 6) verdict = `You're running ${score} of 7. You're close. What's left is precision: your numbers, adjusted every week.`;
  else verdict = 'You\'re running all 7. At this level, the difference a coach makes is precision and the honest second pair of eyes.';
  return { covered: [...covered], missing, score, verdict };
}

/** The visitor's diagnosis, from their entry answer. */
export function diagnose(painId) {
  return PAIN_POINTS.find((p) => p.id === painId) || PAIN_POINTS[0];
}

/** The call sheet: the guide's seventy-two hours, as a shooting schedule. */
export const CALL_SHEET = [
  {
    day: 'DAY 1', title: 'Wardrobe & make-up', time: 'Hour 0 – 24',
    calls: [
      ['Kill the phantom four', 'No carbonation, sugar alcohols, gum or straws — all four put gas into you.'],
      ['Potassium, not panic', 'Keep salt sensible; add three potassium-rich foods (avocado, spinach, potato, beans, salmon, yoghurt).'],
      ['Protein, then colour, then starch', 'Same plate, different order — steadier blood sugar, earlier fullness.'],
    ],
  },
  {
    day: 'DAY 2', title: 'Rehearsal', time: 'Hour 24 – 48',
    calls: [
      ['Drink more to hold less', 'Steady fluids all day; under-drinking makes the body hold water.'],
      ['Climb the fibre ladder', 'Add at most 5 g a day, soluble first (oats, chia, kiwi) — never a fibre flood.'],
      ['The four-hour finish line', 'Last calorie four hours before bed; walk ten minutes after every meal.'],
    ],
  },
  {
    day: 'DAY 3', title: 'Premiere', time: 'Hour 48 – 72',
    calls: [
      ['The cosmetic finisher', 'Two kiwifruit in the evening; zero alcohol for the full 72 hours.'],
      ['The refill', 'A normal, moderate carb meal at the end of day three pulls water into muscle — tight, not soft.'],
      ['Report back', 'Waist at the navel, morning weight, bloat score — numbers, not "kind of worked".'],
    ],
  },
];

/** What the studio does not allow on set. */
export const BANNED = [
  ['Water pills & "detox" teas', 'Diuretic pills and laxative teas dehydrate you and strip minerals. Not on this set.'],
  ['Cutting salt to zero', 'It backfires: the body retains harder the moment you eat normally again.'],
  ['Dehydrating for a look', 'Under-drinking makes you hold more water, not less — and it is dangerous.'],
  ['Changing medication yourself', 'GLP-1 doses are your prescriber\'s call. Food, training and habits are yours.'],
];

export const CAUTION = 'Raising potassium is not safe for everyone: if you have kidney disease or take an ACE inhibitor, an ARB, a potassium-sparing diuretic or potassium supplements, clear it with your prescriber first. Same for magnesium with reduced kidney function.';

/** What the deflate moves in 72 hours, from the guide (relative, not a promise). */
export const GAUGE = [
  ['Water', 86, 'High'], ['Gas', 78, 'High'], ['Transit', 64, 'Moderate'], ['Glycogen', 48, 'Moderate'], ['Body fat', 6, 'Minimal'],
];

/** Colin's lines, by moment. */
export const LINES = {
  arrive: 'Quiet on set. You\'re on a closed lot: what happens here, stays here. Shall we find out why the fat isn\'t moving?',
  thumb: 'Hold still. Studio security takes prints. Fake ones, but they take them very seriously.',
  thumbFail: 'Cut. Hold it for two seconds, like you mean it.',
  thumbDone: 'Print on file. Now the hard question.',
  question: 'Be honest. Nobody in this business is, but you can be.',
  roll: 'Roll camera. And… action.',
  enter: 'Welcome to the Hollywood secret. Before we start, I need to know one thing: what are you doing right now to hit your goal?',
  panels: [
    'Scene one. The secret every premiere runs on: nobody loses four pounds of fat in three days. They lose water, gas and what\'s in transit.',
    'Scene two. Your diagnosis. I read your answer. Let\'s talk about what is actually going on.',
    'Scene three. The call sheet. Seventy-two hours, three days, nine directions. The full script is in Coach Colin\'s guide.',
    'Scene four. The interrogation. Tell me what you are doing. All of it. I\'ll tell you what\'s missing.',
    'Scene five. What the studio does not allow. Some shortcuts end careers, and some end up in A and E.',
    'Final cut. You can run the deflate alone. Fat loss that lasts is a different film, and it has a director.',
  ],
  nags: [
    'Still on set? Then answer me this: what are you doing this week to hit your goal?',
    'Quick question from the director\'s chair: when did you last weigh, measure, or check your numbers?',
    'Here\'s the thing about stars: none of them do it alone. Who\'s checking your work?',
    'What\'s the plan for Monday? Not the dream. The plan.',
  ],
  scored: (score) => (score >= 6 ? 'Impressive. Most people I meet run two pillars, maybe three.' : score >= 3 ? 'Good bones. Now look at what\'s missing: that\'s where the stall lives.' : 'That\'s honest, and honest is where coaching starts.'),
  final: 'Grab the 72-hour guide for the quick win. If you want the fat gone for good, that\'s what Coach Colin does — precisely.',
};

/* ------------------------------------------------------------- the card */

/**
 * The station card: studio security. Fingerprint, the question, roll camera.
 *
 * @param {object} state Shared state (uses state.holly).
 * @param {{ say: Function, openRoom: Function, reduced: boolean }} hooks Card hooks.
 */
export function buildHollywoodCard(state, hooks) {
  const h = state.holly;
  const status = el('p', { class: 'meta vault-check', text: 'Awaiting fingerprint. Press and hold.' });
  const roll = el('button', { class: 'btn-holly', type: 'button', disabled: '', text: '🎬 Roll camera' });
  const again = el('button', { class: 'btn-holly ghost', type: 'button', hidden: '', text: '⇢ Back on set', onclick: () => hooks.openRoom() });
  const other = el('input', { type: 'text', maxlength: '140', placeholder: 'Or in your own words…', 'aria-label': 'Why you think the fat is not coming off' });
  const sync = () => {
    const ready = h.print && (h.pain || other.value.trim().length > 3);
    roll.disabled = !ready;
    roll.classList.toggle('armed', Boolean(ready));
    again.hidden = !h.entered;
  };
  const thumb = thumbScanner({
    onDone: () => {
      h.print = true;
      status.textContent = 'Print on file · studio clearance pending · simulated — nothing is read from your finger';
      status.classList.add('ok');
      beep(880); beep(1320, 0.08);
      hooks.say(LINES.thumbDone);
      sync();
    },
    onFail: () => { status.textContent = 'Scan incomplete. Hold for two seconds.'; hooks.say(LINES.thumbFail); },
  });
  let told = false;
  thumb.node.addEventListener('pointerdown', () => { if (!told) { told = true; hooks.say(LINES.thumb); } });
  const chips = el('div', { class: 'holly-pains' }, PAIN_POINTS.map((p) => {
    const b = el('button', { class: 'holly-pain', type: 'button', 'aria-pressed': 'false', text: p.label });
    b.addEventListener('click', () => {
      h.pain = p.id;
      for (const c of chips.children) c.setAttribute('aria-pressed', String(c === b));
      sync();
    });
    return b;
  }));
  other.addEventListener('input', () => { h.painText = other.value.trim(); sync(); });
  roll.addEventListener('click', async () => {
    if (roll.disabled) return;
    h.painText = other.value.trim();
    if (!h.pain) h.pain = guessPain(h.painText);
    roll.disabled = true;
    hooks.say(LINES.roll);
    await playPremiere({ reduced: hooks.reduced });
    h.entered = true;
    sync();
    hooks.openRoom();
  });
  sync();
  return [
    el('div', { class: 'holly-marquee', 'aria-hidden': 'true' }, [
      el('span', { class: 'holly-now', text: 'NOW SHOWING · CLOSED SET' }),
      el('b', { text: 'THE HOLLYWOOD SECRET' }),
      el('span', { class: 'holly-sub', text: 'THE 72-HOUR DEFLATE' }),
    ]),
    el('div', { class: 'classified-head holly-head' }, [
      el('span', { class: 'stamp', text: 'STUDIO EYES ONLY' }),
      el('p', { text: '// CALL SHEET 72H // CLEARANCE: CAST & CREW //' }),
    ]),
    el('ul', { class: 'facts vault-terms' }, [
      el('li', { text: 'The honest secret: three days move water, gas and transit — not fat. Fat moves over weeks, and that\'s a different film.' }),
      el('li', { text: 'Your fingerprint is simulated and your answers stay on this device.' }),
      el('li', { text: 'Educational, not medical advice. On a GLP-1 medication? Your prescriber decides doses.' }),
    ]),
    el('div', { class: 'vault-step' }, [el('p', { class: 'step-label', text: '01 · Digital fingerprint' }), el('div', { class: 'thumb-row' }, [thumb.node, status])]),
    el('div', { class: 'vault-step' }, [
      el('p', { class: 'step-label', text: '02 · Be honest: why isn\'t the fat coming off?' }),
      chips,
      other,
    ]),
    el('div', { class: 'pair vault-actions' }, [roll, again]),
  ];
}

/** Read a free-text answer into the nearest pain point. */
export function guessPain(text = '') {
  const t = text.toLowerCase();
  if (/glp|ozempic|wegovy|mounjaro|zepbound|semaglutide|tirzepatide|injection/.test(t)) return 'glp1';
  if (/bloat|puff|swollen|water|gas/.test(t)) return 'bloat';
  if (/back|regain|yo-?yo|rebound|comes back/.test(t)) return 'rebound';
  if (/know what|confus|what to eat|don'?t know/.test(t)) return 'what';
  if (/consisten|motivat|fall off|quit|stick|discipline|wednesday|weekend/.test(t)) return 'consistency';
  return 'clean';
}

/* ---------------------------------------------------------- the premiere */

/**
 * The transition: a film leader counts down 3-2-1, the clapper snaps, the
 * curtains part.
 */
export function playPremiere({ reduced }) {
  return new Promise((resolve) => {
    const count = el('b', { class: 'leader-n', text: '3' });
    const node = el('div', { class: 'holly-premiere', 'aria-hidden': 'true' }, [
      el('div', { class: 'leader' }, [el('i', { class: 'leader-sweep' }), el('span', { class: 'leader-ring' }), count]),
      el('div', { class: 'clapper' }, [
        el('div', { class: 'clapper-top' }),
        el('div', { class: 'clapper-body' }, [
          el('p', { text: 'PROD. THE HOLLYWOOD SECRET' }),
          el('p', { text: 'SCENE 72 · TAKE 1' }),
          el('p', { text: 'DIR. COACH COLIN' }),
        ]),
      ]),
      el('div', { class: 'curtain left' }),
      el('div', { class: 'curtain right' }),
    ]);
    document.body.append(node);
    if (reduced) { setTimeout(() => { node.remove(); resolve(); }, 400); return; }
    let n = 3;
    const step = () => {
      n -= 1;
      if (n > 0) { count.textContent = String(n); beep(660, 0.05); setTimeout(step, 520); return; }
      node.classList.add('clap');
      beep(220, 0.08);
      setTimeout(() => node.classList.add('open'), 650);
      setTimeout(() => { node.remove(); resolve(); }, 2100);
    };
    beep(660, 0.05);
    setTimeout(step, 520);
  });
}

/* ------------------------------------------------------------- the room */

const SCENES = ['The secret', 'Your diagnosis', 'The call sheet', 'The interrogation', 'Banned on set', 'Final cut'];

export class HollywoodRoom {
  constructor({ state, say, stop, reduced, onClose }) {
    Object.assign(this, { state, sayHook: say, stop, reduced, onClose });
    this.root = null;
  }

  open() {
    if (this.root) return;
    const h = this.state.holly;
    h.open = true;
    this.panel = -1;
    this.doing = new Set(h.doing || []);
    this.lastTouch = performance.now();
    this.nag = 0;
    const caption = el('p', { class: 'hs-caption', 'aria-live': 'polite' });
    const track = el('main', { class: 'hs-track', 'aria-label': 'The Hollywood Secret' });
    const dots = el('nav', { class: 'hs-dots', 'aria-label': 'Scenes' });
    const builders = [this.secret, this.diagnosis, this.callSheet, this.interrogation, this.banned, this.finalCut];
    builders.forEach((build, i) => {
      track.append(el('section', { class: 'hs-sec' }, [
        el('div', { class: 'hs-card' }, [
          el('p', { class: 'hs-kicker' }, [el('span', { class: 'hs-slate', text: `SCENE ${String(i + 1).padStart(2, '0')}` }), ` · ${SCENES[i]}`]),
          ...build.call(this),
        ]),
      ]));
      dots.append(el('button', { class: 'dot', type: 'button', 'aria-label': SCENES[i], title: SCENES[i], onclick: () => this.goto(i) }));
    });
    this.root = el('div', { class: 'hollyroom', role: 'dialog', 'aria-label': 'The Hollywood Secret — the 72-Hour Deflate' }, [
      el('div', { class: 'hs-velvet', 'aria-hidden': 'true' }),
      el('div', { class: 'hs-beams', 'aria-hidden': 'true' }, [el('i'), el('i')]),
      el('div', { class: 'hs-bokeh', 'aria-hidden': 'true' }),
      el('div', { class: 'hs-bulbs', 'aria-hidden': 'true' }),
      el('div', { class: 'hs-grain', 'aria-hidden': 'true' }),
      el('div', { class: 'hs-stamp', 'aria-hidden': 'true', text: 'CLASSIFIED · STUDIO EYES ONLY' }),
      el('div', { class: 'hs-letterbox top', 'aria-hidden': 'true' }),
      el('div', { class: 'hs-letterbox bottom', 'aria-hidden': 'true' }),
      el('header', { class: 'hs-hud' }, [
        el('span', { class: 'hs-brand' }, [el('b', { text: 'THE HOLLYWOOD SECRET' }), el('em', { text: ' · 72-Hour Deflate' })]),
        el('span', { class: 'hs-rec', text: '● REC' }),
        el('button', { class: 'hs-leave', type: 'button', text: '← Leave set', onclick: () => this.close() }),
      ]),
      track,
      el('div', { class: 'hs-colin' }, [el('span', { class: 'hs-face', 'aria-hidden': 'true' }), el('div', {}, [el('p', { class: 'hs-name', text: 'Colin · casting director' }), caption])]),
      el('button', { class: 'nav-arrow prev hs-prev', type: 'button', 'aria-label': 'Previous scene', text: '‹', onclick: () => this.goto(this.panel - 1) }),
      el('button', { class: 'nav-arrow next hs-next', type: 'button', 'aria-label': 'Next scene', text: '›', onclick: () => this.goto(this.panel + 1) }),
      dots,
    ]);
    document.body.append(this.root);
    document.body.classList.add('lab-open');
    Object.assign(this, { track, caption, dots: [...dots.children] });
    this.onScroll = () => {
      const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      if (i !== this.panel) this.arrive(i);
    };
    track.addEventListener('scroll', this.onScroll, { passive: true });
    this.onKey = (e) => {
      if (e.key === 'ArrowRight') this.goto(this.panel + 1);
      else if (e.key === 'ArrowLeft') this.goto(this.panel - 1);
      else if (e.key === 'Escape') this.close();
    };
    addEventListener('keydown', this.onKey);
    this.onTouch = () => { this.lastTouch = performance.now(); };
    this.root.addEventListener('pointerdown', this.onTouch);
    this.root.addEventListener('input', this.onTouch);
    requestAnimationFrame(() => this.root?.classList.add('on'));
    this.panel = 0;
    this.dots[0].classList.add('on');
    this.say(LINES.enter);
    setTimeout(() => { if (this.root) this.fillGauge(); }, 600);
    // When the visitor goes quiet, the director asks what they're doing.
    this.nagTimer = setInterval(() => {
      if (!this.root || performance.now() - this.lastTouch < 30000) return;
      this.lastTouch = performance.now();
      this.say(LINES.nags[this.nag % LINES.nags.length]);
      this.nag += 1;
    }, 5000);
  }

  say(text) {
    if (this.caption) this.caption.textContent = text;
    this.sayHook?.(text);
  }

  goto(i) {
    const k = Math.max(0, Math.min(SCENES.length - 1, i));
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
    this.dots.forEach((d, k) => d.classList.toggle('on', k === i));
    clearTimeout(this.sayTimer);
    this.sayTimer = setTimeout(() => this.say(LINES.panels[i]), 300);
    if (i === 0) this.fillGauge();
    if (i === 5) this.renderFinal?.();
  }

  fillGauge() {
    for (const bar of this.root?.querySelectorAll('.hs-gauge i') || []) bar.style.width = `${bar.dataset.fill}%`;
  }

  /* -------------------------------------------------------- scenes */

  secret() {
    return [
      el('h2', { text: 'Nobody loses four pounds of fat before a premiere.' }),
      el('p', { text: 'Here is what actually happens in the 72 hours before a red carpet: the cast stops wearing three pounds of water, gas and unfinished digestion that were never theirs to carry. Fat is slow arithmetic — roughly 3,500 calories of deficit per pound. Water, gas, transit and glycogen answer in days.' }),
      el('div', { class: 'hs-gauge' }, [
        el('p', { class: 'hs-mini', text: 'What moves in 72 hours (relative, from the guide)' }),
        ...GAUGE.map(([name, fill, level]) => el('div', { class: 'hs-g-row' }, [
          el('span', { text: name }),
          el('span', { class: 'hs-g-bar' }, [el('i', { 'data-fill': String(fill) })]),
          el('b', { text: level }),
        ])),
      ]),
      el('blockquote', { class: 'hs-quote' }, [
        el('p', { text: '“You are not going to lose four pounds of fat this weekend. You are going to stop wearing three pounds of water and gas that were never yours to carry.”' }),
        el('cite', { text: '— Coach Colin, The 72-Hour Deflate' }),
      ]),
    ];
  }

  diagnosis() {
    const h = this.state.holly;
    const d = diagnose(h.pain);
    return [
      el('h2', { text: d.headline }),
      el('p', { class: 'hs-you' }, ['You said: ', el('b', { text: `“${h.painText || d.label}”` })]),
      el('p', { class: 'hs-mini', text: 'What is usually going on' }),
      el('ol', { class: 'hs-list' }, d.likely.map((t) => el('li', { text: t }))),
      el('div', { class: 'hs-split' }, [
        el('div', { class: 'hs-box' }, [el('p', { class: 'hs-mini', text: 'What the 72-hour deflate fixes' }), el('p', { text: d.deflate })]),
        el('div', { class: 'hs-box gold' }, [el('p', { class: 'hs-mini', text: 'What precise coaching fixes' }), el('p', { text: d.coaching })]),
      ]),
    ];
  }

  callSheet() {
    return [
      el('h2', { text: 'The call sheet: 72 hours, three days on set.' }),
      el('p', { text: 'A preview of the shooting schedule from Coach Colin\'s 72-Hour Deflate. The full script — the seven rules, the gut-nervous-system drills, the behaviour plays and the report-back scorecard — is in the guide.' }),
      ...CALL_SHEET.map((d) => el('div', { class: 'hs-day' }, [
        el('div', { class: 'hs-day-head' }, [el('b', { text: d.day }), el('span', { text: `${d.title} · ${d.time}` })]),
        el('ul', {}, d.calls.map(([t, b]) => el('li', {}, [el('b', { text: t }), el('span', { text: b })]))),
      ])),
      el('a', { class: 'btn-holly', href: GUIDE_URL, target: '_blank', rel: 'noopener', text: '📜 Get the full 72-Hour Deflate guide' }),
    ];
  }

  interrogation() {
    const out = el('div', { class: 'hs-readout', 'aria-live': 'polite' });
    const text = el('textarea', { rows: '3', maxlength: '400', placeholder: 'Tell the director, in your own words: what does a normal week look like?', 'aria-label': 'What you are doing to reach your goal' });
    const render = () => {
      const r = assessPlan([...this.doing], text.value);
      this.state.holly.doing = [...this.doing];
      this.state.holly.plan = r;
      out.replaceChildren(
        el('div', { class: 'hs-score' }, [el('b', { text: `${r.score}/7` }), el('span', { text: 'pillars running' })]),
        el('div', { class: 'hs-pillars' }, PILLARS.map((p) => el('span', { class: `hs-pillar${r.covered.includes(p.id) ? ' on' : ''}`, title: p.why, text: p.label }))),
        el('p', { class: 'hs-verdict', text: r.verdict }),
        r.missing.length ? el('ul', { class: 'hs-missing' }, r.missing.slice(0, 4).map((p) => el('li', {}, [el('b', { text: `Missing: ${p.label}. ` }), p.why]))) : null,
      );
      this.renderFinal?.();
    };
    const chips = el('div', { class: 'hs-chips' }, DOING.map((d) => {
      const b = el('button', { class: 'hs-chip', type: 'button', 'aria-pressed': String(this.doing.has(d.id)), text: d.label });
      b.addEventListener('click', () => {
        if (this.doing.has(d.id)) this.doing.delete(d.id); else this.doing.add(d.id);
        if (d.id === 'nothing' && this.doing.has('nothing')) for (const x of [...this.doing]) if (x !== 'nothing') this.doing.delete(x);
        if (d.id !== 'nothing') this.doing.delete('nothing');
        for (const c of chips.children) c.setAttribute('aria-pressed', String(this.doing.has(DOING[[...chips.children].indexOf(c)].id)));
        render();
      });
      return b;
    }));
    const ask = el('button', { class: 'btn-holly', type: 'button', text: '🎥 Read my plan back', onclick: () => { render(); this.say(LINES.scored(assessPlan([...this.doing], text.value).score)); } });
    let typing;
    text.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(render, 500); });
    render();
    return [
      el('h2', { text: 'What are you doing to accomplish your goal?' }),
      el('p', { text: 'All of it. Tap everything you do in a normal week, or tell the director in your own words.' }),
      chips,
      text,
      ask,
      out,
    ];
  }

  banned() {
    return [
      el('h2', { text: 'Banned on this set.' }),
      el('p', { text: 'The guide is a cosmetic protocol for healthy adults, and it has hard lines. These shortcuts are how people end up dehydrated, mineral-depleted and in a clinic — so they are not part of the secret.' }),
      el('ol', { class: 'hs-ban' }, BANNED.map(([t, b]) => el('li', {}, [el('b', { text: t }), el('span', { text: b })]))),
      el('p', { class: 'hs-caution' }, [el('b', { text: 'Before you touch the potassium rule. ' }), CAUTION]),
    ];
  }

  finalCut() {
    const body = el('div', { class: 'hs-final' });
    this.renderFinal = () => {
      const h = this.state.holly;
      const d = diagnose(h.pain);
      const r = h.plan || assessPlan(h.doing || [], '');
      body.replaceChildren(
        el('div', { class: 'hs-brief' }, [
          el('p', { class: 'hs-mini', text: 'Your casting brief' }),
          el('p', {}, [el('b', { text: 'The problem: ' }), h.painText || d.label]),
          el('p', {}, [el('b', { text: 'The plan right now: ' }), `${r.score} of 7 pillars running${r.missing.length ? ` — missing ${r.missing.map((p) => p.label.toLowerCase()).slice(0, 3).join(', ')}` : ''}.`]),
          el('p', {}, [el('b', { text: 'The fix: ' }), d.coaching]),
        ]),
        el('div', { class: 'hs-two' }, [
          el('div', { class: 'hs-offer' }, [
            el('p', { class: 'hs-mini', text: 'The quick win · 72 hours' }),
            el('h3', { text: 'The 72-Hour Deflate guide' }),
            el('p', { text: 'Drop the water, gas and transit that hide your progress. Three days, five phases, no equipment, a scorecard to report back.' }),
            el('a', { class: 'btn-holly ghost', href: GUIDE_URL, target: '_blank', rel: 'noopener', text: 'Open the guide →' }),
          ]),
          el('div', { class: 'hs-offer star' }, [
            el('p', { class: 'hs-mini', text: 'The lasting result · weeks, not days' }),
            el('h3', { text: 'Precise coaching with Coach Colin' }),
            el('ul', {}, [
              el('li', { text: 'Your numbers: intake and protein set from your own trend, not a template.' }),
              el('li', { text: 'Weekly check-ins: weight trend, waist and photos reviewed, plan adjusted.' }),
              el('li', { text: 'Training and habits built around your life — and a maintenance exit.' }),
              el('li', { text: 'GLP-1 specialist: protein, muscle and the habits that outlast the medication.' }),
            ]),
            el('a', { class: 'btn-holly', href: COACHING_URL, target: '_blank', rel: 'noopener', text: '⭐ Hire Coach Colin' }),
          ]),
        ]),
        el('p', { class: 'hs-fine', text: 'Honest small print: the deflate is cosmetic and temporary — water, not fat. Coaching is general wellness coaching, not medical care; on medication, your prescriber stays in charge.' }),
      );
    };
    this.renderFinal();
    return [el('h2', { text: 'Every star has a director.' }), body];
  }

  close() {
    if (!this.root) return;
    clearInterval(this.nagTimer);
    clearTimeout(this.sayTimer);
    removeEventListener('keydown', this.onKey);
    this.stop?.();
    this.root.remove();
    this.root = null;
    this.renderFinal = null;
    this.state.holly.open = false;
    document.body.classList.remove('lab-open');
    this.onClose?.();
  }
}

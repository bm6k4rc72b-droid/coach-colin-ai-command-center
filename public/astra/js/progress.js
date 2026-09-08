/**
 * Progression: the reason people come back.
 *
 * This is the layer the brief asked for — levels, streaks, unlocks, a sense of
 * getting somewhere — built out of the mechanics that genuinely drive return
 * visits: visible progress against a goal, near-miss proximity to the next
 * threshold, a streak that costs something to break, and rewards that arrive on
 * a variable schedule rather than a predictable one.
 *
 * It is built with one constraint that changes everything about it. **Every
 * point is earned by an act of research literacy** — opening the sources behind
 * a claim, decoding a paper, finding contradicting evidence, checking a claim
 * before publishing it. Nothing is awarded for time on site, scroll depth or
 * coming back for its own sake. The loop rewards the behaviour the platform
 * exists to teach, so a user who is "addicted" to it is addicted to reading
 * primary sources, which is the only version of this worth shipping.
 *
 * A calm-mode switch turns off streak pressure and the variable-reward drops
 * entirely, keeping the record without the pull. It is offered plainly in
 * Settings rather than buried, because a persuasion system nobody can switch
 * off is a dark pattern regardless of how good its intentions are.
 *
 * @module astra/progress
 */

const KEY = 'astra.progress.v1';

/**
 * The actions worth points, and what each is worth.
 *
 * The weighting is the editorial argument in numeric form: expanding sources
 * beats reading a summary, and finding what contradicts a claim beats finding
 * what supports it.
 */
export const ACTIONS = {
  'dossier-open': { xp: 6, label: 'Opened a compound dossier' },
  'sources-expand': { xp: 14, label: 'Expanded the sources behind a claim' },
  'study-open': { xp: 10, label: 'Opened a study record' },
  'pubmed-open': { xp: 22, label: 'Went to the primary literature' },
  'paper-decode': { xp: 30, label: 'Decoded a research paper' },
  'claim-check': { xp: 18, label: 'Checked a claim against the evidence' },
  'compliance-check': { xp: 16, label: 'Ran copy through the compliance guardian' },
  'compare-run': { xp: 20, label: 'Ran a side-by-side comparison' },
  'contradiction-found': { xp: 34, label: 'Surfaced evidence that contradicts a claim' },
  'graph-explore': { xp: 8, label: 'Explored the knowledge graph' },
  'timeline-view': { xp: 8, label: 'Read a research timeline' },
  'debate-run': { xp: 26, label: 'Convened the scientific debate room' },
  'simulator-run': { xp: 24, label: 'Ran the study-design simulator' },
  'campaign-generate': { xp: 20, label: 'Generated a campaign package' },
  'radar-read': { xp: 12, label: 'Reviewed the research radar' },
};

/**
 * Ranks. The names are laboratory clearance levels because the whole platform
 * is dressed as a facility, and a rank you can picture is a rank you want.
 */
export const RANKS = [
  { level: 1, at: 0, name: 'Visitor', clearance: 'LEVEL 1', blurb: 'The doors are open. Everything below the surface is still dark.' },
  { level: 2, at: 90, name: 'Reader', clearance: 'LEVEL 2', blurb: 'You have started opening the sources instead of trusting the summary.' },
  { level: 3, at: 260, name: 'Analyst', clearance: 'LEVEL 3', blurb: 'You can tell a mouse from a person at a glance. The comparison lab is yours.' },
  { level: 4, at: 560, name: 'Reviewer', clearance: 'LEVEL 4', blurb: 'You read limitations before conclusions. The debate room unlocks.' },
  { level: 5, at: 1020, name: 'Investigator', clearance: 'LEVEL 5', blurb: 'You look for the study that disagrees. Most people never do.' },
  { level: 6, at: 1700, name: 'Principal', clearance: 'LEVEL 6', blurb: 'The command centre is unlocked. You can brief other people safely.' },
  { level: 7, at: 2700, name: 'Director', clearance: 'OMEGA', blurb: 'Full facility access. There is nothing here you have not opened.' },
];

/**
 * Unlockables. Each one is a real capability gated behind demonstrated
 * literacy, not a cosmetic badge — the gate teaches the order to learn in.
 */
export const UNLOCKS = [
  { id: 'graph', at: 1, deck: 'graph', label: 'Knowledge Graph', blurb: 'The 3D map of the field.' },
  { id: 'decoder', at: 2, deck: 'decoder', label: 'Paper Decoder', blurb: 'Turn an abstract into its five real answers.' },
  { id: 'compare', at: 3, deck: 'compare', label: 'Comparison Lab', blurb: 'Two compounds, five axes, one honest verdict.' },
  { id: 'simulator', at: 3, deck: 'simulator', label: 'Study Simulator', blurb: 'Change the design, watch the conclusion move.' },
  { id: 'debate', at: 4, deck: 'debate', label: 'Debate Room', blurb: 'Four reviewers argue; you read the consensus.' },
  { id: 'studio', at: 5, deck: 'studio', label: 'Content Studio', blurb: 'One paper, thirty compliant pieces.' },
  { id: 'command', at: 6, deck: 'command', label: 'Command Centre', blurb: 'The private dashboard and campaign engine.' },
];

/** Milestone streak lengths that earn a bonus. */
const STREAK_BONUS = { 3: 40, 7: 120, 14: 280, 30: 700 };

/**
 * Read the stored record.
 *
 * @returns {object} The progression state.
 */
export function load() {
  const empty = {
    xp: 0,
    actions: {},
    log: [],
    streak: 0,
    best: 0,
    lastDay: null,
    seen: [],
    drops: [],
    calm: false,
    goals: [],
    created: Date.now(),
  };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    return raw ? { ...empty, ...raw } : empty;
  } catch {
    return empty;
  }
}

/**
 * Persist the record.
 *
 * @param {object} state The state to store.
 * @returns {object} The same state.
 */
export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // A private-mode browser with storage disabled still gets a working
    // session; it just will not remember it.
  }
  return state;
}

/**
 * Day key in the viewer's own timezone, so a streak means "days as they live
 * them" rather than days in UTC.
 *
 * @param {number} [timestamp] Epoch milliseconds.
 * @returns {string} `YYYY-MM-DD`.
 */
export function dayKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The rank for an XP total.
 *
 * @param {number} xp Experience points.
 * @returns {object} The rank, with progress toward the next.
 */
export function rankFor(xp) {
  let current = RANKS[0];
  for (const rank of RANKS) if (xp >= rank.at) current = rank;
  const next = RANKS.find((rank) => rank.at > xp) || null;
  const span = next ? next.at - current.at : 1;
  const into = next ? xp - current.at : 1;
  return {
    ...current,
    next,
    progress: next ? Math.min(1, into / span) : 1,
    toNext: next ? next.at - xp : 0,
  };
}

/**
 * Which capabilities are unlocked at a rank.
 *
 * @param {number} level Rank level.
 * @returns {{ open: Array<object>, locked: Array<object> }} The split.
 */
export function unlocksFor(level) {
  return {
    open: UNLOCKS.filter((unlock) => unlock.at <= level),
    locked: UNLOCKS.filter((unlock) => unlock.at > level),
  };
}

/**
 * Record an action.
 *
 * Returns everything the UI needs to react: the points, whether a rank or an
 * unlock was crossed, the streak state, and any research drop that fired.
 *
 * @param {object} state Current state (mutated and saved).
 * @param {string} action An {@link ACTIONS} key.
 * @param {object} [detail] Optional context stored in the log.
 * @returns {{ state: object, xp: number, levelled: object|null, unlocked: Array<object>,
 *   streak: number, streakBonus: number, drop: object|null }} What happened.
 */
export function record(state, action, detail = {}) {
  const definition = ACTIONS[action];
  if (!definition) return { state, xp: 0, levelled: null, unlocked: [], streak: state.streak, streakBonus: 0, drop: null };

  const beforeRank = rankFor(state.xp);
  const today = dayKey();

  let streakBonus = 0;
  if (state.lastDay !== today) {
    const yesterday = dayKey(Date.now() - 86400000);
    state.streak = state.lastDay === yesterday ? state.streak + 1 : 1;
    state.lastDay = today;
    state.best = Math.max(state.best || 0, state.streak);
    if (!state.calm && STREAK_BONUS[state.streak]) streakBonus = STREAK_BONUS[state.streak];
  }

  // First time doing a given action is worth full value; repeats decay toward
  // a floor, so grinding one button is not a route to a rank.
  const done = state.actions[action] || 0;
  const decay = Math.max(0.34, 1 - done * 0.08);
  const gained = Math.round(definition.xp * decay) + streakBonus;

  state.actions[action] = done + 1;
  state.xp += gained;
  state.log.unshift({ action, label: definition.label, xp: gained, at: Date.now(), ...detail });
  state.log = state.log.slice(0, 60);

  const afterRank = rankFor(state.xp);
  const levelled = afterRank.level > beforeRank.level ? afterRank : null;
  const unlocked = levelled
    ? UNLOCKS.filter((unlock) => unlock.at > beforeRank.level && unlock.at <= afterRank.level)
    : [];

  const drop = state.calm ? null : maybeDrop(state, action);

  save(state);
  return { state, xp: gained, levelled, unlocked, streak: state.streak, streakBonus, drop };
}

/**
 * Mark something as seen, for the "you have opened 12 of 47 studies" counters
 * that give a collection its shape.
 *
 * @param {object} state Current state.
 * @param {string} id What was seen.
 * @returns {boolean} Whether this was the first time.
 */
export function see(state, id) {
  if (state.seen.includes(id)) return false;
  state.seen.push(id);
  save(state);
  return true;
}

/**
 * Research drops.
 *
 * A variable-ratio reward: roughly one action in five yields a finding pulled
 * from the corpus that the reader has not seen. The schedule is what makes it
 * compelling; the content is what makes it defensible — every drop is a real
 * limitation, contradiction or piece of context from the library.
 *
 * @param {object} state Current state.
 * @param {string} action The action that may have triggered it.
 * @returns {object|null} A drop, or null.
 */
function maybeDrop(state, action) {
  const total = Object.values(state.actions).reduce((sum, count) => sum + count, 0);
  // Deterministic pseudo-randomness over the action count: unpredictable to a
  // user, reproducible in a test.
  const roll = ((total * 2654435761) % 100) / 100;
  const generous = ['pubmed-open', 'contradiction-found', 'paper-decode'].includes(action);
  if (roll > (generous ? 0.45 : 0.2)) return null;
  const pool = DROPS.filter((drop) => !state.drops.includes(drop.id));
  if (!pool.length) return null;
  const drop = pool[Math.floor(roll * pool.length * (1 / (generous ? 0.45 : 0.2))) % pool.length];
  state.drops.push(drop.id);
  return drop;
}

/**
 * The drop pool: things in the corpus that reward a second look.
 */
export const DROPS = [
  { id: 'drop-ceiling', title: 'Evidence ceilings', body: 'Ten animal studies never outrank one randomised human trial. The confidence meter enforces that with a hard cap per tier — which is why some popular compounds can never pass 45%.' },
  { id: 'drop-tb500', title: 'The fragment problem', body: 'The human trials people cite for TB-500 used full-length thymosin beta-4, applied to an eye or a skin ulcer. The injected fragment sold under the name has never been tested that way.' },
  { id: 'drop-ipamorelin', title: 'The trial that failed', body: 'Ipamorelin was taken into a proper randomised human trial — for postoperative ileus — and missed its endpoint. It is the best-designed human test the compound has had, and marketing never mentions it.' },
  { id: 'drop-regain', title: 'What the ads leave out', body: 'GLP-1 weight loss is real and large. It also reverses substantially after discontinuation, which reframes the drug as ongoing therapy rather than a course of treatment.' },
  { id: 'drop-tesamorelin', title: 'How narrow an approval is', body: 'Tesamorelin is approved — for visceral fat in HIV-associated lipodystrophy. Everything else it is sold for is outside the population it was tested in.' },
  { id: 'drop-onegroup', title: 'One group, many papers', body: 'A large share of the BPC-157 literature comes from a single research group. That is not misconduct; it is a replication gap, and it is the first thing to check on any compound.' },
  { id: 'drop-biomarker', title: 'Biomarkers are proxies', body: 'CJC-1295 raises growth hormone. Reliably. In humans. What no study shows is that raising it changes anything a person would notice — and when GH itself was tested in healthy older adults, strength did not improve and side effects did.' },
  { id: 'drop-stack', title: 'Stacks inherit the weakest link', body: 'Four compounds with no combination study do not average their evidence. The combination is bounded below by its weakest member, then penalised again for an interaction surface nobody has measured.' },
  { id: 'drop-russian', title: 'A publication ecosystem, not a verdict', body: 'Semax and Selank have real clinical literature — almost entirely in Russian journals, largely unreplicated elsewhere. That is a scrutiny problem, not automatically a quality problem, and the distinction matters.' },
  { id: 'drop-purity', title: 'The vial is part of the evidence', body: 'Independent testing of grey-market research peptides repeatedly finds content that does not match the label. No amount of published research tells you what is in a specific bottle.' },
];

/**
 * A session summary for the dashboard header.
 *
 * @param {object} state Current state.
 * @returns {object} Display values.
 */
export function summary(state) {
  const rank = rankFor(state.xp);
  const totalActions = Object.values(state.actions).reduce((sum, count) => sum + count, 0);
  return {
    xp: state.xp,
    rank,
    streak: state.streak,
    best: state.best,
    actions: totalActions,
    seen: state.seen.length,
    drops: state.drops.length,
    dropTotal: DROPS.length,
    calm: Boolean(state.calm),
    unlocks: unlocksFor(rank.level),
  };
}

/**
 * Reset everything. Offered in Settings next to calm mode, because a record you
 * cannot delete is a record you did not consent to.
 *
 * @returns {object} A fresh state.
 */
export function reset() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
  return load();
}

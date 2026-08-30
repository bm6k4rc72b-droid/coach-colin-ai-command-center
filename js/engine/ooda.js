/* ============================================================
   THE OODA ENGINE
   Boyd's real claim was never "go fast". It was: operate INSIDE the
   opponent's decision cycle, so that by the time they act, their
   picture of the world is already stale.

   So every rep runs two clocks:
     YOUR LOOP      observe → orient → decide → act, timestamped
                    from real inputs (sensor, tap, release).
     DEFENSE LOOP   the coverage's own cycle: how long until the
                    secondary has fully passed off, re-leveraged and
                    closed the window it just opened.

   Δ-LOOP = defenseLoop − yourLoop.
   Positive Δ means you released while their picture was still old.
   That single number is the app's north star; everything else is
   diagnostic for it.
   ============================================================ */
import { clamp, jitter, lerp } from '../core/rng.js';

export const PHASES = ['observe','orient','decide','act'];

export const PHASE_META = {
  observe:{ label:'OBSERVE', color:'#4DF0FF', note:'Time from the rotation to your first eyes-on reaction.' },
  orient: { label:'ORIENT',  color:'#B96BFF', note:'Time to classify the coverage. Boyd’s decisive phase.' },
  decide: { label:'DECIDE',  color:'#FFC44D', note:'Time to commit to the read the coverage dictates.' },
  act:    { label:'ACT',     color:'#7CFF9E', note:'Time from decision to ball out of your hand.' },
};

/* Benchmarks in ms. These are POSITION-DEPENDENT and are overwritten in
   place by the active position pack — a receiver's orient window is a
   fraction of a quarterback's, and scoring one against the other's
   numbers would make the grade meaningless. Defaults are quarterback. */
export const BENCH = {
  observe:{ elite:220, good:380, ok:600 },
  orient: { elite:420, good:700, ok:1100 },
  decide: { elite:300, good:520, ok:850 },
  act:    { elite:220, good:360, ok:600 },
};

/** How long the defense needs to finish its own loop, in ms.
 *  Faster (harder) as level and stress climb. */
export function defenseLoopMs(level = 1, stress = 2){
  const base = lerp(2900, 1450, clamp((level - 1) / 9, 0, 1));
  const stressCut = (stress - 2) * 140;
  return Math.round(jitter(base - stressCut, 130));
}

/** Point the shared phase scoring at a position's benchmarks. */
export function applyBench(b){
  for(const p of PHASES) if(b[p]) Object.assign(BENCH[p], b[p]);
}

/** Re-word what each phase means for the active position. */
export function applyPhaseNotes(notes){
  for(const p of PHASES) if(notes?.[p]) PHASE_META[p].note = notes[p];
}

export class OodaRep {
  constructor(cfg = {}){
    this.cfg = cfg;
    this.marks = {};           // phase -> ms timestamp
    this.t0 = 0;               // snap
    this.rotationAt = 0;       // when the disguise broke
    this.phase = 'idle';
    this.defenseLoop = cfg.defenseLoop || defenseLoopMs(cfg.level, cfg.stress);
    this.flags = { killShown:false, killHonored:null, recallCorrect:null };
    this.answers = {};
  }

  snap(){ this.t0 = performance.now(); this.phase = 'observe'; }
  rotate(){ this.rotationAt = performance.now(); }

  /** Close a phase. Returns its duration in ms. */
  mark(phase){
    const now = performance.now();
    const from = phase === 'observe'
      ? (this.rotationAt || this.t0)
      : (this.marks[prevOf(phase)]?.at ?? this.rotationAt ?? this.t0);
    const ms = Math.max(0, Math.round(now - from));
    this.marks[phase] = { at:now, ms };
    const i = PHASES.indexOf(phase);
    this.phase = PHASES[i+1] || 'done';
    return ms;
  }

  ms(phase){ return this.marks[phase]?.ms ?? null; }

  get loopMs(){
    return PHASES.reduce((sum, p) => sum + (this.marks[p]?.ms || 0), 0);
  }
  get deltaLoop(){ return Math.round(this.defenseLoop - this.loopMs); }

  /** Probability the throw is completed, given Δ-loop and correctness. */
  outcome({ correctCoverage, correctRead, power = 0.55, contested = 0 }){
    const d = this.deltaLoop;
    // logistic on Δ: at Δ=0 the window is a coin flip; +600ms is wide open.
    let p = 1 / (1 + Math.exp(-d / 260));
    if(!correctCoverage) p *= 0.62;          // you threw with the wrong picture
    if(!correctRead)     p *= 0.28;          // you threw into the coverage
    p *= lerp(0.82, 1.06, clamp(power, 0, 1));
    p *= lerp(1, 0.72, clamp(contested, 0, 1));
    p = clamp(p, 0.02, 0.97);

    const roll = Math.random();
    let type;
    if(!correctRead && roll > p + 0.42) type = 'INT';
    else if(roll < p * 0.34 && correctRead && d > 220) type = 'TOUCHDOWN';
    else if(roll < p * 0.7) type = 'BIG PLAY';
    else if(roll < p) type = 'COMPLETE';
    else if(d < -450) type = 'SACK';
    else type = 'INCOMPLETE';

    return { type, p:+p.toFixed(3), delta:d, good:['TOUCHDOWN','BIG PLAY','COMPLETE'].includes(type) };
  }

  /** 0..100 rep score. Δ-loop is 45% of it — the app rewards the thing
   *  it claims to train. */
  score({ correctCoverage, correctRead, outcome, stopOk = true }){
    const d = this.deltaLoop;
    const deltaScore = clamp((d + 600) / 1400, 0, 1) * 45;
    const orientScore = phaseScore('orient', this.ms('orient')) * 20;
    const observeScore = phaseScore('observe', this.ms('observe')) * 12;
    const actScore = phaseScore('act', this.ms('act')) * 8;
    const accuracy = (correctCoverage ? 8 : 0) + (correctRead ? 7 : 0);
    const stop = stopOk ? 0 : -25;
    const bonus = outcome?.type === 'TOUCHDOWN' ? 6 : outcome?.type === 'INT' ? -12 : 0;
    return Math.round(clamp(deltaScore + orientScore + observeScore + actScore + accuracy + stop + bonus, 0, 100));
  }

  breakdown(){
    return PHASES.map(p => ({
      phase:p, ...PHASE_META[p],
      ms:this.ms(p),
      q:this.ms(p) == null ? 0 : phaseScore(p, this.ms(p)),
      bench:BENCH[p],
    }));
  }
}

function prevOf(phase){ return PHASES[PHASES.indexOf(phase) - 1]; }

/** 0..1 quality for a phase duration against its benchmarks. */
export function phaseScore(phase, ms){
  if(ms == null) return 0;
  const b = BENCH[phase];
  if(ms <= b.elite) return 1;
  if(ms >= b.ok * 2) return 0;
  if(ms <= b.good) return lerp(1, 0.75, (ms - b.elite) / (b.good - b.elite));
  if(ms <= b.ok)   return lerp(0.75, 0.45, (ms - b.good) / (b.ok - b.good));
  return lerp(0.45, 0, (ms - b.ok) / b.ok);
}

export function gradeOf(score){
  if(score >= 93) return { g:'S',  note:'Inside the loop, repeatedly. This is the target state.' };
  if(score >= 86) return { g:'A+', note:'Elite orientation speed with clean decisions.' };
  if(score >= 78) return { g:'A',  note:'You are winning the cycle more often than not.' };
  if(score >= 70) return { g:'B+', note:'Solid. The leak is in one phase, not all four.' };
  if(score >= 61) return { g:'B',  note:'Reads are right, the clock is beating you.' };
  if(score >= 52) return { g:'C+', note:'Orientation is the bottleneck. Drill the library.' };
  if(score >= 42) return { g:'C',  note:'Slow picture, late ball. Volume fixes this.' };
  if(score >= 30) return { g:'D',  note:'You are outside the loop. Slow the stress down a notch.' };
  return { g:'F', note:'Reset. Drop to CALM and rebuild the read.' };
}

/** Stress governor → concrete load parameters for the drills. */
export function stressProfile(level = 2){
  return [
    null,
    { id:1, name:'CALM',  crowd:0.05, cardMs:2600, clockMs:5200, jitterPx:0, killRate:0.10, recallRate:0.15, disguise:0.15, levelBump:0 },
    { id:2, name:'GAME',  crowd:0.42, cardMs:1700, clockMs:3600, jitterPx:1.4, killRate:0.18, recallRate:0.25, disguise:0.40, levelBump:1 },
    { id:3, name:'CHAOS', crowd:0.85, cardMs:1050, clockMs:2600, jitterPx:3.2, killRate:0.26, recallRate:0.35, disguise:0.70, levelBump:2 },
  ][level] || null;
}

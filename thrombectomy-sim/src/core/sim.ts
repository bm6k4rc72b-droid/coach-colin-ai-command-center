/**
 * The whole case as one state machine: code-stroke triage decisions, then the endovascular
 * procedure (navigation, device placement, passes, angiograms) on a simulated clock.
 * Pure (no DOM) so the UI, the guided demo and the tests share it.
 */
import { CASES, type Case } from '../config/cases';
import { BRANCH_HINT, buildTree, choose, pointOn, type Tree, type V3 } from './anatomy';
import { eTici, isSuccess, perfusedFraction, type ETici, type Occlusion } from './angio';
import { coreVolume, IMAGING_AT } from './physiology';
import { resolvePass, rng, type PassOutcome, type Technique } from './thrombus';

export type DeviceId = 'guide' | 'asp' | 'micro';

export interface Device {
  s: number;
  angle: number;
  inBody: boolean;
}

export type LogKind = 'info' | 'good' | 'warn' | 'bad';
export interface LogEntry {
  t: number;
  text: string;
  kind: LogKind;
}

export interface Decision {
  id: string;
  question: string;
  choice: string;
  correct: boolean | null;
  feedback: string;
}

export interface PassRecord {
  n: number;
  t: number;
  technique: Technique;
  flowArrest: boolean;
  embed: number;
  coverage: number;
  atFace: boolean;
  outcome: PassOutcome;
  grade: ETici;
}

export interface Triage {
  id: string;
  question: string;
  options: { id: string; label: string }[];
}

export const STENT_LENGTHS = [20, 30, 40];

/** Navigation cost (simulated minutes per mm moved). */
const NAV_COST = { guide: 0.02, asp: 0.022, micro: 0.03, retract: 0.004 };
const ARCH_FACTOR = { 1: 1, 2: 1.6, 3: 2.5 } as const;

export class Sim {
  c: Case;
  tree: Tree;
  phase: 'triage' | 'procedure' | 'done' = 'triage';
  /** Simulated minutes since hospital arrival. */
  t = 0;
  log: LogEntry[] = [];
  decisions: Decision[] = [];
  triageStep = 0;
  lysis = false;
  lysisAt: number | null = null;
  perfusionDone = false;
  anaesthesia: 'sedation' | 'ga' | null = null;
  groinAt: number | null = null;

  route: string[] = ['desc'];
  dev: Record<DeviceId, Device> = {
    guide: { s: 0, angle: 180, inBody: false },
    asp: { s: 0, angle: 0, inBody: false },
    micro: { s: 0, angle: 0, inBody: false },
  };
  active: DeviceId = 'guide';
  occ: Occlusion[] = [];
  stent: { from: number; to: number; deployedAt: number; length: number } | null = null;
  stentLength = 30;
  aspirating = false;
  bgcInflated = false;
  passes: PassRecord[] = [];
  runs: { t: number; grade: ETici; f: number; inj: { seg: string; u: number } }[] = [];
  /** Time the territory was reperfused (first eTICI ≥ 2b50) and to what extent. */
  reperfusedAt: number | null = null;
  reperfusedF = 0;
  complications: string[] = [];
  newTerritoryMl = 0;
  sich = false;
  /** Increments whenever the anatomy/occlusion picture changes (for renderers). */
  version = 0;
  private rand: () => number;
  private pushAtEnd = 0;
  private warned = new Set<string>();

  constructor(caseId = 'm1', seed = 7) {
    this.c = CASES.find((k) => k.id === caseId) ?? CASES[0];
    this.tree = buildTree(this.c.arch);
    this.rand = rng(seed);
    const cl = this.c.clot;
    const L = this.tree.segs[cl.segment].length;
    this.occ = [{ seg: cl.segment, u: cl.from * L, kind: 'clot', len: (cl.to - cl.from) * L + (cl.intoM1 ?? 0) * this.tree.segs.m1.length }];
    this.say(`Code stroke: ${this.c.age}${this.c.sex}, NIHSS ${this.c.nihss}. ${this.c.summary}`, 'info');
  }

  say(text: string, kind: LogKind = 'info'): void {
    this.log.push({ t: this.t, text, kind });
    if (this.log.length > 200) this.log.shift();
  }

  /** Last known well → now, in minutes. */
  get sinceOnset(): number {
    return this.c.onsetToDoor + this.t;
  }

  get core(): number {
    return coreVolume(this.c, this.t, this.reperfusedAt === null ? null : { at: this.reperfusedAt, fraction: this.reperfusedF });
  }

  get perfused(): number {
    return perfusedFraction(this.tree, this.occ);
  }

  // ------------------------------------------------------------------ triage --
  triageQuestions(): Triage[] {
    const c = this.c;
    const q: Triage[] = [
      { id: 'perfusion', question: 'CTA shows a large-vessel occlusion. Do you need CT perfusion before deciding?', options: [{ id: 'skip', label: 'No — decide on CT + CTA' }, { id: 'get', label: 'Yes — get CT perfusion (+8 min)' }] },
    ];
    if (c.bp[0] > 185 || c.bp[1] > 110)
      q.push({ id: 'bp', question: `BP is ${c.bp[0]}/${c.bp[1]}. What now?`, options: [{ id: 'lower', label: 'IV labetalol to ≤ 185/110 first' }, { id: 'ignore', label: 'Proceed — BP does not matter yet' }] });
    q.push({ id: 'lysis', question: 'IV thrombolysis (tenecteplase 0.25 mg/kg bolus)?', options: [{ id: 'give', label: 'Give tenecteplase' }, { id: 'withhold', label: 'Withhold' }] });
    q.push({ id: 'evt', question: 'Mechanical thrombectomy?', options: [{ id: 'proceed', label: 'Proceed — activate the angio team' }, { id: 'decline', label: 'Not a candidate' }] });
    q.push({ id: 'anaesthesia', question: 'Anaesthesia for the procedure?', options: [{ id: 'sedation', label: 'Conscious sedation' }, { id: 'ga', label: 'General anaesthesia' }] });
    return q;
  }

  get triageCurrent(): Triage | null {
    return this.phase === 'triage' ? this.triageQuestions()[this.triageStep] ?? null : null;
  }

  /** Imaging that happens before the first decision. */
  beginTriage(): void {
    if (this.t > 0) return;
    this.t = 15;
    this.say(`Non-contrast CT at 15 min: no haemorrhage, early ischaemic change — ASPECTS ${this.c.aspects}.`, 'info');
    this.t = IMAGING_AT;
    const where = this.c.clot.segment === 'ica' ? 'left ICA terminus (T-occlusion)' : 'left proximal M1';
    this.say(`CT angiogram: occlusion of the ${where}. Collaterals: ${this.c.collaterals}.`, 'info');
  }

  decide(id: string, choice: string): void {
    const q = this.triageCurrent;
    if (!q || q.id !== id) return;
    const c = this.c;
    const late = c.onsetToDoor + this.t > 360;
    let correct: boolean | null = null;
    let fb = '';
    if (id === 'perfusion') {
      if (choice === 'get') {
        this.t += 8;
        this.perfusionDone = true;
        correct = c.answers.perfusionNeeded ? true : null;
        fb = `CT perfusion: core ${c.coreAtImaging} mL, hypoperfused ${c.hypoperfused} mL (mismatch ratio ${(c.hypoperfused / c.coreAtImaging).toFixed(1)}).` + (c.answers.perfusionNeeded ? ' Required here: beyond 6 h, DAWN/DEFUSE-3 selection needs it.' : ' Acceptable, but within 6 h it is not required. Do not let it delay the groin puncture.');
      } else if (c.answers.perfusionNeeded) {
        correct = false;
        this.t += 8;
        this.perfusionDone = true;
        fb = `In the 6–24 h window you need perfusion (or MRI) to show salvageable tissue (DAWN, DEFUSE-3). Getting it now: core ${c.coreAtImaging} mL, hypoperfused ${c.hypoperfused} mL.`;
      } else {
        correct = true;
        fb = 'Right: within 6 h, CT (ASPECTS) + CTA is enough. Every minute saved matters more than extra imaging.';
      }
    } else if (id === 'bp') {
      if (choice === 'lower') {
        this.t += 8;
        correct = true;
        fb = 'Correct: BP must be ≤ 185/110 before thrombolysis and kept ≤ 180/105 for 24 h afterwards.';
      } else {
        correct = false;
        this.t += 8;
        fb = 'Thrombolysis with BP above 185/110 raises bleeding risk. The nurse gives labetalol anyway (+8 min).';
      }
    } else if (id === 'lysis') {
      const ok = c.answers.thrombolysis;
      correct = choice === ok;
      if (choice === 'give') {
        this.lysis = true;
        this.lysisAt = this.t;
        this.t += 3;
      }
      fb =
        ok === 'give'
          ? correct
            ? `Correct: ${Math.round((c.onsetToDoor + this.t) / 6) / 10} h from onset, no contraindication. Bolus given; it does not replace thrombectomy.`
            : 'Missed opportunity: she is within 4.5 h with no contraindication. Guidelines recommend thrombolysis for eligible patients even when thrombectomy is planned.'
          : correct
            ? late
              ? 'Correct: beyond 4.5 h from last known well, standard thrombolysis is not indicated.'
              : 'Correct: by the time a bolus could be given she is past 4.5 h from onset.'
            : 'Outside the licensed window, thrombolysis adds haemorrhage risk without proven benefit here. (Given — the risk is now higher.)';
    } else if (id === 'evt') {
      correct = choice === c.answers.thrombectomy;
      fb = correct
        ? c.id === 'core'
          ? 'Correct: large-core trials (SELECT2, ANGEL-ASPECT, RESCUE-Japan LIMIT, TENSION) showed benefit even with ASPECTS 3–5.'
          : c.id === 'late'
            ? 'Correct: clinical–core mismatch in the 6–24 h window (DAWN/DEFUSE-3). Thrombectomy roughly triples the chance of independence here.'
            : 'Correct: anterior LVO, NIHSS ≥ 6, ASPECTS ≥ 6, within 6 h — the HERMES population. Number needed to treat ≈ 2.6 for one less disability level.'
        : 'This patient does meet criteria; declining would leave most of the penumbra to die. Proceeding.';
    } else if (id === 'anaesthesia') {
      this.anaesthesia = choice as 'sedation' | 'ga';
      correct = null;
      this.t += choice === 'ga' ? 14 : 5;
      fb =
        choice === 'ga'
          ? 'Reasonable: a still patient and airway protection. Avoid hypotension at induction and keep SBP ≥ 140.'
          : 'Reasonable: faster start and continuous neuro checks; be ready to convert if the patient cannot stay still.';
    }
    this.decisions.push({ id, question: q.question, choice: q.options.find((o) => o.id === choice)?.label ?? choice, correct, feedback: fb });
    this.say(fb, correct === false ? 'bad' : correct ? 'good' : 'info');
    this.triageStep++;
    if (!this.triageCurrent) this.startProcedure();
  }

  private startProcedure(): void {
    this.t += 15;
    this.say('Transferred to the angio suite.', 'info');
    this.t += 5;
    this.groinAt = this.t;
    this.phase = 'procedure';
    this.dev.guide = { s: 0, angle: 180, inBody: true };
    this.dev.asp = { s: 0, angle: 0, inBody: true };
    this.dev.micro = { s: 0, angle: 0, inBody: true };
    this.say(`Femoral access at ${fmt(this.t)} (door-to-groin). 8F balloon guide catheter in the descending aorta.`, 'info');
    this.version++;
  }

  // ------------------------------------------------------------------- route --
  get routeLength(): number {
    return this.route.reduce((a, id) => a + this.tree.segs[id].length, 0);
  }

  /** Segment and local arc length at a route distance. */
  locate(s: number): { seg: string; u: number; start: number } {
    let acc = 0;
    for (const id of this.route) {
      const L = this.tree.segs[id].length;
      if (s <= acc + L || id === this.route[this.route.length - 1]) return { seg: id, u: Math.min(L, s - acc), start: acc };
      acc += L;
    }
    return { seg: this.route[0], u: 0, start: 0 };
  }

  /** Route distance of the start of a segment on the route, or null. */
  segStart(id: string): number | null {
    let acc = 0;
    for (const r of this.route) {
      if (r === id) return acc;
      acc += this.tree.segs[r].length;
    }
    return null;
  }

  pointAt(s: number): { p: V3; r: number } {
    const l = this.locate(s);
    return pointOn(this.tree.segs[l.seg], l.u);
  }

  /** Main clot (or residual) range on the current route, in route mm. */
  clotRange(): { from: number; to: number } | null {
    const main = this.occ.find((o) => o.kind === 'clot' || o.kind === 'residual');
    if (!main) return null;
    const st = this.segStart(main.seg);
    if (st === null) return null;
    const from = st + main.u;
    let to = from + main.len;
    // A clot only extends into the next segment along the route if that is where it really is (ICA-T → M1).
    const segEnd = st + this.tree.segs[main.seg].length;
    const next = this.route[this.route.indexOf(main.seg) + 1];
    if (to > segEnd && next !== 'm1') to = segEnd;
    return { from, to };
  }

  /** What the leading tip will enter at the next junction. */
  nextJunction(d: DeviceId = this.active): { at: string; into: string | null; hint: string; distance: number } | null {
    const tip = this.dev[d].s;
    const last = this.route[this.route.length - 1];
    const end = this.routeLength;
    if (tip < end - 25) return null;
    const into = choose(this.tree, last, this.dev[d].angle);
    return { at: last, into, hint: BRANCH_HINT[last] ?? '', distance: end - tip };
  }

  private extendRoute(d: DeviceId): void {
    while (this.dev[d].s > this.routeLength) {
      const last = this.route[this.route.length - 1];
      const next = choose(this.tree, last, this.dev[d].angle);
      if (!next) {
        this.dev[d].s = this.routeLength;
        return;
      }
      this.route.push(next);
      this.onEnter(d, next);
    }
  }

  private trimRoute(): void {
    const reach = Math.max(this.dev.guide.s, this.dev.asp.s, this.dev.micro.s, this.stent ? this.stent.to : 0);
    while (this.route.length > 1) {
      const st = this.segStart(this.route[this.route.length - 1])!;
      if (st > reach + 0.5) this.route.pop();
      else break;
    }
  }

  private onEnter(d: DeviceId, seg: string): void {
    const name = this.tree.segs[seg].name;
    const wrong: Record<string, string> = {
      lsa: 'Wrong vessel: left subclavian. Pull back and rotate the tip down to follow the arch, then up at the left carotid.',
      bct: 'Wrong vessel: brachiocephalic trunk (right side). Pull back — the left common carotid is the previous branch.',
      asc: 'Into the ascending aorta: you passed the left carotid origin. Pull back.',
      eca: 'Wrong vessel: external carotid. Pull back to the bifurcation and turn the tip back (0°) for the ICA.',
      a1: 'Into the A1 (anterior cerebral). The occlusion is in the MCA: pull back and turn the tip lateral (0°).',
    };
    if (wrong[seg]) this.say(wrong[seg], 'warn');
    else if (['lcca', 'ica', 'm1', 'm2s', 'm2i'].includes(seg)) this.say(`${d === 'guide' ? 'Guide' : d === 'asp' ? 'Aspiration catheter' : 'Microwire'} into the ${name}.`, 'good');
    else if (seg.startsWith('m3')) this.say(`Microwire in a small cortical branch (${name}): go gently — perforation risk.`, 'warn');
    this.version++;
  }

  /** Limits for advancing each device. */
  private maxS(d: DeviceId): number {
    const g = this.dev.guide.s;
    const clot = this.clotRange();
    if (d === 'guide') {
      const ica = this.segStart('ica');
      if (ica !== null && this.route.includes('ica')) return ica + 58; // the petrous ICA: guides stay below the skull base
      return Infinity;
    }
    if (d === 'asp') {
      let m = Math.max(g + 20, this.dev.micro.s - 1);
      if (clot) m = Math.min(m, clot.from - 0.3);
      // A large-bore aspiration catheter (~1.8 mm OD) will not go where the lumen is narrower than ~1.9 mm.
      for (let x = Math.max(g, this.dev.asp.s); x <= Math.min(m, this.routeLength); x += 0.5) {
        if (this.pointAt(x).r < 0.95) return Math.min(m, x);
      }
      return m;
    }
    return Infinity;
  }

  /** Move the given device by `mm` (negative to retract). */
  move(d: DeviceId, mm: number): void {
    if (this.phase !== 'procedure') return;
    const dv = this.dev[d];
    const before = dv.s;
    let target = Math.max(d === 'guide' ? 0 : Math.min(this.dev.guide.s, dv.s), dv.s + mm);
    if (mm > 0) target = Math.min(target, this.maxS(d));
    if (mm > 0 && d === 'guide' && target >= this.maxS('guide') - 0.01 && !this.warned.has('guide-stop')) {
      this.warned.add('guide-stop');
      this.say('The guide stays in the cervical ICA, below the skull base. Pushing it into the petrous segment risks dissection.', 'warn');
    }
    if (mm > 0 && d === 'asp') {
      const clot = this.clotRange();
      if (clot && target >= clot.from - 0.35 && !this.warned.has('asp-face')) {
        this.warned.add('asp-face');
        this.say('Aspiration catheter at the face of the clot.', 'good');
      }
    }
    dv.s = Math.max(0, target);
    // Pushing a wire against the end of a small cortical branch perforates it.
    if (d === 'micro' && mm > 0) {
      this.extendRoute('micro');
      const l = this.locate(dv.s);
      const terminal = this.tree.segs[l.seg].children.length === 0;
      if (terminal && l.u >= this.tree.segs[l.seg].length - 0.5) {
        this.pushAtEnd += mm;
        if (this.pushAtEnd > 4 && !this.complications.includes('perforation')) {
          this.complications.push('perforation');
          this.sich = true;
          this.say('Contrast extravasation: the wire has perforated a distal branch (subarachnoid haemorrhage). In real life: pull back, reverse heparin, consider balloon tamponade.', 'bad');
        } else if (!this.warned.has('wire-end')) {
          this.warned.add('wire-end');
          this.say('The wire is buckling against the end of a small branch. Stop pushing!', 'warn');
        }
      } else this.pushAtEnd = 0;
    } else if (mm > 0) {
      this.extendRoute(d);
      if (d === 'guide' && dv.s > this.maxS('guide')) {
        dv.s = this.maxS('guide');
        this.trimRoute();
        if (!this.warned.has('guide-stop')) {
          this.warned.add('guide-stop');
          this.say('The guide stays in the cervical ICA, below the skull base. Pushing it into the petrous segment risks dissection.', 'warn');
        }
      }
    }
    if (d !== 'guide' && d !== 'micro' && dv.s > this.routeLength) dv.s = this.routeLength;
    // Inner devices travel with the guide when it is pulled back past them.
    if (d === 'guide' && mm < 0) {
      for (const k of ['asp', 'micro'] as DeviceId[]) if (this.dev[k].s > dv.s && this.dev[k].s <= before + 0.01) this.dev[k].s = Math.min(this.dev[k].s, dv.s);
    }
    if (mm < 0) this.trimRoute();
    // Travel inside the guide is quick; time is spent where the tip is in the patient's vessels.
    const moved = d === 'guide' ? Math.abs(dv.s - before) : Math.max(0, Math.max(dv.s, before) - Math.max(this.dev.guide.s, Math.min(dv.s, before)));
    const archy = d === 'guide' && ['desc', 'arch1', 'arch2', 'lcca'].includes(this.locate(dv.s).seg);
    this.t += moved * (mm < 0 ? NAV_COST.retract : NAV_COST[d] * (archy ? ARCH_FACTOR[this.c.arch] : 1));
  }

  rotate(d: DeviceId, deg: number): void {
    this.dev[d].angle = (((this.dev[d].angle + deg) % 360) + 360) % 360;
  }

  setAngle(d: DeviceId, deg: number): void {
    this.dev[d].angle = ((deg % 360) + 360) % 360;
  }

  // ----------------------------------------------------------------- actions --
  guideIn(seg: string): boolean {
    return this.locate(this.dev.guide.s).seg === seg;
  }

  /** Is the microcatheter tip beyond the distal end of the clot? */
  crossed(): boolean {
    const cl = this.clotRange();
    return !!cl && this.dev.micro.s > cl.to + 1;
  }

  atFace(): boolean {
    const cl = this.clotRange();
    return !!cl && this.dev.asp.s >= cl.from - 3 && this.dev.asp.s <= cl.from;
  }

  runDsa(): { grade: ETici; f: number } | null {
    if (this.phase !== 'procedure') return null;
    const l = this.locate(this.dev.guide.s);
    this.t += 1.5;
    const f = this.perfused;
    const grade = eTici(f);
    this.runs.push({ t: this.t, grade, f, inj: { seg: l.seg, u: l.u } });
    if (!['lcca', 'ica'].includes(l.seg)) this.say('Injection from the arch/neck: for a selective cerebral run, put the guide in the left carotid first.', 'warn');
    else this.say(this.runs.length === 1 ? `Diagnostic run: eTICI ${grade}. ${this.passes.length ? '' : 'The occlusion is confirmed.'}` : `Control run: eTICI ${grade}.`, isSuccess(grade) ? 'good' : 'info');
    this.version++;
    return { grade, f };
  }

  setStentLength(mm: number): void {
    if (!this.stent) this.stentLength = mm;
  }

  deployStent(): boolean {
    if (this.phase !== 'procedure' || this.stent) return false;
    const cl = this.clotRange();
    if (!cl || !this.crossed()) {
      this.say('Cross the clot with the microcatheter first: the stent is deployed from beyond the clot back across it.', 'warn');
      return false;
    }
    const to = this.dev.micro.s;
    const from = to - this.stentLength;
    this.stent = { from, to, deployedAt: this.t, length: this.stentLength };
    this.dev.micro.s = Math.max(this.dev.guide.s, from - 2);
    this.t += 1;
    const cov = this.coverage();
    const distal = this.locate(to).seg;
    this.say(
      `Stent retriever (${this.stentLength} mm) unsheathed: covers ${Math.round(cov * 100)}% of the clot.` +
        (cov < 0.999 ? ' Part of the clot sits outside the stent.' : ' Good: wait ~3–5 min for it to embed.') +
        (distal.startsWith('m3') ? ' Its tip is in a small M3 branch — risk of vasospasm.' : ''),
      cov < 0.999 ? 'warn' : 'good',
    );
    this.version++;
    return true;
  }

  coverage(): number {
    const cl = this.clotRange();
    if (!cl || !this.stent) return 0;
    const ov = Math.max(0, Math.min(cl.to, this.stent.to) - Math.max(cl.from, this.stent.from));
    return ov / (cl.to - cl.from);
  }

  wait(minutes = 1): void {
    if (this.phase === 'done') return;
    this.t += minutes;
    if (this.stent) this.say(`Waiting… stent embedded for ${(this.t - this.stent.deployedAt).toFixed(1)} min.`, 'info');
  }

  setBalloon(on: boolean): void {
    if (on && !['lcca', 'ica'].includes(this.locate(this.dev.guide.s).seg)) {
      this.say('Inflate the balloon guide only in the carotid: it arrests forward flow during retrieval.', 'warn');
      return;
    }
    this.bgcInflated = on;
    this.t += 0.3;
    this.say(on ? 'Balloon guide inflated: flow arrest.' : 'Balloon guide deflated.', 'info');
  }

  setAspiration(on: boolean): void {
    if (on && this.dev.asp.s <= this.dev.guide.s + 1) {
      this.say('Aspirating through the guide only. For aspiration thrombectomy, advance the aspiration catheter to the clot face first.', 'warn');
    }
    this.aspirating = on;
    this.t += 0.3;
    if (on) this.say(this.atFace() ? 'Aspiration on at the clot face: wait for the pump to stall (clot engaged).' : 'Aspiration on.', 'info');
  }

  /** Pull the stent / aspiration catheter back with the clot: one pass. */
  retrieve(): PassRecord | null {
    if (this.phase !== 'procedure') return null;
    const usingStent = !!this.stent;
    const usingAsp = this.aspirating && this.dev.asp.s > this.dev.guide.s + 1;
    if (!usingStent && !usingAsp) {
      this.say('Nothing to retrieve with: deploy a stent retriever, or aspirate through a catheter at the clot face.', 'warn');
      return null;
    }
    const technique: Technique = usingStent && usingAsp ? 'combined' : usingStent ? 'stent' : 'aspiration';
    const embed = this.stent ? this.t - this.stent.deployedAt : 0;
    const coverage = this.coverage();
    const atFace = this.atFace();
    const n = this.passes.length + 1;
    const cl = this.c.clot;
    const hasClot = !!this.occ.find((o) => o.kind === 'clot' || o.kind === 'residual');
    const flowArrest = this.bgcInflated;
    const outcome = resolvePass(
      { technique, clot: cl.type, clotLength: cl.lengthMm, flowArrest: this.bgcInflated, embedMinutes: embed, coverage: usingStent ? coverage : 1, atFace, pass: n, icaT: cl.segment === 'ica' },
      [this.rand(), this.rand(), this.rand()],
    );
    this.t += 2;
    if (hasClot) this.applyPass(outcome);
    // Devices come out with the clot.
    this.stent = null;
    this.dev.micro.s = this.dev.guide.s;
    if (usingAsp) this.dev.asp.s = this.dev.guide.s;
    this.aspirating = false;
    if (this.bgcInflated) {
      this.bgcInflated = false;
      this.say('Balloon deflated after the pass.', 'info');
    }
    this.trimRoute();
    if (n >= 3 && this.rand() < 0.25 && !this.complications.includes('vasospasm')) {
      this.complications.push('vasospasm');
      this.say('Vasospasm in the ICA after repeated passes (often treated with intra-arterial nimodipine or verapamil).', 'warn');
    }
    const f = this.perfused;
    const grade = eTici(f);
    if (isSuccess(grade) && this.reperfusedAt === null) {
      this.reperfusedAt = this.t;
      this.reperfusedF = f;
    } else if (this.reperfusedAt !== null) this.reperfusedF = Math.max(this.reperfusedF, f);
    const rec: PassRecord = { n, t: this.t, technique, flowArrest, embed, coverage, atFace, outcome, grade };
    this.passes.push(rec);
    const word = outcome.result === 'complete' ? 'Clot retrieved whole' : outcome.result === 'partial' ? 'Part of the clot retrieved' : 'Device came back empty';
    this.say(`Pass ${n} (${technique}): ${word}${outcome.distalEmboli ? ', with small distal emboli' : ''}${outcome.newTerritory ? ', and a fragment went to the ACA (new territory)' : ''}. Run an angiogram to grade it.`, outcome.result === 'complete' ? 'good' : outcome.result === 'partial' ? 'warn' : 'bad');
    this.version++;
    return rec;
  }

  private applyPass(o: PassOutcome): void {
    const segs = this.tree.segs;
    const keep = this.occ.filter((x) => x.kind !== 'clot' && x.kind !== 'residual');
    if (o.result === 'complete') this.occ = keep;
    else if (o.result === 'partial') {
      const main = this.occ.find((x) => x.kind === 'clot' || x.kind === 'residual')!;
      if (main.seg === 'ica') this.occ = [...keep, { seg: 'm1', u: segs.m1.length * 0.2, kind: 'residual', len: segs.m1.length * 0.5 }];
      else if (main.seg === 'm1') {
        const trunk = this.rand() < 0.5 ? 'm2s' : 'm2i';
        this.occ = [...keep, { seg: trunk, u: segs[trunk].length * 0.3, kind: 'residual', len: 5 }];
      } else this.occ = [...keep, { seg: main.seg, u: Math.min(main.u + 2, segs[main.seg].length - 3), kind: 'residual', len: 3 }];
    } else return;
    if (o.distalEmboli) {
      const branches = ['m3a', 'm3b', 'm3c', 'm3d', 'm3e', 'm3f'];
      const b = branches[Math.floor(this.rand() * branches.length)];
      this.occ.push({ seg: b, u: segs[b].length * 0.72, kind: 'embolus', len: 2 });
      if (!this.complications.includes('distal emboli')) this.complications.push('distal emboli');
    }
    if (o.newTerritory) {
      this.occ.push({ seg: 'a2', u: segs.a2.length * 0.45, kind: 'new-territory', len: 3 });
      this.newTerritoryMl += 12;
      if (!this.complications.includes('emboli to a new territory')) this.complications.push('emboli to a new territory');
    }
  }

  /** Finish: requires a control angiogram after the last pass. */
  finish(): boolean {
    if (this.phase !== 'procedure') return false;
    const lastPass = this.passes[this.passes.length - 1];
    const lastRun = this.runs[this.runs.length - 1];
    if (lastPass && (!lastRun || lastRun.t < lastPass.t)) {
      this.say('Run a control angiogram before you finish — you need to see the result.', 'warn');
      return false;
    }
    this.phase = 'done';
    this.say('Procedure complete. Sheath out, closure device, transfer to the stroke unit.', 'info');
    this.version++;
    return true;
  }

  /** The suggested next step, for the mentor panel. */
  hint(): string {
    if (this.phase === 'triage') return 'Make the code-stroke decisions: imaging, blood pressure, thrombolysis, thrombectomy, anaesthesia.';
    if (this.phase === 'done') return 'See the debrief.';
    const g = this.locate(this.dev.guide.s).seg;
    if (!['lcca', 'ica'].includes(g) || (g === 'lcca' && this.dev.guide.s < (this.segStart('lcca') ?? 0) + 60)) {
      const j = this.nextJunction('guide');
      return `Guide: advance up the aorta and into the LEFT common carotid, then the internal carotid. ${j?.hint ? `Next junction — ${j.hint}.` : j && !j.into ? 'End of this vessel — you are in the wrong branch: pull back.' : ''}`;
    }
    if (!this.guideIn('ica')) return 'Guide: continue into the cervical internal carotid (turn the tip back, 0°, at the bifurcation).';
    if (!this.runs.length) return 'Run a diagnostic angiogram (DSA) to see the occlusion.';
    const last = this.runs[this.runs.length - 1];
    if (isSuccess(last.grade) && (!this.passes.length || last.t >= this.passes[this.passes.length - 1].t)) {
      return last.grade === '3' || last.grade === '2c' ? 'Excellent reperfusion. Finish the procedure.' : `eTICI ${last.grade} is a success. Another pass could improve it — or stop here (more passes, more risk).`;
    }
    if (this.passes.length && last.t < this.passes[this.passes.length - 1].t) return 'Run a control angiogram to grade this pass.';
    if (!this.crossed() && !this.stent) {
      if (this.dev.micro.s <= this.dev.guide.s + 1) return 'Select the microcatheter and wire. Advance them up the ICA (tip lateral, 0°, at the ICA terminus for the M1).';
      return 'Microwire: cross the clot gently and park the microcatheter in an M2 trunk beyond it.';
    }
    if (!this.stent && !this.atFace()) return 'Choose your technique: deploy a stent retriever across the clot, and/or bring the aspiration catheter up to the clot face.';
    if (this.stent && this.t - this.stent.deployedAt < 3) return 'Let the stent embed (wait ~3 min). Bring the aspiration catheter to the clot face for a combined technique.';
    if (!this.bgcInflated) return 'Inflate the balloon guide (flow arrest), switch aspiration on, then retrieve.';
    if (!this.aspirating && this.atFace()) return 'Switch aspiration on, then retrieve.';
    return 'Retrieve: pull back under aspiration.';
  }

  /** Door-to-groin, groin-to-reperfusion and so on. */
  metrics() {
    const lysisDecision = this.decisions.find((d) => d.id === 'lysis');
    return {
      doorToNeedle: this.lysisAt,
      doorToGroin: this.groinAt,
      groinToReperfusion: this.reperfusedAt !== null && this.groinAt !== null ? this.reperfusedAt - this.groinAt : null,
      onsetToReperfusion: this.reperfusedAt !== null ? this.reperfusedAt + this.c.onsetToDoor : null,
      firstPass: this.passes.length >= 1 && ['2c', '3'].includes(this.passes[0].grade),
      lysisDecision,
    };
  }
}

export const fmt = (minutes: number) => {
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

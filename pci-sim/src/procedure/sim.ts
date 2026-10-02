/**
 * The whole case as a pure, DOM-free simulation. The renderer and UI read from it; keyboard,
 * mouse and the demo autopilot all drive it through the same SimInput + action methods.
 */
import {
  BALLOON,
  CONTRAST,
  FLUORO,
  GUIDE,
  HEPARIN_UNITS,
  INFLATION,
  INPUT,
  LESION,
  PHYSIOLOGY,
  STENT,
  WIRE,
} from '../config/anatomy';
import { clamp, makeRng } from '../anatomy/math';
import {
  computeLumen,
  lesionEnd,
  lesionStart,
  measureQCA,
  worstStenosis,
  type LiveBalloon,
  type QCA,
  type Treatment,
} from '../anatomy/lumen';
import { buildAnatomy, CORONARY_IDS, valueAt, type Anatomy, type VesselId } from '../anatomy/vessels';
import {
  aorticInjection,
  cineLength,
  computeFactors,
  distalFactor,
  selectiveInjection,
  timiGrade,
  type Dissection,
  type FlowField,
  type Occlusion,
} from '../physics/flow';
import {
  canResize,
  catheterDiameter,
  isInflated,
  isOccluding,
  newCatheter,
  stepCatheter,
  type CatheterState,
  type InflationRecord,
} from '../physics/balloon';
import { facesLeftCusp, initialGuide, stepGuide, type GuideState } from '../physics/guide';
import type { Msg, MsgLevel } from '../physics/messages';
import { initialPhysiology, stepPhysiology, type Physiology } from '../physics/physiology';
import { locate, upcomingBranch } from '../physics/route';
import { initialWire, stepWire, wireIsOut, type WireState } from '../physics/wire';
import { TOOLS, toolAvailability, type ToolId } from '../tools/tools';
import { buildDebrief, type CaseSummary, type Debrief } from './debrief';
import type { CatheterSnap, Snapshot } from './snapshot';
import { initialProgress, STAGES, updateProgress, type StageProgress } from './stages';

export interface SimInput {
  /** Held advance (−1..1). */
  advance: number;
  fine: boolean;
  /** Held rotation (−1..1), + = clockwise. */
  rotate: number;
  inflate: boolean;
  /** Edge-triggered deflate. */
  deflate: boolean;
  /** Fluoro pedal held. */
  pedal: boolean;
  /** Accumulated wheel notches this frame (+ = advance). */
  wheel: number;
  /** Held C-arm nudge (deg/s direction) from arrow keys. */
  carmLao: number;
  carmCra: number;
}

export const emptyInput = (): SimInput => ({
  advance: 0,
  fine: false,
  rotate: 0,
  inflate: false,
  deflate: false,
  pedal: false,
  wheel: 0,
  carmLao: 0,
  carmCra: 0,
});

export interface Injection {
  t: number;
  mode: 'selective' | 'aortic';
  lao: number;
  cra: number;
  afterStent: boolean;
  ml: number;
}

export interface StentRecord {
  vessel: VesselId;
  s0: number;
  s1: number;
  /** Achieved expanded diameter (before recoil). */
  diameter: number;
  nominalD: number;
  length: number;
  deployedAt: number;
}

export interface Cine {
  start: number;
  duration: number;
  mode: 'selective' | 'aortic';
}

export interface TimedMsg extends Msg {
  t: number;
  id: number;
}

export interface LogEntry {
  t: number;
  text: string;
}

export interface Beat {
  t: number;
  rr: number;
  pvc: boolean;
  st: number;
}

export type Acquisition = 'off' | 'fluoro' | 'cine';

export interface CArm {
  lao: number;
  cra: number;
}

export function projectionName(c: CArm): string {
  const lao = Math.round(c.lao);
  const cra = Math.round(c.cra);
  const a = lao === 0 ? 'AP' : lao > 0 ? `LAO ${lao}` : `RAO ${-lao}`;
  const b = cra === 0 ? '' : cra > 0 ? ` CRA ${cra}` : ` CAU ${-cra}`;
  return a + b;
}

/** Number of mutually distinct projections (≥ threshold apart in LAO or CRA). */
export function distinctViews(views: CArm[], threshold = FLUORO.distinctViewDegrees): number {
  const kept: CArm[] = [];
  for (const v of views) {
    if (kept.every((k) => Math.max(Math.abs(k.lao - v.lao), Math.abs(k.cra - v.cra)) >= threshold)) kept.push(v);
  }
  return kept.length;
}

export interface SimOptions {
  seed?: number;
  rng?: () => number;
}

export class Simulation {
  readonly anat: Anatomy;
  readonly lesion = LESION;
  readonly rng: () => number;
  t = 0;
  tool: ToolId = 'guide';
  guide: GuideState = initialGuide();
  wire: WireState = initialWire();
  catheter: CatheterState | null = null;
  balloonSize = { d: 2.5, l: 15 };
  stentSize = { d: 3.0, l: 18 };
  stents: StentRecord[] = [];
  balloonTreatments: Treatment[] = [];
  dissections: Dissection[] = [];
  live: LiveBalloon | null = null;
  lumen: Record<VesselId, number[]>;
  /** Bumped whenever any lumen changes (renderer rebuilds vessel meshes). */
  lumenVersion = 0;
  factors: Partial<Record<VesselId, number[]>> = {};
  ladFlow = 1;
  timi = 3;
  physio: Physiology = initialPhysiology();
  contrastMl = 0;
  fluoroTime = 0;
  acquisition: Acquisition = 'off';
  cine: Cine | null = null;
  /** Contrast field of the most recent injection, and when it started. */
  field: FlowField | null = null;
  fieldStart = -Infinity;
  fieldVersion = 0;
  carm: CArm = { lao: -30, cra: 30 };
  presetIndex = 0;
  view: '3d' | 'fluoro' = '3d';
  inflations: InflationRecord[] = [];
  ruptures = 0;
  injections: Injection[] = [];
  qca: QCA | null = null;
  flags = {
    fluoroSeenGuide: false,
    angioDone: false,
    predilInflated: false,
    predilationDone: false,
    qcaDone: false,
    stentDeflated: false,
    everInLAD: false,
  };
  progress: StageProgress = initialProgress();
  messages: TimedMsg[] = [];
  log: LogEntry[] = [];
  beats: Beat[] = [];
  beatPhase = 0;
  finished = false;
  finishedAt: number | null = null;
  demo = false;
  /** The coronary wire has been introduced into the guide (drawn from then on). */
  wireLoaded = false;
  /** Stage indices completed since the UI last looked (UI clears it). */
  stageEvents: number[] = [];
  private msgId = 0;
  private lastMsgAt = new Map<string, number>();
  private oversizeThisInflation = false;
  private activeStent: StentRecord | null = null;
  private wasChestPain = false;
  private wasUnstable = false;
  private lastUnstableNag = -Infinity;
  private wasPvcRisk = false;
  private lumenDirty = true;
  private flowDirty = true;
  private lastOcclusionKey = '';

  constructor(opts: SimOptions = {}, anatomy?: Anatomy) {
    this.anat = anatomy ?? buildAnatomy();
    this.rng = opts.rng ?? makeRng(opts.seed ?? 20261002);
    this.lumen = {} as Record<VesselId, number[]>;
    this.recomputeLumen();
    this.recomputeFlow();
    this.logEvent('Case started.');
  }

  // --------------------------------------------------------------- messages --
  say(level: MsgLevel, text: string, repeatAfter = 4): void {
    const last = this.lastMsgAt.get(text);
    if (last !== undefined && this.t - last < repeatAfter) return;
    this.lastMsgAt.set(text, this.t);
    this.messages.push({ level, text, t: this.t, id: ++this.msgId });
    if (this.messages.length > 60) this.messages.splice(0, this.messages.length - 60);
  }

  private sayAll(ms: Msg[]): void {
    for (const m of ms) this.say(m.level, m.text);
  }

  logEvent(text: string): void {
    this.log.push({ t: this.t, text });
  }

  // ----------------------------------------------------------------- derived --
  get wireOut(): boolean {
    return wireIsOut(this.wire);
  }

  get guideAtRoot(): boolean {
    return !this.guide.engaged && this.guide.s >= this.anat.landmarks.root - 1e-6;
  }

  wireLocus() {
    return locate(this.anat, this.wire.legs, this.wire.d);
  }

  catheterRange(): { vessel: VesselId; s0: number; s1: number } | null {
    const c = this.catheter;
    if (!c) return null;
    const a = locate(this.anat, this.wire.legs, c.pos - c.length);
    const b = locate(this.anat, this.wire.legs, c.pos);
    if (c.pos - c.length < GUIDE.engagedDepth - 0.5) {
      // Partly or wholly inside the guide.
      return b.s > 0 ? { vessel: b.vessel, s0: Math.max(0, a.vessel === b.vessel ? a.s : 0), s1: b.s } : null;
    }
    return { vessel: b.vessel, s0: a.vessel === b.vessel ? a.s : 0, s1: b.s };
  }

  catheterOutside(): boolean {
    const c = this.catheter;
    return !!c && c.pos - c.length > GUIDE.engagedDepth - 0.5;
  }

  catheterOut(): boolean {
    const c = this.catheter;
    return !!c && c.pos > GUIDE.engagedDepth;
  }

  upcomingBranch() {
    if (!this.guide.engaged) return null;
    return upcomingBranch(this.anat, this.wire.legs, Math.max(0, this.wire.d));
  }

  referenceAt(vessel: VesselId, s: number): number {
    const v = this.anat.vessels[vessel];
    return valueAt(v.refD, v.s, clamp(s, 0, v.length));
  }

  lumenAt(vessel: VesselId, s: number): number {
    const v = this.anat.vessels[vessel];
    return valueAt(this.lumen[vessel], v.s, clamp(s, 0, v.length));
  }

  treatments(): Treatment[] {
    return [
      ...this.balloonTreatments,
      ...this.stents.map((st) => ({ kind: 'stent' as const, vessel: st.vessel, s0: st.s0, s1: st.s1, diameter: st.diameter })),
    ];
  }

  // ------------------------------------------------------------- lumen/flow --
  private recomputeLumen(): void {
    const tr = this.treatments();
    for (const id of Object.keys(this.anat.vessels) as VesselId[]) {
      const v = this.anat.vessels[id];
      this.lumen[id] = v.coronary ? computeLumen(v, tr, this.live, this.lesion) : v.refD.slice();
    }
    this.lumenVersion++;
    this.lumenDirty = false;
    this.flowDirty = true;
  }

  occlusion(): Occlusion | null {
    if (!this.catheter || !isOccluding(this.catheter) || !this.catheterOutside()) return null;
    const r = this.catheterRange();
    return r ? { vessel: r.vessel, s: r.s0 } : null;
  }

  private recomputeFlow(): void {
    const lumen: Partial<Record<VesselId, number[]>> = {};
    for (const id of CORONARY_IDS) lumen[id] = this.lumen[id];
    this.factors = computeFactors({
      anatomy: this.anat,
      lumen,
      occlusion: this.occlusion(),
      dissections: this.dissections,
    });
    this.ladFlow = distalFactor(this.factors, 'LAD');
    this.timi = timiGrade(this.ladFlow);
    this.flowDirty = false;
  }

  private flowConditions() {
    const lumen: Partial<Record<VesselId, number[]>> = {};
    for (const id of CORONARY_IDS) lumen[id] = this.lumen[id];
    return { anatomy: this.anat, lumen, occlusion: this.occlusion(), dissections: this.dissections };
  }

  addDissection(vessel: VesselId, s: number, cause: Dissection['cause']): void {
    if (this.dissections.some((d) => d.vessel === vessel && Math.abs(d.s - s) < 4)) return;
    const d: Dissection = { vessel, s, length: 6, sealed: false, cause, time: this.t };
    this.dissections.push(d);
    this.updateSealing();
    this.flowDirty = true;
    this.logEvent(`Dissection (${cause}) in ${vessel} at ${s.toFixed(1)} mm.`);
    if (!d.sealed) this.say('danger', 'Dissection! Contrast staining beside the lumen and slower flow — cover it with a stent.');
  }

  private updateSealing(): void {
    for (const d of this.dissections) {
      const wasSealed = d.sealed;
      d.sealed = this.stents.some((st) => st.vessel === d.vessel && st.s0 <= d.s - 1 && st.s1 >= d.s + 1);
      if (d.sealed && !wasSealed) {
        this.say('ok', 'Dissection sealed by the stent.');
        this.logEvent('Dissection sealed.');
        this.flowDirty = true;
      }
    }
  }

  // ----------------------------------------------------------------- actions --
  selectTool(id: ToolId): boolean {
    const av = toolAvailability(this.snapshot())[id];
    const def = TOOLS.find((t) => t.id === id)!;
    if (!av.enabled) {
      this.say('info', `${def.name} locked: ${av.reason}`);
      return false;
    }
    if (id === 'contrast') {
      this.inject();
      return true;
    }
    if (id === 'fluoro') return true;
    if ((id === 'balloon' || id === 'stent') && this.catheter && this.catheter.kind !== id) {
      this.say('warn', `Only one catheter on the wire — withdraw the ${this.catheter.kind} first (select it and retract with S).`);
      return false;
    }
    this.tool = id;
    if (id === 'wire') this.wireLoaded = true;
    if (id === 'measure') this.performQCA();
    return true;
  }

  inject(): boolean {
    const snap = this.snapshot();
    const av = toolAvailability(snap).contrast;
    if (!av.enabled) {
      this.say('info', av.reason);
      return false;
    }
    if (this.cine && this.t < this.cine.start + this.cine.duration - 0.5) {
      this.say('info', 'Cine still running — wait for the run to finish.');
      return false;
    }
    const selective = this.guide.engaged;
    const cond = this.flowConditions();
    this.field = selective ? selectiveInjection(cond) : aorticInjection(cond);
    this.fieldStart = this.t;
    this.fieldVersion++;
    const duration = cineLength(this.field);
    this.cine = { start: this.t, duration, mode: selective ? 'selective' : 'aortic' };
    const ml = selective ? CONTRAST.selectiveMl : CONTRAST.aorticMl;
    this.contrastMl += ml;
    const afterStent = this.stents.length > 0 && !this.catheterOut();
    this.injections.push({ t: this.t, mode: this.cine.mode, lao: this.carm.lao, cra: this.carm.cra, afterStent, ml });
    if (selective) this.flags.angioDone = true;
    this.logEvent(`${selective ? 'Selective' : 'Aortic root'} injection ${ml} ml in ${projectionName(this.carm)}.`);
    this.say(
      'info',
      selective
        ? `Selective left coronary injection (${ml} ml) — cine ${projectionName(this.carm)}. LAD flow TIMI ${this.timi}.`
        : `Aortic root flush (${ml} ml) — engage the left main for selective views.`,
      0.5,
    );
    if (this.view !== 'fluoro') this.view = 'fluoro';
    return true;
  }

  giveHeparin(): void {
    if (this.physio.heparinAt !== null) {
      this.say('info', `Heparin already given — ACT ${Math.round(this.physio.act)} s.`);
      return;
    }
    this.physio = { ...this.physio, heparinAt: this.t };
    this.logEvent(`Heparin ${HEPARIN_UNITS} IU IV.`);
    this.say('ok', `Heparin ${HEPARIN_UNITS} IU IV (100 IU/kg). ACT will rise toward ~${PHYSIOLOGY.actHeparin} s.`);
  }

  setSize(kind: 'balloon' | 'stent', d: number, l: number): boolean {
    const c = this.catheter;
    if (c && c.kind === kind && !canResize(c, GUIDE.engagedDepth)) {
      this.say('warn', 'Sizes can only be changed while the catheter is inside the guide — withdraw it first.');
      return false;
    }
    const spec = kind === 'balloon' ? BALLOON : STENT;
    if (!spec.diameters.includes(d) || !spec.lengths.includes(l)) return false;
    if (kind === 'balloon') this.balloonSize = { d, l };
    else this.stentSize = { d, l };
    if (c && c.kind === kind) this.catheter = { ...c, nominalD: d, length: l };
    return true;
  }

  setPreset(i: number): void {
    const n = FLUORO.presets.length;
    this.presetIndex = ((i % n) + n) % n;
    const p = FLUORO.presets[this.presetIndex];
    this.carm = { lao: p.lao, cra: p.cra };
  }

  cyclePreset(): void {
    this.setPreset(this.presetIndex + 1);
    this.say('info', `C-arm: ${FLUORO.presets[this.presetIndex].name}`, 0.2);
  }

  nudgeCarm(dLao: number, dCra: number): void {
    this.carm = {
      lao: clamp(this.carm.lao + dLao, -FLUORO.maxLao, FLUORO.maxLao),
      cra: clamp(this.carm.cra + dCra, -FLUORO.maxCra, FLUORO.maxCra),
    };
  }

  toggleView(): void {
    this.view = this.view === '3d' ? 'fluoro' : '3d';
  }

  performQCA(): QCA | null {
    if (!this.flags.angioDone) {
      this.say('info', 'QCA needs an angiogram first.');
      return null;
    }
    const lad = this.anat.vessels.LAD;
    this.qca = measureQCA(lad, this.lumen.LAD, lesionStart(this.lesion) - 8, lesionEnd(this.lesion) + 8);
    if (!this.flags.qcaDone) this.logEvent('QCA measured.');
    this.flags.qcaDone = true;
    const q = this.qca;
    this.say(
      'info',
      `QCA: reference ${q.referenceDiameter.toFixed(2)} mm, MLD ${q.mld.toFixed(2)} mm, ${Math.round(q.ds * 100)}% DS, length ${q.lesionLength.toFixed(1)} mm.`,
      1,
    );
    return q;
  }

  // -------------------------------------------------------------------- step --
  step(dtIn: number, inp: SimInput): void {
    const dt = Math.min(dtIn, 0.1);
    this.t += dt;

    // C-arm nudges
    if (inp.carmLao || inp.carmCra) this.nudgeCarm(inp.carmLao * INPUT.carmNudgeSpeed * dt, inp.carmCra * INPUT.carmNudgeSpeed * dt);

    this.stepDevices(dt, inp);
    this.stepLiveBalloon();

    if (this.lumenDirty) this.recomputeLumen();
    const occKey = JSON.stringify(this.occlusion());
    if (occKey !== this.lastOcclusionKey) {
      this.lastOcclusionKey = occKey;
      this.flowDirty = true;
    }
    if (this.flowDirty) this.recomputeFlow();

    this.stepPatient(dt);
    this.stepImaging(dt, inp);
    this.stepProgress();
  }

  private moveFor(inp: SimInput, dt: number, speed: number, fine: number, wheel: [number, number]): number {
    return inp.advance * (inp.fine ? fine : speed) * dt + inp.wheel * (inp.fine ? wheel[1] : wheel[0]);
  }

  private stepDevices(dt: number, inp: SimInput): void {
    const tool = this.tool;
    // Guide
    if (tool === 'guide') {
      const move = this.moveFor(inp, dt, GUIDE.speed, GUIDE.fineSpeed, INPUT.wheelGuide);
      const rot = inp.rotate * GUIDE.rotateSpeed * dt * (inp.fine ? 0.35 : 1);
      if (move !== 0 || rot !== 0 || this.guide.speed > 0.01) {
        const r = stepGuide(this.guide, {
          move,
          rotate: rot,
          dt,
          railLength: this.anat.landmarks.root,
          wireOut: this.wireOut || this.catheterOut(),
        });
        this.guide = r.state;
        this.sayAll(r.messages);
        if (r.engagedNow) this.logEvent('Guide engaged in the left main.');
        if (r.poppedOut) this.logEvent('Guide popped out (over-torque).');
        if (!this.guide.engaged && this.wire.d > GUIDE.engagedDepth) this.wire = { ...this.wire, d: GUIDE.engagedDepth };
      }
    }
    // Wire
    if (tool === 'wire') {
      const move = this.moveFor(inp, dt, WIRE.speed, WIRE.fineSpeed, INPUT.wheelWire);
      const rot = inp.rotate * WIRE.rotateSpeed * dt * (inp.fine ? 0.35 : 1);
      const r = stepWire(this.anat, this.wire, {
        move,
        rotate: rot,
        dt,
        catheterOut: this.catheterOut(),
        guideEngaged: this.guide.engaged,
        lesion: this.lesion,
        rng: this.rng,
      });
      this.wire = r.state;
      this.sayAll(r.messages);
      if (r.crossedNow) this.logEvent('Wire crossed the lesion.');
      if (r.dissection) this.addDissection('LAD', this.lesion.centre, 'wire');
    } else if (this.wire.speed > 0 || this.wire.buckling) {
      this.wire = { ...this.wire, speed: 0, buckling: false, resistance: Math.max(0, this.wire.resistance - dt * 2) };
    }
    const loc = this.wireLocus();
    if (loc.vessel === 'LAD' && this.wire.d > GUIDE.engagedDepth) this.flags.everInLAD = true;

    // Balloon / stent catheter
    const catTool = tool === 'balloon' || tool === 'stent' ? tool : null;
    let move = 0;
    if (catTool) move = this.moveFor(inp, dt, INFLATION.speed, INFLATION.fineSpeed, INPUT.wheelCatheter);
    // Pulling back through the guide is quicker than tracking forward over the wire.
    if (move < 0 && !inp.fine && this.catheter && this.catheter.pos < GUIDE.engagedDepth) move *= 2.5;
    if (catTool && !this.catheter && move > 0) {
      const size = catTool === 'balloon' ? this.balloonSize : this.stentSize;
      this.catheter = newCatheter(catTool, size.d, size.l);
      this.oversizeThisInflation = false;
      this.logEvent(`${catTool === 'balloon' ? 'Balloon' : 'Stent'} ${size.d.toFixed(2)} × ${size.l} mm loaded.`);
      this.say('info', `${catTool === 'balloon' ? 'Balloon' : 'Stent'} ${size.d} × ${size.l} mm loaded on the wire.`);
    }
    if (this.catheter) {
      const myMove = catTool === this.catheter.kind ? move : 0;
      const r = stepCatheter(this.catheter, {
        move: myMove,
        inflate: inp.inflate,
        fine: inp.fine,
        deflate: inp.deflate,
        dt,
        now: this.t,
        wireTip: this.wire.d,
        guideTip: GUIDE.engagedDepth,
      });
      const prev = this.catheter;
      this.catheter = r.state;
      this.sayAll(r.messages);
      if (r.deployedNow) this.deployStent();
      if (r.ruptured) {
        this.ruptures++;
        this.logEvent('Balloon rupture.');
        const rg = this.catheterRange();
        if (rg && this.rng() < 0.5) this.addDissection(rg.vessel, (rg.s0 + rg.s1) / 2, 'rupture');
      }
      if (r.record) this.finishInflation(r.record);
      if (prev.pressure > 0 && this.catheter.pressure === 0) this.lumenDirty = true;
      if (r.withdrawn) {
        const k = this.catheter.kind;
        this.logEvent(`${k === 'balloon' ? 'Balloon' : 'Stent catheter'} withdrawn.`);
        this.say('info', `${k === 'balloon' ? 'Balloon' : 'Stent delivery'} catheter withdrawn from the patient.`);
        this.catheter = null;
        this.activeStent = null;
      }
    } else if (inp.inflate && catTool) {
      this.say('info', 'Advance a catheter onto the wire first (W).');
    }
  }

  private deployStent(): void {
    const c = this.catheter!;
    const r = this.catheterRange();
    if (!r) return;
    const st: StentRecord = {
      vessel: r.vessel,
      s0: r.s0,
      s1: r.s1,
      diameter: catheterDiameter(c),
      nominalD: c.nominalD,
      length: c.length,
      deployedAt: this.t,
    };
    this.stents.push(st);
    this.activeStent = st;
    this.logEvent(`Stent ${c.nominalD} × ${c.length} deployed in ${r.vessel} ${r.s0.toFixed(1)}–${r.s1.toFixed(1)} mm.`);
    this.updateSealing();
    this.lumenDirty = true;
  }

  private finishInflation(rec: InflationRecord): void {
    this.inflations.push(rec);
    this.oversizeThisInflation = false;
    const r = this.catheterRange();
    this.logEvent(`${rec.kind} inflation: ${rec.maxPressure.toFixed(1)} atm, ${rec.duration.toFixed(1)} s.`);
    if (rec.kind === 'balloon' && r) {
      this.balloonTreatments.push({ kind: 'balloon', vessel: r.vessel, s0: r.s0, s1: r.s1, diameter: rec.maxDiameter });
      if (this.flags.predilInflated) this.flags.predilationDone = true;
    }
    if (rec.kind === 'stent' && this.activeStent) this.flags.stentDeflated = true;
    this.lumenDirty = true;
  }

  private stepLiveBalloon(): void {
    const c = this.catheter;
    let live: LiveBalloon | null = null;
    if (c && isInflated(c) && !c.ruptured && this.catheterOutside()) {
      const r = this.catheterRange();
      if (r) {
        const d = catheterDiameter(c);
        live = { vessel: r.vessel, s0: r.s0, s1: r.s1, diameter: d };
        // Post-dilation of stents under the balloon, and expansion of the stent being deployed.
        for (const st of this.stents) {
          const overlap = Math.min(st.s1, r.s1) - Math.max(st.s0, r.s0);
          if (st.vessel === r.vessel && overlap > 1 && d > st.diameter) {
            st.diameter = d;
            this.lumenDirty = true;
          }
        }
        // Pre-dilation over the lesion.
        if (
          c.kind === 'balloon' &&
          r.vessel === 'LAD' &&
          c.pressure >= INFLATION.predilatePressure &&
          r.s0 <= this.lesion.centre - 2 &&
          r.s1 >= this.lesion.centre + 2 &&
          !this.flags.predilInflated
        ) {
          this.flags.predilInflated = true;
          this.logEvent('Pre-dilation ≥ 6 atm over the lesion.');
        }
        // Over-sizing dissection.
        const mid = (r.s0 + r.s1) / 2;
        const ref = this.referenceAt(r.vessel, mid);
        if (!this.oversizeThisInflation && d > INFLATION.dissectionRatio * ref) {
          this.oversizeThisInflation = true;
          if (c.kind === 'stent') {
            const v = this.anat.vessels[r.vessel];
            const at = Math.min(v.length - 2, r.s1 + INFLATION.edgeDissectionOffset);
            this.addDissection(r.vessel, at, 'stent-edge');
            this.say('danger', `Device ${d.toFixed(2)} mm in a ${ref.toFixed(2)} mm artery (> 1.2×) — edge dissection beyond the stent.`);
          } else {
            this.addDissection(r.vessel, mid, 'balloon');
            this.say('danger', `Balloon ${d.toFixed(2)} mm in a ${ref.toFixed(2)} mm artery (> 1.2×) — dissection.`);
          }
        }
      }
    }
    const changed =
      (live === null) !== (this.live === null) ||
      (live && this.live && (Math.abs(live.diameter - this.live.diameter) > 0.004 || live.s0 !== this.live.s0));
    if (changed) {
      this.live = live;
      this.lumenDirty = true;
    }
  }

  private stepPatient(dt: number): void {
    const occ = this.occlusion();
    const ladOccluded = !!occ && (occ.vessel === 'LAD' || occ.vessel === 'LM');
    this.physio = stepPhysiology(this.physio, dt, this.t, this.ladFlow, ladOccluded);
    const p = this.physio;
    if (p.chestPain && !this.wasChestPain) {
      this.say('warn', 'Patient: "The chest pain is back…" — ST elevation in V2. Expected during inflation; keep it short.');
    }
    this.wasChestPain = p.chestPain;
    if (p.pvcRisk && !this.wasPvcRisk) this.say('warn', `LAD occluded > ${PHYSIOLOGY.pvcAfter} s: ventricular ectopics, BP falling.`);
    this.wasPvcRisk = p.pvcRisk;
    if (p.unstable && (!this.wasUnstable || this.t - this.lastUnstableNag > 5)) {
      this.lastUnstableNag = this.t;
      this.say('danger', 'Patient UNSTABLE — hypotension and ectopy. Deflate now (Q)!', 0);
      if (!this.wasUnstable) this.logEvent('Patient unstable (prolonged occlusion).');
    }
    this.wasUnstable = p.unstable;

    // Heartbeat
    const rr = 60 / Math.max(30, p.hr);
    this.beatPhase += dt / rr;
    if (this.beatPhase >= 1) {
      this.beatPhase -= 1;
      const pvc = p.pvcRisk && this.rng() < PHYSIOLOGY.pvcProbability;
      this.beats.push({ t: this.t, rr, pvc, st: p.st });
      while (this.beats.length > 30) this.beats.shift();
    }
  }

  private stepImaging(dt: number, inp: SimInput): void {
    if (this.cine && this.t > this.cine.start + this.cine.duration) this.cine = null;
    this.acquisition = this.cine ? 'cine' : inp.pedal ? 'fluoro' : 'off';
    if (this.acquisition !== 'off') {
      this.fluoroTime += dt;
      if (this.guide.s > 30) this.flags.fluoroSeenGuide = true;
    }
  }

  private stepProgress(): void {
    const snap = this.snapshot();
    const { progress, completed } = updateProgress(this.progress, snap);
    this.progress = progress;
    for (const i of completed) {
      this.stageEvents.push(i);
      this.logEvent(`Stage ${i + 1} complete: ${STAGES[i].title}.`);
      this.say('ok', `Stage ${i + 1} complete — ${STAGES[i].title}.`, 0);
    }
    if (!this.finished && this.progress.current >= STAGES.length) {
      this.finished = true;
      this.finishedAt = this.t;
      this.logEvent('All stages complete.');
    }
  }

  // ---------------------------------------------------------------- snapshot --
  snapshot(): Snapshot {
    const loc = this.wireLocus();
    const c = this.catheter;
    let cat: CatheterSnap | null = null;
    if (c) {
      const r = this.catheterRange();
      cat = {
        kind: c.kind,
        inGuide: c.pos <= GUIDE.engagedDepth,
        outside: this.catheterOutside(),
        pressure: c.pressure,
        vessel: r ? r.vessel : null,
        s0: r ? r.s0 : -1,
        s1: r ? r.s1 : -1,
        deployed: c.deployed,
        ruptured: c.ruptured,
        nominalD: c.nominalD,
        length: c.length,
      };
    }
    const ls = lesionStart(this.lesion);
    const le = lesionEnd(this.lesion);
    const after = this.injections.filter((i) => i.afterStent && i.mode === 'selective');
    return {
      t: this.t,
      stage: this.progress.current,
      guideS: this.guide.s,
      elbowS: this.anat.landmarks.elbow,
      aortaEntryS: this.anat.landmarks.aortaEntry,
      guideAtRoot: this.guideAtRoot,
      guideAngle: this.guide.angle,
      facingLeft: facesLeftCusp(this.guide.angle),
      engaged: this.guide.engaged,
      fluoroSeenGuide: this.flags.fluoroSeenGuide,
      angioDone: this.flags.angioDone,
      heparin: this.physio.heparinAt !== null,
      act: this.physio.act,
      wireOut: this.wireOut,
      wireVessel: loc.vessel,
      wireS: loc.s,
      wireInLAD: this.wireOut && loc.vessel === 'LAD',
      wireCrossed: this.wire.crossed,
      wireParked: this.wire.crossed && loc.vessel === 'LAD' && loc.s >= le + WIRE.parkBeyondLesion,
      wireBuckling: this.wire.buckling,
      catheter: cat,
      balloonInPatient: !!c && c.kind === 'balloon',
      stentInPatient: !!c && c.kind === 'stent',
      predilInflated: this.flags.predilInflated,
      predilationDone: this.flags.predilationDone,
      qcaDone: this.flags.qcaDone,
      stentDeployed: this.stents.length > 0,
      stentCoversLesion: this.stentCoverage().covered,
      stentDeflated: this.flags.stentDeflated,
      finalInjections: after.length,
      finalDistinctViews: distinctViews(after.map((i) => ({ lao: i.lao, cra: i.cra }))),
      lesionStart: ls,
      lesionEnd: le,
      lesionCentre: this.lesion.centre,
      ischaemia: this.physio.ischaemia,
      occlusionTime: this.physio.occlusionTime,
      unstable: this.physio.unstable,
      dissection: this.dissections.length > 0,
      dissectionSealed: this.dissections.length > 0 && this.dissections.every((d) => d.sealed),
      timi: this.timi,
      demo: this.demo,
    };
  }

  /** Union of LAD stents vs the lesion: coverage and margins. */
  stentCoverage(): { covered: boolean; marginProx: number | null; marginDist: number | null } {
    const ls = lesionStart(this.lesion);
    const le = lesionEnd(this.lesion);
    const lad = this.stents.filter((s) => s.vessel === 'LAD' && s.s1 > ls - 5 && s.s0 < le + 5);
    if (!lad.length) return { covered: false, marginProx: null, marginDist: null };
    const covers = (x: number) => lad.some((s) => s.s0 <= x && s.s1 >= x);
    let gap = 0;
    for (let x = ls; x <= le; x += 0.25) if (!covers(x)) gap += 0.25;
    const minS0 = Math.min(...lad.map((s) => s.s0));
    const maxS1 = Math.max(...lad.map((s) => s.s1));
    let mp = ls - minS0;
    let md = maxS1 - le;
    if (gap > 0 && mp >= 0 && md >= 0) md = -gap;
    return { covered: gap === 0, marginProx: mp, marginDist: md };
  }

  // ------------------------------------------------------------------ debrief --
  summary(): CaseSummary {
    const lad = this.anat.vessels.LAD;
    const ls = lesionStart(this.lesion);
    const le = lesionEnd(this.lesion);
    const cov = this.stentCoverage();
    const lesStents = this.stents.filter((s) => s.vessel === 'LAD' && s.s1 > ls && s.s0 < le);
    const after = this.injections.filter((i) => i.afterStent && i.mode === 'selective');
    const ongoing = this.catheter && isOccluding(this.catheter) ? this.catheter.inflationTime : 0;
    return {
      stagesCompleted: Math.min(STAGES.length, this.progress.current),
      residualStenosis: worstStenosis(lad, this.lumen.LAD, ls, le),
      finalTimi: this.timi,
      stentCount: this.stents.length,
      stentDiameter: lesStents.length ? Math.max(...lesStents.map((s) => s.diameter)) : null,
      referenceDiameter: this.lesion.referenceDiameter,
      marginProximal: cov.marginProx,
      marginDistal: cov.marginDist,
      heparin: this.physio.heparinAt !== null,
      preDilated: this.flags.predilationDone,
      qcaUsed: this.flags.qcaDone,
      dissection: this.dissections.length > 0,
      dissectionSealed: this.dissections.every((d) => d.sealed),
      wireForcingEvents: this.wire.forcingEvents,
      balloonRupture: this.ruptures > 0,
      longestInflation: Math.max(0, ongoing, ...this.inflations.map((i) => i.duration)),
      contrastMl: this.contrastMl,
      fluoroSeconds: this.fluoroTime,
      finalViews: distinctViews(after.map((i) => ({ lao: i.lao, cra: i.cra }))),
    };
  }

  debrief(): Debrief {
    return buildDebrief(this.summary());
  }
}

// Which arteries carry flow. ICG, the micro Doppler and the MEP all read this,
// so what you see, hear and monitor always matches the physical state of the vessels.
//
//   patency  set by the clip evaluation from the clips currently on the vessels
//            (recomputed whenever a clip is applied or removed)
//   injured  vessels permanently occluded by an instrument, e.g. a coagulated perforator
//   tempClip the proximal ICA clamp
const DOWNSTREAM = ['M1', 'M2s', 'M2i', 'A1', 'PCom', 'AChA', 'perforator', 'aneurysm', 'bleb'];

export class Flow {
  constructor() {
    this.patency = Flow.open();
    this.injured = {};
    this.tempClip = false;
  }
  static open() { return { ICA: 1, M1: 1, M2s: 1, M2i: 1, A1: 1, PCom: 1, AChA: 1, perforator: 1, aneurysm: 1, bleb: 1 }; }

  // 0 = no flow, 1 = full flow.
  at(part) {
    if (!(part in this.patency) || this.injured[part]) return 0;
    let f = this.patency[part];
    // A narrowed ICA reduces flow into everything downstream of it.
    if (DOWNSTREAM.includes(part)) f *= 0.35 + 0.65 * this.patency.ICA;
    if (part === 'bleb') f = Math.min(f, this.patency.aneurysm);
    if (this.tempClip) {
      // With the proximal ICA clamped, the distal circulation is fed retrogradely
      // through the PCom and the circle of Willis. Flow persists but is weak, and
      // the aneurysm softens, which is the point of proximal control.
      f *= part === 'aneurysm' || part === 'bleb' ? 0.15 : part === 'ICA' ? 0.25 : 0.55;
    }
    return f;
  }
}

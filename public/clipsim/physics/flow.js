// Which arteries carry flow. The clip evaluation (M5) and the temporary clip
// change patency; ICG and the micro Doppler read it, so what you hear and see
// always matches the physical state of the vessels.
export class Flow {
  constructor() {
    this.patency = { ICA: 1, M1: 1, M2s: 1, M2i: 1, A1: 1, PCom: 1, AChA: 1, perforator: 1, aneurysm: 1, bleb: 1 };
    this.tempClip = false;   // temporary clip on the proximal ICA
  }
  // 0 = no flow, 1 = full flow.
  at(part) {
    if (!(part in this.patency)) return 0;
    let f = this.patency[part];
    if (this.tempClip) {
      // With the proximal ICA clamped, the distal circulation is fed retrogradely
      // through the PCom and the circle of Willis. Flow persists but is weak, and
      // the aneurysm softens — that is the point of proximal control.
      f *= part === 'aneurysm' || part === 'bleb' ? 0.15 : part === 'ICA' ? 0.25 : 0.55;
    }
    return f;
  }
}

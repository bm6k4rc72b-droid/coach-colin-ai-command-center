// Demo: Coach Colin runs a back-squat session the right way.
// Warm up light → fix the setup → brace and cue → working load → working set → side-view review.
// Driven by update(dt) from the mode, so it pauses with the simulation.
export class IronDemo {
  constructor(mode, app, onEnd) {
    this.m = mode; this.app = app; this.onEnd = onEnd;
    this.step = 0; this.t = 0;
  }
  stop() { this.stopped = true; }

  update(dt) {
    if (this.stopped) return;
    const m = this.m, a = this.app;
    this.t += dt;
    const setDone = () => m.set && m.set.done;
    const next = () => { this.step++; this.t = 0; };
    const pick = (kind, fn) => { m.openChooser(kind); fn(); m.pose(0, 0); a.toolbar.refresh(); };
    switch (this.step) {
      case 0: if (this.t > 1) { if (m.lift !== 'squat') { m.lift = 'squat'; m.newSession(); } m.cam.view = 'three'; m.setView(); next(); } break;
      case 1: if (this.t > 0.8) { pick('load', () => { m.pct = 0.5; m.reps = 5; m.barbell.userData.setLoad(m.loadKg); }); next(); } break;
      case 2: if (this.t > 1.2) { a.chooser.classList.add('hidden'); m.startSet(); next(); } break;
      case 3: if (setDone() && this.t > 1) next(); break;
      case 4: if (this.t > 1) { pick('stance', () => { m.p.stance = 'shoulder'; }); next(); } break;
      case 5: if (this.t > 1.1) { pick('depth', () => { m.p.depth = 'parallel'; }); next(); } break;
      case 6: if (this.t > 1.1) { a.chooser.classList.add('hidden'); if (!m.p.brace) m.toggle('brace'); next(); } break;
      case 7: if (this.t > 0.9) { if (!m.p.cue) m.toggle('cue'); m.cam.view = 'front'; m.setView(); next(); } break;
      case 8: if (this.t > 1.2) { pick('load', () => { m.pct = 0.8; m.reps = 5; m.barbell.userData.setLoad(m.loadKg); }); next(); } break;
      case 9: if (this.t > 1.2) { a.chooser.classList.add('hidden'); m.startSet(); next(); } break;
      case 10: if (setDone() && this.t > 0.8) { m.cam.view = 'side'; m.setView(); next(); } break;
      case 11: if (m.facts.review && this.t > 3) { this.stopped = true; m.showDebrief(); this.onEnd?.(); } break;
    }
  }
}

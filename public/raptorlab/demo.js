// Demo: Coach Colin runs a textbook hot fire, narrating each step.
// Driven by update(dt) from the lab so it runs on simulation time.
export class RaptorDemo {
  constructor(lab, app, onEnd) {
    this.lab = lab; this.app = app; this.onEnd = onEnd;
    this.t = 0; this.step = 0; this.wait = 0;
  }
  stop() { this.stopped = true; }

  update(dt) {
    if (this.stopped) return;
    const L = this.lab, E = L.E, o = L.o;
    this.t += dt;
    const after = (s) => { if (this.t >= s) { this.t = 0; this.step++; return true; } return false; };
    switch (this.step) {
      case 0: if (after(1.2)) { L.cam.target = { r: 7.5, y: 2.3, pitch: 0.12 }; L.toggleValve('chill'); } break;
      case 1: if (o && o.TlineF < 122 && o.TlineO < 98 && this.t > 2) { this.t = 0; this.step++; } break;   // keep bleeding until the main valves open
      case 2: if (after(0.6)) L.toggleValve('purge'); break;
      case 3: if (after(2.4)) { L.toggleValve('purge'); } break;
      case 4: if (after(0.6)) L.toggleIgn(); break;
      case 5: if (after(0.8)) { L.cam.target = { r: 15, y: -0.6, pitch: 0.06 }; L.toggleValve('chill'); L.toggleMain(); L.toggleSpin(); } break;
      case 6: if (after(0.5)) L.togglePB('fpb'); break;
      case 7: if (after(0.55)) L.togglePB('opb'); break;
      case 8: if (after(0.8)) { if (E.spin) L.toggleSpin(); } break;
      case 9: if (E.closedLoop && L.facts.stableT > 2.5) { this.t = 0; this.step++; L.cam.target = { r: 14, y: -3.5, pitch: 0.02 }; } break;
      case 10: if (after(3)) { L.cam.target = { r: 6, y: 2.2, pitch: 0.1 }; L.toggleCutaway(); } break;
      case 11: if (after(3.5)) { L.toggleCutaway(); L.cam.target = { r: 16, y: -1.5, pitch: 0.07 }; L.startGimbal(); } break;
      case 12: if (L.facts.gimbal && after(1.2)) { this.toThrottle(0.6); } break;
      case 13: if (after(3.2)) this.toThrottle(1.0); break;
      case 14: if (after(3.2)) { L.togglePB('opb'); } break;                     // fuel-rich shutdown: ox side first
      case 15: if (after(0.35)) L.togglePB('fpb'); break;
      case 16: if (after(0.35)) L.toggleMain(); break;
      case 17: if (E.s.pc < 1e5 && after(0.8)) { L.toggleIgn(); L.toggleValve('purge'); } break;
      case 18: if (E.purgeAfter > 2.2) { L.toggleValve('purge'); this.step++; this.t = 0; } break;
      case 19: if (after(1.2)) { this.stopped = true; L.showDebrief(); this.onEnd?.(); } break;
    }
  }
  toThrottle(v) { const E = this.lab.E; if (!E.closedLoop) return; E.throttleCmd = v; E.log('throttle:' + v); this.app.feed.push('rl.feed.throttle', 'ok', { pct: Math.round(v * 100) }); }
}

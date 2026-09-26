import { COVERAGES, CONCEPTS, DRIVE } from './config.js';
import { best } from './fieldMode.js';
import { i18n } from '../core/i18n.js';

// Demo: Coach Colin runs the drive. Each play follows the same routine a real
// quarterback uses: find the safeties, name the coverage, set the protection,
// call the beater, snap, look off the safety, throw to the open man, watch the film.
// Driven by update(dt) from the mode, so it pauses with the simulation.
export class FieldDemo {
  constructor(mode, app, onEnd) {
    this.m = mode; this.app = app; this.onEnd = onEnd;
    this.t = 0; this.play = -1; this.step = 0; this.wait = 0;
  }
  stop() { this.stopped = true; this.m.ndc.set(0, -0.2); }

  // Point the "mouse" at a player so hover and eyes work exactly as for a user.
  lookAt(id) {
    const mesh = this.m.meshes[id];
    if (!mesh) return;
    const p = mesh.position.clone(); p.y += 1;
    p.project(this.m.camera);
    this.m.ndc.set(p.x, p.y);
    this.m.mouse = { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight };
  }

  update(dt) {
    if (this.stopped) return;
    const m = this.m, sim = m.sim, a = this.app;
    this.t += dt;
    if (this.play !== m.drive.n) { this.play = m.drive.n; this.step = 0; this.t = 0; }
    const at = (s) => this.t >= s;
    const cov = sim.coverage;
    const blitz = !!COVERAGES[cov].blitz;
    switch (this.step) {
      case 0: this.lookAt('FS'); m.playClock = Math.max(m.playClock, 12); if (at(1.3)) this.step++; break;
      case 1: this.lookAt('SS'); if (at(2.3)) { m.facts.scanned = true; m.openChooser('cover'); this.step++; } break;
      case 2: if (at(3.3)) { m.call.coverage = cov; m.closeChooser(); a.toolbar.refresh(); a.feed.push('fld.feed.call', 'ok', { play: i18n.t('fld.cov.' + cov) }); this.step++; } break;
      case 3: if (at(3.9)) { m.call.protection.slide = blitz ? 1 : 0; m.call.protection.rbStay = blitz; m.openChooser('protect'); this.step++; } break;
      case 4: if (at(4.9)) { m.call.protectionSet = true; m.sim.protection = { ...m.call.protection }; m.closeChooser(); a.toolbar.refresh(); this.step++; } break;
      case 5: if (at(5.4)) { m.openChooser('play'); this.step++; } break;
      case 6: if (at(6.4)) {
        const c = best(cov);
        m.call.concept = c; m.call.conceptSet = true; m.sim.concept = c;
        m.closeChooser(); a.toolbar.refresh(); a.feed.push('fld.feed.call', 'ok', { play: i18n.t('fld.con.' + c) });
        this.step++;
      } break;
      case 7: if (at(7.1)) { m.snap(); this.step++; } break;
      case 8: {
        // Look off: eyes start away from the intended target, then come back.
        if (!sim.snapped || sim.over) { if (sim.over) this.step = 9; break; }
        const b = sim.bestOpen();
        const quick = blitz ? 0.9 : 1.5;
        if (sim.t < quick * 0.7) this.lookAt(b && b.id === 'X' ? 'Z' : 'X');
        else if (b) this.lookAt(b.id);
        if (!sim.ball && b && ((sim.t > quick && b.sep > 3) || sim.t > (blitz ? 1.4 : 2.6))) {
          if (b.sep < 1.2 && sim.t > 2.6) m.throwAway(); else m.throwTo(b.id, CONCEPTS[m.call.concept].routes[b.id] === 'corner' || CONCEPTS[m.call.concept].routes[b.id] === 'wheel');
        }
        break;
      }
      case 9: m.ndc.set(0, -0.2); if (m.facts.film) { this.wait += dt; if (this.wait > 1.4) { this.wait = 0; this.step++; } } break;
      case 10:
        if (m.drive.n >= DRIVE.plays) { this.stopped = true; m.showDebrief(); this.onEnd?.(); }
        else m.nextPlay();
        break;
    }
  }
}

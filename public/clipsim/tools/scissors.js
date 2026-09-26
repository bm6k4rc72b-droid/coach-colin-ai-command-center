import * as THREE from 'three';
import { scissorsModel } from './models.js';
import { partRoot } from './index.js';
import { sfx } from '../audio/engine.js';
import { bus } from '../procedure/bus.js';

// Micro scissors (key 2): click an arachnoid strip to cut it sharply. The
// fissure is opened from superficial to deep. Rule: never cut anything that
// isn't arachnoid. Cutting a vessel makes it bleed, and cutting the dome is
// catastrophic.
export function scissors(ctx) {
  const model = scissorsModel();
  let snipT = 1;
  const arachnoidTotal = ctx.anatomy.arachnoid.length;

  function cut(mesh, hit) {
    mesh.userData.cut = true;
    const mat = mesh.material, o0 = mat.opacity;
    // Cut membranes spring back toward each lobe and fade out.
    ctx.animate(0.55, (k) => { mesh.scale.y = 1 - 0.92 * k; mat.opacity = o0 * (1 - k); }, () => { mesh.visible = false; });
    const done = ctx.anatomy.arachnoid.filter((m) => m.userData.cut).length;
    ctx.stats.arachnoidCut = done;
    bus.emit('arachnoid:cut', { layer: mesh.userData.layer, index: mesh.userData.index, done, total: arachnoidTotal });
    ctx.feed.push('feed.arachnoidCut', 'ok', { n: done, total: arachnoidTotal });
    // Arachnoid carries tiny bridging vessels: every so often a cut starts an ooze.
    if (done % 4 === 2 || (mesh.userData.layer === 'deep' && done % 3 === 0)) {
      // The bleeding comes from the pial surface under the membrane, so find the tissue behind the cut.
      const ray = new THREE.Raycaster(ctx.camera.position, hit.point.clone().sub(ctx.camera.position).normalize());
      const under = ray.intersectObjects(ctx.anatomy.pickables, false)
        .find((h) => h.object.visible && !['arachnoid', 'blood', 'ooze', 'char', 'adhesion', 'clip', 'tempclip'].includes(h.object.userData.pickPart));
      if (!under) return;
      const n = under.face ? under.face.normal.clone().transformDirection(under.object.matrixWorld) : hit.normal;
      ctx.bleeding.addSource(under.point.clone(), 'ooze', n);
      ctx.feed.push('feed.oozeStarted', 'warn');
    }
  }

  return {
    id: 'scissors', model, side: 1,
    validate(hit) {
      if (!hit) return { state: 'idle', action: 'act.cut' };
      const p = hit.part;
      if (p === 'arachnoid') return { state: 'ok', action: 'act.cut', highlight: hit.object };
      if (p === 'adhesion') return { state: 'warn', action: 'act.useDissector' };
      if (p === 'aneurysm' || p === 'bleb') return { state: 'bad', action: 'act.noCutDome', highlight: partRoot(hit.object) };
      if (['ICA', 'M1', 'M2s', 'M2i', 'A1', 'PCom', 'AChA', 'perforator', 'SSV', 'optic', 'oculomotor'].includes(p)) return { state: 'bad', action: 'act.noCut', highlight: partRoot(hit.object) };
      return { state: 'idle', action: 'act.cut' };
    },
    onDown(hit) {
      snipT = 0;
      sfx.snip();
      if (!hit) return;
      const p = hit.part;
      if (p === 'arachnoid' && !hit.object.userData.cut) return cut(hit.object, hit);
      if (p === 'aneurysm' || p === 'bleb') {
        ctx.risk.add(0.7, 'scissorsDome');
        ctx.feed.push('feed.domeCut', 'bad');
        bus.emit('injury', { part: p, by: 'scissors', severity: 'critical' });
        return;
      }
      if (['ICA', 'M1', 'M2s', 'M2i', 'A1', 'PCom', 'AChA', 'perforator', 'SSV'].includes(p)) {
        ctx.bleeding.addSource(hit.point.clone(), 'ooze', hit.normal);
        ctx.stats.injuries.push({ part: p, by: 'scissors' });
        bus.emit('injury', { part: p, by: 'scissors', severity: p === 'perforator' || p === 'AChA' ? 'major' : 'minor' });
        ctx.feed.push('feed.vesselCut', 'bad', { part: ctx.i18n.t('part.' + p) });
        return;
      }
      if (p === 'optic' || p === 'oculomotor') {
        ctx.stats.injuries.push({ part: p, by: 'scissors' });
        bus.emit('injury', { part: p, by: 'scissors', severity: 'major' });
        ctx.feed.push('feed.nerveInjury', 'bad', { part: ctx.i18n.t('part.' + p) });
      }
    },
    update(dt) {
      snipT = Math.min(1, snipT + dt * 6);
      model.userData.setOpen(0.02 + 0.26 * Math.abs(Math.cos(snipT * Math.PI)));
    },
  };
}

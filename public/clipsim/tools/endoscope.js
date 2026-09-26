import * as THREE from 'three';
import { endoscopeModel } from './models.js';
import { sfx } from '../audio/engine.js';
import { bus } from '../procedure/bus.js';
import { MICROSCOPE } from '../config/anatomy.js';

// Endoscope (key 9): selecting it inserts a 2.7 mm, 30° endoscope into the
// corridor beneath the aneurysm. A picture-in-picture view shows what the
// microscope can't: the back of the neck, the PCom and AChA origins, and
// whether the clip blades cross the whole neck. Click (with this tool) to
// withdraw or re-insert it. The view stays open while you use other tools.
export function endoscope(ctx) {
  const g = ctx.anatomy.aneurysm.geometry;
  const cam = new THREE.PerspectiveCamera(74, 1, 0.3, 200);
  // The scope tip is passed beyond the neck, on the far side from the
  // microscope, and looks back at the neck. This shows what the microscope
  // can't: whether the blade tips cross the whole neck, and the PCom origin.
  const W = g.wall;
  const yaw = THREE.MathUtils.degToRad(MICROSCOPE.startYawDeg), tilt = THREE.MathUtils.degToRad(MICROSCOPE.startTiltDeg);
  const scopeFwd = new THREE.Vector3(-Math.sin(tilt) * Math.sin(yaw), Math.sin(tilt) * Math.cos(yaw), -Math.cos(tilt));
  const look = W.center(0.6);
  const tip = W.center(0).addScaledVector(W.n, 4.5).addScaledVector(scopeFwd, 5);
  cam.position.copy(tip);
  cam.up.copy(W.n);
  cam.lookAt(look);
  const light = new THREE.PointLight('#e8f4ff', 0, 0, 0);
  light.position.copy(tip);
  ctx.scene.add(light);

  const shaft = endoscopeModel();
  const inDir = new THREE.Vector3(1, -0.1, 0.45).normalize(); // out laterally along the fissure floor, clear of the dome
  shaft.position.copy(tip);
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), inDir);
  shaft.visible = false;
  ctx.scene.add(shaft);

  const frame = document.getElementById('pip');
  let inserted = false;
  function set(on) {
    inserted = on;
    shaft.visible = on;
    frame.classList.toggle('hidden', !on);
    ctx.state.endoscope = on;
    sfx.select();
    ctx.feed.push(on ? 'feed.endoIn' : 'feed.endoOut', 'ok');
    if (on) { bus.emit('endoscope:view', {}); ctx.stats.endoscopeUses++; }
  }

  return {
    id: 'endoscope', model: null, side: 1,
    validate() { return { state: 'ok', action: inserted ? 'act.endoOut' : 'act.endoIn' }; },
    activate() { if (!inserted) set(true); },
    onDown() { set(!inserted); },
    get inserted() { return inserted; },
    // Render the endoscope's view into the PiP rectangle, after the main frame.
    renderPiP(renderer, scene) {
      if (!inserted) return;
      const r = frame.querySelector('.pip-view').getBoundingClientRect();
      if (r.width < 2) return;
      const H = window.innerHeight;
      cam.aspect = r.width / r.height;
      cam.updateProjectionMatrix();
      shaft.visible = false;
      light.intensity = 2.2;
      const hidden = [];
      ctx.tools.list.forEach((t) => { if (t.model?.visible) { hidden.push(t.model); t.model.visible = false; } });
      renderer.setScissorTest(true);
      renderer.setScissor(r.left, H - r.bottom, r.width, r.height);
      renderer.setViewport(r.left, H - r.bottom, r.width, r.height);
      renderer.render(scene, cam);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, window.innerWidth, H);
      light.intensity = 0;
      shaft.visible = true;
      hidden.forEach((m) => { m.visible = true; });
    },
  };
}

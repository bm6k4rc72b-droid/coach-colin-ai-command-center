import * as THREE from 'three';
import { MICROSCOPE } from '../config/anatomy.js';

// An operating microscope lights the field coaxially: the light comes out
// alongside the optics, so shadows are minimal and deep structures stay lit.
// The spotlight follows the scope head. The holographic fills (teal sky,
// magenta ground) give the cinematic split-tone.
export function createLights(scene, camera) {
  const scope = new THREE.SpotLight(MICROSCOPE.lightColor, 1.35, 0, 0.42, 0.85, 0);
  scene.add(scope, scope.target);

  const hemi = new THREE.HemisphereLight('#4fe3ff', '#ff3fae', 0.38);
  scene.add(hemi);

  const rim = new THREE.DirectionalLight('#9a7bff', 0.55);
  rim.position.set(-60, -40, 40);
  scene.add(rim);

  const warmFill = new THREE.PointLight('#ffb070', 0.7, 0, 0);
  warmFill.position.set(40, 30, 20);
  scene.add(warmFill);

  return {
    scope,
    update(target) {
      scope.position.copy(camera.position);
      scope.target.position.copy(target);
    },
  };
}

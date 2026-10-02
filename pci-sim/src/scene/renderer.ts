/**
 * Orchestrates both scenes: 3D view (orbit camera + fluoro picture-in-picture) and the
 * fluoroscopy monitor view (square, centred), with heartbeat and contrast clocks.
 */
import * as THREE from 'three';
import type { Vec3 } from '../config/anatomy';
import { beatScale } from '../anatomy/heart';
import type { Simulation } from '../procedure/sim';
import { DeviceMeshes } from './deviceMeshes';
import { FluoroWorld } from './fluoroWorld';
import { blitMaterial, sharedUniforms } from './materials';
import { VesselMeshes } from './vesselMeshes';
import { OrbitCam, World3D } from './world3d';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  /** Where the fluoro image is drawn (CSS px, top-left origin), or null. */
  monitor: Rect | null;
  pip: Rect | null;
}

export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  world!: World3D;
  fluoro!: FluoroWorld;
  vessels!: VesselMeshes;
  devices!: DeviceMeshes;
  readonly orbit: OrbitCam;
  private blitScene = new THREE.Scene();
  private blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private sim!: Simulation;
  width = 1;
  height = 1;
  layout: Layout = { monitor: null, pip: null };
  /** Margins (CSS px) kept free by the HUD for the fluoro monitor. */
  insets = { top: 48, bottom: 120, left: 0, right: 0 };

  constructor(canvas: HTMLCanvasElement, sim: Simulation) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.autoClear = false;
    this.orbit = new OrbitCam(1);
    this.load(sim);
  }

  /** (Re)build every scene object for a simulation, keeping the WebGL context. */
  load(sim: Simulation): void {
    if (this.fluoro) this.fluoro.dispose();
    this.sim = sim;
    this.world = new World3D(sim.anat);
    this.fluoro = new FluoroWorld(sim.anat, sim.anat.frame);
    this.vessels = new VesselMeshes(sim);
    this.devices = new DeviceMeshes(sim);
    this.world.scene.add(this.vessels.group3d, this.devices.group3d);
    this.fluoro.scene.add(this.vessels.groupX, this.devices.groupX);
    this.orbit.setGoal(this.world.overviewPoint, 950);
    this.orbit.snap();
    this.blitScene.clear();
    this.blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMaterial(this.fluoro.display.texture)));
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.orbit.camera.aspect = w / Math.max(1, h);
    this.orbit.camera.updateProjectionMatrix();
  }

  /** Rest-pose tip of the guide while it is still in the arm/aorta (fluoro table panning). */
  private fluoroFollow(): THREE.Vector3 | null {
    const sim = this.sim;
    if (sim.guide.engaged || sim.guide.s > sim.anat.landmarks.root - 45) return null;
    return this.devices.tip.clone();
  }

  render(dt: number, opts: { follow: boolean; pip: Rect | null }): Layout {
    const sim = this.sim;
    const s = beatScale(sim.beatPhase);
    sharedUniforms.uBeatK.value = s - 1;
    sharedUniforms.uClock.value = Number.isFinite(sim.fieldStart) ? sim.t - sim.fieldStart : 1e6;
    this.world.heartGroup.scale.setScalar(s);
    this.fluoro.setHeartScale(s);
    const C: Vec3 = sim.anat.frame.centre;
    this.vessels.update(sim.t);
    this.devices.update(sim.t, s, C);
    this.world.setCarm(sim.carm.lao, sim.carm.cra);
    this.fluoro.aim(sim.carm.lao, sim.carm.cra, this.fluoroFollow(), dt);
    this.fluoro.acquire(this.renderer, sim.t, sim.acquisition !== 'off');

    if (opts.follow) this.orbit.setGoal(this.devices.tip);
    this.orbit.update(dt);

    const r = this.renderer;
    const W = this.width;
    const H = this.height;
    r.setRenderTarget(null);
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    r.setClearColor(sim.view === '3d' ? 0x0b1016 : 0x000000, 1);
    r.clear();
    const layout: Layout = { monitor: null, pip: null };
    if (sim.view === '3d') {
      r.render(this.world.scene, this.orbit.camera);
      if (opts.pip && this.fluoro.hasImage) {
        this.drawImage(opts.pip);
        layout.pip = opts.pip;
      }
    } else {
      const availH = H - this.insets.top - this.insets.bottom;
      const size = Math.max(160, Math.min(W - 8, availH));
      const rect = { x: Math.round((W - size) / 2), y: Math.round(this.insets.top + (availH - size) / 2), w: size, h: size };
      if (this.fluoro.hasImage) this.drawImage(rect);
      layout.monitor = rect;
    }
    this.layout = layout;
    return layout;
  }

  private drawImage(rect: Rect): void {
    const r = this.renderer;
    const y = this.height - rect.y - rect.h;
    r.setViewport(rect.x, y, rect.w, rect.h);
    r.setScissor(rect.x, y, rect.w, rect.h);
    r.setScissorTest(true);
    r.render(this.blitScene, this.blitCam);
    r.setScissorTest(false);
    r.setViewport(0, 0, this.width, this.height);
  }

  dispose(): void {
    this.fluoro.dispose();
    this.renderer.dispose();
  }
}

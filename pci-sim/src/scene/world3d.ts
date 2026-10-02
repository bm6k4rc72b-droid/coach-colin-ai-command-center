/**
 * Lit 3D anatomy scene: beating heart, vessel tree, devices, a translucent C-arm, and an orbit
 * camera that can auto-zoom to the lesion or follow the device tip.
 */
import * as THREE from 'three';
import { lerp3 } from '../anatomy/math';
import { sampleAt, type Anatomy } from '../anatomy/vessels';
import { buildHeartGeometry } from './heartMesh';
import { carmDirection } from './fluoroWorld';

export class OrbitCam {
  readonly camera: THREE.PerspectiveCamera;
  readonly target = new THREE.Vector3();
  private goalTarget = new THREE.Vector3();
  yaw = 0.35;
  pitch = 0.18;
  distance = 900;
  goalDistance = 900;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(40, aspect, 1, 6000);
  }

  setGoal(target: THREE.Vector3, distance?: number): void {
    this.goalTarget.copy(target);
    if (distance !== undefined) this.goalDistance = distance;
  }

  snap(): void {
    this.target.copy(this.goalTarget);
    this.distance = this.goalDistance;
  }

  orbit(dx: number, dy: number): void {
    this.yaw -= dx * 0.006;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + dy * 0.006));
  }

  zoom(factor: number): void {
    this.goalDistance = Math.max(40, Math.min(2200, this.goalDistance * factor));
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt / 0.35);
    this.target.lerp(this.goalTarget, k);
    this.distance += (this.goalDistance - this.distance) * k;
    const cp = Math.cos(this.pitch);
    const off = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).multiplyScalar(this.distance);
    this.camera.position.copy(this.target).add(off);
    this.camera.lookAt(this.target);
  }
}

export class World3D {
  readonly scene = new THREE.Scene();
  readonly heartGroup = new THREE.Group();
  readonly heartMesh: THREE.Mesh;
  readonly carm = new THREE.Group();
  readonly lesionPoint: THREE.Vector3;
  readonly overviewPoint: THREE.Vector3;
  readonly heartPoint: THREE.Vector3;

  constructor(anat: Anatomy) {
    this.scene.background = new THREE.Color(0x0b1016);
    this.scene.fog = new THREE.Fog(0x0b1016, 1400, 3200);
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a1a18, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(200, 400, 500);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.6);
    rim.position.set(-400, 100, -300);
    this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight(0x404650, 0.6));

    const C = anat.frame.centre;
    this.heartMesh = new THREE.Mesh(
      buildHeartGeometry(anat.frame),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02 }),
    );
    this.heartGroup.position.set(...C);
    this.heartGroup.add(this.heartMesh);
    this.scene.add(this.heartGroup);

    this.lesionPoint = new THREE.Vector3(...sampleAt(anat.vessels.LAD, 38));
    this.heartPoint = new THREE.Vector3(...lerp3(anat.rootCentre, C, 0.5));
    this.overviewPoint = new THREE.Vector3(-230, 40, 0);

    // Translucent C-arm (orientation cue).
    const mat = new THREE.LineBasicMaterial({ color: 0x6f8fb3, transparent: true, opacity: 0.22, depthWrite: false });
    const edges = (g: THREE.BufferGeometry) => new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), mat);
    const arc = edges(new THREE.TorusGeometry(520, 22, 4, 40, Math.PI));
    const det = edges(new THREE.BoxGeometry(260, 260, 60));
    det.position.set(0, 0, 470);
    const tube = edges(new THREE.CylinderGeometry(70, 90, 140, 16));
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0, -470);
    const inner = new THREE.Group();
    inner.add(arc, det, tube);
    // The C joins tube (−z) and detector (+z), arcing around the head end like a cath-lab C-arm.
    arc.rotation.set(0, -Math.PI / 2, 0);
    this.carm.add(inner);
    this.carm.position.copy(this.heartPoint);
    this.scene.add(this.carm);
  }

  setCarm(lao: number, cra: number): void {
    const dir = carmDirection(lao, cra);
    this.carm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  }
}

// The anatomy engine: a plain (non-React) registry of every piece plus the
// per-frame update that animates positions, opacity and highlight. React
// state changes only *retarget* the engine (applyState); the render loop does
// the interpolation, so nothing re-renders per frame.

import * as THREE from 'three';
import { BACKGROUND, SYSTEM_STYLE } from '../data/systems';
import { COLLECTIONS, inCollection } from '../data/collections';
import { layoutSheet } from '../lib/atlasLayout';
import { clamp01, damp, easeInOutCubic, smoothstep } from '../lib/easing';
import { SYSTEM_IDS } from '../types';
import type { ManifestEntry, SystemId } from '../types';
import type { AtlasState } from '../state/store';
import { useAtlas } from '../state/store';
import { rig } from './cameraRig';
import type { Pose } from './cameraRig';

export const LAYER_INTERACTIVE = 0;
export const LAYER_PASSIVE = 1;

export interface PieceRuntime {
  entry: ManifestEntry;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  baseColor: THREE.Color;
  assembled: THREE.Vector3;
  /** Where the piece goes at explode = 1 (atlas or collection sheet). */
  exploded: THREE.Vector3;
  /** Smoothed copy of `exploded`, so sheet re-flows glide instead of jump. */
  explodedCur: THREE.Vector3;
  /** 0 (top row, leaves first) … 1 (bottom row). */
  stagger: number;
  opacity: number;
  opacityTarget: number;
  fadeDelayUntil: number;
  interactive: boolean;
  dim: number;
  dimTarget: number;
  hover: number;
  hoverTarget: number;
  sel: number;
  selTarget: number;
}

export const pieces = new Map<string, PieceRuntime>();

const bg = new THREE.Color(BACKGROUND);
const GHOST = 0.07;
const STAGGER = 0.35;

const engine = {
  explodeCur: 0,
  tween: null as null | { from: number; to: number; t0: number; dur: number },
  frames: {
    assembled: new THREE.Box3(),
    sheet: new THREE.Box3(),
  },
  lastVisible: null as Record<SystemId, boolean> | null,
};

export function explodeValue() {
  return engine.explodeCur;
}

// ---------------------------------------------------------------------------
// Registration (called once per system GLB).

export function registerPiece(entry: ManifestEntry, mesh: THREE.Mesh, material: THREE.MeshStandardMaterial) {
  const assembled = new THREE.Vector3(...entry.assembledPosition);
  const exploded = new THREE.Vector3(...entry.explodedPosition);
  mesh.position.copy(assembled);
  mesh.userData.id = entry.id;
  const p: PieceRuntime = {
    entry,
    mesh,
    material,
    baseColor: material.color.clone(),
    assembled,
    exploded,
    explodedCur: exploded.clone(),
    stagger: 0,
    opacity: 0,
    opacityTarget: 1,
    fadeDelayUntil: 0,
    interactive: true,
    dim: 0,
    dimTarget: 0,
    hover: 0,
    hoverTarget: 0,
    sel: 0,
    selTarget: 0,
  };
  pieces.set(entry.id, p);
}

export function unregisterSystem(system: SystemId) {
  for (const [id, p] of pieces) if (p.entry.system === system) pieces.delete(id);
}

// ---------------------------------------------------------------------------
// State → targets

function isShown(p: ManifestEntry, st: AtlasState) {
  if (!st.visible[p.system]) return false;
  if (st.collection) {
    const c = COLLECTIONS.find((x) => x.id === st.collection)!;
    return inCollection(p, c, st.side);
  }
  return true;
}

export function countShown(st: AtlasState) {
  if (!st.manifest) return 0;
  let n = 0;
  for (const p of st.manifest.pieces) if (isShown(p, st)) n++;
  return n;
}

/** Recompute sheet positions for the pieces currently shown. */
function relayout(st: AtlasState) {
  const m = st.manifest;
  if (!m) return;
  const shown = m.pieces.filter((p) => isShown(p, st));
  const allSystems = SYSTEM_IDS.every((s) => st.visible[s]);
  const order = new Map(SYSTEM_IDS.map((s, i) => [s, i]));

  const asm = new THREE.Box3();
  for (const p of shown) {
    const c = new THREE.Vector3(...p.assembledPosition);
    const h = new THREE.Vector3(...p.size).multiplyScalar(0.5);
    asm.expandByPoint(c.clone().sub(h)).expandByPoint(c.clone().add(h));
  }
  if (asm.isEmpty()) asm.set(new THREE.Vector3(...m.bounds.min), new THREE.Vector3(...m.bounds.max));

  const sheet = new THREE.Box3();
  if (!st.collection && allSystems) {
    // The canonical atlas layout from the manifest.
    for (const p of m.pieces) {
      const rt = pieces.get(p.id);
      if (rt) rt.exploded.set(...p.explodedPosition);
    }
    sheet.set(new THREE.Vector3(...m.sheet.min), new THREE.Vector3(...m.sheet.max));
  } else {
    const collection = !!st.collection;
    const layout = layoutSheet(
      shown.map((p) => ({ id: p.id, w: p.size[0], h: p.size[1], group: order.get(p.system)!, name: p.name })),
      collection ? { aspect: 1.7, gutter: 0.3, minGutter: 0.006 } : {},
    );
    const cx = collection ? (asm.min.x + asm.max.x) / 2 : 0;
    const cy = collection ? (asm.min.y + asm.max.y) / 2 : (m.bounds.min[1] + m.bounds.max[1]) / 2;
    const cz = collection ? (asm.min.z + asm.max.z) / 2 : 0;
    for (const p of shown) {
      const [x, y] = layout.positions.get(p.id)!;
      pieces.get(p.id)?.exploded.set(cx + x, cy + y, cz);
    }
    sheet.set(
      new THREE.Vector3(cx - layout.width / 2, cy - layout.height / 2, cz),
      new THREE.Vector3(cx + layout.width / 2, cy + layout.height / 2, cz),
    );
  }

  // Stagger: top rows of the sheet leave first.
  if (!sheet.isEmpty()) {
    const h = Math.max(1e-6, sheet.max.y - sheet.min.y);
    for (const p of pieces.values()) p.stagger = clamp01((sheet.max.y - p.exploded.y) / h);
  }
  engine.frames.assembled.copy(asm);
  engine.frames.sheet.copy(sheet);
}

/** Retarget every piece from store state. Cheap; runs on state change only. */
export function applyState(st: AtlasState, prev?: AtlasState) {
  const now = performance.now();

  // Systems changing together fade with a slight stagger.
  const changed = prev ? SYSTEM_IDS.filter((s) => prev.visible[s] !== st.visible[s]) : [];
  const delay = new Map(changed.map((s, i) => [s, now + (changed.length > 1 ? i * 55 : 0)]));

  const isolating = st.isolated && st.selectedId !== null;
  for (const p of pieces.values()) {
    const shown = isShown(p.entry, st);
    const isSel = p.entry.id === st.selectedId;
    let target = shown ? 1 : 0;
    if (isolating && !isSel) target = shown ? GHOST : 0;
    if (isolating && isSel) target = 1;
    if (target !== p.opacityTarget) {
      p.opacityTarget = target;
      p.fadeDelayUntil = delay.get(p.entry.system) ?? now;
    }
    p.interactive = target === 1;
    p.dimTarget = st.selectedId && !isolating && !isSel ? 1 : 0;
    p.selTarget = isSel ? 1 : 0;
    p.hoverTarget = p.entry.id === st.hoveredId ? 1 : 0;
  }

  const layoutChanged =
    !prev ||
    prev.collection !== st.collection ||
    prev.side !== st.side ||
    changed.length > 0 ||
    prev.manifest !== st.manifest ||
    prev.loaded !== st.loaded;
  if (layoutChanged) relayout(st);

  // Explode target changed → eased tween (or a direct chase while scrubbing).
  if (!prev || prev.explode !== st.explode) {
    const dist = Math.abs(st.explode - engine.explodeCur);
    engine.tween = { from: engine.explodeCur, to: st.explode, t0: now, dur: Math.max(380, 1700 * dist) };
  }

  // Camera follows the explode, or reframes on a collection change.
  const explodeMoved = prev && (prev.explode !== st.explode || prev.collection !== st.collection);
  const sheetChanged = prev && st.explode > 0 && layoutChanged;
  if (explodeMoved || sheetChanged) rig.setFollow(followPose);
}

// ---------------------------------------------------------------------------
// Camera framing

let assembledPose: Pose | null = null;
let sheetPose: Pose | null = null;
let poseStamp = '';

function framePoses() {
  const { assembled, sheet } = engine.frames;
  const stamp = `${assembled.min.toArray()}${assembled.max.toArray()}${sheet.min.toArray()}${sheet.max.toArray()}${window.innerWidth}x${window.innerHeight}`;
  if (stamp !== poseStamp) {
    poseStamp = stamp;
    const isBody = assembled.max.y - assembled.min.y > 1;
    assembledPose = rig.poseForBox(assembled.min, assembled.max, isBody ? 1.06 : 1.5);
    sheetPose = rig.poseForBox(sheet.min, sheet.max, 1.04, 0.02);
  }
  return { a: assembledPose!, s: sheetPose! };
}

/** Pose for the current explode amount: the camera pulls back as pieces spread. */
export function followPose(): Pose {
  const { a, s } = framePoses();
  const e = smoothstep(clamp01(engine.explodeCur));
  return {
    position: a.position.clone().lerp(s.position, e),
    target: a.target.clone().lerp(s.target, e),
  };
}

/** Home framing for the current state (used by Reset and on load). */
export function homePose(): Pose {
  const { a, s } = framePoses();
  return useAtlas.getState().explode > 0.5 ? s : a;
}

// ---------------------------------------------------------------------------
// Focus helpers (piece-aware: frames where the piece is going, not where it is)

function pieceT(p: PieceRuntime, e: number) {
  return smoothstep(clamp01(e * (1 + STAGGER) - p.stagger * STAGGER));
}

export function pieceBox(id: string, atTarget = true): THREE.Box3 | null {
  const p = pieces.get(id);
  if (!p) return null;
  const e = atTarget ? useAtlas.getState().explode : engine.explodeCur;
  const pos = p.assembled.clone().lerp(p.exploded, pieceT(p, e));
  const geo = p.mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  return geo.boundingBox!.clone().translate(pos);
}

export function focusPiece(id: string, ms = 900) {
  const box = pieceBox(id);
  if (box) rig.focusOnBox(box, ms);
}

// ---------------------------------------------------------------------------
// Per-frame update

const tmp = new THREE.Vector3();
const tmpColor = new THREE.Color();

export function tick(dt: number) {
  const st = useAtlas.getState();
  const now = performance.now();

  // Explode amount.
  if (st.scrubbing) {
    engine.tween = null;
    engine.explodeCur = damp(engine.explodeCur, st.explode, 16, dt);
  } else if (engine.tween) {
    const { from, to, t0, dur } = engine.tween;
    const t = clamp01((now - t0) / dur);
    engine.explodeCur = from + (to - from) * easeInOutCubic(t);
    if (t >= 1) engine.tween = null;
  }
  const e = engine.explodeCur;
  const lift = 0.12;

  for (const p of pieces.values()) {
    // Position.
    p.explodedCur.lerp(p.exploded, 1 - Math.exp(-dt * 5));
    const t = pieceT(p, e);
    tmp.copy(p.assembled).lerp(p.explodedCur, t);
    tmp.z += Math.sin(Math.PI * t) * lift * (0.4 + 0.6 * (1 - p.stagger));
    p.mesh.position.copy(tmp);

    // Opacity (with per-system fade delay).
    if (now >= p.fadeDelayUntil && p.opacity !== p.opacityTarget) {
      p.opacity = damp(p.opacity, p.opacityTarget, 11, dt);
      if (Math.abs(p.opacity - p.opacityTarget) < 0.004) p.opacity = p.opacityTarget;
      const m = p.material;
      m.opacity = p.opacity;
      const transparent = p.opacity < 0.999;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      m.depthWrite = p.opacity > 0.5;
    }
    const visible = p.opacity > 0.003;
    if (p.mesh.visible !== visible) p.mesh.visible = visible;
    const layer = p.interactive && visible ? LAYER_INTERACTIVE : LAYER_PASSIVE;
    if (!p.mesh.layers.isEnabled(layer)) p.mesh.layers.set(layer);

    // Highlight / dim.
    const dim = damp(p.dim, p.dimTarget, 10, dt);
    const hover = damp(p.hover, p.hoverTarget, 18, dt);
    const sel = damp(p.sel, p.selTarget, 10, dt);
    if (Math.abs(dim - p.dim) + Math.abs(hover - p.hover) + Math.abs(sel - p.sel) > 1e-4) {
      p.dim = dim;
      p.hover = hover;
      p.sel = sel;
      tmpColor.copy(p.baseColor).lerp(bg, dim * 0.5);
      p.material.color.copy(tmpColor);
      p.material.emissive.copy(p.baseColor).multiplyScalar(0.18 * sel).addScalar(0.1 * hover);
    } else if (p.dim !== p.dimTarget || p.hover !== p.hoverTarget || p.sel !== p.selTarget) {
      p.dim = p.dimTarget;
      p.hover = p.hoverTarget;
      p.sel = p.selTarget;
      p.material.color.copy(p.baseColor).lerp(bg, p.dim * 0.5);
      p.material.emissive.copy(p.baseColor).multiplyScalar(0.18 * p.sel).addScalar(0.1 * p.hover);
    }
  }

  rig.update(dt);
}

export function materialFor(system: SystemId) {
  const s = SYSTEM_STYLE[system];
  return new THREE.MeshStandardMaterial({
    color: s.color,
    roughness: s.roughness,
    metalness: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
}

if (import.meta.env.DEV) (window as unknown as { __engine: unknown }).__engine = { pieces, engine, rig };

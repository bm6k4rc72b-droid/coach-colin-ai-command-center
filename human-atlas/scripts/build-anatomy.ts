// Builds the Human Atlas anatomy assets from the BodyParts3D archive.
//
//   npm run build:anatomy                     # defaults below
//   npm run build:anatomy -- --raw <dir> --out <dir> --ratio 0.05
//
// Input (assets/anatomy/raw, not committed):
//   parts_list_e.txt          id → English name
//   conventional_part_of.txt  part-of tree (system / region membership)
//   *.obj or *.stl            one mesh per element, named by element ID
//                             (searched in raw/, raw/obj/ and raw/stl/)
//
// Output:
//   public/anatomy/<system>.glb      one meshopt-compressed GLB per system;
//                                    every piece is a node named by its ID
//   public/anatomy/manifest.json     one entry per piece (see src/types.ts)
//   assets/anatomy/unclassified.tsv  pieces no rule could place in a system
//   assets/anatomy/build-report.txt  warnings worth a human look
//
// BodyParts3D coordinates are millimetres, Z up, anterior -Y, left +X. The
// atlas uses metres, Y up, anterior +Z (three.js convention), with the body
// centred on X/Z and the soles of the feet on Y = 0.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Document, Logger, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { layoutSheet } from '../src/lib/atlasLayout.ts';
import { SYSTEM_IDS } from '../src/types.ts';
import type { Manifest, ManifestEntry, Relation, SystemId, Vec3 } from '../src/types.ts';
import { ATTACHMENTS } from './rules/attachments.ts';
import { REGION_NODES, ROOTS, categoryFor, classify, sideFor } from './rules/classify.ts';
import type { RootKey } from './rules/classify.ts';

const ROOT = path.resolve(import.meta.dirname, '..');

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const RAW = path.resolve(ROOT, arg('raw', 'assets/anatomy/raw'));
const OUT = path.resolve(ROOT, arg('out', 'public/anatomy'));
const LOG_DIR = path.resolve(ROOT, 'assets/anatomy');
const RATIO = Number(arg('ratio', '0.055'));
const MIN_TRIS = 260;
const MAX_TRIS = 7000;

export const SYSTEM_LABELS: Record<SystemId, string> = {
  skeleton: 'Skeleton',
  muscles: 'Muscles',
  heart: 'Heart',
  sensory: 'Sensory organs',
  arteries: 'Arteries',
  veins: 'Veins',
  nervous: 'Nervous system',
  respiratory: 'Respiratory',
};

// ---------------------------------------------------------------------------
// Tables

function readTsv(file: string): string[][] {
  const text = readFileSync(path.join(RAW, file), 'utf8');
  return text
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((l) => l.split('\t'));
}

const names = new Map<string, string>();
for (const [id, en] of readTsv('parts_list_e.txt')) names.set(id, en);

const parents = new Map<string, Set<string>>();
for (const [parent, , child] of readTsv('conventional_part_of.txt')) {
  if (!parents.has(child)) parents.set(child, new Set());
  parents.get(child)!.add(parent);
}

function ancestors(id: string): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    for (const p of parents.get(stack.pop()!) ?? []) {
      if (!out.has(p)) {
        out.add(p);
        stack.push(p);
      }
    }
  }
  return out;
}

const GENERIC_PARENTS = new Set(['human body', 'set of immaterial anatomical entities', 'cardinal body part']);

// ---------------------------------------------------------------------------
// Mesh parsing

interface RawMesh {
  positions: Float32Array; // non-indexed triangles, atlas space, metres
}

function toAtlas(x: number, y: number, z: number, out: number[]) {
  out.push(x / 1000, z / 1000, -y / 1000);
}

function parseStl(buf: Buffer): RawMesh {
  const isBinary = buf.length >= 84 && 84 + buf.readUInt32LE(80) * 50 === buf.length;
  const out: number[] = [];
  if (isBinary) {
    const n = buf.readUInt32LE(80);
    for (let t = 0; t < n; t++) {
      const o = 84 + t * 50 + 12;
      for (let v = 0; v < 3; v++) {
        const b = o + v * 12;
        toAtlas(buf.readFloatLE(b), buf.readFloatLE(b + 4), buf.readFloatLE(b + 8), out);
      }
    }
  } else {
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
    const text = buf.toString('utf8');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) toAtlas(+m[1], +m[2], +m[3], out);
  }
  return { positions: new Float32Array(out) };
}

function parseObj(text: string): RawMesh {
  const verts: number[] = [];
  const out: number[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.trim().split(/\s+/);
      verts.push(+x, +y, +z);
    } else if (line.startsWith('f ')) {
      const idx = line
        .trim()
        .split(/\s+/)
        .slice(1)
        .map((tok) => {
          const i = parseInt(tok.split('/')[0], 10);
          return i < 0 ? verts.length / 3 + i : i - 1;
        });
      for (let k = 1; k + 1 < idx.length; k++) {
        for (const i of [idx[0], idx[k], idx[k + 1]]) {
          toAtlas(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2], out);
        }
      }
    }
  }
  return { positions: new Float32Array(out) };
}

function findMeshFiles(): Map<string, string> {
  const files = new Map<string, string>();
  for (const dir of [RAW, path.join(RAW, 'obj'), path.join(RAW, 'stl')]) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) {
      const ext = path.extname(f).toLowerCase();
      if (ext !== '.obj' && ext !== '.stl') continue;
      const id = path.basename(f, path.extname(f));
      // Prefer OBJ when both exist.
      if (!files.has(id) || ext === '.obj') files.set(id, path.join(dir, f));
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Geometry processing

interface Piece {
  id: string;
  positions: Float32Array; // indexed, centred on `center`
  normals: Float32Array;
  indices: Uint32Array;
  center: Vec3;
  size: Vec3;
  samples: Float32Array; // world-space points for proximity
}

function weld(raw: Float32Array): { positions: Float32Array; indices: Uint32Array } {
  const map = new Map<string, number>();
  const pos: number[] = [];
  const idx: number[] = [];
  const tri = [0, 0, 0];
  for (let t = 0; t < raw.length / 9; t++) {
    for (let v = 0; v < 3; v++) {
      const o = t * 9 + v * 3;
      const key = `${Math.round(raw[o] * 1e6)},${Math.round(raw[o + 1] * 1e6)},${Math.round(raw[o + 2] * 1e6)}`;
      let i = map.get(key);
      if (i === undefined) {
        i = pos.length / 3;
        map.set(key, i);
        pos.push(raw[o], raw[o + 1], raw[o + 2]);
      }
      tri[v] = i;
    }
    if (tri[0] !== tri[1] && tri[1] !== tri[2] && tri[0] !== tri[2]) idx.push(tri[0], tri[1], tri[2]);
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

function compact(positions: Float32Array, indices: Uint32Array) {
  const remap = new Int32Array(positions.length / 3).fill(-1);
  const pos: number[] = [];
  const idx = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i];
    if (remap[v] < 0) {
      remap[v] = pos.length / 3;
      pos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
    }
    idx[i] = remap[v];
  }
  return { positions: new Float32Array(pos), indices: idx };
}

function vertexNormals(p: Float32Array, idx: Uint32Array): Float32Array {
  const n = new Float32Array(p.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3;
    const b = idx[i + 1] * 3;
    const c = idx[i + 2] * 3;
    const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
    const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) {
      n[v] += nx;
      n[v + 1] += ny;
      n[v + 2] += nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l;
    n[i + 1] /= l;
    n[i + 2] /= l;
  }
  return n;
}

function processMesh(id: string, raw: RawMesh): Piece | null {
  const welded = weld(raw.positions);
  const tris = welded.indices.length / 3;
  if (tris === 0) return null;
  let { positions, indices } = welded;
  const target = Math.min(tris, Math.max(MIN_TRIS, Math.min(MAX_TRIS, Math.round(tris * RATIO))));
  if (target < tris) {
    const [simplified] = MeshoptSimplifier.simplify(indices, positions, 3, target * 3, 0.05, []);
    ({ positions, indices } = compact(positions, simplified));
  }
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }
  const center: Vec3 = [0, 1, 2].map((k) => (min[k] + max[k]) / 2) as Vec3;
  const size: Vec3 = [0, 1, 2].map((k) => max[k] - min[k]) as Vec3;
  const step = Math.max(1, Math.floor(positions.length / 3 / 320));
  const samples: number[] = [];
  for (let v = 0; v < positions.length / 3; v += step) {
    samples.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
  }
  const normals = vertexNormals(positions, indices);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] -= center[0];
    positions[i + 1] -= center[1];
    positions[i + 2] -= center[2];
  }
  return { id, positions, normals, indices, center, size, samples: new Float32Array(samples) };
}

// ---------------------------------------------------------------------------
// Proximity ("nearby"): surfaces within NEAR metres of each other.

const NEAR = 0.004;

function computeNearby(pieces: Piece[]): Map<string, string[]> {
  const cell = NEAR;
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  pieces.forEach((p, pi) => {
    for (let i = 0; i < p.samples.length; i += 3) {
      const k = key(p.samples[i], p.samples[i + 1], p.samples[i + 2]);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k)!.push(pi, i);
    }
  });
  const result = new Map<string, string[]>();
  pieces.forEach((p, pi) => {
    const hits = new Map<number, number>();
    for (let i = 0; i < p.samples.length; i += 3) {
      const x = p.samples[i], y = p.samples[i + 1], z = p.samples[i + 2];
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++) {
            const bucket = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
            if (!bucket) continue;
            for (let b = 0; b < bucket.length; b += 2) {
              const qi = bucket[b];
              if (qi === pi) continue;
              const q = pieces[qi].samples;
              const j = bucket[b + 1];
              if (Math.hypot(q[j] - x, q[j + 1] - y, q[j + 2] - z) < NEAR) hits.set(qi, (hits.get(qi) ?? 0) + 1);
            }
          }
    }
    const ranked = [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    result.set(p.id, ranked.map(([qi]) => pieces[qi].id));
  });
  return result;
}

// ---------------------------------------------------------------------------

async function main() {
  await MeshoptSimplifier.ready;
  await MeshoptEncoder.ready;

  const files = findMeshFiles();
  if (files.size === 0) {
    console.error(`No .obj or .stl files found in ${RAW}. See README.md → "Anatomy assets".`);
    process.exit(1);
  }
  console.log(`Found ${files.size} mesh files in ${path.relative(ROOT, RAW)}`);

  const unclassified: string[] = ['id\tname\tsystem roots\treason'];
  const report: string[] = [];
  type Meta = Pick<ManifestEntry, 'id' | 'name' | 'system' | 'region' | 'side' | 'category' | 'partOf'>;
  const meta = new Map<string, Meta>();

  for (const id of [...files.keys()].sort()) {
    const name = names.get(id);
    if (!name) {
      unclassified.push(`${id}\t\t\tno entry in parts_list_e.txt`);
      continue;
    }
    const anc = ancestors(id);
    const roots = new Set<RootKey>();
    for (const [k, fma] of Object.entries(ROOTS) as Array<[RootKey, string]>) if (anc.has(fma)) roots.add(k);
    const c = classify(name, roots);
    if (!c) {
      unclassified.push(`${id}\t${name}\t${[...roots].join(',') || '-'}\toutside the 8 atlas systems or ambiguous`);
      continue;
    }
    const region = REGION_NODES.find(([fma]) => anc.has(fma))?.[1] ?? '';
    const partOf = [...(parents.get(id) ?? [])]
      .map((p) => names.get(p) ?? p)
      .filter((p) => !GENERIC_PARENTS.has(p))
      .slice(0, 3);
    meta.set(id, {
      id,
      name,
      system: c.system,
      region,
      side: sideFor(name, c.system),
      category: categoryFor(name, c.system),
      partOf,
    });
  }

  // Parse + decimate.
  const pieces: Piece[] = [];
  let srcTris = 0;
  let i = 0;
  for (const id of meta.keys()) {
    const file = files.get(id)!;
    const buf = readFileSync(file);
    const raw = file.toLowerCase().endsWith('.obj') ? parseObj(buf.toString('utf8')) : parseStl(buf);
    srcTris += raw.positions.length / 9;
    const piece = processMesh(id, raw);
    if (piece) pieces.push(piece);
    else report.push(`mesh: ${id} has no triangles`);
    if (++i % 100 === 0) console.log(`  processed ${i}/${meta.size}`);
  }

  // Whole-body bounds → centre on X/Z, feet on the floor.
  const bmin: Vec3 = [Infinity, Infinity, Infinity];
  const bmax: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pieces) {
    for (let k = 0; k < 3; k++) {
      bmin[k] = Math.min(bmin[k], p.center[k] - p.size[k] / 2);
      bmax[k] = Math.max(bmax[k], p.center[k] + p.size[k] / 2);
    }
  }
  const shift: Vec3 = [-(bmin[0] + bmax[0]) / 2, -bmin[1], -(bmin[2] + bmax[2]) / 2];
  for (const p of pieces) {
    for (let k = 0; k < 3; k++) p.center[k] += shift[k];
    for (let s = 0; s < p.samples.length; s += 3) {
      p.samples[s] += shift[0];
      p.samples[s + 1] += shift[1];
      p.samples[s + 2] += shift[2];
    }
  }
  const bounds = {
    min: [bmin[0] + shift[0], bmin[1] + shift[1], bmin[2] + shift[2]] as Vec3,
    max: [bmax[0] + shift[0], bmax[1] + shift[1], bmax[2] + shift[2]] as Vec3,
  };

  // Region fallback for pieces the part-of tree files under no body region.
  const height = bounds.max[1];
  for (const p of pieces) {
    const m = meta.get(p.id)!;
    if (m.region) continue;
    m.region = regionByNameOrPosition(m.name, m.system, p.center[1] / height);
    report.push(`region: ${p.id} "${m.name}" not under a region node; placed in ${m.region} by name/position`);
  }

  // Laterality sanity check (left is +X).
  for (const p of pieces) {
    const m = meta.get(p.id)!;
    if ((m.side === 'left' && p.center[0] < -0.01) || (m.side === 'right' && p.center[0] > 0.01)) {
      report.push(`side: ${p.id} "${m.name}" is named ${m.side} but its centre is at x=${p.center[0].toFixed(3)}`);
    }
  }

  // Atlas specimen sheet.
  const order = new Map(SYSTEM_IDS.map((s, k) => [s, k]));
  const layout = layoutSheet(
    pieces.map((p) => ({
      id: p.id,
      w: p.size[0],
      h: p.size[1],
      group: order.get(meta.get(p.id)!.system)!,
      name: meta.get(p.id)!.name,
    })),
  );
  const sheetCenterY = (bounds.min[1] + bounds.max[1]) / 2;

  // Relations.
  const byBase = new Map<string, string[]>();
  const baseName = (n: string) => n.replace(/\b(left|right) /, '');
  for (const m of meta.values()) {
    const b = baseName(m.name);
    if (!byBase.has(b)) byBase.set(b, []);
    byBase.get(b)!.push(m.id);
  }
  const relations = new Map<string, Relation[]>();
  const addRel = (from: string, rel: Relation) => {
    if (!relations.has(from)) relations.set(from, []);
    const list = relations.get(from)!;
    if (!list.some((r) => r.id === rel.id && r.role === rel.role)) list.push(rel);
  };
  for (const m of meta.values()) {
    if (m.system !== 'muscles') continue;
    const rule = ATTACHMENTS[baseName(m.name)];
    if (!rule) continue;
    for (const role of ['origin', 'insertion'] as const) {
      for (const bone of rule[role]) {
        const candidates = (byBase.get(bone) ?? []).map((id) => meta.get(id)!);
        const same = candidates.find((c) => c.side === m.side) ?? candidates.find((c) => c.side === 'midline');
        // A midline muscle (e.g. the diaphragm) attaches to both of a paired bone.
        const hits = same ? [same] : m.side === 'midline' ? candidates : [];
        if (hits.length === 0) {
          report.push(`attachment: "${bone}" (${role} of ${m.name}) has no matching mesh`);
          continue;
        }
        for (const hit of hits) {
          addRel(m.id, { id: hit.id, role });
          addRel(hit.id, { id: m.id, role: 'attached-muscle' });
        }
      }
    }
  }
  for (const key of Object.keys(ATTACHMENTS)) {
    if (!byBase.has(key)) report.push(`attachment: rule "${key}" matches no muscle mesh`);
  }

  console.log('Computing proximity…');
  const nearby = computeNearby(pieces);

  // Write GLBs, one per system.
  mkdirSync(OUT, { recursive: true });
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const entries: ManifestEntry[] = [];
  let outTris = 0;
  for (const system of SYSTEM_IDS) {
    const members = pieces.filter((p) => meta.get(p.id)!.system === system);
    if (members.length === 0) continue;
    const doc = new Document().setLogger(new Logger(Logger.Verbosity.WARN));
    const buffer = doc.createBuffer();
    const scene = doc.createScene(system);
    for (const p of members) {
      const prim = doc
        .createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(p.positions as Float32Array<ArrayBuffer>).setBuffer(buffer))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(p.normals as Float32Array<ArrayBuffer>).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(p.indices as Uint32Array<ArrayBuffer>).setBuffer(buffer));
      const mesh = doc.createMesh(p.id).addPrimitive(prim);
      scene.addChild(doc.createNode(p.id).setMesh(mesh).setTranslation(p.center));
      outTris += p.indices.length / 3;
    }
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const file = `${system}.glb`;
    await io.write(path.join(OUT, file), doc);
    const kb = statSync(path.join(OUT, file)).size / 1024;
    console.log(`  ${file.padEnd(16)} ${String(members.length).padStart(4)} pieces  ${kb.toFixed(0).padStart(6)} KB`);

    for (const p of members) {
      const m = meta.get(p.id)!;
      const [sx, sy] = layout.positions.get(p.id)!;
      entries.push({
        ...m,
        meshFile: file,
        assembledPosition: p.center.map(round) as Vec3,
        explodedPosition: [round(sx), round(sheetCenterY + sy), 0],
        size: p.size.map(round) as Vec3,
        relations: relations.get(p.id) ?? [],
        nearby: nearby.get(p.id) ?? [],
        triangles: p.indices.length / 3,
      });
    }
  }

  const manifest: Manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: 'BodyParts3D (DBCLS), CC BY-SA 2.1 JP',
    units: 'm',
    pieceCount: entries.length,
    triangleCount: outTris,
    bounds: { min: bounds.min.map(round) as Vec3, max: bounds.max.map(round) as Vec3 },
    sheet: {
      min: [round(-layout.width / 2), round(sheetCenterY - layout.height / 2), 0],
      max: [round(layout.width / 2), round(sheetCenterY + layout.height / 2), 0],
    },
    systems: SYSTEM_IDS.map((id) => ({
      id,
      label: SYSTEM_LABELS[id],
      file: `${id}.glb`,
      count: entries.filter((e) => e.system === id).length,
    })),
    pieces: entries,
  };
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(path.join(LOG_DIR, 'unclassified.tsv'), unclassified.join('\n') + '\n');
  writeFileSync(path.join(LOG_DIR, 'build-report.txt'), report.join('\n') + '\n');

  console.log(
    `\n${entries.length} pieces · ${srcTris.toLocaleString()} → ${outTris.toLocaleString()} triangles` +
      `\n${unclassified.length - 1} unclassified → assets/anatomy/unclassified.tsv` +
      `\n${report.length} warnings → assets/anatomy/build-report.txt`,
  );
}

/** Fallback region from name keywords, then from height as a fraction of stature. */
function regionByNameOrPosition(name: string, system: SystemId, h: number): string {
  const n = name.toLowerCase();
  if (/\bhand\b/.test(n)) return 'Hand';
  if (/\bfoot\b|plantar/.test(n)) return 'Foot';
  if (/forearm/.test(n)) return 'Forearm';
  if (/\bleg\b|calcaneal/.test(n)) return 'Leg';
  if (/costal cartilage/.test(n)) return 'Thorax';
  if (system === 'nervous') return h > 0.86 ? 'Brain' : 'Back';
  if (h > 0.87) return 'Head';
  if (h > 0.81) return 'Neck';
  if (h > 0.63) return 'Thorax';
  if (h > 0.53) return 'Abdomen';
  return 'Pelvis';
}

function round(v: number) {
  return Math.round(v * 1e5) / 1e5;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

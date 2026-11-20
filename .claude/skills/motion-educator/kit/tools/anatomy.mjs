// Real human anatomy for a film: builds one .glb from BodyParts3D (the Database Center for Life Science's
// whole-body model, measured from a real body: every bone, muscle, organ and the skin, in millimetres), so a body
// in a film is the body's real shape and never a stack of cylinders.
//
//   node kit/tools/anatomy.mjs films/NAME/models/arm.json
//
// The recipe names parts the way the database does (its English names: "right humerus", "long head of right
// biceps brachii", "skin") and says how each one is drawn:
//
//   { "out": "../assets/arm.glb",                      relative to the recipe
//     "units": 0.1,                                     millimetres to scene units (0.1: one unit = 1 cm)
//     "origin": "right humerus:bottom",                 the point placed at 0,0,0: a part's centre, or its top/bottom end
//     "parts": [
//       { "name": "humerus", "find": "right humerus", "material": "bone" },
//       { "name": "biceps", "find": ["long head of right biceps brachii", "short head of right biceps brachii"],
//         "material": "muscle", "tendons": true },     tendons: white where the muscle thins to a cord
//       { "name": "skin", "find": "skin", "material": "skin", "crop": { "x": [-340, -120], "z": [640, 1420] } }
//     ],
//     "smooth": 2 }                                     rounds of subdivide-and-relax: the source is about 2000
//                                                       triangles a muscle, so 1 or 2 takes the facets off
//
// A covering that spans the whole body (the skin, the fascia) is trimmed to a limb with `near`: keep the triangles
// within `within` millimetres of the named parts, e.g. "near": ["right humerus", "right radius", "right ulna",
// "right hand"], "within": 60 keeps the sleeve of skin around the arm and leaves the torso out.
// Coordinates come out three.js style: +x the body's left, +y up, +z the body's front (the camera's default view is
// the body facing you). `crop` keeps the triangles whose centre lies inside the box, in the source's millimetres
// (x: right is negative; y: front is negative; z: up from the soles).
//
// Find a part's name: `node kit/tools/anatomy.mjs --find biceps`. The database (about 200 MB) is fetched once into
// ~/.cache/motion-educator/bodyparts3d (or $ANATOMY_CACHE). Its licence asks for a credit: the tool writes it next
// to the .glb, and the film's credits carry it.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Document, NodeIO, VertexLayout } from "@gltf-transform/core";

const BASE = "https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST";
const CACHE = process.env.ANATOMY_CACHE ?? join(homedir(), ".cache", "motion-educator", "bodyparts3d");
const CREDIT = "BodyParts3D, © The Database Center for Life Science, licensed under CC Attribution 4.0 International (dbarchive.biosciencedbc.jp/en/bodyparts3d)";
const SETS = ["isa", "partof"];

function fetchOnce(name) {
  const file = join(CACHE, name);
  if (existsSync(file)) return file;
  mkdirSync(CACHE, { recursive: true });
  console.log(`fetching ${name} from BodyParts3D (once)`);
  const r = spawnSync("curl", ["-sSfL", "--retry", "3", "-o", `${file}.part`, `${BASE}/${name}`], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`could not fetch ${BASE}/${name}`);
  spawnSync("mv", [`${file}.part`, file]);
  if (name.endsWith(".zip")) {
    const u = spawnSync("unzip", ["-q", "-o", file, "-d", CACHE], { stdio: "inherit" });
    if (u.status !== 0) throw new Error(`could not unpack ${name} (is unzip installed?)`);
  }
  return file;
}

// name -> element files, from both of the database's trees.
function catalogue() {
  const byName = new Map();
  for (const set of SETS) {
    const text = readFileSync(fetchOnce(`${set}_element_parts.txt`), "utf8");
    for (const line of text.split("\n").slice(1)) {
      const [, name, file] = line.trim().split("\t");
      if (!file || file.endsWith("M")) continue; // the M files are mirror copies
      if (!byName.has(name)) byName.set(name, new Set());
      byName.get(name).add(file);
    }
  }
  return byName;
}

function objPath(file) {
  for (const set of SETS) {
    const p = join(CACHE, `${set}_BP3D_4.0_obj_99`, `${file}.obj`);
    if (existsSync(p)) return p;
  }
  for (const set of SETS) fetchOnce(`${set}_BP3D_4.0_obj_99.zip`);
  for (const set of SETS) {
    const p = join(CACHE, `${set}_BP3D_4.0_obj_99`, `${file}.obj`);
    if (existsSync(p)) return p;
  }
  throw new Error(`no mesh file ${file} in BodyParts3D`);
}

// ── Mesh work (indexed triangles, positions in source millimetres) ─────────────────────────────────────────────
function readObj(path, mesh) {
  const base = mesh.pos.length / 3;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.split(/\s+/);
      mesh.pos.push(+x, +y, +z);
    } else if (line.startsWith("f ")) {
      const v = line.trim().split(/\s+/).slice(1).map((s) => base + parseInt(s, 10) - 1);
      for (let i = 1; i + 1 < v.length; i++) mesh.tri.push(v[0], v[i], v[i + 1]);
    }
  }
}

function weld(mesh) {
  const key = new Map();
  const remap = new Int32Array(mesh.pos.length / 3);
  const pos = [];
  for (let i = 0; i < remap.length; i++) {
    const k = `${Math.round(mesh.pos[i * 3] * 100)},${Math.round(mesh.pos[i * 3 + 1] * 100)},${Math.round(mesh.pos[i * 3 + 2] * 100)}`;
    let j = key.get(k);
    if (j === undefined) {
      j = pos.length / 3;
      key.set(k, j);
      pos.push(mesh.pos[i * 3], mesh.pos[i * 3 + 1], mesh.pos[i * 3 + 2]);
    }
    remap[i] = j;
  }
  const tri = [];
  for (let i = 0; i < mesh.tri.length; i += 3) {
    const a = remap[mesh.tri[i]], b = remap[mesh.tri[i + 1]], c = remap[mesh.tri[i + 2]];
    if (a !== b && b !== c && a !== c) tri.push(a, b, c);
  }
  return { pos, tri };
}

function crop(mesh, box) {
  const inside = (v, axis) => {
    const range = box[axis];
    return !range || (v >= range[0] && v <= range[1]);
  };
  const tri = [];
  for (let i = 0; i < mesh.tri.length; i += 3) {
    const c = [0, 1, 2].map((k) => (mesh.pos[mesh.tri[i] * 3 + k] + mesh.pos[mesh.tri[i + 1] * 3 + k] + mesh.pos[mesh.tri[i + 2] * 3 + k]) / 3);
    if (inside(c[0], "x") && inside(c[1], "y") && inside(c[2], "z")) tri.push(mesh.tri[i], mesh.tri[i + 1], mesh.tri[i + 2]);
  }
  // Drop the vertices no triangle uses any more.
  const used = new Map();
  const pos = [];
  const out = tri.map((v) => {
    if (!used.has(v)) {
      used.set(v, pos.length / 3);
      pos.push(mesh.pos[v * 3], mesh.pos[v * 3 + 1], mesh.pos[v * 3 + 2]);
    }
    return used.get(v);
  });
  return { pos, tri: out };
}

// Keeps the triangles whose centre lies within `within` mm of any vertex of the named parts (a hashed grid).
function nearTo(mesh, finds, within) {
  const cell = within;
  const ref = { pos: [], tri: [] };
  for (const f of [finds].flat()) {
    const files = names.get(f);
    if (!files) throw new Error(`near: no part "${f}" in BodyParts3D`);
    for (const file of files) readObj(objPath(file), ref);
  }
  const refPos = ref.pos;
  // A coarse test by cells, then an exact distance check against the reference vertices in the 27 cells around.
  const buckets = new Map();
  for (let i = 0; i < refPos.length; i += 3) {
    const k = `${Math.floor(refPos[i] / cell)},${Math.floor(refPos[i + 1] / cell)},${Math.floor(refPos[i + 2] / cell)}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(refPos[i], refPos[i + 1], refPos[i + 2]);
  }
  const close = (x, y, z) => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const list = buckets.get(`${cx + a},${cy + b},${cz + c}`);
      if (!list) continue;
      for (let i = 0; i < list.length; i += 3) if ((list[i] - x) ** 2 + (list[i + 1] - y) ** 2 + (list[i + 2] - z) ** 2 < within * within) return true;
    }
    return false;
  };
  const keep = [];
  for (let i = 0; i < mesh.tri.length; i += 3) {
    const c = [0, 1, 2].map((k) => (mesh.pos[mesh.tri[i] * 3 + k] + mesh.pos[mesh.tri[i + 1] * 3 + k] + mesh.pos[mesh.tri[i + 2] * 3 + k]) / 3);
    if (close(...c)) keep.push(mesh.tri[i], mesh.tri[i + 1], mesh.tri[i + 2]);
  }
  return crop({ pos: mesh.pos, tri: keep }, {});
}

function neighbours(mesh) {
  const n = mesh.pos.length / 3;
  const sets = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < mesh.tri.length; i += 3) {
    const [a, b, c] = [mesh.tri[i], mesh.tri[i + 1], mesh.tri[i + 2]];
    sets[a].add(b).add(c);
    sets[b].add(a).add(c);
    sets[c].add(a).add(b);
  }
  return sets.map((s) => [...s]);
}

// Taubin smoothing: a relax step and an inflate step, so the shape loses its facets without shrinking. Open edges
// (a cropped skin's rim) stay where they are.
function relax(mesh, rounds = 4, lambda = 0.5, mu = -0.53) {
  const nb = neighbours(mesh);
  const edge = boundary(mesh);
  const p = Float64Array.from(mesh.pos);
  const next = new Float64Array(p.length);
  for (let r = 0; r < rounds * 2; r++) {
    const f = r % 2 ? mu : lambda;
    for (let i = 0; i < nb.length; i++) {
      const list = nb[i];
      if (!list.length || edge.has(i)) {
        next.set(p.subarray(i * 3, i * 3 + 3), i * 3);
        continue;
      }
      for (let k = 0; k < 3; k++) {
        let s = 0;
        for (const j of list) s += p[j * 3 + k];
        next[i * 3 + k] = p[i * 3 + k] + f * (s / list.length - p[i * 3 + k]);
      }
    }
    p.set(next);
  }
  return { pos: [...p], tri: mesh.tri };
}

function boundary(mesh) {
  const count = new Map();
  for (let i = 0; i < mesh.tri.length; i += 3) {
    for (const [a, b] of [[mesh.tri[i], mesh.tri[i + 1]], [mesh.tri[i + 1], mesh.tri[i + 2]], [mesh.tri[i + 2], mesh.tri[i]]]) {
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  const edge = new Set();
  for (const [k, c] of count) if (c === 1) for (const v of k.split(",")) edge.add(+v);
  return edge;
}

// One triangle into four (a new vertex on each edge), then relaxed: close to Loop subdivision, and enough to take
// the facets off a 2000-triangle muscle.
function subdivide(mesh) {
  const pos = [...mesh.pos];
  const mid = new Map();
  const at = (a, b) => {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    let m = mid.get(k);
    if (m === undefined) {
      m = pos.length / 3;
      pos.push((pos[a * 3] + pos[b * 3]) / 2, (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2, (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2);
      mid.set(k, m);
    }
    return m;
  };
  const tri = [];
  for (let i = 0; i < mesh.tri.length; i += 3) {
    const [a, b, c] = [mesh.tri[i], mesh.tri[i + 1], mesh.tri[i + 2]];
    const ab = at(a, b), bc = at(b, c), ca = at(c, a);
    tri.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  return { pos, tri };
}

function normals(mesh) {
  const n = new Float64Array(mesh.pos.length);
  const p = mesh.pos;
  for (let i = 0; i < mesh.tri.length; i += 3) {
    const [a, b, c] = [mesh.tri[i] * 3, mesh.tri[i + 1] * 3, mesh.tri[i + 2] * 3];
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; // area-weighted
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

// Where a muscle thins into a cord, it is tendon: white and glossy. Measured from the shape itself: along the
// muscle's long axis, the slices much thinner than its belly are tendon. Returned per vertex, 0 (belly) to 1.
function tendonWeight(mesh) {
  const n = mesh.pos.length / 3;
  const c = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] += mesh.pos[i * 3 + k] / n;
  // The long axis: power iteration on the covariance.
  const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const d = [0, 1, 2].map((k) => mesh.pos[i * 3 + k] - c[k]);
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) cov[a * 3 + b] += d[a] * d[b];
  }
  let ax = [1, 1, 1];
  for (let it = 0; it < 30; it++) {
    const v = [0, 1, 2].map((a) => cov[a * 3] * ax[0] + cov[a * 3 + 1] * ax[1] + cov[a * 3 + 2] * ax[2]);
    const l = Math.hypot(...v);
    ax = v.map((x) => x / l);
  }
  const s = new Float64Array(n), r = new Float64Array(n);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const d = [0, 1, 2].map((k) => mesh.pos[i * 3 + k] - c[k]);
    s[i] = d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2];
    r[i] = Math.hypot(d[0] - s[i] * ax[0], d[1] - s[i] * ax[1], d[2] - s[i] * ax[2]);
    lo = Math.min(lo, s[i]);
    hi = Math.max(hi, s[i]);
  }
  const bins = 40;
  const width = new Float64Array(bins);
  const bin = (x) => Math.min(bins - 1, Math.floor(((x - lo) / (hi - lo + 1e-9)) * bins));
  for (let i = 0; i < n; i++) width[bin(s[i])] = Math.max(width[bin(s[i])], r[i]);
  const belly = Math.max(...width);
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const f = width[bin(s[i])] / belly; // under about a third of the belly's width reads as tendon
    w[i] = Math.min(1, Math.max(0, (0.42 - f) / 0.17));
  }
  return w;
}

function bounds(pos) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], pos[i + k]);
      hi[k] = Math.max(hi[k], pos[i + k]);
    }
  }
  return { lo, hi };
}

// ── The command ──────────────────────────────────────────────────────────────────────────────────────────────
const arg = process.argv[2];
if (!arg || arg === "--help") {
  console.log("node kit/tools/anatomy.mjs RECIPE.json   |   node kit/tools/anatomy.mjs --find WORD");
  process.exit(arg ? 0 : 1);
}
const names = catalogue();
if (arg === "--find") {
  const word = (process.argv[3] ?? "").toLowerCase();
  for (const name of [...names.keys()].filter((n) => n.toLowerCase().includes(word)).sort()) console.log(`${name}  (${names.get(name).size} mesh${names.get(name).size > 1 ? "es" : ""})`);
  process.exit(0);
}

const recipePath = resolve(arg);
const recipe = JSON.parse(readFileSync(recipePath, "utf8"));
const units = recipe.units ?? 0.1;
const built = [];
for (const part of recipe.parts) {
  const finds = [part.find].flat();
  const files = new Set();
  for (const f of finds) {
    const hit = names.get(f);
    if (!hit) {
      const near = [...names.keys()].filter((n) => n.includes(f.split(" ").at(-1))).slice(0, 8);
      throw new Error(`no part "${f}" in BodyParts3D${near.length ? `; near: ${near.join(" | ")}` : ""}`);
    }
    for (const file of hit) files.add(file);
  }
  let mesh = { pos: [], tri: [] };
  for (const file of files) readObj(objPath(file), mesh);
  mesh = weld(mesh);
  if (part.crop) mesh = crop(mesh, part.crop);
  if (part.near) mesh = nearTo(mesh, part.near, part.within ?? 60);
  if (!mesh.tri.length) throw new Error(`${part.name}: nothing left after the crop`);
  mesh = relax(mesh, 2);
  for (let i = 0; i < (part.smooth ?? recipe.smooth ?? 1); i++) mesh = relax(subdivide(mesh), 3);
  built.push({ part, mesh, tendon: part.tendons ? tendonWeight(mesh) : null });
  console.log(`${part.name.padEnd(14)} ${files.size} source mesh${files.size > 1 ? "es" : ""}, ${mesh.tri.length / 3} triangles`);
}

// The origin: a named part's centre, top or bottom end, in source millimetres.
let origin = [0, 0, 0];
if (recipe.origin) {
  const [name, where = "centre"] = recipe.origin.split(":");
  const hit = built.find((b) => b.part.name === name || [b.part.find].flat().includes(name));
  if (!hit) throw new Error(`origin: no part "${name}" in the recipe`);
  const { lo, hi } = bounds(hit.mesh.pos);
  origin = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, where === "top" ? hi[2] : where === "bottom" ? lo[2] : (lo[2] + hi[2]) / 2];
}

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene("anatomy");
const mats = new Map();
for (const { part, mesh, tendon } of built) {
  const n = mesh.pos.length / 3;
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    // Source: x right-negative, y front-negative, z up (mm). Out: x left, y up, z front.
    P[i * 3] = (mesh.pos[i * 3] - origin[0]) * units;
    P[i * 3 + 1] = (mesh.pos[i * 3 + 2] - origin[2]) * units;
    P[i * 3 + 2] = -(mesh.pos[i * 3 + 1] - origin[1]) * units;
  }
  const nm = normals(mesh);
  const N = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    N[i * 3] = nm[i * 3];
    N[i * 3 + 1] = nm[i * 3 + 2];
    N[i * 3 + 2] = -nm[i * 3 + 1];
  }
  const index = n > 65535 ? new Uint32Array(mesh.tri) : new Uint16Array(mesh.tri);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(P).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(N).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(index).setBuffer(buffer));
  if (tendon) {
    // COLOR_0: red is belly (1,1,1 = the material's own colour), the tendon fraction goes to the green channel's
    // complement so a film can read it back: the kit's muscle material tints by it.
    const C = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) C.set([1, 1 - tendon[i], 1], i * 3);
    prim.setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(C).setBuffer(buffer));
  }
  const matName = part.material ?? "bone";
  if (!mats.has(matName)) mats.set(matName, doc.createMaterial(matName));
  prim.setMaterial(mats.get(matName));
  const meshNode = doc.createNode(part.name).setMesh(doc.createMesh(part.name).addPrimitive(prim)).setExtras({ material: matName, tendons: Boolean(tendon), source: [part.find].flat() });
  scene.addChild(meshNode);
}
doc.getRoot().getAsset().copyright = CREDIT;

const out = resolve(dirname(recipePath), recipe.out ?? "anatomy.glb");
mkdirSync(dirname(out), { recursive: true });
await new NodeIO().setVertexLayout(VertexLayout.SEPARATE).write(out, doc); // separate arrays: body3d poses them in place
writeFileSync(out.replace(/\.glb$/, ".credit.txt"), `${CREDIT}\nParts: ${recipe.parts.map((p) => [p.find].flat().join(" + ")).join("; ")}\nSmoothed and cropped for this film.\n`);
const all = bounds(built.flatMap((b) => b.mesh.pos));
const size = [0, 2, 1].map((k) => ((all.hi[k] - all.lo[k]) * units).toFixed(1));
console.log(`-> ${out} (${size.join(" x ")} units, x by y by z)\n   credit: ${CREDIT}`);

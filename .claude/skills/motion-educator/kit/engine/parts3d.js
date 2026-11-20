// Parts for detailed 3D models: materials with real surface (grain, brushing, weave, foam), shapes beyond boxes
// (lathed, extruded, rounded, tubes) and ready-made pieces of the things explainers open up most (circuit
// boards, chips, passives, connectors, speaker drivers, microphones, screws, cables).
//
//   import { createParts } from "../../kit/engine/parts3d.js";
//   const P = createParts(space);                      // space from createStage3D
//   const board = P.pcb({ w: 26, d: 18 });              // world units; build at a real object's proportions
//   board.add(P.at(P.ic({ w: 7, d: 7, pins: "qfn", count: 48, text: "MCU" }), 2, board.top, -1));
//
// Every piece is a THREE.Group named for what it is, with its parts as named children, so a film can pin a label
// on any of them, fly them apart (set `userData.out`, then space.explode) or look inside (space.ghost / cutaway).
// Sizes are world units: pick a scale (1 unit = 1 mm suits a board, 1 unit = 1 cm suits headphones) and keep it.
// Everything is deterministic: textures are drawn from a seed, never from Math.random.
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createParts(space) {
  const { THREE, renderer } = space;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // ---- textures ------------------------------------------------------------------------------------------
  const canvasOf = (w, h = w) => Object.assign(document.createElement("canvas"), { width: w, height: h });
  function texture(canvas, { repeat = 1, color = false } = {}) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = maxAniso;
    t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  }
  // A height field (white = high) turned into a tangent-space normal map.
  function normalFrom(height, strength = 2) {
    const w = height.width;
    const h = height.height;
    const src = height.getContext("2d").getImageData(0, 0, w, h).data;
    const out = canvasOf(w, h);
    const ctx = out.getContext("2d");
    const img = ctx.createImageData(w, h);
    const at = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
        const len = Math.hypot(dx, dy, 1);
        const i = (y * w + x) * 4;
        img.data[i] = (-dx / len) * 127.5 + 127.5;
        img.data[i + 1] = (dy / len) * 127.5 + 127.5;
        img.data[i + 2] = (1 / len) * 127.5 + 127.5;
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    return out;
  }
  // Smooth value noise, tileable, drawn into a canvas (white = high).
  function noise(size, cells, seed, octaves = 3) {
    const c = canvasOf(size);
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(size, size);
    const layers = [];
    for (let o = 0; o < octaves; o++) {
      const n = cells * 2 ** o;
      const r = rng(seed + o * 101);
      layers.push({ n, g: Array.from({ length: n * n }, r) });
    }
    const smooth = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        let v = 0;
        let amp = 1;
        let sum = 0;
        for (const { n, g } of layers) {
          const fx = (x / size) * n;
          const fy = (y / size) * n;
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          const tx = smooth(fx - x0);
          const ty = smooth(fy - y0);
          const q = (a, b) => g[((b % n) * n + (a % n)) % (n * n)];
          const top = q(x0, y0) * (1 - tx) + q(x0 + 1, y0) * tx;
          const bot = q(x0, y0 + 1) * (1 - tx) + q(x0 + 1, y0 + 1) * tx;
          v += (top * (1 - ty) + bot * ty) * amp;
          sum += amp;
          amp *= 0.5;
        }
        const i = (y * size + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = (v / sum) * 255;
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  const cache = new Map();
  const once = (key, make) => (cache.has(key) ? cache.get(key) : cache.set(key, make()).get(key));

  // ---- materials -----------------------------------------------------------------------------------------
  // Each takes a colour and returns a new material; `cut` is the colour its section shows in a cutaway.
  const M = {};
  M.plastic = (color = 0x2a2b30, { rough = 0.48, gloss = 0, cut } = {}) => {
    const n = once("plastic", () => texture(normalFrom(noise(256, 32, 7, 2), 0.6), { repeat: 3 }));
    return tag(new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, normalMap: n, normalScale: new THREE.Vector2(0.25, 0.25), clearcoat: gloss, clearcoatRoughness: 0.18 }), cut ?? shade(color, 0.7));
  };
  M.metal = (color = 0xb8bcc4, { rough = 0.3, brushed = true, cut } = {}) => {
    const map = brushed
      ? once("brushed", () => {
          const c = canvasOf(512);
          const ctx = c.getContext("2d");
          const r = rng(11);
          ctx.fillStyle = "#808080";
          ctx.fillRect(0, 0, 512, 512);
          for (let i = 0; i < 2600; i++) {
            const y = r() * 512;
            ctx.strokeStyle = `rgba(${r() < 0.5 ? 255 : 0},${r() < 0.5 ? 255 : 0},${r() < 0.5 ? 255 : 0},${0.04 + r() * 0.08})`;
            ctx.lineWidth = 0.5 + r();
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(512, y + (r() - 0.5) * 2);
            ctx.stroke();
          }
          return texture(c, { repeat: 2 });
        })
      : null;
    return tag(new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: rough, roughnessMap: map, anisotropy: brushed ? 0.6 : 0, clearcoat: 0.2, clearcoatRoughness: 0.3 }), cut ?? shade(color, 0.85));
  };
  M.rubber = (color = 0x17171a, { cut } = {}) => tag(new THREE.MeshPhysicalMaterial({ color, roughness: 0.82, metalness: 0, sheen: 0.4, sheenRoughness: 0.8, sheenColor: 0x444448 }), cut ?? shade(color, 1.4));
  M.foam = (color = 0x2b2c31, { cut } = {}) => {
    const n = once("foam", () => {
      const c = canvasOf(512);
      const ctx = c.getContext("2d");
      const r = rng(23);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 1800; i++) {
        const x = r() * 512;
        const y = r() * 512;
        const s = 2 + r() * 6;
        const g = ctx.createRadialGradient(x, y, 0, x, y, s);
        g.addColorStop(0, "rgba(0,0,0,0.9)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - s, y - s, s * 2, s * 2);
      }
      return texture(normalFrom(c, 3), { repeat: 4 });
    });
    return tag(new THREE.MeshPhysicalMaterial({ color, roughness: 0.95, normalMap: n, normalScale: new THREE.Vector2(1, 1), sheen: 0.6, sheenColor: 0x55565c, sheenRoughness: 0.9 }), cut ?? shade(color, 1.5));
  };
  M.leather = (color = 0x1d1d21, { cut } = {}) => {
    const n = once("leather", () => texture(normalFrom(noise(512, 48, 31, 3), 3.2), { repeat: 5 }));
    return tag(new THREE.MeshPhysicalMaterial({ color, roughness: 0.62, normalMap: n, normalScale: new THREE.Vector2(0.55, 0.55), clearcoat: 0.25, clearcoatRoughness: 0.5, sheen: 0.3, sheenColor: 0x6a6a72 }), cut ?? shade(color, 1.3));
  };
  M.fabric = (color = 0x3a3b42, { cut } = {}) => {
    const n = once("fabric", () => {
      const c = canvasOf(256);
      const ctx = c.getContext("2d");
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 256; x++) {
          const v = 0.5 + 0.5 * Math.sin((x / 256) * Math.PI * 64) * Math.sin((y / 256) * Math.PI * 64);
          ctx.fillStyle = `rgb(${v * 255},${v * 255},${v * 255})`;
          ctx.fillRect(x, y, 1, 1);
        }
      return texture(normalFrom(c, 1.4), { repeat: 6 });
    });
    return tag(new THREE.MeshPhysicalMaterial({ color, roughness: 0.9, normalMap: n, sheen: 1, sheenColor: shade(color, 1.8), sheenRoughness: 0.6 }), cut ?? shade(color, 1.2));
  };
  M.copper = (color = 0xc77a45) => tag(new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: 0.32, clearcoat: 0.3 }), shade(color, 0.9));
  M.solder = (color = 0xc9ccd2) => tag(new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: 0.18 }), color);
  M.goldPlate = (color = 0xe0b34a) => tag(new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: 0.22 }), color);
  M.silicon = (color = 0x4a4f63) => tag(new THREE.MeshPhysicalMaterial({ color, metalness: 0.6, roughness: 0.18, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 900] }), color);
  M.ferrite = (color = 0x3b3c40) => {
    const n = once("ferrite", () => texture(normalFrom(noise(256, 64, 41, 2), 1.5), { repeat: 2 }));
    return tag(new THREE.MeshPhysicalMaterial({ color, roughness: 0.75, metalness: 0.2, normalMap: n }), shade(color, 1.2));
  };
  M.paper = (color = 0xd8d2c4) => tag(new THREE.MeshPhysicalMaterial({ color, roughness: 0.92, sheen: 0.3, side: THREE.DoubleSide }), shade(color, 0.9));
  M.skin = (color = 0xc98d6e) => tag(new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, sheen: 0.5, sheenColor: 0xffc4a8, sheenRoughness: 0.5, clearcoat: 0.08, transmission: 0.06, thickness: 3 }), 0xb0543f);
  M.glass = (color = 0xffffff) => tag(new THREE.MeshPhysicalMaterial({ color, roughness: 0.04, transmission: 0.95, thickness: 1, ior: 1.5 }), color);
  M.glow = (color = 0xffb21a, power = 1.5) => tag(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: power }), color);

  // Wood: long grain with growth rings and fine pores, for desks, floors and shelves (grain runs along x).
  M.wood = (color = 0x5a3220, { rough = 0.5, gloss = 0.35, seed = 17, cut } = {}) => {
    const maps = once(`wood-${seed}`, () => {
      const w = 1024;
      const h = 256;
      const c = canvasOf(w, h);
      const ctx = c.getContext("2d");
      const n = noise(256, 8, seed, 3).getContext("2d").getImageData(0, 0, 256, 256).data;
      const img = ctx.createImageData(w, h);
      const r = rng(seed);
      const pores = Array.from({ length: 900 }, () => [r() * w, r() * h, 20 + r() * 80]);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const nv = n[((y % 256) * 256 + ((x >> 2) % 256)) * 4] / 255;
          const ring = 0.5 + 0.5 * Math.sin((y / h) * Math.PI * 2 * 9 + nv * 7 + Math.sin(x / 260) * 1.4);
          const v = 0.55 + 0.3 * Math.pow(ring, 3) + 0.15 * nv;
          const i = (y * w + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255;
          img.data[i + 3] = 255;
        }
      ctx.putImageData(img, 0, 0);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      for (const [x, y, l] of pores) {
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + l, y + (r() - 0.5));
        ctx.stroke();
      }
      const tint = canvasOf(w, h);
      const tc = tint.getContext("2d");
      tc.drawImage(c, 0, 0);
      return { tone: texture(tint, { color: true }), bump: texture(normalFrom(c, 1.2)) };
    });
    const m = new THREE.MeshPhysicalMaterial({ color, map: maps.tone, normalMap: maps.bump, normalScale: new THREE.Vector2(0.35, 0.35), roughness: rough, clearcoat: gloss, clearcoatRoughness: 0.22 });
    return tag(m, cut ?? shade(color, 1.2));
  };

  function shade(color, k) {
    const c = new THREE.Color(color);
    return c.multiplyScalar(k).getHex();
  }
  function tag(material, cut) {
    material.userData.cut = cut;
    return material;
  }

  // ---- shapes --------------------------------------------------------------------------------------------
  const mesh = (geometry, material, name) => {
    const m = new THREE.Mesh(geometry, material);
    if (name) m.name = name;
    return m;
  };
  const group = (name, ...children) => {
    const g = new THREE.Group();
    g.name = name;
    if (children.length) g.add(...children);
    return g;
  };
  const roundedBox = (w, h, d, r = Math.min(w, h, d) * 0.12, seg = 4) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2 - 1e-4));
  // A body of revolution from a profile of [radius, height] points, bottom to top (a cone, a cup, a knob).
  const lathe = (profile, segments = 96) => {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), segments);
    g.computeVertexNormals();
    return g;
  };
  // A profile with rounded joins: `round` smooths each corner by that distance, so a lathed part has no hard creases.
  const smoothProfile = (pts, round = 0.3, steps = 5) => {
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
      const la = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const k1 = Math.min(round, la / 2) / la;
      const k2 = Math.min(round, lc / 2) / lc;
      const p1 = [b[0] + (a[0] - b[0]) * k1, b[1] + (a[1] - b[1]) * k1];
      const p2 = [b[0] + (c[0] - b[0]) * k2, b[1] + (c[1] - b[1]) * k2];
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = (1 - t) ** 2 * p1[0] + 2 * (1 - t) * t * b[0] + t * t * p2[0];
        const y = (1 - t) ** 2 * p1[1] + 2 * (1 - t) * t * b[1] + t * t * p2[1];
        out.push([x, y]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  };
  // An SVG path (in its own units) extruded to a depth, with a rounded bevel. y is flipped to point up.
  const extrude = (d, depth = 1, { bevel = 0.15, scale = 1, curveSegments = 24 } = {}) => {
    const shapes = new SVGLoader().parse(`<svg><path d="${d}"/></svg>`).paths.flatMap((p) => SVGLoader.createShapes(p));
    const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments });
    g.scale(scale, -scale, 1);
    g.computeVertexNormals();
    return g;
  };
  // A tube through points (a cable, a wire, a pipe).
  const tube = (points, radius = 0.3, { closed = false, segments = 128 } = {}) =>
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), closed), segments, radius, 16, closed);
  // Put an object at x, y, z (and optionally turn it), returning it.
  const at = (o, x = 0, y = 0, z = 0, ry = 0) => {
    o.position.set(x, y, z);
    o.rotation.y = ry;
    return o;
  };
  // Give each child a direction to fly when the group explodes (space.explode reads userData.out).
  const explodable = (g, outs) => {
    for (const [name, v] of Object.entries(outs)) {
      const o = g.getObjectByName(name);
      if (o) o.userData.out = new THREE.Vector3(...v);
    }
    return g;
  };

  // ---- electronics ---------------------------------------------------------------------------------------
  // A circuit board with solder mask, copper traces, gold pads, vias and silkscreen. Its top face is at
  // `board.userData.top`; place parts on it at that height. 1 unit = 1 mm reads right.
  function pcb({ w = 50, d = 26, t = 1.6, color = "#0d4a2c", seed = 3, traces = 60, holes = true, name = "board" } = {}) {
    const px = 24;
    const cw = Math.round(w * px);
    const ch = Math.round(d * px);
    const c = canvasOf(cw, ch);
    const ctx = c.getContext("2d");
    const r = rng(seed);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, cw, ch);
    // Copper under the mask reads a little lighter; a ground pour fills the rest with a faint hatch.
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#1f7a49";
    for (let i = 0; i < 9; i++) ctx.fillRect(r() * cw, r() * ch, r() * cw * 0.4, r() * ch * 0.4);
    ctx.globalAlpha = 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Traces run in bundles, horizontal, vertical or at 45 degrees, the way a router lays them; each ends in a via.
    const dirs = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    for (let b = 0; b < traces / 4; b++) {
      const n = 2 + Math.floor(r() * 5);
      const gap = px * 0.6;
      let x = r() * cw;
      let y = r() * ch;
      let dir = dirs[Math.floor(r() * 4)];
      const path = [[x, y]];
      for (let s = 0; s < 2 + r() * 3; s++) {
        const len = px * (3 + r() * 12);
        x += Math.cos(dir) * len;
        y += Math.sin(dir) * len;
        path.push([x, y]);
        dir += (r() < 0.5 ? -1 : 1) * (Math.PI / 4) * (r() < 0.5 ? 1 : 2);
        dir = Math.round(dir / (Math.PI / 4)) * (Math.PI / 4);
      }
      const width = px * (0.14 + r() * 0.16);
      for (let k = 0; k < n; k++) {
        ctx.strokeStyle = "rgba(78,168,108,0.75)";
        ctx.lineWidth = width;
        ctx.beginPath();
        path.forEach(([px0, py0], i) => {
          const a = i < path.length - 1 ? Math.atan2(path[i + 1][1] - py0, path[i + 1][0] - px0) : Math.atan2(py0 - path[i - 1][1], px0 - path[i - 1][0]);
          const ox = -Math.sin(a) * gap * k;
          const oy = Math.cos(a) * gap * k;
          i ? ctx.lineTo(px0 + ox, py0 + oy) : ctx.moveTo(px0 + ox, py0 + oy);
        });
        ctx.stroke();
        const [ex, ey] = path[path.length - 1];
        const a = Math.atan2(ey - path[path.length - 2][1], ex - path[path.length - 2][0]);
        const vx = ex - Math.sin(a) * gap * k;
        const vy = ey + Math.cos(a) * gap * k;
        ctx.fillStyle = "#c9a24e";
        ctx.beginPath();
        ctx.arc(vx, vy, px * 0.26, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#101010";
        ctx.beginPath();
        ctx.arc(vx, vy, px * 0.11, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Silkscreen: part outlines and reference marks.
    ctx.strokeStyle = "rgba(240,240,236,0.85)";
    ctx.fillStyle = "rgba(240,240,236,0.85)";
    ctx.lineWidth = px * 0.12;
    ctx.font = `${px * 0.9}px "JetBrains Mono Variable", monospace`;
    for (let i = 0; i < 14; i++) {
      const x = r() * cw * 0.9;
      const y = r() * ch * 0.9;
      ctx.strokeRect(x, y, px * (1.5 + r() * 3), px * (1 + r() * 2));
      ctx.fillText(`${"RCUJLD"[Math.floor(r() * 6)]}${1 + Math.floor(r() * 40)}`, x, y - px * 0.3);
    }
    const map = texture(c, { color: true });
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    map.repeat.set(1, 1);
    const top = new THREE.MeshPhysicalMaterial({ map, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.25 });
    top.userData.cut = 0xc9b98a;
    const edge = tag(new THREE.MeshPhysicalMaterial({ color: 0x7d7650, roughness: 0.75 }), 0x9c9466);
    const geo = new THREE.BoxGeometry(w, t, d);
    const board = mesh(geo, [edge, edge, top, edge, edge, edge], "pcb");
    const g = group(name, board);
    g.userData.top = t / 2;
    if (holes)
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const ring = mesh(new THREE.TorusGeometry(1.1, 0.35, 12, 32), M.goldPlate(), "mount");
        ring.rotation.x = Math.PI / 2;
        ring.position.set(sx * (w / 2 - 2.4), t / 2 + 0.01, sz * (d / 2 - 2.4));
        g.add(ring);
      }
    return g;
  }

  // A chip: a moulded body with a laser-etched marking and its leads. pins: "qfn" (pads under the edge),
  // "qfp" (gull-wing legs on four sides), "soic" (legs on two sides).
  function ic({ w = 7, d = 7, h = 0.9, pins = "qfn", count = 48, text = "", sub = "", name = "chip", body = 0x111114 } = {}) {
    const g = group(name);
    const top = canvasOf(512, Math.round((512 * d) / w));
    const ctx = top.getContext("2d");
    ctx.fillStyle = "#151518";
    ctx.fillRect(0, 0, top.width, top.height);
    ctx.fillStyle = "rgba(215,215,222,0.78)";
    ctx.textAlign = "center";
    ctx.font = `600 ${top.width * 0.13}px "Inter Variable", sans-serif`;
    ctx.fillText(text, top.width / 2, top.height * 0.48);
    ctx.font = `${top.width * 0.075}px "JetBrains Mono Variable", monospace`;
    ctx.fillText(sub, top.width / 2, top.height * 0.66);
    ctx.beginPath();
    ctx.arc(top.width * 0.12, top.height * 0.14, top.width * 0.035, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.9)";
    ctx.fill();
    const topMat = new THREE.MeshPhysicalMaterial({ map: texture(top, { color: true }), roughness: 0.55, clearcoat: 0.15 });
    topMat.map.wrapS = topMat.map.wrapT = THREE.ClampToEdgeWrapping;
    const side = M.plastic(body, { rough: 0.6 });
    topMat.userData.cut = side.userData.cut = 0x3a3a40;
    const bodyGeo = roundedBox(w, h, d, 0.12, 2);
    // Map only the top face's UVs to the marking: give the body six groups like a box by using a box for the top cap.
    g.add(mesh(bodyGeo, side, "package"));
    const cap = mesh(new THREE.PlaneGeometry(w - 0.24, d - 0.24), topMat, "marking");
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = h / 2 + 0.002;
    g.add(cap);
    const per = Math.max(1, Math.round(count / (pins === "soic" ? 2 : 4)));
    const leadMat = pins === "qfn" ? M.solder() : M.solder(0xd7d9de);
    const sides = pins === "soic" ? [0, 2] : [0, 1, 2, 3];
    for (const s of sides) {
      const along = s % 2 === 0 ? w : d;
      const across = s % 2 === 0 ? d : w;
      const pitch = (along * 0.82) / per;
      for (let i = 0; i < per; i++) {
        const u = -along * 0.41 + pitch * (i + 0.5);
        let lead;
        if (pins === "qfn") {
          lead = mesh(new THREE.BoxGeometry(pitch * 0.55, 0.2, 0.6), leadMat);
          lead.position.set(0, -h / 2 + 0.1, across / 2 - 0.25);
        } else {
          // A gull wing: out, down, out again.
          const shape = new THREE.Shape();
          shape.moveTo(0, 0);
          shape.lineTo(0.5, 0);
          shape.lineTo(0.85, -h * 0.55);
          shape.lineTo(1.35, -h * 0.55);
          shape.lineTo(1.35, -h * 0.55 - 0.15);
          shape.lineTo(0.75, -h * 0.55 - 0.15);
          shape.lineTo(0.4, -0.15);
          shape.lineTo(0, -0.15);
          const leg = new THREE.ExtrudeGeometry(shape, { depth: pitch * 0.5, bevelEnabled: false });
          leg.translate(0, 0, -pitch * 0.25);
          lead = mesh(leg, leadMat);
          lead.rotation.y = -Math.PI / 2;
          lead.position.set(0, 0.05, across / 2);
        }
        const holder = new THREE.Group();
        holder.add(lead);
        holder.rotation.y = (-s * Math.PI) / 2;
        const off = new THREE.Vector3(u, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), (-s * Math.PI) / 2);
        holder.position.copy(off);
        g.add(holder);
      }
    }
    if (pins === "qfn") {
      const pad = mesh(new THREE.BoxGeometry(w * 0.55, 0.12, d * 0.55), M.solder(), "thermal pad");
      pad.position.y = -h / 2;
      g.add(pad);
    }
    g.userData.height = h;
    g.position.y = h / 2;
    return group(name + " (placed)", g);
  }

  // A surface-mount resistor or capacitor (0603 by default: 1.6 x 0.8 mm).
  function smd({ kind = "resistor", l = 1.6, w = 0.8, h = 0.45, name = kind } = {}) {
    const bodyMat = kind === "resistor" ? M.plastic(0x141416, { rough: 0.5 }) : M.plastic(0x9b7a52, { rough: 0.55 });
    const g = group(name, mesh(roundedBox(l * 0.62, h, w, 0.05, 2), bodyMat, "body"));
    for (const s of [-1, 1]) {
      const cap = mesh(roundedBox(l * 0.2, h * 1.02, w * 1.02, 0.06, 2), M.solder(), "terminal");
      cap.position.x = s * l * 0.4;
      g.add(cap);
    }
    g.children.forEach((c) => (c.position.y = h / 2));
    return g;
  }

  // A pressed-steel shield can (over a radio or a processor): flat top, folded edges, a few dimples.
  function shield({ w = 18, d = 14, h = 2.6, name = "shield" } = {}) {
    const mat = M.metal(0xc6c9cf, { rough: 0.24, brushed: true });
    const g = group(name, mesh(roundedBox(w, h, d, 0.5, 3), mat, "can"));
    g.children[0].position.y = h / 2;
    const r = rng(5);
    for (let i = 0; i < 6; i++) {
      const dim = mesh(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      dim.scale.y = 0.18;
      dim.position.set((r() - 0.5) * w * 0.8, h + 0.001, (r() - 0.5) * d * 0.8);
      g.add(dim);
    }
    return g;
  }

  // A USB-C receptacle: a stadium-shaped steel shell with the tongue inside.
  function usbC({ name = "usb-c" } = {}) {
    const w = 8.9;
    const h = 3.2;
    const shape = new THREE.Shape();
    const r = h / 2;
    shape.absarc(-w / 2 + r, 0, r, Math.PI / 2, (3 * Math.PI) / 2);
    shape.absarc(w / 2 - r, 0, r, (3 * Math.PI) / 2, Math.PI / 2);
    const hole = new THREE.Path();
    const ri = r - 0.25;
    hole.absarc(-w / 2 + r, 0, ri, Math.PI / 2, (3 * Math.PI) / 2);
    hole.absarc(w / 2 - r, 0, ri, (3 * Math.PI) / 2, Math.PI / 2);
    shape.holes.push(hole);
    const shell = mesh(new THREE.ExtrudeGeometry(shape, { depth: 7.4, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, curveSegments: 32 }), M.metal(0xd0d3d8, { rough: 0.2 }), "shell");
    const tongue = mesh(roundedBox(6.6, 0.7, 6.5, 0.1, 2), M.plastic(0x151517), "tongue");
    tongue.position.z = 3.6;
    const g = group(name, shell, tongue);
    g.rotation.y = Math.PI;
    return group(name + " (placed)", g);
  }

  // A row of header pins.
  function header({ count = 10, pitch = 2.54, name = "header" } = {}) {
    const g = group(name);
    const base = mesh(roundedBox(pitch * count, 2.5, pitch, 0.2, 2), M.plastic(0x101012), "base");
    base.position.y = 1.25;
    g.add(base);
    for (let i = 0; i < count; i++) {
      const p = mesh(new THREE.BoxGeometry(0.64, 8.5, 0.64), M.goldPlate(), "pin");
      p.position.set(-((count - 1) * pitch) / 2 + i * pitch, 3.2, 0);
      g.add(p);
    }
    return g;
  }

  // A screw: a pan head with a cross recess and a threaded shank.
  function screw({ r = 1, length = 5, name = "screw" } = {}) {
    const mat = M.metal(0x9da2aa, { rough: 0.28, brushed: false });
    const head = mesh(lathe(smoothProfile([[0, 0], [r * 1.9, 0], [r * 1.9, r * 0.5], [r * 1.4, r * 1.05], [0, r * 1.1]], r * 0.3)), mat, "head");
    const shank = mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, length, 24), mat, "shank");
    shank.position.y = -length / 2;
    const helix = new (class extends THREE.Curve {
      getPoint(t, target = new THREE.Vector3()) {
        const a = t * Math.PI * 2 * (length / (r * 0.6));
        return target.set(Math.cos(a) * r * 0.9, -t * length, Math.sin(a) * r * 0.9);
      }
    })();
    const thread = mesh(new THREE.TubeGeometry(helix, 200, r * 0.12, 6, false), mat, "thread");
    return group(name, head, shank, thread);
  }

  // ---- sound ---------------------------------------------------------------------------------------------
  // A dynamic speaker driver, with every part a named child you can fly apart: basket, magnet, top plate,
  // voice coil, spider, cone, surround, dust cap. Radius r is the cone's outer radius; it faces +y.
  function driver({ r = 2, name = "driver", coneColor = 0x2c2d33 } = {}) {
    const g = group(name);
    const coilR = r * 0.32;
    const magnet = mesh(lathe([[coilR * 1.15, 0], [r * 0.78, 0], [r * 0.78, r * 0.32], [coilR * 1.15, r * 0.32]], 96), M.ferrite(), "magnet");
    const plate = mesh(lathe([[coilR * 1.08, r * 0.32], [r * 0.8, r * 0.32], [r * 0.8, r * 0.4], [coilR * 1.08, r * 0.4]], 96), M.metal(0xa8acb4), "top plate");
    const pole = mesh(new THREE.CylinderGeometry(coilR * 0.92, coilR * 0.92, r * 0.5, 48), M.metal(0x9aa0a8), "pole piece");
    pole.position.y = r * 0.22;
    const coil = mesh(new THREE.CylinderGeometry(coilR, coilR, r * 0.3, 64, 1, true), M.copper(), "voice coil");
    coil.material.side = THREE.DoubleSide;
    coil.position.y = r * 0.48;
    // Copper winding: fine rings so the coil reads as wire.
    const windings = mesh(new THREE.CylinderGeometry(coilR * 1.015, coilR * 1.015, r * 0.26, 64, 1, true), windingMaterial(), "winding");
    windings.position.y = r * 0.48;
    const spider = mesh(lathe(Array.from({ length: 61 }, (_, i) => [coilR * 1.05 + (i / 60) * (r * 0.62 - coilR), r * 0.6 + Math.sin((i / 60) * Math.PI * 10) * r * 0.022]), 96), M.fabric(0xb59b6a), "spider");
    spider.material.side = THREE.DoubleSide;
    const coneProfile = Array.from({ length: 16 }, (_, i) => {
      const t = i / 15;
      return [coilR + t * (r * 0.9 - coilR), r * 0.62 + Math.pow(t, 0.8) * r * 0.42];
    });
    const cone = mesh(lathe(coneProfile, 128), M.paper(coneColor), "cone");
    cone.material.side = THREE.DoubleSide;
    cone.material.userData.cut = 0x55565c;
    const surround = mesh(new THREE.TorusGeometry(r * 0.95, r * 0.06, 16, 128, Math.PI * 2), M.rubber(0x1a1a1d), "surround");
    surround.rotation.x = Math.PI / 2;
    surround.position.y = r * 1.04;
    surround.scale.z = 0.7;
    const dust = mesh(new THREE.SphereGeometry(coilR * 1.2, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2.6), M.paper(shade(coneColor, 1.25)), "dust cap");
    dust.scale.y = 0.6;
    dust.position.y = r * 0.6;
    // The basket: a ring at the rim and four spokes down to the plate.
    const basket = group("basket");
    const rim = mesh(new THREE.TorusGeometry(r * 1.02, r * 0.035, 10, 128), M.metal(0x6f747d, { rough: 0.4 }), "rim");
    rim.rotation.x = Math.PI / 2;
    rim.position.y = r * 1.05;
    basket.add(rim);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const spoke = mesh(tube([[Math.cos(a) * r * 0.8, r * 0.4, Math.sin(a) * r * 0.8], [Math.cos(a) * r * 0.92, r * 0.75, Math.sin(a) * r * 0.92], [Math.cos(a) * r * 1.02, r * 1.05, Math.sin(a) * r * 1.02]], r * 0.05, { segments: 24 }), rim.material, "spoke");
      basket.add(spoke);
    }
    g.add(magnet, plate, pole, coil, windings, spider, cone, surround, dust, basket);
    return explodable(g, {
      magnet: [0, -r * 1.2, 0],
      "top plate": [0, -r * 0.7, 0],
      "pole piece": [0, -r * 1.6, 0],
      "voice coil": [0, r * 0.5, 0],
      winding: [0, r * 0.5, 0],
      spider: [0, r * 0.9, 0],
      cone: [0, r * 1.4, 0],
      surround: [0, r * 1.75, 0],
      "dust cap": [0, r * 2.2, 0],
      basket: [0, -r * 0.2, 0],
    });
  }
  function windingMaterial() {
    const map = once("winding", () => {
      const c = canvasOf(64, 512);
      const ctx = c.getContext("2d");
      for (let y = 0; y < 512; y++) {
        const v = 0.55 + 0.45 * Math.sin((y / 512) * Math.PI * 2 * 90);
        ctx.fillStyle = `rgb(${v * 255},${v * 255},${v * 255})`;
        ctx.fillRect(0, y, 64, 1);
      }
      return texture(normalFrom(c, 2.5));
    });
    return tag(new THREE.MeshPhysicalMaterial({ color: 0xd08048, metalness: 1, roughness: 0.3, normalMap: map, side: THREE.DoubleSide }), 0xb86a3a);
  }

  // A MEMS microphone: a small metal lid on a little board, with its sound port. It faces +y.
  function mic({ w = 3.5, d = 2.65, h = 1, name = "microphone" } = {}) {
    const base = mesh(roundedBox(w, 0.3, d, 0.05, 2), M.plastic(0x2a5a3a, { rough: 0.4 }), "substrate");
    base.position.y = 0.15;
    const lid = mesh(roundedBox(w * 0.94, h, d * 0.94, 0.25, 4), M.metal(0xc7cad0, { rough: 0.22, brushed: false }), "lid");
    lid.position.y = 0.3 + h / 2;
    const port = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 24), M.plastic(0x050505), "sound port");
    port.position.set(w * 0.22, 0.3 + h + 0.02, 0);
    return group(name, base, lid, port);
  }

  // A perforated grille (a speaker or microphone cover): a disc of metal with a hexagonal hole pattern.
  function grille({ r = 2, t = 0.15, hole = 0.12, name = "grille", color = 0x3a3c42 } = {}) {
    const alpha = once(`grille-${hole}`, () => {
      const c = canvasOf(512);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = "#000";
      const step = 512 / 24;
      for (let row = 0; row < 26; row++)
        for (let col = 0; col < 26; col++) {
          const x = col * step + (row % 2) * step * 0.5;
          const y = row * step * 0.866;
          ctx.beginPath();
          ctx.arc(x, y, step * hole * 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      return texture(c, { repeat: 1 });
    });
    const tex = alpha.clone();
    tex.repeat.set(r, r);
    tex.needsUpdate = true;
    const m = tag(new THREE.MeshPhysicalMaterial({ color, metalness: 0.8, roughness: 0.35, alphaMap: tex, alphaTest: 0.5, side: THREE.DoubleSide }), color);
    const disc = mesh(new THREE.CylinderGeometry(r, r, t, 96), m, name);
    return group(name + " (placed)", disc);
  }

  // A cable: a tube along points with a subtle twist texture.
  function cable(points, { r = 0.35, color = 0x1b1b1f, name = "cable" } = {}) {
    return group(name, mesh(tube(points, r), M.rubber(color), name));
  }

  // ---- the set: a place for the object to be ----------------------------------------------------------
  // A desk in a dark room: a wooden top, a wall far behind, and warm practical lights in the distance that the
  // depth of field turns into bokeh. Sizes in world units; `y` is the desk's top.
  function desk({ w = 600, d = 300, y = 0, color = 0x4a2a1a, wall = 0x16110e, lights = 14, seed = 4, warm = 0xffb066 } = {}) {
    const g = group("set");
    const top = mesh(new THREE.BoxGeometry(w, 4, d), M.wood(color, { seed }), "desk");
    top.position.y = y - 2;
    top.receiveShadow = true;
    top.material.map.repeat.set(w / 400, d / 200);
    top.material.normalMap.repeat.copy(top.material.map.repeat);
    const back = mesh(new THREE.PlaneGeometry(w * 6, w * 3), new THREE.MeshStandardMaterial({ color: wall, roughness: 0.95 }), "wall");
    back.position.set(0, y + w * 0.6, -d * 3);
    back.userData.shadow = false;
    g.add(top, back, bokeh({ count: lights, seed, color: warm, x: w * 1.4, y: [y + 25, y + w * 0.32], z: -d * 1.5, size: w * 0.008 }));
    return g;
  }
  // Points of light far behind the subject: with cam.blur they open into soft discs.
  function bokeh({ count = 12, seed = 2, color = 0xffb066, x = 800, y = [40, 400], z = -600, size = 6 } = {}) {
    const g = group("bokeh");
    const r = rng(seed);
    for (let i = 0; i < count; i++) {
      const c = new THREE.Color(color).offsetHSL((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.2);
      const m = mesh(new THREE.SphereGeometry(size * (0.6 + r() * 0.9), 16, 12), new THREE.MeshBasicMaterial({ color: c.multiplyScalar(1.5 + r() * 2.5), toneMapped: false }), "light");
      m.position.set((r() - 0.5) * x, y[0] + r() * (y[1] - y[0]), z + (r() - 0.5) * 200);
      m.userData.shadow = false;
      g.add(m);
    }
    return g;
  }
  // Dust or a particle stream: `count` soft points; `place(i, t, p)` sets point i's position p at time t (a pure
  // function of t, so it renders the same every time). Call `dust.update(t)` each frame.
  function dust({ count = 600, size = 1.2, color = 0xffc27a, opacity = 0.9, place, seed = 9, box = [200, 120, 120] } = {}) {
    const r = rng(seed);
    const seeds = Float32Array.from({ length: count * 4 }, r);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const sprite = once("dot", () => {
      const c = canvasOf(64);
      const ctx = c.getContext("2d");
      const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.35, "rgba(255,255,255,0.55)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 64, 64);
      return texture(c, { color: true });
    });
    const mat = new THREE.PointsMaterial({ size, map: sprite, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false });
    const points = new THREE.Points(geo, mat);
    points.name = "dust";
    points.userData.shadow = false;
    const p = new THREE.Vector3();
    const drift = (i, t, out) => {
      const s = (k) => seeds[i * 4 + k];
      out.set((s(0) - 0.5) * box[0] + Math.sin(t * 0.3 + s(3) * 9) * 4, (s(1) - 0.5) * box[1] + ((t * 2 + s(3) * 50) % 20) - 10, (s(2) - 0.5) * box[2]);
    };
    points.update = (t) => {
      for (let i = 0; i < count; i++) {
        (place ?? drift)(i, t, p, (k) => seeds[i * 4 + k]);
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
      }
      geo.attributes.position.needsUpdate = true;
    };
    points.update(0);
    return points;
  }

  return { desk, bokeh, dust, M, rng, noise, normalFrom, texture, canvasOf, mesh, group, roundedBox, lathe, smoothProfile, extrude, tube, at, explodable, pcb, ic, smd, shield, usbC, header, screw, driver, mic, grille, cable, mergeVertices, THREE };
}

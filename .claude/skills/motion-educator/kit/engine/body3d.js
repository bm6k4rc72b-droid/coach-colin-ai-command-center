// Bodies for a film: real human anatomy (from kit/tools/anatomy.mjs, which builds a .glb out of BodyParts3D's
// measured meshes), drawn with materials made for tissue, and posed by bending it at a joint.
//
//   import { createBody } from "../../kit/engine/body3d.js";
//   const B = createBody(space, P);                         // P from createParts(space)
//   const arm = await B.load("assets/arm.glb");             // await it before film.finish()
//   space.scene.add(arm);
//   const elbow = B.joint(arm, { pivot: [0, 1.4, 0.2], axis: [1, 0, 0], below: ["radius", "ulna", "hand"],
//                                above: ["humerus", "scapula", "clavicle", "deltoid"], blend: 3.5 });
//   tl.to(elbow, { angle: 95, duration: 1.2, ease: "power2.inOut" }, s.s03.start);   // a curl, in degrees
//   tl.to(B.flex(arm.userData.parts.biceps), { v: 1, duration: 1.2 }, s.s03.start); // the belly thickens
//   tl.to(B.xray(arm.userData.parts.skin), { v: 1, duration: 0.8 }, s.s04.start);  // skin to a glass shell
//
// Never build a body, a limb or an organ out of cylinders and boxes: the viewer knows what an arm looks like, and
// a stack of shapes reads as a toy. Load the real one. What the materials do:
// - muscle: deep red belly with fine fibres running along the muscle, and white glossy tendon where the muscle thins
//   (the tool measures that from the shape and stores it in the mesh), a wet sheen
// - bone: ivory, matt, with a faint porous grain
// - skin: warm, soft sheen; `xray` turns it into a clear shell with a bright rim so the anatomy inside shows
// - fat, fascia, cartilage, nerve, vessel (artery / vein): for the other parts a recipe asks for
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export function createBody(space, P) {
  const { THREE } = space;

  // Fine surface detail in object space (the meshes carry no texture coordinates): fibres along an axis for
  // muscle, a porous grain for bone. Added to the material's own shader; a later cutaway still chains onto it.
  function detail(material, { kind, axis = [0, 1, 0], scale = 1, strength = 0.35, tendon = false }) {
    const uni = { dAxis: { value: new THREE.Vector3(...axis).normalize() }, dScale: { value: scale }, dStrength: { value: strength } };
    material.userData.detail = uni;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uni);
      shader.vertexShader = shader.vertexShader
        .replace("void main() {", "varying vec3 vObj;\nvoid main() {\n  vObj = position;")
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "void main() {",
          `varying vec3 vObj;
uniform mat4 modelMatrix;
uniform vec3 dAxis; uniform float dScale; uniform float dStrength;
float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
void main() {`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
{
  vec3 p = vObj * dScale;
  ${
    kind === "fibre"
      ? `// fibres: ridges across the axis direction, with a little waviness, so the surface reads as bundled strands
  vec3 a = normalize(dAxis);
  vec3 u = normalize(cross(a, abs(a.y) < 0.9 ? vec3(0,1,0) : vec3(1,0,0)));
  vec3 w = cross(a, u);
  float along = dot(p, a);
  float wob = vnoise(p * 0.35) * 2.0;
  float ru = sin(dot(p, u) * 9.0 + wob + vnoise(vec3(along * 0.15, dot(p,u), 0.0)) * 3.0);
  float rw = sin(dot(p, w) * 9.0 + wob * 1.3);
  vec3 g = (u * ru + w * rw) * 0.5;`
      : `// grain: fine pits and pores
  float n1 = vnoise(p * 3.0), n2 = vnoise(p * 9.0 + 7.0);
  vec3 g = vec3(vnoise(p * 6.0 + 1.0) - 0.5, vnoise(p * 6.0 + 2.0) - 0.5, vnoise(p * 6.0 + 3.0) - 0.5) * (0.6 + n1) + vec3(n2 - 0.5) * 0.4;`
  }
  vec3 gv = (viewMatrix * modelMatrix * vec4(g, 0.0)).xyz;
  ${tendon ? "float tnd = 1.0 - vColor.g;" : "float tnd = 0.0;"}
  normal = normalize(normal + (gv - dot(gv, normal) * normal) * dStrength * (1.0 - 0.75 * tnd));
}`,
        );
      if (tendon) {
        // The tendon fraction rides in the mesh's colour (green channel, inverted): belly colour to tendon white,
        // and tendon is glossier.
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <color_fragment>", "#include <color_fragment>\n  float tendonMix = smoothstep(0.0, 1.0, 1.0 - vColor.g);\n  diffuseColor.rgb = mix(diffuseColor.rgb / max(vColor, vec3(0.001)), vec3(0.86, 0.84, 0.78), tendonMix);")
          .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.28, tendonMix);");
      }
    };
    material.customProgramCacheKey = () => `body-${kind}-${tendon}`;
    return material;
  }

  const M = {
    muscle: ({ color = 0x8e1f1d, axis, scale = 2.2, tendon = true } = {}) =>
      detail(new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.35, sheen: 0.4, sheenColor: 0xff8a7a, sheenRoughness: 0.4, vertexColors: tendon }), { kind: "fibre", axis, scale, strength: 0.28, tendon }),
    bone: ({ color = 0xe6dcc6 } = {}) => detail(new THREE.MeshPhysicalMaterial({ color, roughness: 0.62, sheen: 0.2, sheenColor: 0xfff4dc }), { kind: "grain", scale: 3, strength: 0.18 }),
    skin: ({ color = 0xc58c6c } = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, sheen: 0.55, sheenColor: 0xffc9b0, sheenRoughness: 0.45, clearcoat: 0.06, side: THREE.DoubleSide }),
    fat: ({ color = 0xf0c95a } = {}) => detail(new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.6, transmission: 0.08, thickness: 1 }), { kind: "grain", scale: 1.2, strength: 0.4 }),
    fascia: ({ color = 0xeee8e0 } = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
    cartilage: ({ color = 0xc9d6e0 } = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 0.8, transmission: 0.15, thickness: 1 }),
    nerve: ({ color = 0xf2d36b } = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, sheen: 0.4 }),
    artery: ({ color = 0xc0262b } = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.7 }),
    vein: ({ color = 0x2f4fa8 } = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.7 }),
  };

  // The long axis of a mesh (for the fibre direction), from its vertices.
  function longAxis(geometry) {
    const p = geometry.attributes.position;
    const c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) c.add(new THREE.Vector3().fromBufferAttribute(p, i));
    c.divideScalar(p.count);
    const m = new Array(9).fill(0);
    const d = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      d.fromBufferAttribute(p, i).sub(c);
      const v = [d.x, d.y, d.z];
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) m[a * 3 + b] += v[a] * v[b];
    }
    let ax = new THREE.Vector3(0.3, 1, 0.2);
    for (let k = 0; k < 24; k++) ax = new THREE.Vector3(m[0] * ax.x + m[1] * ax.y + m[2] * ax.z, m[3] * ax.x + m[4] * ax.y + m[5] * ax.z, m[6] * ax.x + m[7] * ax.y + m[8] * ax.z).normalize();
    return { axis: ax, centre: c };
  }

  // Loads a model made by anatomy.mjs, gives every part its tissue material, and lists the parts by name in
  // `group.userData.parts`. `materials` overrides a part's material: { biceps: B.M.muscle({ color: 0xa02a24 }) }.
  async function load(url, { materials = {}, shadows = true } = {}) {
    const gltf = await new GLTFLoader().loadAsync(url);
    const group = gltf.scene;
    group.userData.parts = {};
    group.userData.credit = gltf.asset?.copyright ?? "";
    group.traverse((o) => {
      if (!o.isMesh) return;
      const kind = o.userData.material ?? o.parent?.userData?.material ?? o.material?.name ?? "bone";
      const name = o.name || o.parent?.name;
      const { axis } = longAxis(o.geometry);
      o.material = materials[name] ?? (kind === "muscle" ? M.muscle({ axis: axis.toArray(), tendon: Boolean(o.geometry.attributes.color) }) : (M[kind] ?? M.bone)());
      if (o.material.userData.detail && kind === "muscle") o.material.userData.detail.dAxis.value.copy(axis);
      o.castShadow = o.receiveShadow = shadows;
      o.userData.kind = kind;
      group.userData.parts[name] = o;
    });
    return group;
  }

  // ── Posing ────────────────────────────────────────────────────────────────────────────────────────────────
  // A hinge joint (elbow, knee, finger): parts listed in `below` turn rigidly about the axis through `pivot`;
  // parts in `above` stay; everything else (muscles crossing the joint, skin) bends smoothly, each vertex turned
  // by a weight that goes from 0 to 1 across `blend` units around the pivot, measured along `along` (the limb's
  // direction from the pivot toward the moving end, default down). Tween the returned `angle` (degrees).
  function joint(group, { pivot, axis = [1, 0, 0], below = [], above = [], along = [0, -1, 0], blend = 3, sign = -1 }) {
    const piv = new THREE.Vector3(...pivot);
    const ax = new THREE.Vector3(...axis).normalize();
    const dir = new THREE.Vector3(...along).normalize();
    const parts = group.userData.parts;
    const items = [];
    for (const [name, mesh] of Object.entries(parts)) {
      const pos = mesh.geometry.attributes.position;
      const rest = restOf(pos);
      const w = new Float32Array(pos.count);
      const rigid = below.includes(name) ? 1 : above.includes(name) ? 0 : null;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        if (rigid !== null) {
          w[i] = rigid;
          continue;
        }
        v.fromArray(rest, i * 3).sub(piv);
        const s = v.dot(dir) / blend; // -0.5..0.5 is the blend band
        w[i] = Math.min(1, Math.max(0, s + 0.5));
        w[i] = w[i] * w[i] * (3 - 2 * w[i]);
      }
      if (w.every((x) => x === 0)) continue;
      items.push({ mesh, rest, w });
      mesh.userData.joints = (mesh.userData.joints ?? 0) + 1;
    }
    const state = { angle: 0, items, last: 0 };
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    state.apply = () => {
      if (state.angle === state.last) return;
      state.last = state.angle;
      for (const { mesh, rest, w } of items) {
        const pos = mesh.geometry.attributes.position;
        const base = mesh.userData.restPose ?? rest;
        for (let i = 0; i < pos.count; i++) {
          v.fromArray(base, i * 3);
          if (w[i] > 0) {
            q.setFromAxisAngle(ax, sign * THREE.MathUtils.degToRad(state.angle) * w[i]);
            v.sub(piv).applyQuaternion(q).add(piv);
          }
          pos.setXYZ(i, v.x, v.y, v.z);
        }
        pos.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingSphere();
      }
    };
    poses.push(state);
    return state;
  }

  // A muscle contracting: its belly (not its tendons) thickens about its long axis. Tween `v` 0..1; `amount` is
  // the widening at full contraction (0.18 = 18 %, about what a biceps belly does in a curl).
  function flex(mesh, { amount = 0.18 } = {}) {
    const pos = mesh.geometry.attributes.position;
    const col = mesh.geometry.attributes.color;
    const { axis, centre } = longAxis(mesh.geometry);
    const state = { v: 0, last: 0, mesh, amount, axis, centre, belly: new Float32Array(pos.count) };
    for (let i = 0; i < pos.count; i++) state.belly[i] = col ? col.getY(i) : 1;
    flexes.push(state);
    return state;
  }

  // Skin (or any covering) turned to a clear shell with a bright rim, so what is inside shows. Tween `v` 0..1.
  function xray(mesh, { rim = 0xffd2bf } = {}) {
    const m = mesh.material.clone();
    m.transparent = true;
    m.depthWrite = true;
    const state = { v: 0, mesh, material: m, base: mesh.material, rim: new THREE.Color(rim) };
    m.onBeforeCompile = (shader) => {
      shader.uniforms.xv = { value: 0 };
      state.uniform = shader.uniforms.xv;
      shader.fragmentShader = shader.fragmentShader.replace("void main() {", "uniform float xv;\nvoid main() {").replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
  float fres = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.5);
  gl_FragColor.a = mix(gl_FragColor.a, 0.04 + 0.7 * fres, xv);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.4 + vec3(${state.rim.r.toFixed(3)}, ${state.rim.g.toFixed(3)}, ${state.rim.b.toFixed(3)}) * fres * 0.9, xv);`,
      );
    };
    m.customProgramCacheKey = () => "xray";
    mesh.material = m;
    xrays.push(state);
    return state;
  }

  // A position attribute's values as a plain x,y,z array (an interleaved attribute's .array holds the others too).
  function restOf(pos) {
    const a = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) a.set([pos.getX(i), pos.getY(i), pos.getZ(i)], i * 3);
    return a;
  }

  const poses = [];
  const flexes = [];
  const xrays = [];
  // Call before space.render each frame (film.each): applies joints, flexes and x-ray in that order.
  function update() {
    // Joints rebuild positions from the rest pose; a flex then works on the posed shape.
    const flexed = new Set();
    for (const f of flexes) if (f.v > 0.0001 || f.last > 0.0001) flexed.add(f.mesh);
    for (const s of poses) {
      if (flexed.size) s.last = NaN; // re-pose so the flex starts from the posed rest each frame
      s.apply();
    }
    for (const f of flexes) {
      if (f.v < 0.0001 && f.last < 0.0001) continue;
      const pos = f.mesh.geometry.attributes.position;
      if (!f.mesh.userData.joints) {
        f.rest ??= restOf(pos);
        for (let i = 0; i < pos.count; i++) pos.setXYZ(i, f.rest[i * 3], f.rest[i * 3 + 1], f.rest[i * 3 + 2]);
      }
      const { axis } = longAxis(f.mesh.geometry);
      const c = new THREE.Vector3();
      const box = new THREE.Box3().setFromBufferAttribute(pos);
      box.getCenter(c);
      const v = new THREE.Vector3();
      const d = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        d.copy(v).sub(c);
        const along = axis.clone().multiplyScalar(d.dot(axis));
        const radial = d.sub(along);
        const k = 1 + f.amount * f.v * Math.pow(f.belly[i], 2);
        v.copy(c).add(along.multiplyScalar(1 - 0.06 * f.v * f.belly[i])).add(radial.multiplyScalar(k));
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      pos.needsUpdate = true;
      f.mesh.geometry.computeVertexNormals();
      f.last = f.v;
    }
    for (const x of xrays) if (x.uniform) x.uniform.value = x.v;
  }

  return { M, load, joint, flex, xray, update, longAxis };
}

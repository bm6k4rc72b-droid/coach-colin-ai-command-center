// A 3D layer for a film: a three.js canvas over the stage, drawn only when the film asks for a frame.
//
//   const space = createStage3D(document.querySelector("#space"), { rig: true, shadows: true });
//   const board = buildBoard(space);                       // your model, from kit/engine/parts3d.js pieces
//   space.scene.add(board);
//   const pin = space.pin(board.userData.chip, "processor", { dx: 260, dy: -160 });
//   tl.to(space.cam, { az: 35, el: 22, dist: 38, ty: 1, duration: 2.4, ease: "power2.inOut" }, s.s04.start);
//   tl.to(pin, { show: 1, duration: 0.5 }, s.s04.start + 0.8);
//   film.each((t) => space.render(state.vis, t));
//
// Two ways to hold the camera:
// - Fixed (the default): it looks down -z from DIST away with a narrow lens, so at z = 0 one world unit is UNIT
//   pixels and a thing can be placed by pixels with space.at(xPx, yPx) (from the frame's centre, y down).
// - Directed (`rig: true`): the camera orbits a target, and a film moves it by tweening `space.cam`:
//   az / el (degrees around and above the target), dist, tx / ty / tz (the target), fov, roll (degrees),
//   sway (0..1, a slow hand-held drift), focus (the distance in focus, 0 = the target) and blur (depth of field,
//   0 = off; 1 is a strong macro look). This is how a product film moves: orbit, push in, crane, rack focus.
//
// What else it holds (each one is driven by plain numbers a timeline can tween):
// - space.pin(object, text, { dx, dy })   a label pinned to a part: a dot on the part, a leader line, a chip.
//                                         It follows the part as the camera moves. Tween `pin.show` 0..1.
// - space.explode(group)                  parts fly apart along `child.userData.out` (a Vector3) as `group.userData.explode`
//                                         goes 0..1 (see parts3d.js `explodable`).
// - space.ghost(group, keep)             everything in `group` but `keep` fades to a faint shell: tween the returned
//                                         state's `v` 0..1 to look *at* one part inside a machine.
// - space.cutaway(group, plane)          slices `group` with a plane (tween `plane.constant`); cut faces show solid in
//                                         each material's `userData.cut` colour, like a sectioned engineering model.
// - shadows: true                         soft shadows from the key light onto `space.floor()` and onto the parts.
// Use 3D where it explains something physical or spatial. Type, panels and charts stay HTML and SVG.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export function createStage3D(canvas, { distance = 100, fov = 30, exposure = 1.05, environment = 0.42, rig = false, shadows = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.setClearColor(0x000000, 0);
  renderer.localClippingEnabled = true;
  if (shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  const W = canvas.width;
  const H = canvas.height;

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environmentIntensity = environment;
  const camera = new THREE.PerspectiveCamera(fov, W / H, 0.1, 4000);
  camera.position.set(0, 0, distance);
  const UNIT = H / (2 * distance * Math.tan(THREE.MathUtils.degToRad(fov / 2)));

  // Studio light: a key from the upper left, a rim from behind, a soft fill from below. All white: colour comes
  // from the materials and the stage.
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(-40, 60, 90);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6);
  rim.position.set(70, -20, -30);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(30, -50, 60);
  scene.add(key, rim, fill, key.target);
  if (shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 6;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    fitShadow(40);
  }
  // The key's shadow box: call with the radius (world units) of what it must cover, around the target.
  function fitShadow(radius) {
    const c = key.shadow.camera;
    c.left = c.bottom = -radius;
    c.right = c.top = radius;
    c.near = 1;
    c.far = radius * 8;
    c.updateProjectionMatrix();
  }

  // Materials that read as real things under this light. Each call makes a new one, so a film can tune its own.
  const materials = {
    ceramic: (color = 0xf1f1f4) => new THREE.MeshPhysicalMaterial({ color, metalness: 0.05, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }),
    gold: (color = 0xd9a032) => new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: 0.26, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    graphite: (color = 0x1c1c20) => new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.46 }),
    glass: (color = 0xffffff) => new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.06, transmission: 0.92, thickness: 2, ior: 1.45 }),
    glow: (color = 0xffb21a, power = 1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: power, roughness: 0.4 }),
  };

  // ---- the directed camera -------------------------------------------------------------------------------
  const cam = { az: 0, el: 0, dist: distance, tx: 0, ty: 0, tz: 0, fov, roll: 0, sway: 0, focus: 0, blur: 0 };
  const deg = THREE.MathUtils.degToRad;
  function placeCamera(t) {
    // A hand-held drift: slow, smooth, the same on every render of the same frame.
    const s = cam.sway;
    const az = deg(cam.az + s * (0.9 * Math.sin(t * 0.41) + 0.4 * Math.sin(t * 1.13 + 1.7)));
    const el = deg(cam.el + s * (0.6 * Math.sin(t * 0.53 + 0.6) + 0.25 * Math.sin(t * 1.31 + 2.9)));
    const d = cam.dist;
    camera.position.set(cam.tx + d * Math.cos(el) * Math.sin(az), cam.ty + d * Math.sin(el), cam.tz + d * Math.cos(el) * Math.cos(az));
    camera.up.set(Math.sin(deg(cam.roll)), Math.cos(deg(cam.roll)), 0);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    if (camera.fov !== cam.fov) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
    // The key light keeps its angle to the camera, so a turning object stays lit like a product on a set.
    if (shadows) {
      const off = new THREE.Vector3(-0.45, 0.75, 0.5).normalize().multiplyScalar(d * 3);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), az);
      key.position.set(cam.tx + off.x, cam.ty + off.y, cam.tz + off.z);
      key.target.position.set(cam.tx, cam.ty, cam.tz);
    }
  }

  // ---- depth of field (only drawn when cam.blur > 0) -------------------------------------------------------
  // A gather blur on the rendered frame, keeping its alpha, so the 3D still sits over the stage.
  let dof = null;
  function makeDof() {
    const target = new THREE.WebGLRenderTarget(W, H, { samples: 4, type: THREE.HalfFloatType });
    target.depthTexture = new THREE.DepthTexture(W, H);
    target.depthTexture.type = THREE.UnsignedIntType;
    const material = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: target.texture }, tDepth: { value: target.depthTexture }, near: { value: 0.1 }, far: { value: 4000 }, focus: { value: 50 }, amount: { value: 0 }, aspect: { value: W / H }, size: { value: new THREE.Vector2(W, H) } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: `
        uniform sampler2D tColor; uniform sampler2D tDepth; uniform float near, far, focus, amount, aspect; varying vec2 vUv;
        float depthAt(vec2 uv){ float z = texture2D(tDepth, uv).x * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
        float coc(float d){ return clamp(abs(d - focus) / max(focus, 0.001), 0.0, 1.0) * amount * 0.018; }
        uniform vec2 size;
        void main(){
          float c = coc(depthAt(vUv));
          // In focus (the blur would move a sample by under half a pixel): the pixel is its own result. Most of a
          // close-up's subject is in focus, so most pixels skip the gather; the picture is unchanged.
          float px = c * size.x;
          if (px < 0.5) {
            gl_FragColor = texture2D(tColor, vUv);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            return;
          }
          // A small blur needs few samples to look smooth; a large one gets all 28.
          int n = int(clamp(ceil(px * 1.6), 8.0, 28.0));
          float fn = float(n);
          vec4 acc = vec4(0.0); float wsum = 0.0;
          for (int i = 0; i < 28; i++) {
            if (i >= n) break;
            float fi = float(i) + 0.5;
            float r = sqrt(fi / fn);
            float a = fi * 2.39996;
            vec2 o = vec2(cos(a), sin(a) * aspect) * r * c;
            vec2 uv = vUv + o;
            float cs = coc(depthAt(uv));
            float w = smoothstep(0.0, 1.0, (cs + 0.0015) / (r * c + 0.0015));
            acc += min(texture2D(tColor, uv), vec4(3.0)) * w; wsum += w;
          }
          gl_FragColor = acc / max(wsum, 0.0001);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
      transparent: true,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    const post = new THREE.Scene();
    post.add(quad);
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return { target, material, post, ortho };
  }

  // ---- pins: labels that stay on a part as the camera moves ---------------------------------------------
  const overlay = document.createElement("div");
  overlay.className = "pins3d";
  overlay.style.cssText = `position:absolute;left:${canvas.offsetLeft || 0}px;top:${canvas.offsetTop || 0}px;width:${W}px;height:${H}px;pointer-events:none;`;
  canvas.insertAdjacentElement("afterend", overlay);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.style.cssText = "position:absolute;inset:0;overflow:visible";
  overlay.appendChild(svg);
  const pins = [];
  function pin(target, text, { dx = 220, dy = -140, side = dx >= 0 ? "right" : "left", at = null, className = "" } = {}) {
    const el = document.createElement("div");
    el.className = `pin3d ${className}`.trim();
    el.innerHTML = text;
    overlay.appendChild(el);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("class", "pin3d-line");
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("class", "pin3d-dot");
    dot.setAttribute("r", 7);
    svg.append(line, dot);
    const state = { show: 0, dx, dy, el, target, at, side };
    pins.push({ state, el, line, dot });
    return state;
  }
  const v = new THREE.Vector3();
  function placePins() {
    for (const { state, el, line, dot } of pins) {
      const shown = state.show > 0.001;
      el.style.display = line.style.display = dot.style.display = shown ? "" : "none";
      if (!shown) continue;
      if (state.at) v.copy(state.at);
      else v.set(0, 0, 0);
      if (state.target) state.target.localToWorld(v);
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * W;
      const y = (-v.y * 0.5 + 0.5) * H;
      const k = Math.min(1, state.show * 1.6);
      const lx = x + state.dx * k;
      const ly = y + state.dy * k;
      // An elbow: out on the diagonal, then level into the chip.
      const ex = x + state.dx * 0.55 * k;
      line.setAttribute("points", `${x},${y} ${ex},${ly} ${lx},${ly}`);
      dot.setAttribute("cx", x);
      dot.setAttribute("cy", y);
      dot.setAttribute("r", 7 * Math.min(1, state.show * 3));
      const t = Math.max(0, Math.min(1, (state.show - 0.4) / 0.6));
      el.style.opacity = t;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      // keep the chip inside the frame, 40 px from every edge (and clear of the app's right column in portrait)
      const edge = 40;
      const maxX = W - edge - w - (H > W ? 110 : 0);
      const left = Math.max(edge, Math.min(maxX, state.side === "right" ? lx + 10 : lx - w - 10));
      const top = Math.max(edge, Math.min(H - edge - h, ly - h / 2));
      el.style.transform = `translate(${left}px, ${top}px) translateY(${(1 - t) * 10}px)`;
    }
  }

  // ---- exploded views, ghosting, cutaways --------------------------------------------------------------
  const exploders = [];
  function explode(group) {
    group.userData.explode ??= 0;
    const parts = [];
    group.traverse((o) => {
      if (o !== group && o.userData.out) parts.push({ o, base: o.position.clone(), out: o.userData.out.clone() });
    });
    exploders.push({ group, parts });
    return group.userData;
  }

  const ghosts = [];
  function ghost(group, keep = [], { floor = 0.08 } = {}) {
    const keepSet = new Set();
    for (const k of [].concat(keep)) k.traverse((o) => keepSet.add(o));
    const meshes = [];
    group.traverse((o) => {
      if (!o.isMesh || keepSet.has(o)) return;
      o.material = o.material.clone();
      meshes.push({ o, opacity: o.material.opacity ?? 1, transparent: o.material.transparent });
    });
    const state = { v: 0, floor };
    ghosts.push({ state, meshes });
    return state;
  }

  function cutaway(group, plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1000)) {
    group.traverse((o) => {
      if (!o.isMesh) return;
      const m = (o.material = o.material.clone());
      m.clippingPlanes = [plane];
      m.side = THREE.DoubleSide;
      const cut = new THREE.Color(m.userData.cut ?? m.color ?? 0x888888);
      m.userData.cutColor = cut; // the live colour of the cut face: change it (copy/lerp) to recolour the section
      const before = m.onBeforeCompile; // a material's own shader patch (body3d's fibres, say) still runs first
      const beforeKey = m.customProgramCacheKey?.() ?? "";
      m.onBeforeCompile = (shader, r) => {
        before.call(m, shader, r);
        shader.uniforms.cutColor = { value: cut };
        shader.fragmentShader = shader.fragmentShader
          .replace("void main() {", "uniform vec3 cutColor;\nvoid main() {")
          // the cut face's colour goes in before tone mapping and the output colour space, so it comes out the same
          // whether the frame is drawn straight to the canvas or through the depth-of-field pass (which tone-maps
          // afterwards): set after them, it jumped in brightness the moment a shot's blur rose above zero
          .replace("#include <tonemapping_fragment>", "if (!gl_FrontFacing) { float hatch = step(0.82, fract((gl_FragCoord.x + gl_FragCoord.y) / 16.0)); gl_FragColor = vec4(cutColor * (0.8 + 0.12 * hatch), 1.0); }\n#include <tonemapping_fragment>");
      };
      m.customProgramCacheKey = () => `${beforeKey}cut-${cut.getHexString()}`;
    });
    return plane;
  }

  // A floor that only shows shadows (and a faint reflection of nothing): the object sits on something.
  function floor({ y = 0, size = 400, opacity = 0.42 } = {}) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShadowMaterial({ opacity }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  // Photo matching: a reference photograph laid behind (or over) the 3D view, so a model can be shaped against the
  // real thing at the photo's own angle. Turnaround pages only, never a film. Await it: the image must be loaded.
  //   await space.backplate("../reference/nozzle-side.jpg", { opacity: 0.5, over: true });
  async function backplate(src, { opacity = 0.5, over = false, fit = "contain" } = {}) {
    const img = new Image();
    img.src = src;
    await img.decode();
    img.style.cssText = `position:absolute;left:${canvas.offsetLeft || 0}px;top:${canvas.offsetTop || 0}px;width:${W}px;height:${H}px;object-fit:${fit};opacity:${opacity};pointer-events:none;`;
    if (over) overlay.before(img);
    else canvas.before(img);
    return img;
  }

  // Blueprint matching: the camera straight at the model from one side, with almost no perspective (a 1-degree lens
  // from far away), so the render lines up with an orthographic drawing laid behind it with backplate().
  // `width` is how many world units the frame's width shows. Needs `rig: true`. Turnaround pages only.
  const VIEWS = { front: [0, 0], back: [180, 0], side: [90, 0], left: [-90, 0], right: [90, 0], top: [0, 89.9], bottom: [0, -89.9] };
  function blueprintView(view = "side", { width = 100, tx = 0, ty = 0, tz = 0 } = {}) {
    const [az, el] = VIEWS[view] ?? VIEWS.side;
    const dist = width / (2 * Math.tan(deg(0.5)) * (W / H));
    Object.assign(cam, { az, el, dist, tx, ty, tz, fov: 1, roll: 0, sway: 0, blur: 0 });
    camera.near = dist * 0.5;
    camera.far = dist * 2;
    camera.fov = 1;
    camera.updateProjectionMatrix();
    return cam;
  }

  function apply() {
    for (const { group, parts } of exploders) {
      const e = group.userData.explode;
      for (const p of parts) p.o.position.copy(p.base).addScaledVector(p.out, e);
    }
    for (const { state, meshes } of ghosts) {
      for (const { o, opacity, transparent } of meshes) {
        const a = opacity * (1 - (1 - state.floor) * state.v);
        o.material.opacity = a;
        o.material.transparent = transparent || a < 0.999;
        o.material.depthWrite = a > 0.6;
        o.castShadow = a > 0.6 && o.userData.castShadow !== false;
      }
    }
    if (shadows) scene.traverse((o) => {
      if (o.isMesh && o.userData.shadow !== false && !(o.material instanceof THREE.ShadowMaterial)) {
        if (o.userData.castShadow === undefined) o.castShadow = o.material.opacity === undefined || o.material.opacity > 0.6;
        o.receiveShadow = true;
      }
    });
  }

  let blank = false;
  return {
    THREE,
    renderer,
    scene,
    camera,
    key,
    rim,
    fill,
    materials,
    UNIT,
    W,
    H,
    cam,
    fitShadow,
    pin,
    explode,
    ghost,
    cutaway,
    floor,
    backplate,
    blueprintView,
    // A position on the z = 0 plane from pixels off the frame's centre (y down), for the fixed camera.
    at: (x, y, z = 0) => new THREE.Vector3(x / UNIT, -y / UNIT, z),
    // Draws the layer at the given opacity; at zero it clears once and then costs nothing. Pass the film's time
    // when the camera is directed (the drift is a function of it).
    render(opacity = 1, t = 0) {
      canvas.style.opacity = opacity;
      overlay.style.opacity = opacity;
      if (opacity <= 0.001) {
        if (!blank) renderer.clear();
        blank = true;
        overlay.style.display = "none";
        return;
      }
      overlay.style.display = "";
      blank = false;
      if (rig) placeCamera(t);
      apply();
      camera.updateMatrixWorld();
      placePins();
      if (cam.blur > 0.001) {
        dof ??= makeDof();
        renderer.setRenderTarget(dof.target);
        renderer.clear();
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        const u = dof.material.uniforms;
        u.near.value = camera.near;
        u.far.value = camera.far;
        u.focus.value = cam.focus > 0 ? cam.focus : cam.dist;
        u.amount.value = cam.blur;
        renderer.clear();
        renderer.render(dof.post, dof.ortho);
      } else {
        renderer.render(scene, camera);
      }
    },
  };
}

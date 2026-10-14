/**
 * Anamorphic cinema stage for Three.js: ACES tone mapping, bloom, then a final grade pass that
 * imitates a 2.39:1 anamorphic lens — long horizontal blue streaks on bright lights, oval
 * vignette, a touch of barrel distortion and chromatic fringing, teal-and-amber split tone,
 * film grain, gate weave and letterbox bars.
 *
 * Sized to its container (not the window), so it works inside a console panel.
 *
 * @module vision-kit/cinema
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const AnamorphicShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uStreak: { value: 0.9 },
    uStreakColor: { value: new THREE.Color('#5ab8ff') },
    uSplit: { value: 0.75 },
    uGrain: { value: 0.035 },
    uBars: { value: 2.39 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color('#ff5a3c') },
    uWarm: { value: 0.6 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uStreak, uSplit, uGrain, uBars, uFlash, uWarm;
    uniform vec3 uStreakColor, uFlashColor;
    varying vec2 vUv;
    float lum(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      float aspect = uRes.x / uRes.y;
      // Gate weave: the frame drifts a fraction of a pixel, like film in a projector.
      vec2 uv = vUv + vec2(sin(uTime*1.7), cos(uTime*1.3)) * 0.00035;
      vec2 d = uv - 0.5;
      // Gentle anamorphic barrel distortion (stronger horizontally).
      float r2 = dot(d * vec2(aspect, 1.0), d * vec2(aspect, 1.0));
      uv = 0.5 + d * (1.0 - 0.018 * r2 * vec2(1.2, 0.8));
      d = uv - 0.5;
      float r = length(d * vec2(aspect, 1.0));
      float ca = 0.0028 * smoothstep(0.2, 0.9, r);
      vec3 col = vec3(texture2D(tDiffuse, uv + vec2(ca, 0.0)).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - vec2(ca, 0.0)).b);
      // Horizontal streaks: integrate bright pixels along the row.
      float s = 0.0;
      for (int i = -16; i <= 16; i++) {
        float fi = float(i);
        vec3 c = texture2D(tDiffuse, uv + vec2(fi * 0.012, 0.0)).rgb;
        s += max(lum(c) - 0.72, 0.0) * exp(-abs(fi) * 0.16);
      }
      col += s * uStreakColor * uStreak * 0.32;
      // Teal shadows, amber highlights.
      float l = lum(col);
      vec3 shadow = vec3(0.0, 0.06, 0.09) * (1.0 - smoothstep(0.0, 0.45, l)) * smoothstep(0.0, 0.08, l);
      vec3 high = vec3(0.08, 0.035, -0.04) * smoothstep(0.4, 1.0, l) * uWarm;
      vec3 graded = col + (shadow + high) * uSplit;
      graded = mix(vec3(lum(graded)), graded, 1.12);
      graded = pow(max(graded, 0.0), vec3(1.05));
      col = graded;
      // Oval vignette.
      vec2 vd = d * vec2(1.0, aspect * 0.62);
      col *= mix(1.0, 0.38, smoothstep(0.32, 0.85, length(vd)));
      col = mix(col, col * 0.55 + uFlashColor * 0.55, uFlash);
      col += (hash(vUv * uRes + fract(uTime) * 91.0) - 0.5) * uGrain;
      // Letterbox to the target aspect.
      float barH = max(0.0, (1.0 - aspect / uBars) * 0.5);
      float bars = step(barH, vUv.y) * step(vUv.y, 1.0 - barH);
      gl_FragColor = vec4(col * bars, 1.0);
    }`,
};

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{bloom?:[number, number, number], exposure?:number, bars?:number}} [opt]
 */
export function createCinemaStage(canvas, opt = {}) {
  const { bloom: b = [0.6, 0.55, 0.78], exposure = 1.0, bars = 2.39 } = opt;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), b[0], b[1], b[2]);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(AnamorphicShader);
  grade.uniforms.uBars.value = bars;
  composer.addPass(grade);

  let camera = null;
  let w = 0;
  let h = 0;
  const resize = () => {
    const box = canvas.parentElement ?? canvas;
    const nw = Math.max(1, box.clientWidth);
    const nh = Math.max(1, box.clientHeight);
    if (nw === w && nh === h) return;
    w = nw;
    h = nh;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    grade.uniforms.uRes.value.set(w, h);
    // Narrow screens keep a 16:9 frame; 2.39:1 bars would swallow a phone view.
    grade.uniforms.uBars.value = w / h < 1.9 ? Math.min(bars, 1.78) : bars;
    if (camera) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement ?? canvas);

  return {
    renderer,
    composer,
    bloom,
    grade,
    get size() {
      return [w, h];
    },
    use(scene, cam) {
      renderPass.scene = scene;
      renderPass.camera = cam;
      camera = cam;
      w = 0;
      resize();
    },
    flash(color = '#ff5a3c') {
      grade.uniforms.uFlashColor.value.set(color);
      grade.uniforms.uFlash.value = 0.85;
    },
    /** Visible (un-barred) fraction of the frame height, for placing UI inside the picture. */
    barFraction() {
      return Math.max(0, (1 - w / h / grade.uniforms.uBars.value) / 2);
    },
    render(t, dt) {
      resize();
      grade.uniforms.uTime.value = t;
      const f = grade.uniforms.uFlash;
      f.value = Math.max(0, f.value - Math.max(0, dt) * 1.4);
      composer.render();
    },
    dispose() {
      ro.disconnect();
      renderer.dispose();
    },
  };
}

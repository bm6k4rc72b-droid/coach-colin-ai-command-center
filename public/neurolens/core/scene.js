import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// White holographic grade: anamorphic streaks keyed on PINK (not brightness — the
// whole frame is bright), an iridescent pearl sheen toward the edges, a soft
// lilac vignette and fine grain.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uStreak: { value: 0.9 }, uFlash: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uStreak, uFlash; varying vec2 vUv;
    float pinkness(vec3 c){ return max(0.0, c.r - c.g) * (0.6 + 0.4 * c.b); }
    void main(){
      vec2 d = vUv - 0.5; float r = length(d * vec2(uRes.x/uRes.y, 1.0));
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float s = 0.0;
      for (int i = -16; i <= 16; i++) { float fi = float(i); s += pinkness(texture2D(tDiffuse, vUv + vec2(fi * 0.010, 0.0)).rgb) * exp(-abs(fi) * 0.18); }
      col = mix(col, col * vec3(1.0, 0.86, 0.95) + vec3(1.0, 0.45, 0.75) * 0.06, clamp(s * 0.06 * uStreak, 0.0, 0.6));
      // Iridescent pearl sheen at the edges.
      vec3 irid = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + r * 1.4 + uTime * 0.02));
      col = mix(col, col * (0.92 + 0.12 * irid), smoothstep(0.35, 0.95, r) * 0.6);
      col = mix(col, col * vec3(0.93, 0.88, 0.97), smoothstep(0.55, 1.05, r));
      col = mix(col, vec3(1.0, 0.94, 0.97), uFlash * 0.7);
      float g = fract(sin(dot(vUv * uRes + uTime * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * 0.018;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;          // keeps whites white
  renderer.toneMappingExposure = 1;
  renderer.setClearColor('#f7f2f7');
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.18, 0.5, 0.97);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader); composer.addPass(grade);
  let camera = null;
  const resize = () => { renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight); grade.uniforms.uRes.value.set(innerWidth, innerHeight); if (camera) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); } };
  addEventListener('resize', resize); resize();
  return {
    renderer, composer, bloom, grade,
    use(scene, cam) { renderPass.scene = scene; renderPass.camera = cam; camera = cam; resize(); },
    flash() { grade.uniforms.uFlash.value = 0.8; },
    render(t, dt) { grade.uniforms.uTime.value = t; const f = grade.uniforms.uFlash; f.value = Math.max(0, f.value - dt * 1.8); composer.render(); },
  };
}

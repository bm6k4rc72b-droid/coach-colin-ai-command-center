import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Cinematic broadcast grade, applied last in display space: holographic
// split tone (teal shadows, magenta-warm highlights), anamorphic horizontal
// streaks on bright lights, soft edge vignette, slight chromatic fringing and
// film grain.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
    uStreak: { value: 0.6 }, uHolo: { value: 0.65 }, uVision: { value: 0 }, uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color('#ff4466') },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uStreak, uHolo, uFlash, uVision; uniform vec3 uFlashColor;
    varying vec2 vUv;
    float lum(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
    void main(){
      vec2 d = vUv - 0.5;
      float r = length(d * vec2(uRes.x/uRes.y, 1.0));
      float ca = 0.0022 * smoothstep(0.25, 0.8, r);
      vec3 col = vec3(texture2D(tDiffuse, vUv + d*ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d*ca).b);
      float s = 0.0;
      for (int i = -12; i <= 12; i++) { float fi = float(i); s += max(lum(texture2D(tDiffuse, vUv + vec2(fi*0.011, 0.0)).rgb) - 0.78, 0.0) * exp(-abs(fi)*0.22); }
      col += s * vec3(0.3, 0.72, 1.0) * uStreak * 0.35;
      float l = lum(col);
      // Teal only in the low mid-tones (true blacks stay black), warm-magenta highlights.
      float lowMid = smoothstep(0.015, 0.18, l) * (1.0 - smoothstep(0.18, 0.5, l));
      vec3 h = col + vec3(-0.004, 0.025, 0.045) * lowMid;
      h *= mix(vec3(1.0), vec3(1.07, 0.95, 1.06), smoothstep(0.35, 1.0, l));
      h = mix(vec3(lum(h)), h, 1.15);
      h = pow(max(h, 0.0), vec3(1.06));                 // a touch of filmic contrast
      col = mix(col, h, uHolo);
      col *= mix(1.0, 0.45, smoothstep(0.45, 0.95, r));
      // Cowl vision modes: 1 = image-intensified night vision, 2 = thermal (ironbow palette).
      if (uVision > 0.5) {
        float L = lum(col);
        float nz = fract(sin(dot(vUv*uRes*0.5 + uTime*97.0, vec2(12.9898,78.233))) * 43758.5453) - 0.5;
        if (uVision < 1.5) { float a = clamp(pow(L, 0.75) * 1.5 + nz * 0.1, 0.0, 1.1); col = vec3(0.1, 0.95, 0.3) * a; col *= 0.88 + 0.12 * sin(vUv.y * uRes.y * 1.6); col *= smoothstep(0.62, 0.45, r); }
        else { float tt = clamp(pow(L, 1.1) * 1.05 + nz * 0.04, 0.0, 1.0); vec3 c1 = vec3(0.02,0.0,0.12), c2 = vec3(0.45,0.0,0.6), c3 = vec3(0.95,0.25,0.05), c4 = vec3(1.0,0.85,0.2), c5 = vec3(1.0);
          col = tt < 0.25 ? mix(c1,c2,tt/0.25) : tt < 0.5 ? mix(c2,c3,(tt-0.25)/0.25) : tt < 0.8 ? mix(c3,c4,(tt-0.5)/0.3) : mix(c4,c5,(tt-0.8)/0.2); }
      }
      col = mix(col, col * 0.6 + uFlashColor * 0.5, uFlash);
      float g = fract(sin(dot(vUv*uRes + uTime*61.0, vec2(12.9898,78.233))) * 43758.5453);
      col += (g - 0.5) * 0.014;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.6, 0.72);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  let camera = null;
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    composer.setSize(innerWidth, innerHeight);
    grade.uniforms.uRes.value.set(innerWidth, innerHeight);
    if (camera) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  };
  window.addEventListener('resize', resize);
  resize();

  return {
    renderer, composer, bloom, grade, envMap,
    use(scene, cam) { renderPass.scene = scene; renderPass.camera = cam; camera = cam; scene.environment = envMap; resize(); },
    flash(color = '#ff4466') { grade.uniforms.uFlashColor.value.set(color); grade.uniforms.uFlash.value = 0.9; },
    render(t, dt) {
      grade.uniforms.uTime.value = t;
      const f = grade.uniforms.uFlash;
      f.value = Math.min(1, Math.max(0, f.value - Math.max(0, dt) * 1.6));
      composer.render();
    },
  };
}

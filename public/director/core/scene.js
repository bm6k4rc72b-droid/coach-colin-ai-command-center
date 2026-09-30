import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ── Physically based depth of field ───────────────────────────────────────
// For every pixel the blur-circle diameter on the sensor is
//     b = (f²/N) · |d − s| / (d · (s − f))            (all in mm)
// converted to pixels with the sensor width, then gathered with a 64-tap
// golden-angle disc. Samples only contribute if their own blur reaches the
// pixel (scatter-as-gather), which keeps sharp foregrounds from smearing.
// Anamorphic mode stretches the kernel vertically for oval bokeh. The camera's
// white balance is applied here too, in linear light (von Kries gains).
const DOFShader = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 500 },
    uF: { value: 50 }, uN: { value: 2.8 }, uS: { value: 3000 }, uSensorW: { value: 24.89 }, uRes: { value: new THREE.Vector2(1, 1) },
    uMaxPx: { value: 26 }, uFrameW: { value: 1 }, uWB: { value: new THREE.Vector3(1, 1, 1) }, uOval: { value: 1 }, uEnabled: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    #include <packing>
    uniform sampler2D tDiffuse, tDepth; uniform float uNear, uFar, uF, uN, uS, uSensorW, uMaxPx, uOval, uEnabled, uFrameW; uniform vec2 uRes; uniform vec3 uWB;
    varying vec2 vUv;
    float distMM(vec2 uv){ float z = texture2D(tDepth, uv).x; return -perspectiveDepthToViewZ(z, uNear, uFar) * 1000.0; }
    float cocPx(float d){ float b = (uF*uF/uN) * abs(d - uS) / (d * max(1e-3, uS - uF)); return min(uMaxPx, b / uSensorW * uFrameW * 0.5); }
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      if (uEnabled < 0.5) { gl_FragColor = vec4(base.rgb * uWB, 1.0); return; }
      float r0 = cocPx(distMM(vUv));
      if (r0 < 0.6) { gl_FragColor = vec4(base.rgb * uWB, 1.0); return; }
      vec3 acc = vec3(0.0); float wsum = 0.0;
      const float GA = 2.39996323;
      for (int i = 0; i < 64; i++) {
        float fi = float(i) + 0.5, rr = sqrt(fi / 64.0);
        vec2 o = vec2(cos(fi * GA), sin(fi * GA) * uOval) * rr;
        vec2 uv = vUv + o * r0 / uRes;
        float rs = cocPx(distMM(uv));
        float w = smoothstep(rr * r0 - 1.5, rr * r0 + 0.5, rs + 0.5);
        vec3 c = texture2D(tDiffuse, uv).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        w *= 1.0 + 3.0 * smoothstep(0.6, 1.4, l);          // bright points bloom into bokeh balls
        acc += c * w; wsum += w;
      }
      gl_FragColor = vec4((wsum > 0.0 ? acc / wsum : base.rgb) * uWB, 1.0);
    }`,
};
class DOFPass extends Pass {
  constructor() { super(); this.material = new THREE.ShaderMaterial(DOFShader); this.uniforms = this.material.uniforms; this.fsQuad = new FullScreenQuad(this.material); }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture; this.uniforms.tDepth.value = readBuffer.depthTexture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.fsQuad.render(renderer);
  }
}

// Cinematic grade: split tone, anamorphic streaks on highlights, vignette,
// grain, plus an optional FALSE COLOUR exposure view (IRE bands).
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uStreak: { value: 0.7 }, uHolo: { value: 0.5 }, uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color('#ffffff') }, uFalse: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uStreak, uHolo, uFlash, uFalse; uniform vec3 uFlashColor;
    varying vec2 vUv;
    float lum(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
    vec3 falseColour(float y){
      float ire = y * 100.0;
      if (ire < 3.0) return vec3(0.45,0.0,0.6);          // crushed
      if (ire < 10.0) return vec3(0.0,0.2,0.9);          // near black
      if (ire < 40.0) return vec3(vec3(y*1.2));          // shadows in grey
      if (ire < 48.0) return vec3(0.1,0.85,0.2);         // 18 % grey
      if (ire < 55.0) return vec3(vec3(y));
      if (ire < 62.0) return vec3(1.0,0.55,0.7);         // skin (one stop over grey)
      if (ire < 93.0) return vec3(vec3(y));
      if (ire < 98.0) return vec3(1.0,0.9,0.0);          // near clip
      return vec3(1.0,0.1,0.1);                           // clipped
    }
    void main(){
      vec2 d = vUv - 0.5; float r = length(d * vec2(uRes.x/uRes.y, 1.0));
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      if (uFalse > 0.5) { gl_FragColor = vec4(falseColour(clamp(lum(col),0.0,1.0)), 1.0); return; }
      float ca = 0.0018 * smoothstep(0.3, 0.8, r);
      col = vec3(texture2D(tDiffuse, vUv + d*ca).r, col.g, texture2D(tDiffuse, vUv - d*ca).b);
      float s = 0.0;
      for (int i = -14; i <= 14; i++) { float fi = float(i); s += max(lum(texture2D(tDiffuse, vUv + vec2(fi*0.012, 0.0)).rgb) - 0.8, 0.0) * exp(-abs(fi)*0.2); }
      col += s * vec3(0.35, 0.65, 1.0) * uStreak * 0.3;
      float l = lum(col);
      vec3 h = col + vec3(-0.004, 0.02, 0.04) * smoothstep(0.015, 0.18, l) * (1.0 - smoothstep(0.18, 0.5, l));
      h *= mix(vec3(1.0), vec3(1.06, 0.97, 1.02), smoothstep(0.35, 1.0, l));
      h = pow(max(h, 0.0), vec3(1.05));
      col = mix(col, h, uHolo);
      col *= mix(1.0, 0.5, smoothstep(0.5, 0.98, r));
      col = mix(col, uFlashColor, uFlash * 0.8);
      float g = fract(sin(dot(vUv*uRes + uTime*61.0, vec2(12.9898,78.233))) * 43758.5453);
      col += (g - 0.5) * 0.02;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 0 });
  rt.depthTexture = new THREE.DepthTexture(2, 2); rt.depthTexture.type = THREE.UnsignedIntType;
  const composer = new EffectComposer(renderer, rt);
  // The composer clones rt; clones share the depth texture's GPU source, so give
  // the second buffer its own or the DOF pass reads the depth it is writing.
  composer.renderTarget2.depthTexture = new THREE.DepthTexture(2, 2); composer.renderTarget2.depthTexture.type = THREE.UnsignedIntType;
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  composer.addPass(renderPass);
  const dofPass = new DOFPass(); composer.addPass(dofPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader); composer.addPass(grade);
  let camera = null;
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    composer.setSize(innerWidth, innerHeight);
    const pr = renderer.getPixelRatio();
    grade.uniforms.uRes.value.set(innerWidth, innerHeight);
    dofPass.uniforms.uRes.value.set(innerWidth * pr, innerHeight * pr);
    if (camera) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  };
  window.addEventListener('resize', resize); resize();
  return {
    renderer, composer, bloom, grade, envMap, dof: dofPass,
    use(scene, cam) { renderPass.scene = scene; renderPass.camera = cam; camera = cam; scene.environment = envMap; resize(); },
    flash(color = '#ffffff') { grade.uniforms.uFlashColor.value.set(color); grade.uniforms.uFlash.value = 0.8; },
    render(t, dt) {
      grade.uniforms.uTime.value = t;
      const f = grade.uniforms.uFlash; f.value = Math.min(1, Math.max(0, f.value - Math.max(0, dt) * 1.6));
      if (camera) { dofPass.uniforms.uNear.value = camera.near; dofPass.uniforms.uFar.value = camera.far; }
      composer.render();
    },
  };
}

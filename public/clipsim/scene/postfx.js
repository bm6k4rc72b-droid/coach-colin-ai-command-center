import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { MICROSCOPE } from '../config/anatomy.js';

// The "through the eyepiece" grade, applied last in display space:
//  - chromatic fringing that grows toward the edge of the optics
//  - anamorphic horizontal streaks from bright specular highlights
//  - holographic split-tone (teal shadows, warm-magenta highlights)
//  - a circular field stop with an iridescent rim, fall-off and film grain
//  - uIcg crossfades to a near-infrared fluorescence look (used from M5)
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uAspect: { value: 1 },
    uTime: { value: 0 },
    uRadius: { value: MICROSCOPE.vignette.radius },
    uSoft: { value: MICROSCOPE.vignette.softness },
    uStreak: { value: MICROSCOPE.streak },
    uHolo: { value: MICROSCOPE.holo },
    uIcg: { value: 0 },
    uRed: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uAspect, uTime, uRadius, uSoft, uStreak, uHolo, uIcg, uRed;
    varying vec2 vUv;
    float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    vec3 hue(float h) { return 0.5 + 0.5 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67))); }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5; c.x *= uAspect;
      float r = length(c);

      float ca = 0.0035 * smoothstep(0.12, 0.5, r);
      vec2 d = uv - 0.5;
      vec3 col = vec3(texture2D(tDiffuse, uv + d * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d * ca).b);

      float streak = 0.0;
      for (int i = -14; i <= 14; i++) {
        float fi = float(i);
        vec3 s = texture2D(tDiffuse, uv + vec2(fi * 0.012, 0.0)).rgb;
        streak += max(lum(s) - 0.8, 0.0) * exp(-abs(fi) * 0.2);
      }
      col += streak * vec3(0.25, 0.7, 1.0) * uStreak * 0.35;

      float l = lum(col);
      vec3 holo = col;
      holo += vec3(0.0, 0.10, 0.16) * (1.0 - smoothstep(0.0, 0.45, l)) * 0.55;   // teal shadows
      holo *= mix(vec3(1.0), vec3(1.08, 0.94, 1.06), smoothstep(0.35, 1.0, l));  // magenta-warm highlights
      holo = mix(vec3(lum(holo)), holo, 1.12);                                    // a touch of saturation
      col = mix(col, holo, uHolo);

      // Near-infrared ICG look: vessels carrying dye glow, everything else goes dark.
      vec3 icg = vec3(pow(clamp(l * 1.6, 0.0, 1.0), 1.4)) * vec3(0.72, 1.0, 0.86);
      col = mix(col, icg, uIcg);

      col = mix(col, col * vec3(1.15, 0.55, 0.55), uRed);

      col *= mix(0.5, 1.0, smoothstep(uRadius, uRadius * 0.4, r));
      float field = smoothstep(uRadius, uRadius - uSoft, r);
      float ring = exp(-pow((r - uRadius + 0.006) / 0.005, 2.0));
      float ang = atan(c.y, c.x);
      vec3 rim = hue(ang / 6.28318 + uTime * 0.04) * vec3(0.55, 0.85, 1.0);
      col = col * field + rim * ring * 0.5;

      float g = fract(sin(dot(uv * uRes + uTime * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * 0.022 * field;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createPostFX(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bokeh = new BokehPass(scene, camera, { focus: MICROSCOPE.distance, aperture: MICROSCOPE.aperture, maxblur: MICROSCOPE.maxBlur });
  composer.addPass(bokeh);

  const b = MICROSCOPE.bloom;
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), b.strength, b.radius, b.threshold);
  composer.addPass(bloom);

  composer.addPass(new OutputPass());

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  let focus = MICROSCOPE.distance;
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    grade.uniforms.uRes.value.set(w, h);
    grade.uniforms.uAspect.value = w / h;
  }
  window.addEventListener('resize', resize);
  resize();

  return {
    composer, bokeh, bloom, grade,
    // The depth of field eases toward the requested focus distance, like an autofocus scope.
    setFocus(dist, dt) {
      focus += (dist - focus) * (1 - Math.exp(-dt * 6));
      bokeh.uniforms.focus.value = focus;
    },
    render(t) {
      grade.uniforms.uTime.value = t;
      composer.render();
    },
  };
}

// The stage behind every scene: a lit, slowly flowing field drawn by one fragment shader.
// It has no clock of its own. Every value comes in through render(state), so any frame can be drawn on its own.
// state: t (seconds), lx ly (the key light, 0..1 from the bottom left), glow, r g b (the light's colour), floor,
// horizon, camx camy (the camera's travel, which moves the whole field), pr ps (a shock ring's radius and strength),
// flash, streak (speed lines), silk (how much of the flowing field shows).
const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uT; uniform vec2 uLight; uniform float uGlow; uniform vec3 uTint;
uniform float uFloor; uniform float uHorizon; uniform vec2 uCam; uniform vec2 uPulse;
uniform float uFlash; uniform float uStreak; uniform float uSilk;
out vec4 o;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for(int i = 0; i < 5; i++){ s += a * noise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= .5; } return s; }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  vec2 L = (uLight - .5) * vec2(uRes.x / uRes.y, 1.);
  float d = length(p - L);
  vec3 tint = uTint;
  vec3 col = mix(vec3(.038, .038, .043), vec3(.062, .061, .068), uv.y);

  // Silk: two rounds of domain warping, read once as broad bands and once as thin ridges.
  vec2 q = p * 1.35 + uCam * .18; float t = uT * .055;
  vec2 w = vec2(fbm(q + vec2(t, -t * .7)), fbm(q + vec2(5.2 - t * .5, 1.3 + t)));
  float s = fbm(q * 1.2 + 2.3 * w + vec2(0., t));
  float bands = smoothstep(.2, .95, s);
  float ridge = pow(1. - abs(2. * fbm(q * 2.1 + 3.1 * w) - 1.), 7.);
  float fall = exp(-d * d * 1.5);
  col += tint * (bands * .055 + ridge * .12) * uSilk * (.2 + fall);

  // Key light with a wide anamorphic streak through it.
  col += tint * uGlow * (.2 * exp(-d * d * 6.5) + .075 * exp(-d * d * 1.3));
  col += mix(tint, vec3(1.), .35) * uGlow * .13 * exp(-pow((p.y - L.y) * 30., 2.)) * exp(-pow((p.x - L.x) * .85, 2.));

  // A floor in perspective: grid lines that thin out toward the horizon, and the light pooling on it.
  float below = uHorizon - p.y;
  if (uFloor > 0. && below > 0.) {
    float z = 1. / below;
    vec2 g = vec2((p.x + uCam.x * .4) * z * .9, z * .9 + uT * .12);
    vec2 fw = fwidth(g) * 1.2;
    vec2 a = smoothstep(fw, vec2(0.), abs(fract(g) - .5) - (.5 - fw));
    float lines = max(1. - a.x, 1. - a.y);
    lines = 1. - min(a.x, a.y);
    float fade = exp(-z * .16) * smoothstep(0., .05, below);
    col += mix(tint, vec3(1.), .5) * lines * fade * .11 * uFloor;
    col += tint * uFloor * uGlow * .16 * exp(-pow((p.x - L.x) * 1.5, 2.)) * exp(-below * 3.2) * smoothstep(0., .02, below);
  }
  // The horizon itself is a soft line of light on both sides, so the floor never starts with a hard edge.
  col += mix(tint, vec3(1.), .4) * uFloor * .045 * exp(-pow(below * 46., 2.));

  // Dust in the light: a few soft discs at different depths.
  for (int i = 0; i < 26; i++) {
    float fi = float(i);
    vec2 c = vec2(hash(vec2(fi, 1.7)), hash(vec2(fi, 9.3)));
    float depth = .3 + hash(vec2(fi, 4.1));
    vec2 pos = fract(c + vec2(.012, .02) * uT * depth + uCam * .05 * depth) - .5;
    pos.x *= uRes.x / uRes.y; pos *= 1.15;
    float r = mix(.004, .022, hash(vec2(fi, 6.6)) * hash(vec2(fi, 2.2)));
    float disc = smoothstep(r, r * .45, length(p - pos));
    float tw = .55 + .45 * sin(uT * (.6 + depth) + fi * 2.4);
    col += mix(tint, vec3(1.), .4) * disc * tw * .05 * (.4 + 2.2 * exp(-length(pos - L) * 2.2)) * uSilk;
  }

  // A shock ring and a flash, for the hits.
  col += (tint * .75 + .25) * exp(-pow((d - uPulse.x) * 24., 2.)) * uPulse.y;
  // Speed lines for the fast moves: a few thin streaks of light, brightest near the key light.
  float sl = pow(noise(vec2(p.y * 46., uT * 7.)), 11.) + .6 * pow(noise(vec2(p.y * 150. + 9., uT * 11.)), 14.);
  col += mix(tint, vec3(1.), .5) * uStreak * sl * .9 * exp(-pow((p.x - L.x) * 1.5, 2.));
  col += vec3(1., .93, .78) * uFlash * (.12 + .88 * exp(-d * d * 3.4));

  col *= 1. - .72 * smoothstep(.36, 1.08, length(p * vec2(.8, 1.)));
  col += (hash(gl_FragCoord.xy + fract(uT) * 91.7) - .5) * 1.6 / 255.;
  o = vec4(col, 1.);
}`;

export function createBackdrop(canvas) {
  const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  const u = (name) => gl.getUniformLocation(program, name);
  const loc = Object.fromEntries(
    ["uRes", "uT", "uLight", "uGlow", "uTint", "uFloor", "uHorizon", "uCam", "uPulse", "uFlash", "uStreak", "uSilk"].map((n) => [n, u(n)]),
  );
  gl.viewport(0, 0, canvas.width, canvas.height);
  return {
    render(s) {
      gl.uniform2f(loc.uRes, canvas.width, canvas.height);
      gl.uniform1f(loc.uT, s.t);
      gl.uniform2f(loc.uLight, s.lx, s.ly);
      gl.uniform1f(loc.uGlow, s.glow);
      gl.uniform3f(loc.uTint, s.r, s.g, s.b);
      gl.uniform1f(loc.uFloor, s.floor);
      gl.uniform1f(loc.uHorizon, s.horizon);
      gl.uniform2f(loc.uCam, s.camx, s.camy);
      gl.uniform2f(loc.uPulse, s.pr, s.ps);
      gl.uniform1f(loc.uFlash, s.flash);
      gl.uniform1f(loc.uStreak, s.streak);
      gl.uniform1f(loc.uSilk, s.silk);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

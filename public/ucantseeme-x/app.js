/* UcantSeeMeX — privacy command center
   Core: MediaPipe Selfie Segmentation + Hands + canvas compositing
   Sensors: DeviceMotion + simulated RF panel (browser cannot read raw CSI)
*/

const $ = (s) => document.querySelector(s);
const state = {
  running: false,
  stealth: false,
  thermal: false,
  night: false,
  calibrated: false,
  pinchLatched: false,
  lastPinch: 0,
  bgCanvas: null,
  bgReady: false,
  fps: 0,
  frames: 0,
  lastFps: performance.now(),
  motionMag: 0,
  motionHits: 0,
  lastMotionAt: 0,
  wifiNetworks: 5,
  devices: { phone: true, android: true, laptop: true, glasses: false, drone: false },
  handsSeen: 0,
};

const video = $("#video");
const canvas = $("#output");
const ctx = canvas.getContext("2d", { willReadFrequently: false });
const wave = $("#wave");
const wctx = wave.getContext("2d");

function logLine(who, text) {
  const box = $("#voiceLog");
  const el = document.createElement("div");
  el.className = "line";
  el.innerHTML = `<span class="who">${who}</span> ${text}`;
  box.prepend(el);
}

const audio = {
  welcome: new Audio("audio/welcome.mp3"),
  on: new Audio("audio/stealth-on.mp3"),
  off: new Audio("audio/stealth-off.mp3"),
  cal: new Audio("audio/calibrated.mp3"),
  thermal: new Audio("audio/thermal.mp3"),
  help: new Audio("audio/help.mp3"),
};
Object.values(audio).forEach((a) => { a.preload = "auto"; });

function speak(key, caption) {
  const a = audio[key];
  if (!a) return;
  a.currentTime = 0;
  a.play().catch(() => {});
  if (caption) logLine("COACH COLIN", caption);
}

/* ---------- MediaPipe ---------- */
let selfieSeg = null;
let hands = null;
let camera = null;
let lastMask = null;
let lastImage = null;

function setupModels() {
  selfieSeg = new SelfieSegmentation({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
  });
  selfieSeg.setOptions({ modelSelection: 1, selfieMode: true });
  selfieSeg.onResults(onSeg);

  hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5,
    selfieMode: true,
  });
  hands.onResults(onHands);
}

function pinchDistance(lm) {
  const a = lm[4];
  const b = lm[8];
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function onHands(results) {
  state.handsSeen = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
  $("#handKpi").textContent = state.handsSeen;
  if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) return;
  const now = performance.now();
  for (const lm of results.multiHandLandmarks) {
    const d = pinchDistance(lm);
    if (d < 0.045 && now - state.lastPinch > 700) {
      state.lastPinch = now;
      toggleStealth();
      break;
    }
  }
}

function captureBackground() {
  if (!lastImage) {
    logLine("SYSTEM", "No camera frame yet. Allow camera first.");
    return;
  }
  const bg = document.createElement("canvas");
  bg.width = canvas.width;
  bg.height = canvas.height;
  const bctx = bg.getContext("2d");
  bctx.drawImage(lastImage, 0, 0, bg.width, bg.height);
  state.bgCanvas = bg;
  state.bgReady = true;
  state.calibrated = true;
  $("#calStatus").textContent = "ARMED";
  $("#calStatus").style.color = "var(--green)";
  speak("cal", "Background captured. Ghost portal armed. Pinch to vanish.");
}

function toggleStealth(force) {
  if (!state.bgReady) {
    logLine("COACH COLIN", "Calibrate the empty background first. Step out of frame, then tap Calibrate.");
    speak("help", null);
    return;
  }
  state.stealth = typeof force === "boolean" ? force : !state.stealth;
  $("#stealthBanner").classList.toggle("show", state.stealth);
  $("#stealthPill").textContent = state.stealth ? "STEALTH ACTIVE" : "STEALTH STANDBY";
  $("#stealthPill").classList.toggle("alert", state.stealth);
  if (state.stealth) speak("on", "Stealth mode engaged. You are off the visual grid.");
  else speak("off", "Stealth mode disengaged. Visible again.");
}

function applyThermal(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // inferno-ish
    let r, g, b;
    const t = l / 255;
    if (t < 0.25) { r = t * 4 * 80; g = 0; b = t * 4 * 140; }
    else if (t < 0.5) { r = 80 + (t - 0.25) * 4 * 120; g = (t - 0.25) * 4 * 40; b = 140 - (t - 0.25) * 4 * 80; }
    else if (t < 0.75) { r = 200; g = 40 + (t - 0.5) * 4 * 160; b = 20; }
    else { r = 255; g = 200 + (t - 0.75) * 4 * 55; b = 40 + (t - 0.75) * 4 * 80; }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  return imageData;
}

function onSeg(results) {
  lastMask = results.segmentationMask;
  lastImage = results.image;
  const w = canvas.width;
  const h = canvas.height;
  ctx.save();
  ctx.clearRect(0, 0, w, h);

  if (state.stealth && state.bgCanvas) {
    // Draw live frame
    ctx.drawImage(results.image, 0, 0, w, h);
    // Punch person out using mask, reveal stored background
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(results.segmentationMask, 0, 0, w, h);
    ctx.globalCompositeOperation = "destination-over";
    ctx.drawImage(state.bgCanvas, 0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  } else {
    ctx.drawImage(results.image, 0, 0, w, h);
  }

  if (state.thermal) {
    const img = ctx.getImageData(0, 0, w, h);
    ctx.putImageData(applyThermal(img), 0, 0);
  } else if (state.night) {
    ctx.filter = "contrast(1.25) brightness(0.85) saturate(0.35)";
    const tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    tmp.getContext("2d").drawImage(canvas, 0, 0);
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(0, 30, 60, 0.25)";
    ctx.fillRect(0, 0, w, h);
  }

  ctx.restore();

  state.frames++;
  const now = performance.now();
  if (now - state.lastFps > 500) {
    state.fps = Math.round((state.frames * 1000) / (now - state.lastFps));
    state.frames = 0;
    state.lastFps = now;
    $("#fpsTag").textContent = `FPS ${state.fps} · 720p NV`;
  }
}

async function startCamera() {
  setupModels();
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  const resize = () => {
    const rect = $(".stageFrame").getBoundingClientRect();
    const ratio = 16 / 9;
    let w = Math.floor(rect.width);
    let h = Math.floor(w / ratio);
    if (h > rect.height && rect.height > 120) {
      h = Math.floor(rect.height);
      w = Math.floor(h * ratio);
    }
    canvas.width = 960;
    canvas.height = 540;
  };
  resize();
  window.addEventListener("resize", resize);

  camera = new Camera(video, {
    onFrame: async () => {
      if (selfieSeg) await selfieSeg.send({ image: video });
      if (hands) await hands.send({ image: video });
    },
    width: 960,
    height: 540,
  });
  camera.start();
  state.running = true;
  $("#camStatus").textContent = "LIVE";
  logLine("SYSTEM", "Camera pipeline live. MediaPipe Selfie Segmentation + Hands online.");
}

/* ---------- Sensors ---------- */
function hookMotion() {
  const handler = (e) => {
    const a = e.accelerationIncludingGravity || e.acceleration || { x: 0, y: 0, z: 0 };
    const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
    // deviation from ~9.8g rest
    const spike = Math.abs(mag - 9.8);
    state.motionMag = spike;
    if (spike > 1.6) {
      state.motionHits++;
      state.lastMotionAt = Date.now();
    }
    $("#motionCount").textContent = String(Math.min(state.motionHits, 99));
    $("#motionDist").textContent = (1.8 + Math.min(spike * 2.2, 14)).toFixed(1) + " m";
    $("#motionConf").textContent = Math.min(99, 70 + Math.round(spike * 8)) + "%";
    $("#motionAgo").textContent = state.lastMotionAt
      ? Math.max(0, Math.round((Date.now() - state.lastMotionAt) / 1000)) + "s ago"
      : "—";
  };
  window.addEventListener("devicemotion", handler);
  // Desktop fallback: subtle simulated ambient + click bursts
  setInterval(() => {
    if (state.motionMag < 0.2) {
      state.motionMag = 0.15 + Math.random() * 0.25;
    }
  }, 800);
}

function drawWave() {
  const w = wave.width = wave.clientWidth || 280;
  const h = wave.height = 70;
  wctx.clearRect(0, 0, w, h);
  wctx.strokeStyle = "rgba(122,240,255,0.9)";
  wctx.lineWidth = 1.6;
  wctx.beginPath();
  const t = performance.now() / 180;
  const energy = 8 + state.motionMag * 14 + (state.stealth ? 6 : 0);
  for (let x = 0; x < w; x++) {
    const y = h / 2 + Math.sin(x / 18 + t) * energy * 0.35
      + Math.sin(x / 7 + t * 1.7) * energy * 0.18
      + (Math.random() - 0.5) * 1.2;
    if (x === 0) wctx.moveTo(x, y);
    else wctx.lineTo(x, y);
  }
  wctx.stroke();
  requestAnimationFrame(drawWave);
}

function updateRadar() {
  const radar = $("#radar");
  radar.querySelectorAll(".blip").forEach((n) => n.remove());
  const n = state.stealth ? 1 : 2 + (state.motionHits % 3);
  for (let i = 0; i < n; i++) {
    const b = document.createElement("div");
    b.className = "blip";
    const ang = (Date.now() / 1400 + i) % (Math.PI * 2);
    const r = 28 + (i * 22) + (state.motionMag * 6);
    b.style.left = 50 + Math.cos(ang) * r / 2 + "%";
    b.style.top = 50 + Math.sin(ang) * r / 2 + "%";
    radar.appendChild(b);
  }
  $("#wifiCount").textContent = String(5 + (state.motionHits % 4));
  $("#rssi").textContent = (-48 - Math.round(state.motionMag * 3)) + " dBm";
}

setInterval(updateRadar, 900);

/* ---------- UI wiring ---------- */
function enterApp() {
  $("#gate").classList.add("hidden");
  speak("welcome", "Welcome to UcantSeeMeX. Coach Colin on comms.");
  startCamera().catch((err) => {
    logLine("SYSTEM", "Camera blocked: " + err.message);
    alert("Camera permission is required for Invisibility Mode.");
  });
}

window.addEventListener("DOMContentLoaded", () => {
  hookMotion();
  drawWave();
  $("#enterBtn").addEventListener("click", enterApp);
  $("#calBtn").addEventListener("click", captureBackground);
  $("#stealthBtn").addEventListener("click", () => toggleStealth());
  $("#thermalBtn").addEventListener("click", () => {
    state.thermal = !state.thermal;
    if (state.thermal) state.night = false;
    $("#thermalBtn").textContent = state.thermal ? "Thermal ON" : "Thermal NV";
    if (state.thermal) speak("thermal", "Thermal overlay online. Browser layer is a false-color simulation.");
  });
  $("#nightBtn").addEventListener("click", () => {
    state.night = !state.night;
    if (state.night) state.thermal = false;
    $("#nightBtn").textContent = state.night ? "NV ON" : "Night boost";
  });
  $("#helpBtn").addEventListener("click", () => speak("help", "Briefing: calibrate empty frame, then pinch to vanish."));
  $("#briefBtn").addEventListener("click", () => speak("welcome", "Coach Colin standing by."));
  document.querySelectorAll("[data-device]").forEach((el) => {
    el.addEventListener("click", () => {
      el.classList.toggle("on");
    });
  });
});

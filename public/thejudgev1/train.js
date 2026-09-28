/* Trainer: AR pose, camera modes, muscle/biomech, punch pads, TKO */
const MUSCLES = ["Lats","Biceps","Chest","Triceps","Delts","Quads","Hams","Glutes","Calves","Core"];
const OSIM = ["Hip","Knee","Ankle","Quads","Glutes","Hams","Calves","Core"];
const CUES = {
  JAB: "Snap it. Shoulder through. Chin tucked.",
  CROSS: "Rotate the back heel. Hip first.",
  HOOK: "Elbow 90. Pivot. Short arc.",
  UPPERCUT: "Dip then drive. Short arc.",
  OVERHAND: "Drop and whip. Come over the top.",
};

const train = {
  on: false,
  mode: { clean: true, ar: true },
  drill: "UPPERCUT",
  facing: "user",
  stream: null,
  streamB: null,
  pose: null,
  landmarker: null,
  muscles: Object.fromEntries(MUSCLES.map((m) => [m, 8])),
  health: 100,
  score: 0,
  hits: 0,
  misses: 0,
  combo: 0,
  bestCombo: 0,
  perfect: 0,
  reps: 0,
  bestRep: 0,
  peakSpeed: 0,
  peakPower: 0,
  handSpeed: 0,
  sway: 0,
  guard: "High",
  targets: [],
  lastT: 0,
  wristHist: [],
  grfHist: new Array(120).fill(80),
  emgHist: { a: new Array(120).fill(20), b: new Array(120).fill(12) },
  traceHist: new Array(160).fill(20),
  motion: 0,
  joints: null,
  inited: false,
};

function trainInit() {
  if (train.inited) return;
  train.inited = true;
  const wrap = $("#muscles");
  wrap.innerHTML = MUSCLES.map((m) => `<span>${m}</span><div class="track"><i id="mu-${m}"></i></div>`).join("");
  const os = $("#osim");
  os.innerHTML = OSIM.map((m) => `<div class="muscle"><span>${m}</span><div class="track"><i id="os-${m}"></i></div></div>`).join("");
  $("#mode-chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]");
    if (!b) return;
    const k = b.dataset.mode;
    train.mode[k] = !train.mode[k];
    b.classList.toggle("on", train.mode[k]);
    if (k === "twocam") trainDualCam();
    if (k === "ego") { train.facing = "user"; $("#facing-lbl").textContent = "EGO"; }
  });
  $("#drill-chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-drill]");
    if (!b) return;
    $$("#drill-chips .chip-btn").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    train.drill = b.dataset.drill;
    $("#drill-name").textContent = train.drill;
    $("#drill-cue").textContent = CUES[train.drill];
  });
  loadMediaPipe();
}

async function loadMediaPipe() {
  try {
    const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs");
    const fileset = await vision.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    train.landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });
    $("#train-status").textContent = "POSE MODEL READY";
  } catch (e) {
    $("#train-status").textContent = "POSE FALLBACK · MOTION + IMU";
  }
}

function cycleFacing() {
  const order = ["user", "environment", "arm"];
  const i = order.indexOf(train.facing);
  train.facing = order[(i + 1) % order.length];
  $("#facing-lbl").textContent = train.facing === "environment" ? "REAR" : train.facing === "arm" ? "ARM" : "FRONT";
  if (train.on) {
    trainStopCameras();
    trainStart();
  }
}

function trainToggle() {
  if (train.on) trainStop();
  else trainStart();
}

async function trainStart() {
  trainInit();
  showView("train");
  try {
    const facing = train.facing === "environment" ? "environment" : "user";
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    train.stream = stream;
    const v = $("#train-cam");
    v.srcObject = stream;
    v.setAttribute("playsinline", "true");
    v.muted = true;
    await v.play();
    train.on = true;
    train.health = 100;
    train.score = 0;
    train.hits = 0;
    train.misses = 0;
    train.combo = 0;
    train.reps = 0;
    train.targets = [];
    train.lastT = performance.now();
    $("#btn-film").textContent = "STOP";
    $("#train-status").textContent = train.facing === "arm" ? "ARM CAMERA" : "FILMING";
    if (train.mode.twocam) trainDualCam();
    if (typeof DeviceMotionEvent !== "undefined" && DeviceMotionEvent.requestPermission) {
      try { await DeviceMotionEvent.requestPermission(); } catch (_) {}
    }
    requestAnimationFrame(trainLoop);
    if (typeof speakKey === "function") speakKey("camera");
  } catch (err) {
    alert("Allow camera on this device. iPhone: Safari settings. Android: Chrome site settings. Laptop: browser camera permission.");
  }
}

async function trainDualCam() {
  if (!train.mode.twocam) {
    if (train.streamB) train.streamB.getTracks().forEach((t) => t.stop());
    train.streamB = null;
    $("#pip-box").style.display = "none";
    return;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    const other = cams.find((c) => train.stream && !train.stream.getVideoTracks()[0].label.includes(c.label.slice(0, 8)));
    const facing = train.facing === "user" ? "environment" : "user";
    const streamB = await navigator.mediaDevices.getUserMedia({
      video: other && other.deviceId
        ? { deviceId: { exact: other.deviceId } }
        : { facingMode: { exact: facing } },
    });
    train.streamB = streamB;
    const pv = $("#pip-cam");
    pv.srcObject = streamB;
    pv.setAttribute("playsinline", "true");
    pv.muted = true;
    await pv.play();
    $("#pip-box").style.display = "block";
  } catch (_) {
    $("#pip-box").style.display = "none";
  }
}

function trainStopCameras() {
  if (train.stream) train.stream.getTracks().forEach((t) => t.stop());
  if (train.streamB) train.streamB.getTracks().forEach((t) => t.stop());
  train.stream = train.streamB = null;
  $("#train-cam").srcObject = null;
  $("#pip-cam").srcObject = null;
}

function trainStop() {
  train.on = false;
  trainStopCameras();
  $("#btn-film").textContent = "ARM · FILM SET";
  $("#train-status").textContent = "STOPPED";
  showTKO();
}

function showTKO() {
  const att = train.hits + train.misses;
  $("#tko-score").textContent = train.score.toLocaleString();
  $("#tko-hit").textContent = train.hits;
  $("#tko-acc").textContent = (att ? Math.round((train.hits / att) * 100) : 0) + "%";
  $("#tko-combo").textContent = train.bestCombo;
  $("#tko-perf").textContent = train.perfect;
  $("#tko").classList.add("show");
}
function trainAgain() {
  $("#tko").classList.remove("show");
  trainStart();
}

/* ---------- POSE ---------- */
function fallbackJoints(w, h, t, motion) {
  const cx = w * 0.5 + Math.sin(t * 0.001) * 8;
  const cy = h * 0.42;
  const punch = Math.min(1, motion / 22000);
  const side = Math.sin(t * 0.008) > 0 ? 1 : -1;
  const reach = punch * 0.22 * w;
  const j = {
    nose: [cx, cy - h * 0.22],
    lShoulder: [cx - w * 0.12, cy - h * 0.12],
    rShoulder: [cx + w * 0.12, cy - h * 0.12],
    lElbow: [cx - w * 0.18, cy + h * 0.02],
    rElbow: [cx + w * 0.16, cy],
    lWrist: [cx - w * 0.16 + (side < 0 ? reach : 0), cy - h * 0.02 - punch * h * 0.12],
    rWrist: [cx + w * 0.14 + (side > 0 ? reach : 0), cy - punch * h * 0.18],
    lHip: [cx - w * 0.08, cy + h * 0.16],
    rHip: [cx + w * 0.08, cy + h * 0.16],
    lKnee: [cx - w * 0.09, cy + h * 0.32],
    rKnee: [cx + w * 0.1, cy + h * 0.32],
    lAnkle: [cx - w * 0.1, cy + h * 0.46],
    rAnkle: [cx + w * 0.12, cy + h * 0.46],
  };
  return j;
}

function mpToJoints(lm, w, h) {
  const p = (i) => [lm[i].x * w, lm[i].y * h, lm[i].z];
  return {
    nose: p(0),
    lShoulder: p(11), rShoulder: p(12),
    lElbow: p(13), rElbow: p(14),
    lWrist: p(15), rWrist: p(16),
    lHip: p(23), rHip: p(24),
    lKnee: p(25), rKnee: p(26),
    lAnkle: p(27), rAnkle: p(28),
  };
}

function ang(a, b, c) {
  const ab = [a[0] - b[0], a[1] - b[1]];
  const cb = [c[0] - b[0], c[1] - b[1]];
  const d = (ab[0] * cb[0] + ab[1] * cb[1]) / (Math.hypot(...ab) * Math.hypot(...cb) + 1e-6);
  return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
}

function sampleMotion(video) {
  const s = document.createElement("canvas");
  s.width = 48; s.height = 27;
  const c = s.getContext("2d", { willReadFrequently: true });
  try { c.drawImage(video, 0, 0, 48, 27); } catch (_) { return 0; }
  const d = c.getImageData(0, 0, 48, 27).data;
  if (!train._prev) { train._prev = d; return 0; }
  let m = 0;
  for (let i = 0; i < d.length; i += 16) m += Math.abs(d[i] - train._prev[i]);
  train._prev = d;
  return m;
}

/* ---------- LOOP ---------- */
function trainLoop(ts) {
  if (!train.on) return;
  const video = $("#train-cam");
  const fx = $("#train-fx");
  const hud = $("#train-hud");
  const w = video.clientWidth || 640;
  const h = video.clientHeight || 360;
  fx.width = hud.width = w;
  fx.height = hud.height = h;
  const fctx = fx.getContext("2d");
  const ctx = hud.getContext("2d");

  applyFilter(fctx, video, w, h);

  const motion = sampleMotion(video);
  train.motion = motion * 0.4 + train.motion * 0.6;
  let joints = fallbackJoints(w, h, ts, train.motion);

  if (train.landmarker && video.readyState >= 2) {
    try {
      const res = train.landmarker.detectForVideo(video, ts);
      if (res && res.landmarks && res.landmarks[0]) {
        joints = mpToJoints(res.landmarks[0], w, h);
        $("#train-status").textContent = "POSE LOCK · " + train.drill;
      }
    } catch (_) {}
  }
  train.joints = joints;

  const dt = Math.max(0.016, (ts - train.lastT) / 1000);
  train.lastT = ts;

  const rw = joints.rWrist;
  train.wristHist.push({ t: ts, x: rw[0], y: rw[1] });
  if (train.wristHist.length > 8) train.wristHist.shift();
  let hs = 0;
  if (train.wristHist.length > 2) {
    const a = train.wristHist[0], b = train.wristHist[train.wristHist.length - 1];
    const pxDist = Math.hypot(b.x - a.x, b.y - a.y);
    const meters = (pxDist / w) * 1.7;
    hs = meters / Math.max(0.05, (b.t - a.t) / 1000);
  }
  train.handSpeed = hs;
  train.peakSpeed = Math.max(train.peakSpeed, hs);
  const kg = Number($("#kg").value) || 79;
  const power = 0.5 * kg * hs * hs * 12;
  train.peakPower = Math.max(train.peakPower, power);

  updateBiomech(joints, kg, hs, dt);
  updateMuscles(joints, train.motion);
  if (train.mode.ar) drawSkeleton(ctx, joints);
  updateTargets(ctx, joints, w, h, ts, hs);
  drawWatchGlasses(joints);

  requestAnimationFrame(trainLoop);
}

function applyFilter(ctx, video, w, h) {
  ctx.filter = "none";
  try { ctx.drawImage(video, 0, 0, w, h); } catch (_) { return; }
  if (train.mode.night) {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(0,40,20,0.35)";
    ctx.fillRect(0, 0, w, h);
    ctx.filter = "contrast(1.3) saturate(0.4) brightness(0.8)";
    try { ctx.drawImage(video, 0, 0, w, h); } catch (_) {}
    ctx.filter = "none";
  }
  if (train.mode.thermal || train.mode.heat) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = d[i] * 0.3 + d[i + 1] * 0.5 + d[i + 2] * 0.2;
      const t = g / 255;
      d[i] = Math.min(255, t * 380);
      d[i + 1] = Math.min(255, t * 140);
      d[i + 2] = Math.min(255, (1 - t) * 180);
    }
    ctx.putImageData(img, 0, 0);
  }
  if (train.mode.exo) {
    ctx.strokeStyle = "#7cff6b88";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }
}

function drawSkeleton(ctx, j) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ff3355";
  ctx.fillStyle = "#ffe9a8";
  const bone = (a, b) => {
    if (!a || !b) return;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  };
  bone(j.lShoulder, j.rShoulder);
  bone(j.lShoulder, j.lElbow); bone(j.lElbow, j.lWrist);
  bone(j.rShoulder, j.rElbow); bone(j.rElbow, j.rWrist);
  bone(j.lShoulder, j.lHip); bone(j.rShoulder, j.rHip);
  bone(j.lHip, j.rHip);
  bone(j.lHip, j.lKnee); bone(j.lKnee, j.lAnkle);
  bone(j.rHip, j.rKnee); bone(j.rKnee, j.rAnkle);
  bone(j.lShoulder, j.nose); bone(j.rShoulder, j.nose);
  Object.values(j).forEach((p) => {
    ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.fill();
  });
  const el = ang(j.rShoulder, j.rElbow, j.rWrist);
  ctx.fillStyle = "#e6c15a";
  ctx.font = "12px Rajdhani";
  ctx.fillText(`Elbow ${el.toFixed(0)}°`, j.rElbow[0] + 8, j.rElbow[1] - 8);
  ctx.fillText("AR overlay · no QR required", 10, ctx.canvas.height - 10);
}

function updateTargets(ctx, j, w, h, ts, hs) {
  if (train.targets.length < 2 && Math.random() < 0.04) {
    const kinds = train.drill === "UPPERCUT" ? ["UPPER", "JAB"] : [train.drill, "JAB", "CROSS"];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const shoulder = kind === "CROSS" || kind === "OVERHAND" ? j.rShoulder : j.lShoulder;
    train.targets.push({
      kind,
      x: shoulder[0] + (Math.random() * 80 - 20),
      y: (j.nose[1] || 80) - 20 + Math.random() * 40,
      r: 28,
      born: ts,
      life: 2200,
    });
  }
  const wrist = [j.rWrist, j.lWrist];
  train.targets = train.targets.filter((t) => {
    t.y += Math.sin(ts / 300 + t.x) * 0.2;
    const age = ts - t.born;
    const hit = wrist.some((p) => Math.hypot(p[0] - t.x, p[1] - t.y) < t.r + 16 && hs > 0.45);
    if (hit) {
      train.hits += 1;
      train.reps += 1;
      train.combo += 1;
      train.bestCombo = Math.max(train.bestCombo, train.combo);
      train.score += 80 + Math.round(hs * 40) + train.combo * 5;
      if (hs > 1.4) train.perfect += 1;
      if (typeof registerStrike === "function") registerStrike("A", t.kind.toLowerCase().includes("jab") ? "jab" : t.kind.toLowerCase().includes("hook") ? "hook" : "cross");
      return false;
    }
    if (age > t.life) {
      train.misses += 1;
      train.combo = 0;
      train.health = Math.max(0, train.health - 8);
      if (train.health <= 0) trainStop();
      return false;
    }
    const col = t.kind === "JAB" ? "#ff3355" : t.kind === "CROSS" ? "#3b82f6" : "#e6c15a";
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = col + "33";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "11px Orbitron";
    ctx.textAlign = "center";
    ctx.fillText(t.kind, t.x, t.y + 4);
    ctx.textAlign = "left";
    return true;
  });
  $("#health-fill").style.width = train.health + "%";
  $("#health-lbl").textContent = Math.round(train.health) + "%";
  $("#rep-count").textContent = "REPS " + train.reps;
  $("#combo-count").textContent = "COMBO " + train.combo;
}

function updateMuscles(j, motion) {
  const punch = Math.min(100, motion / 250);
  const map = {
    Lats: punch * 0.35,
    Biceps: punch * 0.55,
    Chest: punch * 0.4,
    Triceps: punch * 0.8,
    Delts: punch * 0.9,
    Quads: punch * 0.25,
    Hams: punch * 0.2,
    Glutes: punch * 0.22,
    Calves: punch * 0.18,
    Core: punch * 0.5,
  };
  if (train.drill === "UPPERCUT") { map.Triceps *= 1.1; map.Core *= 1.3; map.Quads *= 1.4; }
  if (train.drill === "HOOK") { map.Delts *= 1.3; map.Core *= 1.2; }
  MUSCLES.forEach((m) => {
    train.muscles[m] = train.muscles[m] * 0.82 + map[m] * 0.18;
    const el = document.getElementById("mu-" + m);
    if (el) el.style.width = clamp(train.muscles[m], 2, 100) + "%";
  });
}

function updateBiomech(j, kg, hs, dt) {
  const torso = ang(j.lHip, j.lShoulder, j.nose);
  const kneeF = 180 - ang(j.lHip, j.lKnee, j.lAnkle);
  const kneeR = 180 - ang(j.rHip, j.rKnee, j.rAnkle);
  const loadF = clamp(50 + (kneeF - kneeR) * 1.4, 20, 80);
  const mom = Math.round(kg * 9.81 * 0.4 * Math.sin((kneeF * Math.PI) / 180) * 4 + hs * 80);
  train.sway = Math.abs(j.nose[0] - (j.lHip[0] + j.rHip[0]) / 2) / 4;
  train.guard = (j.lWrist[1] < j.lShoulder[1] + 20 && j.rWrist[1] < j.rShoulder[1] + 20) ? "High" : "Low";

  $("#bio-torso").textContent = `Torso lean ${torso.toFixed(1)}°`;
  $("#bio-knee").textContent = `Knee flex (F) ${kneeF.toFixed(1)}° (R) ${kneeR.toFixed(1)}°`;
  $("#bio-load").textContent = `Load F ${loadF.toFixed(0)}% R ${(100 - loadF).toFixed(0)}%`;
  $("#bio-mom").textContent = `Knee moment ${mom} N·m`;
  $("#m-speed").textContent = train.peakSpeed.toFixed(2) + " m/s";
  $("#m-power").textContent = Math.round(train.peakPower) + " W";
  $("#m-best").textContent = "#" + train.reps;
  $("#m-sway").textContent = train.sway.toFixed(1) + " cm";
  $("#m-hand").textContent = hs.toFixed(1) + " m/s";
  $("#m-guard").textContent = train.guard;

  const grf = kg * 9.81 + hs * hs * kg * 6;
  train.grfHist.push(grf);
  if (train.grfHist.length > 120) train.grfHist.shift();
  const peak = Math.max(...train.grfHist);
  const rfd = Math.abs(train.grfHist[train.grfHist.length - 1] - train.grfHist[train.grfHist.length - 4]) / (dt * 3);
  $("#grf-lbl").textContent = `GRF ${Math.round(grf)} N · peak ${Math.round(peak)} N · RFD ${Math.round(rfd)} N/s`;
  drawSeries($("#grf"), train.grfHist, "#e6c15a");

  train.emgHist.a.push(clamp(train.muscles.Quads + train.muscles.Core, 0, 100));
  train.emgHist.b.push(clamp(train.muscles.Delts + train.muscles.Triceps, 0, 100));
  if (train.emgHist.a.length > 120) { train.emgHist.a.shift(); train.emgHist.b.shift(); }
  drawDual($("#emg"), train.emgHist.a, train.emgHist.b);

  const osimVals = {
    Hip: Math.abs(torso) * 4,
    Knee: mom / 8,
    Ankle: mom / 10,
    Quads: train.muscles.Quads * 3,
    Glutes: train.muscles.Glutes * 3,
    Hams: train.muscles.Hams * 3,
    Calves: train.muscles.Calves * 3,
    Core: train.muscles.Core * 4,
  };
  OSIM.forEach((k) => {
    const el = document.getElementById("os-" + k);
    if (el) el.style.width = clamp(osimVals[k], 2, 100) + "%";
  });

  train.traceHist.push(clamp(hs * 40, 0, 100));
  if (train.traceHist.length > 160) train.traceHist.shift();
  drawSeries($("#trace"), train.traceHist, "#e6c15a");
  drawROM($("#rom"), torso, kneeF);
  drawStick($("#stick"), j, mom, kg);
}

function drawSeries(canvas, arr, color) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const max = Math.max(1, ...arr);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  arr.forEach((v, i) => {
    const x = (i / (arr.length - 1)) * w;
    const y = h - (v / max) * (h - 6) - 3;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}
function drawDual(canvas, a, b) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const paint = (arr, col) => {
    ctx.strokeStyle = col; ctx.beginPath();
    arr.forEach((v, i) => {
      const x = (i / (arr.length - 1)) * w;
      const y = h - (v / 100) * (h - 8) - 4;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  };
  paint(a, "#e6c15a");
  paint(b, "#7cff6b");
}
function drawROM(canvas, torso, knee) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const cols = ["#e6c15a", "#b7c96a", "#7aa87a", "#4d8a8a", "#3a6a9a", "#3a6a9a", "#e67a32"];
  cols.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect((i / cols.length) * w, 0, w / cols.length - 2, h);
  });
  const x = clamp((torso / 180) * w, 4, w - 4);
  ctx.fillStyle = "#fff";
  ctx.fillRect(x, 0, 3, h);
}
function drawStick(canvas, j, mom, kg) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "#7ad4ff";
  ctx.lineWidth = 6;
  const map = (p, i) => [40 + i * 90, 40 + (p[1] % 80)];
  const hip = [80, 50], knee = [220, 90], ankle = [360, 70], toe = [470, 55];
  ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(knee[0], knee[1]); ctx.lineTo(ankle[0], ankle[1]); ctx.lineTo(toe[0], toe[1]); ctx.stroke();
  ctx.fillStyle = "#e6c15a";
  ctx.font = "12px Rajdhani";
  ctx.fillText("W " + Math.round(kg * 9.81) + "N", 50, 140);
  ctx.fillText("Approx. knee " + mom + " Nm", 200, 130);
  ctx.fillStyle = "#c084fc";
  ctx.fillText("N_react", 400, 30);
}

function drawWatchGlasses(j) {
  if ($("#watch-hr")) $("#watch-hr").textContent = Math.round(90 + train.handSpeed * 20) + " BPM";
  if ($("#glass-a")) $("#glass-a").textContent = train.drill + " · " + train.reps + " REP";
  if ($("#glass-b")) $("#glass-b").textContent = "HP " + Math.round(train.health) + "%";
}

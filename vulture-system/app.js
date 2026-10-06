/* VultureSystemV1 browser engine
   Pipeline mirrors Lot Vulture: camera frame → polygon ROI → vehicle inference
   → dual-threshold hysteresis → occupancy map, alerts, timeline.
   Inference is on-device (COCO-SSD). Pose path uses MediaPipe Tasks. */

const VEHICLE = new Set(["car", "truck", "bus", "motorcycle"]);
const STORE_KEY = "vulturesystem.v1";

const DEMO_SPACES = [
  { name: "Space 13", points: [[0.06, 0.40], [0.20, 0.40], [0.21, 0.90], [0.05, 0.90]] },
  { name: "Space 14", points: [[0.22, 0.40], [0.36, 0.40], [0.37, 0.90], [0.22, 0.90]] },
  { name: "Space 15", points: [[0.38, 0.40], [0.52, 0.40], [0.53, 0.90], [0.38, 0.90]] },
  { name: "Space 16", points: [[0.54, 0.40], [0.68, 0.40], [0.69, 0.90], [0.54, 0.90]] },
  { name: "Space 17", points: [[0.70, 0.40], [0.84, 0.40], [0.85, 0.90], [0.70, 0.90]] },
  { name: "Space 18", points: [[0.86, 0.40], [0.98, 0.40], [0.99, 0.90], [0.87, 0.90]] }
];

const state = {
  view: "dashboard",
  source: "demo",
  model: null,
  modelStatus: "loading",
  running: true,
  spaces: [],
  detections: [],
  alerts: [],
  events: [],
  samples: [],
  startedAt: Date.now(),
  occupyTh: 0.30,
  freeTh: 0.12,
  occupyFrames: 3,
  freeFrames: 6,
  minScore: 0.4,
  selected: 0,
  drawing: false,
  draft: [],
  drag: null,
  lastInferMs: 0,
  lastDetectAt: 0,
  photo: null,
  videoFileUrl: null,
  poseOn: false,
  poseLandmarker: null,
  lastPoseAt: 0,
  lastHip: null,
  kinetics: {
    angles: { shoulder: 0, elbow: 0, hip: 0, knee: 0, ankle: 0 },
    muscles: { quad: 12, hamstring: 8, glute: 10, calf: 6 },
    speed: 0, force: 0, fatigue: 8, cadence: 0
  },
  safety: { risk: 18, slope: 12.4, dirt: 72, light: 10, lat: null, lon: null },
  cars: []
};

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const overlay = $("overlay");
const video = $("video");
const sctx = stage.getContext("2d");
const octx = overlay.getContext("2d");

function uid() { return Math.random().toString(36).slice(2, 8); }
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (raw && Array.isArray(raw.spaces) && raw.spaces.length) {
      state.spaces = raw.spaces;
      state.occupyTh = raw.occupyTh ?? state.occupyTh;
      state.freeTh = raw.freeTh ?? state.freeTh;
      state.occupyFrames = raw.occupyFrames ?? state.occupyFrames;
      state.freeFrames = raw.freeFrames ?? state.freeFrames;
      return;
    }
  } catch (_) {}
  seedSpaces();
}
function saveStore() {
  const slim = state.spaces.map((s) => ({
    id: s.id, name: s.name, points: s.points, state: s.state
  }));
  localStorage.setItem(STORE_KEY, JSON.stringify({
    spaces: slim,
    occupyTh: state.occupyTh,
    freeTh: state.freeTh,
    occupyFrames: state.occupyFrames,
    freeFrames: state.freeFrames
  }));
}
function seedSpaces() {
  state.spaces = DEMO_SPACES.map((s) => ({
    id: uid(), name: s.name, points: s.points.map((p) => p.slice()),
    state: "free", occStreak: 0, freeStreak: 0, lastOverlap: 0, occupiedSince: null
  }));
}
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const hit = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}
function bboxPolyOverlap(bbox, poly, w, h) {
  const [x, y, bw, bh] = bbox;
  let inside = 0;
  const steps = 5;
  const total = (steps + 1) * (steps + 1);
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const px = (x + (bw * i) / steps) / w;
      const py = (y + (bh * j) / steps) / h;
      if (pointInPoly(px, py, poly)) inside++;
    }
  }
  return inside / total;
}
function logEvent(space, from, to) {
  const row = {
    t: Date.now(),
    space: space.name,
    from, to,
    text: `${space.name} ${from} → ${to}${space.lastLabel ? " · " + space.lastLabel : ""}`
  };
  state.events.unshift(row);
  state.events = state.events.slice(0, 200);
  if (to === "occupied") {
    state.alerts.unshift({ t: row.t, text: `${space.name} occupied` });
  }
  const occ = state.spaces.filter((s) => s.state === "occupied").length;
  const ratio = state.spaces.length ? occ / state.spaces.length : 0;
  if (ratio >= 0.8) {
    const last = state.alerts[0];
    if (!last || !String(last.text).includes("capacity")) {
      state.alerts.unshift({ t: Date.now(), text: `Lot capacity ${Math.round(ratio * 100)}%` });
    }
  }
  state.alerts = state.alerts.slice(0, 80);
  toast(row.text);
  renderLists();
}
function stepOccupancy(detections, w, h) {
  detections.forEach((d) => { d._used = false; });
  for (const space of state.spaces) {
    let best = 0;
    let label = "";
    let score = 0;
    for (const d of detections) {
      if (!VEHICLE.has(d.class) || d.score < state.minScore) continue;
      const ov = bboxPolyOverlap(d.bbox, space.points, w, h);
      if (ov > best) { best = ov; label = d.class; score = d.score; d._used = true; }
    }
    space.lastOverlap = best;
    space.lastLabel = label;
    space.lastScore = score;
    if (best >= state.occupyTh) {
      space.occStreak = (space.occStreak || 0) + 1;
      space.freeStreak = 0;
    } else if (best <= state.freeTh) {
      space.freeStreak = (space.freeStreak || 0) + 1;
      space.occStreak = 0;
    }
    const prev = space.state || "free";
    if (prev !== "occupied" && space.occStreak >= state.occupyFrames) space.state = "occupied";
    if (prev === "occupied" && space.freeStreak >= state.freeFrames) space.state = "free";
    if (!space.state) space.state = "free";
    if (space.state === "occupied" && !space.occupiedSince) space.occupiedSince = Date.now();
    if (space.state === "free") space.occupiedSince = null;
    if (prev !== space.state) logEvent(space, prev, space.state);
    else space.state = space.state;
    if (space.state !== "occupied" && space.occStreak > 0) space.pending = true;
    else space.pending = false;
  }
}

function initCars() {
  state.cars = [
    { stall: 0, x: -0.2, y: 0.55, w: 0.12, h: 0.28, color: "#d8dee8", parked: false, speed: 0.004 },
    { stall: 2, x: -0.45, y: 0.55, w: 0.12, h: 0.28, color: "#8fd0ff", parked: false, speed: 0.0035 },
    { stall: 4, x: 1.2, y: 0.55, w: 0.13, h: 0.30, color: "#f0c14a", parked: false, speed: -0.0032 },
    { stall: 5, x: 1.45, y: 0.55, w: 0.12, h: 0.28, color: "#ff8b7a", parked: false, speed: -0.0028 }
  ];
}
function updateCars() {
  const t = Date.now() / 1000;
  state.cars.forEach((car, i) => {
    const stall = state.spaces[car.stall] || state.spaces[0];
    if (!stall) return;
    const target = stall.points[0][0] + 0.02;
    if (!car.parked) {
      car.x += car.speed * 60 * (1 / 60);
      if ((car.speed > 0 && car.x >= target) || (car.speed < 0 && car.x <= target)) {
        car.x = target;
        car.parked = true;
        car.parkedAt = t;
      }
    } else if (t - car.parkedAt > 14 + i * 3) {
      car.parked = false;
      car.speed = -car.speed;
      car.x += car.speed * 4;
    }
    car.y = 0.50 + Math.sin(t * 2 + i) * 0.004;
  });
}
function carDetections(w, h) {
  return state.cars.map((car) => ({
    class: "car",
    score: 0.92,
    bbox: [car.x * w, car.y * h, car.w * w, car.h * h]
  }));
}
function drawLot(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#1b2836");
  g.addColorStop(1, "#121820");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#2a3340";
  ctx.fillRect(0, h * 0.34, w, h * 0.62);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  state.spaces.forEach((s) => {
    ctx.beginPath();
    s.points.forEach((p, i) => {
      const x = p[0] * w, y = p[1] * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  });
  ctx.fillStyle = "#9aa4b2";
  ctx.font = "12px sans-serif";
  ctx.fillText("CAM 01 · DEMO LOT", 12, 22);
  state.cars.forEach((car) => {
    const x = car.x * w, y = car.y * h, bw = car.w * w, bh = car.h * h;
    ctx.fillStyle = car.color;
    roundRect(ctx, x, y, bw, bh, 6);
    ctx.fill();
    ctx.fillStyle = "rgba(20,30,40,0.8)";
    ctx.fillRect(x + bw * 0.15, y + bh * 0.12, bw * 0.7, bh * 0.22);
    ctx.fillStyle = "#222";
    ctx.fillRect(x + bw * 0.08, y + bh * 0.72, bw * 0.18, bh * 0.12);
    ctx.fillRect(x + bw * 0.74, y + bh * 0.72, bw * 0.18, bh * 0.12);
  });
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawOverlay(ctx, w, h, detections) {
  ctx.clearRect(0, 0, w, h);
  state.spaces.forEach((space, idx) => {
    const occ = space.state === "occupied";
    ctx.beginPath();
    space.points.forEach((p, i) => {
      const x = p[0] * w, y = p[1] * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = occ ? "rgba(255,70,90,0.35)" : "rgba(61,255,154,0.28)";
    ctx.strokeStyle = occ ? "#ff5a6a" : "#3dff9a";
    ctx.lineWidth = idx === state.selected ? 3 : 2;
    ctx.fill();
    ctx.stroke();
    const c = centroid(space.points);
    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.fillText(`${space.name} · ${occ ? "TAKEN" : "OPEN"}`, c[0] * w - 36, c[1] * h);
  });
  detections.forEach((d) => {
    if (!VEHICLE.has(d.class)) return;
    const [x, y, bw, bh] = d.bbox;
    ctx.strokeStyle = "#f5c518";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, bw, bh);
    ctx.fillStyle = "#f5c518";
    ctx.font = "11px sans-serif";
    ctx.fillText(`${d.class} ${Math.round(d.score * 100)}%`, x + 4, Math.max(12, y - 4));
  });
  if (state.drawing && state.draft.length) {
    ctx.strokeStyle = "#3ee0ff";
    ctx.beginPath();
    state.draft.forEach((p, i) => {
      const x = p[0] * w, y = p[1] * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    state.draft.forEach((p) => {
      ctx.fillStyle = "#3ee0ff";
      ctx.beginPath();
      ctx.arc(p[0] * w, p[1] * h, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}
function centroid(points) {
  const x = points.reduce((s, p) => s + p[0], 0) / points.length;
  const y = points.reduce((s, p) => s + p[1], 0) / points.length;
  return [x, y];
}
function fitCanvas(canvas, wrap) {
  const rect = wrap.getBoundingClientRect();
  const w = Math.max(320, Math.floor(rect.width));
  const h = Math.max(200, Math.floor(rect.height));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h };
}

async function ensureModel() {
  if (state.model) return state.model;
  state.modelStatus = "loading";
  setEngine("loading model", "warn");
  if (typeof cocoSsd === "undefined") throw new Error("coco-ssd failed to load");
  state.model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
  state.modelStatus = "ready";
  setEngine("ready · CPU", "ok");
  toast("On-device detector ready");
  return state.model;
}
function setEngine(label, kind) {
  $("engineLabel").textContent = label;
  const dot = $("engineDot");
  dot.className = "dot" + (kind === "warn" ? " warn" : kind === "bad" ? " bad" : "");
}

async function detectLive() {
  const model = await ensureModel();
  const t0 = performance.now();
  const source = state.source === "photo" ? state.photo : video;
  const preds = await model.detect(source);
  state.lastInferMs = Math.round(performance.now() - t0);
  $("latencyLabel").textContent = state.lastInferMs + " ms";
  return preds.map((p) => ({ class: p.class, score: p.score, bbox: p.bbox }));
}

function renderLists() {
  const occ = state.spaces.filter((s) => s.state === "occupied").length;
  const free = state.spaces.length - occ;
  $("freeCount").textContent = free;
  $("occCount").textContent = occ;
  $("kpiOcc").textContent = `${occ} / ${state.spaces.length}`;
  const util = state.spaces.length ? Math.round((occ / state.spaces.length) * 100) : 0;
  $("kpiUtil").textContent = util + "%";
  $("kpiDet").textContent = state.detections.filter((d) => VEHICLE.has(d.class)).length;
  $("kpiAlerts").textContent = state.alerts.length;
  $("spaceList").innerHTML = state.spaces.map((s, i) => {
    const dwell = s.occupiedSince ? Math.round((Date.now() - s.occupiedSince) / 1000) + "s" : "—";
    return `<div class="space-row" data-i="${i}">
      <span class="swatch ${s.state === "occupied" ? "occupied" : s.pending ? "pending" : "free"}"></span>
      <div><b>${s.name}</b><br><small>${s.state} · overlap ${Math.round((s.lastOverlap || 0) * 100)}% · dwell ${dwell}</small></div>
      <small>${s.lastLabel || ""}</small>
    </div>`;
  }).join("");
  $("alertList").innerHTML = state.events.slice(0, 40).map((e) =>
    `<div class="event"><time>${new Date(e.t).toLocaleTimeString()}</time><div>${e.text}</div></div>`
  ).join("") || "<div class='hint'>No state changes yet.</div>";
  $("cameraList").innerHTML = `
    <div class="space-row"><span class="swatch free"></span><div><b>Lot Cam 01</b><br><small>${state.source} · ${state.modelStatus}</small></div><small>live</small></div>
    <div class="space-row"><span class="swatch ${state.poseOn ? "occupied" : "free"}"></span><div><b>Kinetics cam</b><br><small>pose ${state.poseOn ? "active" : "idle"}</small></div><small>local</small></div>`;
}

let lastStep = 0;
function loop() {
  const wrap = $("stageWrap");
  const { w, h } = fitCanvas(stage, wrap);
  fitCanvas(overlay, wrap);
  let detections = state.detections;
  const now = performance.now();
  if (state.source === "demo") {
    updateCars();
    drawLot(sctx, w, h);
    detections = carDetections(w, h);
    state.detections = detections;
    if (now - lastStep > 200) {
      lastStep = now;
      stepOccupancy(detections, w, h);
    }
    $("latencyLabel").textContent = "sim";
  } else if (state.source === "photo" && state.photo) {
    sctx.clearRect(0, 0, w, h);
    sctx.drawImage(state.photo, 0, 0, w, h);
  } else if (video.readyState >= 2) {
    sctx.clearRect(0, 0, w, h);
    sctx.drawImage(video, 0, 0, w, h);
    if ((state.view === "dashboard" || state.view === "designer") && now - state.lastDetectAt > 280) {
      state.lastDetectAt = now;
      detectLive().then((preds) => {
        const sw = video.videoWidth || stage.width;
        const sh = video.videoHeight || stage.height;
        state.detections = preds.map((p) => ({
          class: p.class,
          score: p.score,
          bbox: scaleBBox(p.bbox, sw, sh, stage.width, stage.height)
        }));
        stepOccupancy(state.detections, stage.width, stage.height);
      }).catch((err) => setEngine(String(err.message || err).slice(0, 42), "bad"));
    }
    detections = state.detections;
  }
  drawOverlay(octx, w, h, detections);
  if (state.view === "designer") drawDesigner();
  const secs = Math.round((Date.now() - state.startedAt) / 1000);
  $("uptimeLabel").textContent = secs < 60 ? secs + "s" : Math.floor(secs / 60) + "m";
  $("clockLabel").textContent = new Date().toLocaleTimeString();
  if (state.view === "dashboard" && now - (state._listAt || 0) > 400) {
    state._listAt = now;
    renderLists();
  }
  requestAnimationFrame(loop);
}

function drawDesigner() {
  const wrap = document.querySelector("#view-designer .stage-wrap");
  const c = $("designStage");
  const o = $("designOverlay");
  const { w, h } = fitCanvas(c, wrap);
  fitCanvas(o, wrap);
  const ctx = c.getContext("2d");
  if (state.source === "demo") drawLot(ctx, w, h);
  else if (state.source === "photo" && state.photo) ctx.drawImage(state.photo, 0, 0, w, h);
  else if (video.readyState >= 2) ctx.drawImage(video, 0, 0, w, h);
  else drawLot(ctx, w, h);
  drawOverlay(o.getContext("2d"), w, h, state.detections);
}

function canvasPoint(canvas, ev) {
  const r = canvas.getBoundingClientRect();
  return [(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height];
}
function bindDesigner() {
  const o = $("designOverlay");
  o.addEventListener("pointerdown", (ev) => {
    const p = canvasPoint(o, ev);
    if (!state.drawing) {
      state.spaces.forEach((s, si) => {
        s.points.forEach((pt, pi) => {
          if (Math.hypot(pt[0] - p[0], pt[1] - p[1]) < 0.03) state.drag = { si, pi };
        });
      });
      const hit = state.spaces.findIndex((s) => pointInPoly(p[0], p[1], s.points));
      if (hit >= 0) state.selected = hit;
      return;
    }
    state.draft.push(p);
    if (state.draft.length === 4) {
      const name = $("spaceName").value || `Space ${state.spaces.length + 13}`;
      state.spaces.push({
        id: uid(), name, points: state.draft, state: "free",
        occStreak: 0, freeStreak: 0, lastOverlap: 0, occupiedSince: null
      });
      state.draft = [];
      state.drawing = false;
      state.selected = state.spaces.length - 1;
      saveStore();
      toast(name + " saved");
    }
  });
  o.addEventListener("pointermove", (ev) => {
    if (!state.drag) return;
    const p = canvasPoint(o, ev);
    state.spaces[state.drag.si].points[state.drag.pi] = p;
  });
  window.addEventListener("pointerup", () => {
    if (state.drag) saveStore();
    state.drag = null;
  });
}

async function useCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  video.srcObject = stream;
  await video.play();
  state.source = "webcam";
  state.photo = null;
  $("sourceLabel").textContent = "Webcam";
  toast("Camera live. Draw stalls if the demo grid does not match the frame.");
  ensureModel().catch((e) => toast(e.message));
}
function useDemo() {
  if (video.srcObject) video.srcObject.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  state.source = "demo";
  $("sourceLabel").textContent = "Demo lot";
  toast("Demo lot running through the occupancy engine");
}
async function useFile(file) {
  if (!file) return;
  if (file.type.startsWith("image/")) {
    const img = new Image();
    img.onload = async () => {
      state.photo = img;
      state.source = "photo";
      $("sourceLabel").textContent = "Photo";
      const model = await ensureModel();
      const preds = await model.detect(img);
      state.detections = preds.map((p) => ({ class: p.class, score: p.score, bbox: p.bbox.map((n, i) => i < 2 || true ? n : n) }));
      // bbox is in image pixels; rescale onto stage in the draw path by detecting against drawn canvas next tick
      const preds2 = await model.detect(img);
      state.detections = preds2.map((p) => ({ class: p.class, score: p.score, bbox: scaleBBox(p.bbox, img.width, img.height, stage.width, stage.height) }));
      stepOccupancy(state.detections, stage.width, stage.height);
      toast(`Photo analyzed · ${state.detections.length} objects`);
    };
    img.src = URL.createObjectURL(file);
    return;
  }
  if (state.videoFileUrl) URL.revokeObjectURL(state.videoFileUrl);
  state.videoFileUrl = URL.createObjectURL(file);
  video.srcObject = null;
  video.src = state.videoFileUrl;
  video.loop = true;
  await video.play();
  state.source = "file";
  $("sourceLabel").textContent = "Video file";
  ensureModel().catch((e) => toast(e.message));
}
function scaleBBox(bbox, sw, sh, dw, dh) {
  const sx = dw / sw, sy = dh / sh;
  return [bbox[0] * sx, bbox[1] * sy, bbox[2] * sx, bbox[3] * sy];
}
async function loadSnapshot() {
  const url = $("snapUrl").value.trim();
  if (!url) return;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = async () => {
    state.photo = img;
    state.source = "photo";
    $("sourceLabel").textContent = "Snapshot";
    const model = await ensureModel();
    const preds = await model.detect(img);
    state.detections = preds.map((p) => ({ class: p.class, score: p.score, bbox: scaleBBox(p.bbox, img.width, img.height, stage.width, stage.height) }));
    toast("Snapshot analyzed");
  };
  img.onerror = () => toast("Snapshot blocked (CORS) or bad URL");
  img.src = url;
}

function angle(a, b, c) {
  const ab = [a.x - b.x, a.y - b.y];
  const cb = [c.x - b.x, c.y - b.y];
  const dot = ab[0] * cb[0] + ab[1] * cb[1];
  const m = Math.hypot(...ab) * Math.hypot(...cb) || 1;
  return Math.round((Math.acos(Math.min(1, Math.max(-1, dot / m))) * 180) / Math.PI);
}
async function startPose() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
  const pv = $("poseVideo");
  pv.srcObject = stream;
  await pv.play();
  state.poseOn = true;
  if (!state.poseLandmarker) {
    $("poseHint").textContent = "Loading pose model…";
    const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm");
    const fileset = await vision.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    state.poseLandmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numPoses: 1
    });
  }
  $("poseHint").textContent = "Pose live. Joint angles and muscle load update from the skeleton.";
  poseLoop();
}
function stopPose() {
  state.poseOn = false;
  const pv = $("poseVideo");
  if (pv.srcObject) pv.srcObject.getTracks().forEach((t) => t.stop());
}
function poseLoop() {
  if (!state.poseOn) return;
  const pv = $("poseVideo");
  const canvas = $("poseStage");
  const wrap = canvas.parentElement;
  const { w, h } = fitCanvas(canvas, wrap);
  const ctx = canvas.getContext("2d");
  if (pv.readyState >= 2) {
    ctx.drawImage(pv, 0, 0, w, h);
    const now = performance.now();
    if (state.poseLandmarker && now - state.lastPoseAt > 50) {
      state.lastPoseAt = now;
      const res = state.poseLandmarker.detectForVideo(pv, now);
      const lm = res.landmarks && res.landmarks[0];
      if (lm) {
        drawSkeleton(ctx, lm, w, h);
        updateKinetics(lm, now);
      }
    }
  }
  requestAnimationFrame(poseLoop);
}
function drawSkeleton(ctx, lm, w, h) {
  const links = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
  ctx.strokeStyle = "#3ee0ff";
  ctx.lineWidth = 2;
  links.forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
    ctx.stroke();
  });
  ctx.fillStyle = "#f5c518";
  lm.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}
function updateKinetics(lm, now) {
  const L = (i) => lm[i];
  const knee = angle(L(23), L(25), L(27));
  const hip = angle(L(11), L(23), L(25));
  const elbow = angle(L(11), L(13), L(15));
  const shoulder = angle(L(13), L(11), L(23));
  const ankle = angle(L(25), L(27), L(31) || L(27));
  const hipMid = { x: (L(23).x + L(24).x) / 2, y: (L(23).y + L(24).y) / 2 };
  let speed = state.kinetics.speed;
  if (state.lastHip) {
    const dt = Math.max(0.05, (now - state.lastHip.t) / 1000);
    const torso = Math.hypot(L(11).x - L(23).x, L(11).y - L(23).y) || 0.2;
    const metersPerPx = 0.5 / torso;
    const dist = Math.hypot(hipMid.x - state.lastHip.x, hipMid.y - state.lastHip.y) * metersPerPx;
    const inst = dist / dt;
    speed = speed * 0.8 + inst * 0.2;
  }
  state.lastHip = { ...hipMid, t: now };
  const kneeFlex = Math.max(0, 170 - knee) / 90;
  const hipExt = Math.max(0, hip - 140) / 50;
  const ankleFlex = Math.max(0, 140 - ankle) / 60;
  const muscles = {
    quad: Math.round(Math.min(100, 20 + kneeFlex * 70 + speed * 8)),
    hamstring: Math.round(Math.min(100, 15 + hipExt * 55 + speed * 6)),
    glute: Math.round(Math.min(100, 12 + hipExt * 68 + speed * 5)),
    calf: Math.round(Math.min(100, 10 + ankleFlex * 60 + speed * 7))
  };
  const force = Math.round(80 * Math.min(4, speed) * 1.6);
  state.kinetics.fatigue = Math.min(96, state.kinetics.fatigue * 0.995 + (speed > 1.5 ? 0.4 : 0.05));
  state.kinetics.angles = { shoulder, elbow, hip, knee, ankle };
  state.kinetics.muscles = muscles;
  state.kinetics.speed = speed;
  state.kinetics.force = force;
  $("speedLabel").textContent = speed.toFixed(1) + " m/s";
  $("forceLabel").textContent = force + " N";
  $("fatigueLabel").textContent = Math.round(state.kinetics.fatigue) + "%";
  $("muscleBars").innerHTML = Object.entries(muscles).map(([k, v]) =>
    `<div class="bar-line"><span>${k.toUpperCase()}</span><div class="track"><div class="fill" style="width:${v}%"></div></div><b>${v}%</b></div>`
  ).join("");
  $("angleGrid").innerHTML = Object.entries(state.kinetics.angles).map(([k, v]) =>
    `<div>${k}<br><b>${v}°</b></div>`
  ).join("");
}

function drawSafety() {
  const c = $("safetyMap");
  const wrap = c.parentElement;
  const { w, h } = fitCanvas(c, wrap);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#07101c";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(62,224,255,0.08)";
  for (let x = 0; x < w; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  const risk = state.safety.risk;
  const pts = [[0.12, 0.7], [0.32, 0.62], [0.48, 0.5], [0.66, 0.42], [0.84, 0.3]];
  ctx.lineWidth = 6;
  for (let i = 0; i < pts.length - 1; i++) {
    const local = risk * (0.5 + i * 0.18);
    ctx.strokeStyle = local < 30 ? "#3dff9a" : local < 70 ? "#ffb020" : "#ff5a6a";
    ctx.beginPath();
    ctx.moveTo(pts[i][0] * w, pts[i][1] * h);
    ctx.lineTo(pts[i + 1][0] * w, pts[i + 1][1] * h);
    ctx.stroke();
  }
  ctx.fillStyle = "#fff";
  ctx.font = "13px sans-serif";
  ctx.fillText("START", pts[0][0] * w, pts[0][1] * h - 10);
  ctx.fillText(risk > 70 ? "HIGH RISK" : "END", pts[4][0] * w - 40, pts[4][1] * h - 10);
  ctx.fillStyle = "#8ea0b8";
  ctx.fillText(`score ${risk}% · slope ${state.safety.slope}° · dirt ${state.safety.dirt}%`, 16, h - 16);
}
function recalcRisk() {
  const hour = new Date().getHours();
  const night = hour < 6 || hour >= 19 ? 22 : hour >= 17 ? 10 : 0;
  const slope = Number($("slopeInput").value) || 0;
  const dirt = Number($("dirtInput").value) || 0;
  const light = Number($("lightInput").value) || 0;
  const slopeScore = Math.min(30, slope * 1.1);
  const surface = Math.max(0, dirt - 50) * 0.25;
  const risk = Math.round(Math.min(99, 8 + night + slopeScore + surface + light));
  state.safety = { ...state.safety, risk, slope, dirt, light };
  const band = risk < 30 ? "LOW" : risk < 70 ? "MODERATE" : "HIGH";
  $("riskLabel").textContent = `${risk}% ${band}`;
  $("slopeLabel").textContent = slope.toFixed(1) + "°";
  $("safetyHint").textContent = band === "HIGH"
    ? "High risk. Alternate path suggested. Low light or steep surface is driving the score."
    : `Predicted safety: ${band}. Thresholds <30 low, 30–70 moderate, >70 high.`;
  drawSafety();
}
function drawChart() {
  const c = $("utilChart");
  if (!c) return;
  const wrap = c.parentElement;
  const { w, h } = fitCanvas(c, wrap);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#07101c";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(245,197,24,0.4)";
  ctx.beginPath();
  state.samples.forEach((s, i) => {
    const x = (i / Math.max(1, state.samples.length - 1)) * (w - 20) + 10;
    const y = h - 16 - s.util * (h - 32);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = "#8ea0b8";
  ctx.fillText("utilization 0–100%", 12, 18);
}

function exportJSON() {
  const blob = new Blob([JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: state.source,
    thresholds: { occupy: state.occupyTh, free: state.freeTh, occupyFrames: state.occupyFrames, freeFrames: state.freeFrames },
    spaces: state.spaces,
    events: state.events.slice(0, 50)
  }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "vulturesystem-occupancy.json";
  a.click();
}

function bind() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.view = btn.dataset.view;
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      $("view-" + state.view).classList.add("active");
      if (state.view === "safety") { recalcRisk(); }
      if (state.view === "analytics") drawChart();
      if (state.view === "alerts" || state.view === "cameras") renderLists();
    });
  });
  $("btnDemo").onclick = useDemo;
  $("btnCam").onclick = () => useCamera().catch((e) => toast(e.message));
  $("btnSnap").onclick = () => $("fileInput").click();
  $("fileInput").onchange = (e) => useFile(e.target.files[0]);
  $("btnLoadUrl").onclick = loadSnapshot;
  $("btnExport").onclick = exportJSON;
  $("btnDraw").onclick = () => { state.drawing = true; state.draft = []; toast("Click 4 corners"); };
  $("btnGrid").onclick = () => { seedSpaces(); saveStore(); toast("6-stall grid dropped"); };
  $("btnClearSpace").onclick = () => {
    state.spaces.splice(state.selected, 1);
    state.selected = 0;
    saveStore();
  };
  $("btnSaveThresholds").onclick = () => {
    state.occupyTh = Number($("occTh").value);
    state.freeTh = Number($("freeTh").value);
    state.occupyFrames = Number($("occFrames").value);
    state.freeFrames = Number($("freeFrames").value);
    saveStore();
    toast("Hysteresis updated");
  };
  $("btnPose").onclick = () => startPose().catch((e) => toast(e.message));
  $("btnPoseStop").onclick = stopPose;
  $("btnRecalc").onclick = recalcRisk;
  $("btnGeo").onclick = () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      state.safety.lat = pos.coords.latitude;
      state.safety.lon = pos.coords.longitude;
      const elev = 245 + Math.round((pos.coords.altitude || 20));
      $("elevLabel").textContent = elev + " m";
      $("geoLabel").textContent = `GPS locked ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
      recalcRisk();
    }, () => toast("Location denied"));
  };
  $("btnClearLog").onclick = () => { state.events = []; state.alerts = []; renderLists(); };
  $("spaceList").addEventListener("click", (e) => {
    const row = e.target.closest(".space-row");
    if (!row) return;
    state.selected = Number(row.dataset.i);
  });
}

function boot() {
  loadStore();
  initCars();
  bind();
  bindDesigner();
  $("occTh").value = state.occupyTh;
  $("freeTh").value = state.freeTh;
  $("occFrames").value = state.occupyFrames;
  $("freeFrames").value = state.freeFrames;
  setEngine("demo engine live", "ok");
  renderLists();
  recalcRisk();
  setInterval(() => {
    const occ = state.spaces.filter((s) => s.state === "occupied").length;
    const util = state.spaces.length ? occ / state.spaces.length : 0;
    state.samples.push({ t: Date.now(), util });
    state.samples = state.samples.slice(-180);
    if (state.view === "analytics") drawChart();
    if (state.view === "safety") drawSafety();
  }, 2000);
  loop();
}
boot();

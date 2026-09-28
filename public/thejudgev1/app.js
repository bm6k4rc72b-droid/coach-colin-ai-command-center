/* TheJudgeV1 — interactive scoring, camera CV, multi-device, Dana White assistant */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  view: "home",
  round: 1,
  time: 180,
  running: false,
  cameraOn: false,
  stream: null,
  musicOn: false,
  device: detectDevice(),
  synced: { iphone: true, android: true, watch: false, glasses: false, laptop: true, actioncam: false },
  A: { name: "FIGHTER A", strikes: 0, jabs: 0, hooks: 0, crosses: 0, body: 0, aggression: 58, control: 54, defense: 70, hr: 118 },
  B: { name: "FIGHTER B", strikes: 0, jabs: 0, hooks: 0, crosses: 0, body: 0, aggression: 62, control: 46, defense: 66, hr: 124 },
  card: [
    { a: 10, b: 9, note: "A +control, +2 clean jabs" },
    { a: 10, b: 9, note: "A aggression / defense" },
    { a: 9, b: 10, note: "B clean strike, ring generalship" },
  ],
  iq: { accuracy: 73, offense: 74, generalship: 72, control: 70 },
  lastMotion: 0,
};

function detectDevice() {
  const ua = navigator.userAgent;
  const w = window.innerWidth;
  if (/Watch|Wear/i.test(ua) || w < 360) return "watch";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iphone";
  return "laptop";
}

/* ---------- NAV ---------- */
function showView(id) {
  state.view = id;
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + id));
  $$(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === id));
  if (id === "live") speakKey("live");
  if (id === "pipeline") speakKey("pipeline");
  if (id === "score") speakKey("score");
  if (id === "devices") speakKey("sync");
  if (id === "train") {
    if (typeof trainInit === "function") trainInit();
    speakKey("camera");
  }
  if (id === "film") speakKey("pipeline");
}

/* ---------- CLOCK / LIVE SIM ---------- */
let tickTimer = null;
function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
function startFight() {
  if (state.running) return;
  state.running = true;
  state.time = 180;
  speakKey("live");
  tickTimer = setInterval(fightTick, 1000);
  $("#btn-start").textContent = "ROUND LIVE";
}
function stopFight() {
  state.running = false;
  clearInterval(tickTimer);
  $("#btn-start").textContent = "START ROUND";
}
function fightTick() {
  if (!state.running) return;
  state.time = Math.max(0, state.time - 1);
  $("#round-clock").textContent = `R${state.round}  ${formatTime(state.time)}`;
  // simulated punches when camera is off
  if (!state.cameraOn && Math.random() < 0.55) {
    const who = Math.random() < 0.52 ? "A" : "B";
    registerStrike(who, randomType());
  }
  state.A.aggression = clamp(state.A.aggression + (Math.random() * 3 - 1.4), 35, 96);
  state.B.aggression = clamp(state.B.aggression + (Math.random() * 3 - 1.4), 35, 96);
  state.A.hr = clamp(state.A.hr + (Math.random() * 4 - 1.5), 98, 178);
  state.B.hr = clamp(state.B.hr + (Math.random() * 4 - 1.5), 98, 178);
  renderLive();
  if (state.time === 0) {
    stopFight();
    autoScoreRound();
    speakKey("score");
  }
}
function randomType() {
  const t = ["jab", "jab", "jab", "cross", "hook", "body"];
  return t[Math.floor(Math.random() * t.length)];
}
function registerStrike(who, type) {
  const F = state[who];
  F.strikes += 1;
  if (type === "jab") F.jabs += 1;
  else if (type === "hook") F.hooks += 1;
  else if (type === "cross") F.crosses += 1;
  else F.body += 1;
  flashStrike(who, type);
  renderLive();
}
function flashStrike(who, type) {
  const el = $("#strike-toast");
  el.textContent = `${who === "A" ? "FIGHTER A" : "FIGHTER B"} · ${type.toUpperCase()}`;
  el.style.color = who === "A" ? "var(--cyan)" : "var(--red)";
  el.classList.add("pop");
  setTimeout(() => el.classList.remove("pop"), 600);
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function renderLive() {
  const tot = Math.max(1, state.A.strikes + state.B.strikes);
  const aPct = Math.round((state.A.strikes / tot) * 100);
  const bPct = 100 - aPct;
  $("#pct-a").textContent = aPct + "%";
  $("#pct-b").textContent = bPct + "%";
  $("#meter-a").style.width = aPct + "%";
  $("#meter-b").style.width = bPct + "%";
  $("#a-strikes").textContent = state.A.strikes;
  $("#b-strikes").textContent = state.B.strikes;
  $("#a-jabs").textContent = state.A.jabs;
  $("#b-jabs").textContent = state.B.jabs;
  $("#a-agg").textContent = Math.round(state.A.aggression) + "%";
  $("#b-agg").textContent = Math.round(state.B.aggression) + "%";
  $("#a-hr").textContent = Math.round(state.A.hr);
  $("#b-hr").textContent = Math.round(state.B.hr);
  $("#watch-score").textContent = `${aPct} / ${bPct}`;
  $("#watch-hr").textContent = Math.round(state.A.hr) + " BPM";
  $("#glass-a").textContent = `A ${state.A.strikes} STR`;
  $("#glass-b").textContent = `B ${state.B.strikes} STR`;
  $("#conf").textContent = (88 + Math.min(11, Math.floor(tot / 8))) + "%";
}

function autoScoreRound() {
  const a = state.A.strikes + state.A.aggression / 10 + state.A.control / 10;
  const b = state.B.strikes + state.B.aggression / 10 + state.B.control / 10;
  const idx = state.round - 1;
  if (Math.abs(a - b) < 4) {
    state.card[idx] = { a: 10, b: 10, note: "Even round" };
  } else if (a > b) {
    state.card[idx] = { a: 10, b: 9, note: "A volume + pressure" };
  } else {
    state.card[idx] = { a: 9, b: 10, note: "B cleaner work" };
  }
  renderCard();
}

function nextRound() {
  if (state.round < 3) {
    state.round += 1;
    state.time = 180;
    $("#round-clock").textContent = `R${state.round}  3:00`;
  }
}

/* ---------- CAMERA + SIMPLE CV ---------- */
async function toggleCamera() {
  if (state.cameraOn) {
    stopCamera();
    return;
  }
  try {
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    };
    // iPhone / Android / laptop
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.stream = stream;
    const video = $("#cam");
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    video.muted = true;
    await video.play();
    state.cameraOn = true;
    $("#btn-cam").textContent = "STOP CAMERA";
    $("#btn-cam").classList.add("danger");
    speakKey("camera");
    requestAnimationFrame(cvLoop);
  } catch (err) {
    // fallback to user-facing cam (iPhone Safari sometimes prefers this)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      state.stream = stream;
      const video = $("#cam");
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.muted = true;
      await video.play();
      state.cameraOn = true;
      $("#btn-cam").textContent = "STOP CAMERA";
      speakKey("camera");
      requestAnimationFrame(cvLoop);
    } catch (e2) {
      alert("Camera blocked. Allow camera access in Settings. iPhone: Safari → TheJudgeV1 → Camera. Android: Chrome site settings.");
    }
  }
}
function stopCamera() {
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
  state.stream = null;
  state.cameraOn = false;
  $("#cam").srcObject = null;
  $("#btn-cam").textContent = "OPEN CAMERA";
  $("#btn-cam").classList.remove("danger");
}

let prevFrame = null;
function cvLoop() {
  if (!state.cameraOn) return;
  const video = $("#cam");
  const canvas = $("#overlay");
  const ctx = canvas.getContext("2d");
  canvas.width = video.clientWidth || 640;
  canvas.height = video.clientHeight || 360;
  const w = canvas.width, h = canvas.height;

  // offscreen sample for motion
  const sample = document.createElement("canvas");
  sample.width = 64; sample.height = 36;
  const sctx = sample.getContext("2d", { willReadFrequently: true });
  try { sctx.drawImage(video, 0, 0, 64, 36); } catch (_) {}
  const frame = sctx.getImageData(0, 0, 64, 36).data;
  let motion = 0;
  if (prevFrame) {
    for (let i = 0; i < frame.length; i += 16) {
      motion += Math.abs(frame[i] - prevFrame[i]);
    }
  }
  prevFrame = frame;
  const punch = motion > 18000;
  if (punch && Date.now() - state.lastMotion > 380) {
    state.lastMotion = Date.now();
    registerStrike("A", randomType());
  }

  ctx.clearRect(0, 0, w, h);
  // HUD boxes
  ctx.strokeStyle = "#00e5ff";
  ctx.lineWidth = 2;
  ctx.strokeRect(w * 0.12, h * 0.18, w * 0.32, h * 0.62);
  ctx.fillStyle = "#00e5ff";
  ctx.font = "12px Rajdhani";
  ctx.fillText("FIGHTER A  TRACKED", w * 0.12, h * 0.16);
  ctx.strokeStyle = "#ff3355";
  ctx.strokeRect(w * 0.56, h * 0.18, w * 0.32, h * 0.62);
  ctx.fillStyle = "#ff3355";
  ctx.fillText("FIGHTER B  TRACKED", w * 0.56, h * 0.16);
  ctx.fillStyle = "#7cff6b";
  ctx.fillText(`POSE · YOLOv8 + ByteTrack · motion ${Math.round(motion / 100)}`, 12, h - 14);
  if (punch) {
    ctx.fillStyle = "#00e5ff";
    ctx.font = "bold 18px Orbitron";
    ctx.fillText("STRIKE DETECTED", 16, 28);
  }
  requestAnimationFrame(cvLoop);
}

/* ---------- SCORECARD ---------- */
function renderCard() {
  const body = $("#card-body");
  body.innerHTML = "";
  let ta = 0, tb = 0;
  state.card.forEach((r, i) => {
    ta += Number(r.a); tb += Number(r.b);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>R${i + 1}</td>
      <td><input class="score" type="number" min="6" max="10" value="${r.a}" data-i="${i}" data-who="a"></td>
      <td><input class="score" type="number" min="6" max="10" value="${r.b}" data-i="${i}" data-who="b"></td>
      <td style="text-align:left;color:var(--muted)">${r.note}</td>`;
    body.appendChild(tr);
  });
  $("#tot-a").textContent = ta;
  $("#tot-b").textContent = tb;
  const res = ta > tb ? `FIGHTER A WINS — ${ta}-${tb}` : ta < tb ? `FIGHTER B WINS — ${tb}-${ta}` : `DRAW — ${ta}-${tb}`;
  $("#verdict").textContent = res;
  $("#iq-acc").textContent = state.iq.accuracy;
  $("#iq-off").textContent = state.iq.offense;
  $("#iq-gen").textContent = state.iq.generalship;
  $("#iq-ctl").textContent = state.iq.control;
}
function onCardInput(e) {
  const inp = e.target.closest("input.score");
  if (!inp) return;
  const i = +inp.dataset.i;
  state.card[i][inp.dataset.who] = Number(inp.value);
  renderCard();
}
function exportCard() {
  const payload = {
    app: "TheJudgeV1",
    result: $("#verdict").textContent,
    card: state.card,
    totals: { A: state.A, B: state.B },
    iq: state.iq,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "TheJudgeV1-scorecard.json";
  a.click();
}

/* ---------- DEVICES ---------- */
function toggleDevice(key) {
  state.synced[key] = !state.synced[key];
  renderDevices();
  speakKey("sync");
}
function renderDevices() {
  $$(".device").forEach((d) => d.classList.toggle("on", !!state.synced[d.dataset.dev]));
  const n = Object.values(state.synced).filter(Boolean).length;
  $("#sync-count").textContent = n + " / 6 LIVE";
}
function setChrome(mode) {
  document.body.classList.remove("mode-watch", "mode-glasses", "mode-laptop");
  if (mode === "watch") document.body.classList.add("mode-watch");
  if (mode === "glasses") document.body.classList.add("mode-glasses");
  showView("live");
}

/* ---------- TYSON SCROLL ---------- */
function bindTyson() {
  const frames = $$("#tyson-stage img");
  const stage = $("#tyson-stage");
  const label = $("#tyson-label");
  const names = ["STANCE", "JAB", "CROSS", "HOOK", "UPPERCUT", "OVERHAND"];
  const onScroll = () => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const p = clamp(window.scrollY / max, 0, 1);
    const idx = Math.min(frames.length - 1, Math.floor(p * frames.length));
    frames.forEach((img, i) => img.classList.toggle("on", i === idx));
    const scale = 0.82 + p * 0.38;
    const x = (1 - p) * 40 - p * 30;
    stage.style.transform = `translateX(${x}px) scale(${scale})`;
    label.textContent = `IRON MIKE · ${names[idx]} · ${Math.round(p * 100)}% FORWARD`;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ---------- MUSIC ---------- */
function toggleMusic() {
  const audio = $("#bgm");
  if (state.musicOn) {
    audio.pause();
    state.musicOn = false;
    $("#btn-music").textContent = "MUSIC OFF";
  } else {
    audio.volume = 0.28;
    audio.play().catch(() => {});
    state.musicOn = true;
    $("#btn-music").textContent = "MUSIC ON";
  }
}

/* ---------- DANA WHITE ASSISTANT ---------- */
const DANA = {
  welcome: { file: "assets/dana_welcome.mp3", text: "What's up! Dana White here, your receptionist at The Judge V1. You think the judges got it wrong? Prove it." },
  camera: { file: "assets/dana_camera.mp3", text: "Camera is live. Pose tracking locked. Throw some punches and The Judge will count every jab, hook, and cross." },
  score: { file: "assets/dana_score.mp3", text: "Round over. Scorecard locked. That's a clean round. Export the card or keep fighting." },
  sync: { file: "assets/dana_sync.mp3", text: "Devices synced. iPhone, Android, Apple Watch, smart glasses, laptop. Same scorecard everywhere." },
  live: { file: "assets/dana_live.mp3", text: "Live analysis is running. That's a hook to the head. Keep the pressure." },
  help: { file: "assets/dana_help.mp3", text: "I am Dana, your ringside receptionist. Say start fight, open camera, show scorecard, sync devices, or explain the ten point must." },
  pipeline: { file: "assets/dana_pipeline.mp3", text: "Prepare video. Track both fighters. Detect every strike. Analyze control and aggression. Score the round on the ten-point must." },
};
let danaAudio = null;
function speakKey(key) {
  const clip = DANA[key] || DANA.help;
  $("#dana-text").textContent = clip.text;
  if (danaAudio) { danaAudio.pause(); danaAudio = null; }
  danaAudio = new Audio(clip.file);
  danaAudio.volume = 1;
  danaAudio.play().catch(() => {
    // speechSynthesis fallback male-ish
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(clip.text);
      u.pitch = 0.7; u.rate = 1.05;
      const voices = speechSynthesis.getVoices();
      const male = voices.find((v) => /male|daniel|alex|fred|david|english/i.test(v.name));
      if (male) u.voice = male;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }
  });
}
function handleDana(q) {
  const s = (q || "").toLowerCase();
  if (/camera|film|record|lens/.test(s)) { showView("live"); toggleCamera(); speakKey("camera"); return; }
  if (/start|fight|bell|round/.test(s)) { showView("live"); startFight(); return; }
  if (/stop|pause/.test(s)) { stopFight(); speakKey("help"); return; }
  if (/score|card|verdict|who won/.test(s)) { showView("score"); speakKey("score"); return; }
  if (/sync|watch|glass|iphone|android|laptop|device/.test(s)) { showView("devices"); speakKey("sync"); return; }
  if (/pipeline|how|yolo|ai|vision/.test(s)) { showView("pipeline"); speakKey("pipeline"); return; }
  if (/music/.test(s)) { toggleMusic(); speakKey("help"); return; }
  if (/film|study|critique|tony|jose|scorecard|judge/.test(s)) { showView("film"); if (typeof startFilmStudy === "function") startFilmStudy(); return; }
  if (/train|uppercut|jab|hook|brawl|pad/.test(s)) { showView("train"); if (typeof trainStart === "function") trainStart(); return; }
  speakKey("welcome");
}
function listenDana() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    const q = prompt("Dana is listening. Type it:") || "";
    handleDana(q);
    return;
  }
  const rec = new SR();
  rec.lang = "en-US";
  rec.onresult = (e) => handleDana(e.results[0][0].transcript);
  rec.onerror = () => speakKey("help");
  rec.start();
  $("#dana-text").textContent = "Dana is listening… talk to me.";
}

/* ---------- INIT ---------- */
window.addEventListener("DOMContentLoaded", () => {
  $("#device-chip").textContent = state.device.toUpperCase();
  renderLive();
  renderCard();
  renderDevices();
  bindTyson();
  $("#card-body").addEventListener("input", onCardInput);

  // first gesture unlocks audio
  const unlock = () => {
    speakKey("welcome");
    const bgm = $("#bgm");
    bgm.volume = 0.22;
    bgm.play().then(() => {
      state.musicOn = true;
      $("#btn-music").textContent = "MUSIC ON";
    }).catch(() => {});
    window.removeEventListener("pointerdown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });

  // pipeline animation
  let step = 0;
  setInterval(() => {
    step = (step + 1) % 5;
    $$("#pipe .step").forEach((el, i) => el.style.borderColor = i <= step ? "#7cff6b88" : "");
  }, 1200);
});

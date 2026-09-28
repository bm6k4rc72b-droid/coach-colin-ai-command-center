(() => {
  const walker = document.getElementById("walker");
  const glow = document.getElementById("glow");
  const toast = document.getElementById("toast");
  const progress = document.getElementById("progress");
  const frames = {
    stand: document.getElementById("frame-stand"),
    a: document.getElementById("frame-a"),
    b: document.getElementById("frame-b"),
  };
  const clock = document.getElementById("clock");
  const bpmEl = document.getElementById("bpm");
  const rangeEl = document.getElementById("range");
  const canvas = document.getElementById("radar");
  const ctx = canvas.getContext("2d");
  const theme = document.getElementById("theme");
  const wayne = document.getElementById("wayne");
  const caption = document.getElementById("wayne-caption");
  const stateEl = document.getElementById("wayne-state");
  const gate = document.getElementById("gate");

  const lines = {
    welcome: { src: "assets/audio/wayne-welcome.mp3", text: "Good evening. I am Mr. Wayne. The cave is online." },
    capabilities: { src: "assets/audio/wayne-capabilities.mp3", text: "Capabilities are live. Heartbeat, presence, machines, falls." },
    devices: { src: "assets/audio/wayne-devices.mp3", text: "Fleet synced: iPhone 13+, Android, laptop, watch, glasses." },
    stack: { src: "assets/audio/wayne-stack.mp3", text: "Swift, Kotlin, Electron, Spark AR, ESP32. One mesh." },
    privacy: { src: "assets/audio/wayne-privacy.mp3", text: "No camera footage. Vitals stay on device. AES-256." },
    ops: { src: "assets/audio/wayne-ops.mp3", text: "Three workers safe. Motor health ninety two percent." },
    help: { src: "assets/audio/wayne-help.mp3", text: "Say capabilities, devices, stack, operations, privacy, or status." },
    status: { src: "assets/audio/wayne-status.mp3", text: "Link active. Heartbeat stable. Zone B, loading dock." },
    fall: { src: "assets/audio/wayne-fall.mp3", text: "Alert. Fall detected. Worker twelve. Help is pushed." },
    stealth: { src: "assets/audio/wayne-unknown.mp3", text: "Stealth stack is live. MediaPipe pinch-to-vanish, thermal plus RGB, WiFi CSI. It only masks feeds you own." },
    lab: { src: "assets/audio/wayne-unknown.mp3", text: "The try lab is armed. Capture an empty room, then vanish. Thermal and fall drill are on the same glass." },
    unknown: { src: "assets/audio/wayne-unknown.mp3", text: "I did not catch that. Try devices, stack, privacy, or help." },
    listen: { src: "assets/audio/wayne-listen.mp3", text: "I am listening, sir." },
  };

  let lastY = window.scrollY;
  let lastMove = Date.now();
  let step = 0;
  let facing = 1;
  let lastZone = "";
  let musicOn = false;
  const zones = [...document.querySelectorAll("section[data-zone]")];

  function setFrame(name) {
    Object.entries(frames).forEach(([key, el]) => el.classList.toggle("on", key === name));
  }

  function synth(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.88;
    u.pitch = 0.62;
    u.lang = "en-US";
    const voices = window.speechSynthesis.getVoices();
    const male = voices.find((v) => /male|daniel|david|fred|alex|baritone|arthur/i.test(v.name)) || voices[0];
    if (male) u.voice = male;
    u.onend = () => { stateEl.textContent = "Reception"; };
    window.speechSynthesis.speak(u);
  }

  function speak(key) {
    const line = lines[key] || lines.unknown;
    caption.textContent = "“" + line.text + "”";
    stateEl.textContent = key === "listen" ? "Listening" : "Speaking";
    wayne.onended = () => { stateEl.textContent = "Reception"; };
    wayne.onerror = () => synth(line.text);
    wayne.src = line.src;
    const play = wayne.play();
    if (play && play.catch) play.catch(() => synth(line.text));
  }

  function updateWalker() {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const t = window.scrollY / max;
    progress.style.width = t * 100 + "%";

    const vw = window.innerWidth;
    const walkerW = walker.offsetWidth || 320;
    const travel = vw + walkerW * 0.35;
    const x = t * travel - walkerW * 0.22;
    const dy = window.scrollY - lastY;
    if (Math.abs(dy) > 1) {
      facing = dy >= 0 ? 1 : -1;
      lastMove = Date.now();
      step += Math.abs(dy);
      setFrame(Math.floor(step / 42) % 2 === 0 ? "a" : "b");
    } else if (Date.now() - lastMove > 220) {
      setFrame("stand");
    }
    lastY = window.scrollY;
    const bob = Math.sin(step / 18) * 6;
    walker.classList.toggle("flip", facing < 0);
    walker.style.transform = "translate3d(" + x + "px, " + bob + "px, 0)";
    glow.style.transform = "translate3d(" + (x + walkerW * 0.28) + "px, 0, 0)";

    const mid = window.scrollY + window.innerHeight * 0.55;
    let zone = "PERIMETER";
    for (const s of zones) {
      if (mid >= s.offsetTop && mid < s.offsetTop + s.offsetHeight) zone = s.dataset.zone;
    }
    toast.querySelector("b").textContent = "ZONE · " + zone;
    toast.querySelector("span").textContent =
      facing > 0 ? "Forward patrol · Mr. Wayne on comms" : "Retracing the grid · still watching";
    if (zone !== lastZone && lastZone) {
      const current = zones.find((s) => s.dataset.zone === zone);
      const map = { capabilities: "capabilities", devices: "devices", stack: "stack", ops: "ops", privacy: "privacy", top: "welcome" };
      if (current && map[current.id]) speak(map[current.id]);
    }
    lastZone = zone;
  }

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(() => { updateWalker(); ticking = false; });
      ticking = true;
    }
  }, { passive: true });
  // On narrow screens the Mr. Wayne dock spans the bottom edge; lift Batman above it.
  const dock = document.getElementById("wayne-dock");
  function liftWalker() {
    const lift = window.innerWidth <= 980 && dock ? dock.offsetHeight + 18 : 0;
    walker.style.bottom = lift ? lift + "px" : "";
    glow.style.bottom = lift ? lift + "px" : "";
  }
  window.addEventListener("resize", () => { liftWalker(); updateWalker(); });
  liftWalker();
  updateWalker();

  function pad(n) { return String(n).padStart(2, "0"); }
  setInterval(() => {
    const d = new Date();
    clock.textContent = pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    const bpm = 74 + Math.round(Math.sin(Date.now() / 900) * 5 + Math.random() * 2);
    const range = (2.2 + Math.sin(Date.now() / 1400) * 0.3).toFixed(1) + "m";
    bpmEl.textContent = String(bpm);
    rangeEl.textContent = range;
    document.querySelectorAll(".bpm-sync").forEach((el) => { el.textContent = String(bpm); });
    document.querySelectorAll(".range-sync").forEach((el) => { el.textContent = range; });
    const wb = document.getElementById("watch-bpm");
    const gb = document.getElementById("g-bpm");
    const gr = document.getElementById("g-range");
    if (wb) wb.textContent = String(bpm);
    if (gb) gb.textContent = String(bpm);
    if (gr) gr.textContent = range;
  }, 700);

  const hist = new Array(140).fill(0);
  function drawRadar() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(109,255,122,0.15)";
    ctx.lineWidth = 1;
    for (let y = 20; y < h; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    const t = Date.now() / 1000;
    const beat = Math.sin(t * Math.PI * 2.4);
    const sample = beat > 0.72 ? 1 : beat > 0.62 ? -0.35 : Math.sin(t * 9) * 0.08 + Math.sin(t * 2.1) * 0.04;
    hist.push(sample); hist.shift();
    ctx.beginPath();
    hist.forEach((v, i) => {
      const x = (i / (hist.length - 1)) * w;
      const y = h * 0.55 - v * h * 0.38;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#6dff7a";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#6dff7a";
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
    requestAnimationFrame(drawRadar);
  }
  drawRadar();

  const canvas2 = document.getElementById("radar2");
  if (canvas2) {
    const ctx2 = canvas2.getContext("2d");
    const hist2 = new Array(140).fill(0);
    (function drawRadar2() {
      const w = canvas2.width, h = canvas2.height;
      ctx2.clearRect(0, 0, w, h);
      ctx2.strokeStyle = "rgba(109,255,122,0.15)";
      for (let y = 16; y < h; y += 28) {
        ctx2.beginPath(); ctx2.moveTo(0, y); ctx2.lineTo(w, y); ctx2.stroke();
      }
      const t = Date.now() / 1000;
      const beat = Math.sin(t * Math.PI * 2.4);
      const sample = beat > 0.72 ? 1 : beat > 0.62 ? -0.35 : Math.sin(t * 9) * 0.08;
      hist2.push(sample); hist2.shift();
      ctx2.beginPath();
      hist2.forEach((v, i) => {
        const x = (i / (hist2.length - 1)) * w;
        const y = h * 0.55 - v * h * 0.38;
        if (i === 0) ctx2.moveTo(x, y); else ctx2.lineTo(x, y);
      });
      ctx2.strokeStyle = "#6dff7a";
      ctx2.lineWidth = 2;
      ctx2.stroke();
      requestAnimationFrame(drawRadar2);
    })();
  }

  const decks = {
    iphone: {
      title: "iPhone 13+ · HealthKit deck",
      push: "APNs",
      fps: "30 FPS",
      html: "<h3>iPhone 13 / 14 / 15 / 16</h3><p>SwiftUI command deck. Live radar waveform, HealthKit BPM write, CoreBluetooth to the UWB puck, APNs fall banner, WidgetKit lock-screen pulse, Live Activities while an incident is open.</p><ul class=\"deck-list\"><li>Minimum: iPhone 13 · iOS 16</li><li>Radar waveform + zone map</li><li>BPM mirrored into HealthKit</li><li>Range lock on Live Activity</li></ul>"
    },
    android: {
      title: "Android · Compose field unit",
      push: "FCM",
      fps: "30 FPS",
      html: "<h3>Android 12+</h3><p>Kotlin / Jetpack Compose field unit. Foreground radar service keeps BPM and range alive with the screen off. FCM pushes falls. Material You adaptive layout for compact and foldables.</p><ul class=\"deck-list\"><li>Minimum: Android 12</li><li>BLE to the radar puck</li><li>BPM + range in a persistent notification</li><li>WorkManager mesh sync</li></ul>"
    },
    laptop: {
      title: "Laptop · Electron ops",
      push: "WebSocket",
      fps: "60 Hz UI",
      html: "<h3>macOS / Windows laptop</h3><p>Electron + React + Recharts factory console. Full radar FFT, multi-zone map, health %, keyboard shortcuts for Mr. Wayne. Same BPM and lock-range as the phones, just a wider glass.</p><ul class=\"deck-list\"><li>Vibration + heartbeat side by side</li><li>Range lock across every zone</li><li>Grafana embed for history</li></ul>"
    },
    watch: {
      title: "Watch · haptic satellite",
      push: "Haptic",
      fps: "complication",
      html: "<h3>Apple Watch / Wear OS</h3><p>Satellite of the phone mesh — not a standalone radar. Live BPM, Zone chip, range in meters, tap-for-emergency, haptic fall. The same three numbers as the iPhone deck, on the wrist.</p><ul class=\"deck-list\"><li>78 BPM live complication</li><li>Range + zone on the watch face</li><li>Haptic when motion lock breaks into a fall</li></ul>"
    }
  };
  document.querySelectorAll("#console-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#console-tabs button").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      const d = decks[btn.dataset.deck];
      document.getElementById("deck-title").textContent = d.title;
      document.getElementById("deck-push").textContent = d.push;
      document.getElementById("deck-fps").textContent = d.fps;
      document.getElementById("deck-copy").innerHTML = d.html;
    });
  });

  function startMusic() {
    theme.volume = Number(document.getElementById("vol").value) / 100;
    theme.play().then(() => {
      musicOn = true;
      document.getElementById("btn-music").textContent = "Mute";
    }).catch(() => {});
  }
  function stopMusic() {
    theme.pause();
    musicOn = false;
    document.getElementById("btn-music").textContent = "Music";
  }

  document.getElementById("enter").addEventListener("click", () => {
    gate.remove();
    startMusic();
    speak("welcome");
  });
  document.getElementById("enter-quiet").addEventListener("click", () => gate.remove());
  document.getElementById("btn-music").addEventListener("click", () => musicOn ? stopMusic() : startMusic());
  document.getElementById("vol").addEventListener("input", (e) => {
    theme.volume = Number(e.target.value) / 100;
  });

  document.querySelectorAll("[data-cmd]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cmd = btn.dataset.cmd;
      if (["devices", "stack", "privacy", "stealth", "console", "lab"].includes(cmd)) {
        const el = document.getElementById(cmd);
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }
      speak(cmd);
    });
  });

  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  const listenBtn = document.getElementById("btn-listen");
  if (Speech) {
    const rec = new Speech();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const said = ev.results[0][0].transcript.toLowerCase();
      caption.textContent = "Heard: “" + said + "”";
      const key = ["help", "status", "devices", "stack", "privacy", "capabilities", "fall", "operations", "music", "mute"]
        .find((w) => said.includes(w));
      if (key === "music") startMusic();
      else if (key === "mute") stopMusic();
      else if (key === "operations") speak("ops");
      else speak(key || "unknown");
      listenBtn.classList.remove("live");
    };
    rec.onend = () => listenBtn.classList.remove("live");
    listenBtn.addEventListener("click", () => {
      speak("listen");
      listenBtn.classList.add("live");
      setTimeout(() => rec.start(), 700);
    });
  } else {
    listenBtn.addEventListener("click", () => speak("help"));
  }

  function detectMode() {
    const ua = navigator.userAgent;
    if (/watch/i.test(ua)) return "watch";
    if (/iPhone|Android.+Mobile/i.test(ua)) return "phone";
    return "laptop";
  }
  function applyMode(mode) {
    const resolved = mode === "auto" ? detectMode() : mode;
    document.body.classList.remove("mode-phone", "mode-laptop", "mode-watch", "mode-glasses");
    document.body.classList.add("mode-" + resolved);
    document.getElementById("watch-face").hidden = resolved !== "watch";
    document.getElementById("glasses-hud").hidden = resolved !== "glasses";
    document.getElementById("link-label").textContent =
      resolved === "watch" ? "WATCH MESH" :
      resolved === "glasses" ? "AR HUD LOCKED" :
      resolved === "phone" ? "PHONE DECK · iOS/ANDROID" :
      "LAPTOP OPS · AES-256";
    document.querySelectorAll("#device-bar button").forEach((b) => {
      b.classList.toggle("on", b.dataset.mode === mode);
    });
  }
  document.querySelectorAll("#device-bar button").forEach((b) => {
    b.addEventListener("click", () => applyMode(b.dataset.mode));
  });
  applyMode("auto");

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  const labVideo = document.getElementById("lab-video");
  const labCanvas = document.getElementById("lab-canvas");
  const labCtx = labCanvas.getContext("2d", { willReadFrequently: true });
  const labMode = document.getElementById("lab-mode");
  const labRange = document.getElementById("lab-range");
  const labMotion = document.getElementById("lab-motion");
  let labStream = null;
  let bgData = null;
  let vanishOn = false;
  let thermalOn = false;
  let labLoop = 0;

  function heat(r, g, b) {
    const t = (r * 0.3 + g * 0.5 + b * 0.2) / 255;
    if (t < 0.33) return [0, Math.floor(t * 3 * 80), Math.floor(40 + t * 80)];
    if (t < 0.66) return [Math.floor((t - 0.33) * 3 * 220), 40, 0];
    return [255, Math.floor((t - 0.66) * 3 * 180), 0];
  }

  function labTick() {
    if (!labStream) return;
    const w = labCanvas.width, h = labCanvas.height;
    labCtx.drawImage(labVideo, 0, 0, w, h);
    const frame = labCtx.getImageData(0, 0, w, h);
    const d = frame.data;
    let changed = 0;
    if (bgData) {
      const b = bgData.data;
      for (let i = 0; i < d.length; i += 16) {
        const diff = Math.abs(d[i] - b[i]) + Math.abs(d[i + 1] - b[i + 1]) + Math.abs(d[i + 2] - b[i + 2]);
        if (diff > 70) changed++;
      }
    }
    const motion = Math.min(100, Math.round((changed / (d.length / 16)) * 400));
    labMotion.textContent = motion + "%";
    labRange.textContent = motion > 8 ? (1.2 + (100 - motion) / 80).toFixed(1) + "m" : "clear";

    if ((vanishOn && bgData) || thermalOn) {
      const b = bgData ? bgData.data : null;
      for (let i = 0; i < d.length; i += 4) {
        let useBg = false;
        if (vanishOn && b) {
          const diff = Math.abs(d[i] - b[i]) + Math.abs(d[i + 1] - b[i + 1]) + Math.abs(d[i + 2] - b[i + 2]);
          useBg = diff > 55;
        }
        if (useBg) {
          d[i] = b[i]; d[i + 1] = b[i + 1]; d[i + 2] = b[i + 2];
        } else if (thermalOn) {
          const c = heat(d[i], d[i + 1], d[i + 2]);
          d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
        }
      }
      labCtx.putImageData(frame, 0, 0);
    }
    labLoop = requestAnimationFrame(labTick);
  }

  document.getElementById("lab-arm").addEventListener("click", async () => {
    try {
      labStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 960, height: 540 }, audio: false });
      labVideo.srcObject = labStream;
      await labVideo.play();
      labMode.textContent = "RGB LIVE";
      cancelAnimationFrame(labLoop);
      labTick();
    } catch (e) {
      labMode.textContent = "CAMERA BLOCKED";
      document.getElementById("lab-help").textContent = "Allow the camera in the browser prompt. iPhone: Safari settings → Camera.";
    }
  });
  document.getElementById("lab-bg").addEventListener("click", () => {
    if (!labStream) return;
    bgData = labCtx.getImageData(0, 0, labCanvas.width, labCanvas.height);
    labMode.textContent = "ROOM LOCKED";
  });
  document.getElementById("lab-vanish").addEventListener("click", () => {
    if (!bgData) {
      labMode.textContent = "CAPTURE ROOM FIRST";
      return;
    }
    vanishOn = !vanishOn;
    labMode.textContent = vanishOn ? (thermalOn ? "VANISH + THERMAL" : "VANISH") : (thermalOn ? "THERMAL" : "RGB LIVE");
  });
  document.getElementById("lab-thermal").addEventListener("click", () => {
    thermalOn = true;
    labMode.textContent = vanishOn ? "VANISH + THERMAL" : "THERMAL";
  });
  document.getElementById("lab-rgb").addEventListener("click", () => {
    thermalOn = false;
    labMode.textContent = vanishOn ? "VANISH" : "RGB LIVE";
  });
  document.getElementById("lab-fall").addEventListener("click", () => {
    applyMode("watch");
    speak("fall");
    document.getElementById("watch-face").hidden = false;
    setTimeout(() => {
      if (!document.body.classList.contains("mode-watch")) document.getElementById("watch-face").hidden = true;
    }, 5000);
  });
  document.getElementById("lab-stop").addEventListener("click", () => {
    cancelAnimationFrame(labLoop);
    vanishOn = false;
    thermalOn = false;
    bgData = null;
    if (labStream) labStream.getTracks().forEach((t) => t.stop());
    labStream = null;
    labMode.textContent = "STANDBY";
    labCtx.clearRect(0, 0, labCanvas.width, labCanvas.height);
  });
})();

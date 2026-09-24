const VO = {
  intro: { src: "audio/vo_intro.mp3", text: "Clearance accepted. This is Coach Colin. You are inside the EMPx briefing. Software EMP. No hardware. One detonator. Every screen. Same pulse." },
  arch: { src: "audio/vo_arch.mp3", text: "Architecture. One laptop is the detonator. Node, sockets, Firebase, Supabase, or MQTT. Under fifty milliseconds. Instant sync." },
  sequence: { src: "audio/vo_sequence.mp3", text: "Three stages. Warning. Pulse. Blackout. Critical anomaly. Then the hit. Then pure black and a fake BIOS restore." },
  devices: { src: "audio/vo_devices.mp3", text: "Phones glitch. Laptops panic. Glasses throw an EM wave through the room. Watches spike heart rate then go dead." },
  stack: { src: "audio/vo_stack.mp3", text: "Weekend build. Same local URL. Emit EMP_PULSE. Or Flutter, Unity, Firebase. Or Figma plus AirPlay." },
  close: { src: "audio/vo_close.mp3", text: "Integrated EMP defense simulation. Isolated devices now on one mesh. Reversible. Demo ready. You are clear to discharge." }
};

const voEl = document.getElementById("vo");
const bgm = document.getElementById("bgm");
const recv = document.getElementById("recv");
const recvText = document.getElementById("recvText");
const enterBtn = document.getElementById("enterBtn");
const gate = document.getElementById("gate");
const empBtn = document.getElementById("empBtn");
const overlay = document.getElementById("empOverlay");
const musicBtn = document.getElementById("musicBtn");
const muteVo = document.getElementById("muteVo");

let voMuted = false;
let lastVo = null;
const played = new Set();

function playVo(key, force) {
  const clip = VO[key];
  if (!clip) return;
  if (voMuted) { recvText.textContent = clip.text; return; }
  if (!force && lastVo === key && !voEl.paused) return;
  lastVo = key;
  recvText.textContent = clip.text;
  voEl.src = clip.src;
  voEl.volume = 1;
  recv.classList.add("talking");
  voEl.play().catch(() => {});
}
voEl.addEventListener("ended", () => recv.classList.remove("talking"));

document.querySelectorAll("[data-vo]").forEach((btn) => {
  if (btn.tagName === "BUTTON") {
    btn.addEventListener("click", () => playVo(btn.dataset.vo, true));
  }
});

muteVo.addEventListener("click", () => {
  voMuted = !voMuted;
  muteVo.textContent = voMuted ? "VO OFF" : "VO";
  if (voMuted) { voEl.pause(); recv.classList.remove("talking"); }
});

musicBtn.addEventListener("click", () => {
  if (bgm.paused) { bgm.volume = 0.28; bgm.play(); musicBtn.textContent = "♪ SCORE"; }
  else { bgm.pause(); musicBtn.textContent = "♪ MUTED"; }
});

enterBtn.addEventListener("click", async () => {
  gate.style.transition = "opacity .7s";
  gate.style.opacity = "0";
  bgm.volume = 0.28;
  try { await bgm.play(); } catch (_) {}
  playVo("intro", true);
  setTimeout(() => gate.remove(), 720);
});

/* clock */
const clock = document.getElementById("clock");
setInterval(() => {
  const d = new Date();
  const t = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
  clock.textContent = t;
}, 1000);

/* grain */
(function grain() {
  const c = document.getElementById("grain");
  const ctx = c.getContext("2d");
  c.width = 180; c.height = 180;
  function tick() {
    const id = ctx.createImageData(180, 180);
    const d = id.data;
    for (let i = 0; i < d.length; i += 16) {
      const v = Math.random() * 255;
      d[i] = d[i+1] = d[i+2] = v; d[i+3] = 40;
    }
    ctx.putImageData(id, 0, 0);
    setTimeout(tick, 80);
  }
  tick();
})();

/* scroll: colin walk + 3d tilt + vo triggers */
const far = document.querySelector(".c-far");
const mid = document.querySelector(".c-mid");
const near = document.querySelector(".c-near");
const cards = document.querySelectorAll(".card3d");
const screens = document.querySelectorAll(".holo-screen");

function onScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  const p = max > 0 ? scrollY / max : 0;

  far.classList.toggle("on", p < 0.38);
  mid.classList.toggle("on", p >= 0.22 && p < 0.68);
  near.classList.toggle("on", p >= 0.55);
  const scale = 0.88 + p * 0.28;
  document.querySelectorAll(".colin.on").forEach((img) => {
    img.style.transform = `scale(${scale}) translateY(${(0.5-p)*20}px)`;
  });

  const tilt = (p - 0.5) * 16;
  screens.forEach((s, i) => {
    const dir = i % 2 === 0 ? -1 : 1;
    s.style.transform = `rotateY(${dir * (10 + tilt)}deg) rotateX(${6 - tilt * 0.4}deg)`;
  });
}
addEventListener("scroll", onScroll, { passive: true });
onScroll();

if (window.gsap && window.ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger);
  document.querySelectorAll(".sec").forEach((sec) => {
    const key = sec.dataset.vo;
    ScrollTrigger.create({
      trigger: sec,
      start: "top 55%",
      onEnter: () => { if (!played.has(key)) { played.add(key); playVo(key); } },
      onEnterBack: () => playVo(key)
    });
    gsap.from(sec.querySelectorAll("h2, .lede, .card3d, .stage, .holo-screen, .stack-grid > div"), {
      scrollTrigger: { trigger: sec, start: "top 75%" },
      y: 40, opacity: 0, duration: 0.8, stagger: 0.08, ease: "power2.out"
    });
  });
} else {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        const key = e.target.dataset.vo;
        if (key && !played.has(key)) { played.add(key); playVo(key); }
      }
    });
  }, { threshold: 0.45 });
  document.querySelectorAll(".sec").forEach((s) => io.observe(s));
}

/* 3d cards follow pointer */
document.querySelectorAll(".card3d").forEach((card) => {
  card.addEventListener("mousemove", (e) => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform = `rotateY(${x * 18}deg) rotateX(${-y * 14}deg)`;
  });
  card.addEventListener("mouseleave", () => { card.style.transform = ""; });
});

/* EMP discharge */
let holdTimer = null;
empBtn.addEventListener("mousedown", startHold);
empBtn.addEventListener("touchstart", startHold, { passive: true });
empBtn.addEventListener("mouseup", cancelHold);
empBtn.addEventListener("mouseleave", cancelHold);
empBtn.addEventListener("touchend", cancelHold);
empBtn.addEventListener("touchcancel", cancelHold);
empBtn.addEventListener("contextmenu", (e) => e.preventDefault());

function startHold() {
  holdTimer = setTimeout(runEmp, 1200);
  empBtn.style.filter = "brightness(1.4)";
}
function cancelHold() {
  clearTimeout(holdTimer);
  empBtn.style.filter = "";
}
function runEmp() {
  overlay.hidden = false;
  overlay.className = "emp-overlay";
  overlay.querySelector(".big").textContent = "WARNING";
  setTimeout(() => {
    overlay.classList.add("static");
    overlay.querySelector(".big").textContent = "PULSE";
    document.body.style.filter = "contrast(1.6) saturate(0.2)";
  }, 700);
  setTimeout(() => {
    overlay.classList.add("black");
    overlay.classList.remove("static");
    overlay.querySelector(".big").textContent = "_";
    document.body.style.filter = "brightness(0)";
  }, 1300);
  setTimeout(() => {
    document.body.style.filter = "";
    overlay.querySelector(".big").textContent = "SYSTEM RESTORED";
    overlay.classList.remove("black");
  }, 3200);
  setTimeout(() => { overlay.hidden = true; overlay.className = "emp-overlay"; }, 4600);
}

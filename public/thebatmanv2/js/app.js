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

  let lastY = window.scrollY;
  let lastMove = Date.now();
  let step = 0;
  let facing = 1;

  const zones = [...document.querySelectorAll("section[data-zone]")];

  function setFrame(name) {
    Object.entries(frames).forEach(([key, el]) => {
      el.classList.toggle("on", key === name);
    });
  }

  function updateWalker() {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const t = window.scrollY / max;
    progress.style.width = `${t * 100}%`;

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
    walker.style.transform = `translate3d(${x}px, ${bob}px, 0)`;
    glow.style.transform = `translate3d(${x + walkerW * 0.28}px, 0, 0)`;

    const mid = window.scrollY + window.innerHeight * 0.55;
    let zone = "PERIMETER";
    for (const s of zones) {
      if (mid >= s.offsetTop && mid < s.offsetTop + s.offsetHeight) {
        zone = s.dataset.zone;
      }
    }
    toast.querySelector("b").textContent = `ZONE · ${zone}`;
    toast.querySelector("span").textContent =
      facing > 0
        ? "Forward patrol · motion locked"
        : "Retracing the grid · still watching";
  }

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        updateWalker();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
  window.addEventListener("resize", updateWalker);
  updateWalker();

  function pad(n) { return String(n).padStart(2, "0"); }
  setInterval(() => {
    const d = new Date();
    clock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    const bpm = 74 + Math.round(Math.sin(Date.now() / 900) * 5 + Math.random() * 2);
    bpmEl.textContent = String(bpm);
    rangeEl.textContent = (2.2 + Math.sin(Date.now() / 1400) * 0.3).toFixed(1) + "m";
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
    const sample =
      beat > 0.72 ? 1 :
      beat > 0.62 ? -0.35 :
      Math.sin(t * 9) * 0.08 + Math.sin(t * 2.1) * 0.04;
    hist.push(sample);
    hist.shift();

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

    const sweep = ((t * 0.15) % 1) * w;
    const g = ctx.createLinearGradient(sweep - 80, 0, sweep + 20, 0);
    g.addColorStop(0, "transparent");
    g.addColorStop(1, "rgba(92,225,255,0.18)");
    ctx.fillStyle = g;
    ctx.fillRect(sweep - 80, 0, 100, h);

    requestAnimationFrame(drawRadar);
  }
  drawRadar();
})();

/* Post-fight film study — Stryker-style live + post analysis */
const FILM = {
  a: "Tony",
  b: "Jose",
  totals: [
    ["STRIKES", 42, 38],
    ["SIG. STRIKES", 30, 28],
    ["AGGRESSION", 75, 72],
    ["EFF. STRIKING", 72, 70],
    ["EFF. GRAPPLING", 0, 0],
    ["CONTROL", 68, 71],
    ["TAKEDOWNS", 0, 0],
    ["SUB ATTEMPTS", 0, 0],
  ],
  rounds: [
    { a: 10, aiq: 74, b: 9, biq: 73, note: "Fighter A controlled the tempo.", winner: "Tony" },
    { a: 10, aiq: 76, b: 9, biq: 72, note: "Volume and pressure. Jose's exits were cleaner late.", winner: "Tony" },
    { a: 9, aiq: 71, b: 10, biq: 75, note: "Jose stole the round with ring generalship.", winner: "Jose" },
  ],
  steps: [
    "Preparing video…",
    "Tracking Fighter A and Fighter B…",
    "Detecting strikes…",
    "Analyzing control and aggression…",
    "Scoring Round 1…",
    "Scoring Round 2…",
    "Scoring Round 3…",
    "Generating TheJudgeV1 scorecard…",
  ],
};

function renderTotals() {
  $("#totals-body").innerHTML = FILM.totals.map(([s, a, b]) =>
    `<tr><td class="col-a">${a}</td><td class="stat">${s}</td><td class="col-b">${b}</td></tr>`
  ).join("");
}

function renderRounds() {
  $("#rbr").innerHTML = FILM.rounds.map((r, i) => `
    <div style="margin:12px 0">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b>Round ${i + 1}</b><span class="badge">${r.winner}</span>
      </div>
      <div class="round-lux">
        <div class="box col-a"><div class="sub">${FILM.a.toUpperCase()}</div><div class="pts">${r.a} <span class="iqn">· ${r.aiq}</span></div></div>
        <div class="box col-b"><div class="sub">${FILM.b.toUpperCase()}</div><div class="pts">${r.b} <span class="iqn">· ${r.biq}</span></div></div>
      </div>
      <p class="sub">${r.note}</p>
    </div>`).join("");
}

function startFilmStudy() {
  if (typeof showView === "function") showView("film");
  renderTotals();
  renderRounds();
  const list = $("#film-pipe");
  list.innerHTML = FILM.steps.map((s) => `<li><span>○</span><span>${s}</span></li>`).join("");
  $("#pipe-head").textContent = "Analyzing control and aggression…";
  $("#film-done").textContent = "ANALYZING…";
  let i = 0;
  const tick = () => {
    const items = [...list.children];
    items.forEach((li, idx) => {
      const mark = li.querySelector("span");
      if (idx < i) { mark.textContent = "✓"; mark.className = "ok"; }
      else if (idx === i) { mark.textContent = "●"; mark.className = "run"; $("#pipe-head").textContent = FILM.steps[i]; }
    });
    i += 1;
    if (i <= FILM.steps.length) setTimeout(tick, 700);
    else {
      $("#pipe-head").textContent = "ANALYSIS COMPLETE";
      $("#film-done").textContent = "ANALYSIS COMPLETE · 85% CONFIDENCE · BOXING";
      $("#film-conf").textContent = "85%";
      if (typeof speakKey === "function") speakKey("score");
    }
  };
  tick();
}

function loadFightClip(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const v = $("#film-vid");
  const img = $("#film-still");
  v.src = url;
  v.style.display = "block";
  img.style.display = "none";
  v.play().catch(() => {});
  startFilmStudy();
}

window.startFilmStudy = startFilmStudy;
window.loadFightClip = loadFightClip;

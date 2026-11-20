// The film engine. One paused GSAP timeline is the only clock: the page, the stage's light and any 3D layer are all
// drawn from the time the timeline is at, so any frame can be rendered by seeking to it.
//
//   const film = await createFilm({ storyboard });      // storyboard.json is the source of every time
//   const s = film.shots;                               // s.s04.start, s.s04.end, s.s04.dur
//   film.scene("#s04", s.s04.start, s.s04.end);
//   film.typeIn(film.split("#title"), s.s04.start + 0.2);
//   film.finish();
//
// Rules that keep a film seekable:
// - never read the wall clock, never start a CSS animation or a requestAnimationFrame loop;
// - anything GSAP cannot tween exactly (canvas drawing, typed text, a dash offset, a counter) keeps its value in a
//   plain object the timeline tweens, and draws it in a function passed to film.each();
// - a fromTo() on state that an earlier tween also animates takes immediateRender: false.
import { createBackdrop } from "./stage.js";

const hex = (value) => {
  const n = Number.parseInt(value.replace("#", ""), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
};

export async function createFilm({ storyboard, duration = storyboard?.duration, tint = storyboard?.look?.accent ?? "#ffb90e" } = {}) {
  const gsap = window.gsap;
  const $ = (sel) => (typeof sel === "string" ? document.querySelector(sel) : sel);
  const $$ = (sel) => (typeof sel === "string" ? [...document.querySelectorAll(sel)] : [].concat(sel));
  await document.fonts.ready;
  // The frame's size comes from the storyboard: "1920x1080" for a landscape film, "1080x1920" for a short.
  const [W, H] = (storyboard?.format ?? "1920x1080").split("x").map(Number);
  const portrait = H > W;
  document.documentElement.style.setProperty("--W", `${W}px`);
  document.documentElement.style.setProperty("--H", `${H}px`);
  document.documentElement.dataset.format = portrait ? "portrait" : "landscape";
  // The narration's measured lines, when the film has any (kit/audio/voice.mjs writes them).
  let voiced = {};
  if ((storyboard?.shots ?? []).some((shot) => shot.voice)) {
    try {
      const response = await fetch("voice/voice.json");
      if (response.ok) {
        const recorded = await response.json();
        // A film cut to one take knows when every word is said, in the film's own time.
        voiced = recorded.version === 2 ? Object.fromEntries(Object.entries(recorded.film ?? {}).map(([id, line]) => [id, { ...line, exact: true }])) : (recorded.lines ?? {});
      }
    } catch {}
  }
  const narrated = Object.keys(voiced).length > 0;

  // The parts every film has: the stage canvas behind the scenes, a flash and a vignette over them, filter defs.
  const root = $("#root");
  let canvas = $("#backdrop");
  if (!canvas) {
    canvas = Object.assign(document.createElement("canvas"), { id: "backdrop", width: W, height: H });
    root.prepend(canvas);
  }
  // A film's own canvases are the size of the frame unless they say otherwise.
  for (const own of root.querySelectorAll("canvas:not([width])")) Object.assign(own, { width: W, height: H });
  for (const id of ["flash", "vignette"]) {
    if (!$(`#${id}`)) root.append(Object.assign(document.createElement("div"), { id }));
  }
  document.body.insertAdjacentHTML("beforeend", '<svg class="defs" width="0" height="0" aria-hidden="true"><defs id="filters"></defs></svg>');

  const backdrop = createBackdrop(canvas);
  const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
  const stage = { t: 0, lx: 0.5, ly: 0.6, glow: 0.6, ...hex(tint), floor: 1, horizon: -0.16, camx: 0, camy: 0, pr: 0, ps: 0, flash: 0, streak: 0, silk: 1 };
  const jobs = [];
  const each = (job) => jobs.push(job);
  // Jobs that read the finished frame (after every each() job and the backdrop have drawn it).
  const afterJobs = [];

  // Shot times come from the storyboard, so the film and its plan cannot drift apart.
  const shots = {};
  for (const shot of storyboard?.shots ?? []) shots[shot.id] = { ...shot, dur: shot.end - shot.start };

  // ── Showing and hiding ───────────────────────────────────────────────────
  const show = (sel, at, d = 0.4) => tl.to(sel, { autoAlpha: 1, duration: d, ease: "power1.out" }, at);
  const hide = (sel, at, d = 0.35) => tl.to(sel, { autoAlpha: 0, duration: d, ease: "power1.in" }, at);
  // A scene is on screen from start to end and costs nothing outside that window.
  const scene = (sel, start, end, { fadeIn = 0, fadeOut = 0 } = {}) => {
    if (start <= 0) gsap.set(sel, { autoAlpha: 1 });
    else if (fadeIn) show(sel, start, fadeIn);
    else tl.set(sel, { autoAlpha: 1 }, start);
    if (end < duration) {
      if (fadeOut) hide(sel, end - fadeOut, fadeOut);
      else tl.set(sel, { autoAlpha: 0 }, end);
    }
  };
  // Things rise into place, one after another.
  const land = (sel, at, vars = {}) => {
    gsap.set(sel, { opacity: 0, y: vars.from ?? 26 });
    const { from: _from, ...rest } = vars;
    tl.to(sel, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out", ...rest }, at);
  };
  const pop = (sel, at, vars = {}) => {
    gsap.set(sel, { opacity: 0, scale: 0.5 });
    tl.to(sel, { opacity: 1, scale: 1, duration: 0.55, ease: "back.out(1.9)", ...vars }, at);
  };

  // ── Type ─────────────────────────────────────────────────────────────────
  // Splits a heading into words and characters and records where each character sits on its line, so the metal fill
  // and the sheen (film.css: --cx, --sx) read as one surface across the whole line.
  const split = (sel) => {
    const el = $(sel);
    if (el.dataset.split) return [...el.querySelectorAll(".ch")];
    el.dataset.split = "1";
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType !== 3) {
          walk(child);
          continue;
        }
        const frag = document.createDocumentFragment();
        for (const word of child.textContent.split(/(\s+)/)) {
          if (!word) continue;
          if (/^\s+$/.test(word)) {
            frag.append(document.createTextNode(" "));
            continue;
          }
          const w = Object.assign(document.createElement("span"), { className: "w" });
          for (const c of word) w.append(Object.assign(document.createElement("span"), { className: "ch", textContent: c }));
          frag.append(w);
        }
        child.replaceWith(frag);
      }
    };
    walk(el);
    const chars = [...el.querySelectorAll(".ch")];
    for (const ch of chars) {
      const line = ch.closest(".ln") || el;
      ch.style.setProperty("--cx", `${Math.round(ch.getBoundingClientRect().left - line.getBoundingClientRect().left)}px`);
    }
    return chars;
  };
  const typeIn = (chars, at, vars = {}) => {
    gsap.set(chars, { opacity: 0, yPercent: 55, filter: "blur(14px)" });
    tl.to(chars, { opacity: 1, yPercent: 0, filter: "blur(0px)", duration: 0.62, ease: "power3.out", stagger: 0.022, ...vars }, at);
  };
  const typeOut = (chars, at, vars = {}) =>
    tl.to(chars, { opacity: 0, yPercent: -45, filter: "blur(12px)", duration: 0.34, ease: "power2.in", stagger: 0.01, ...vars }, at);
  // A band of light crossing the letters.
  const sheen = (sel, at, d = 0.9) => tl.fromTo(sel, { "--sx": "-320px" }, { "--sx": `${$(sel).offsetWidth + 320}px`, duration: d, ease: "power2.inOut" }, at);

  // ── Fast moves ───────────────────────────────────────────────────────────
  // Motion blur for a whole scene: a directional blur the timeline drives. Returns blur(at, duration, x, y).
  const motionBlur = (sel) => {
    const id = `mb-${sel.replace(/\W/g, "")}`;
    $("#filters").insertAdjacentHTML(
      "beforeend",
      `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0 0"/></filter>`,
    );
    const node = $(`#${id} feGaussianBlur`);
    const el = $(sel);
    const state = { x: 0, y: 0 };
    each(() => {
      const on = state.x > 0.05 || state.y > 0.05;
      if (on) node.setAttribute("stdDeviation", `${state.x.toFixed(2)} ${state.y.toFixed(2)}`);
      el.style.filter = on ? `url(#${id})` : "";
    });
    return (at, d, x, y) => {
      tl.to(state, { x, y, duration: d * 0.5, ease: "power2.in" }, at);
      tl.to(state, { x: 0, y: 0, duration: d * 0.5, ease: "power2.out" }, at + d * 0.5);
    };
  };
  // A hit: a flash and a shock ring on the stage, for the moments the sound lands on.
  const hit = (at, strength = 0.9, ring = 0.4) => {
    tl.set("#flash", { opacity: strength * 0.5 }, at);
    tl.to("#flash", { opacity: 0, duration: 0.34, ease: "power2.out" }, at + 0.04);
    tl.set(stage, { flash: strength, pr: 0, ps: ring }, at);
    tl.to(stage, { flash: 0, duration: 0.4, ease: "power2.out" }, at + 0.03);
    tl.to(stage, { pr: 1.7, ps: 0, duration: 1.1, ease: "power2.out" }, at + 0.02);
  };
  // A whip pan between two scenes: the outgoing one leaves, the blur peaks on the cut, and the stage travels too.
  const whip = (from, to, at, { vertical = false, blur } = {}) => {
    tl.to(from, vertical ? { y: -H * 0.83, duration: 0.3, ease: "power3.in" } : { x: -W * 0.57, duration: 0.3, ease: "power3.in" }, at - 0.3);
    tl.set(from, { autoAlpha: 0 }, at);
    tl.fromTo(to, vertical ? { y: H * 0.7 } : { x: W * 0.47 }, { x: 0, y: 0, duration: 0.5, ease: "expo.out", immediateRender: false }, at);
    tl.set(to, { autoAlpha: 1 }, at);
    blur?.(at - 0.26, 0.56, vertical ? 0 : 70, vertical ? 56 : 0);
    tl.to(stage, vertical ? { camy: "+=3.2", duration: 0.6, ease: "power3.inOut" } : { camx: "+=3.4", duration: 0.6, ease: "power3.inOut" }, at - 0.3);
  };

  // ── The stage's light ────────────────────────────────────────────────────
  const light = (vars, at, d = 0.8, ease = "power3.inOut") => tl.to(stage, { ...vars, duration: d, ease }, at);
  const tintTo = (colour, at, d = 1.2) => tl.to(stage, { ...hex(colour), duration: d, ease: "power2.inOut" }, at);

  // ── Values GSAP cannot hold exactly ──────────────────────────────────────
  // Draws an SVG path from its start: the path needs pathLength="1".
  const draw = (sel, at, d = 0.8, ease = "power2.inOut") => {
    for (const path of $$(sel)) {
      const state = { off: 1 };
      path.style.strokeDasharray = "1";
      each(() => {
        path.style.strokeDashoffset = state.off.toFixed(4);
        path.style.visibility = state.off >= 0.9999 ? "hidden" : "visible";
      });
      tl.to(state, { off: 0, duration: d, ease }, at);
    }
  };
  // Counts a number up or down in an element.
  const count = (sel, from, to, at, d = 1, format = (v) => v.toFixed(1)) => {
    const el = $(sel);
    const state = { v: from };
    each(() => {
      const text = format(state.v);
      if (el.textContent !== text) el.textContent = text;
    });
    tl.to(state, { v: to, duration: d, ease: "power2.out" }, at);
  };

  // ── Captions ─────────────────────────────────────────────────────────────
  // Every shot's caption from the storyboard, set at the bottom of the frame and read in by word. Words wrapped in
  // *stars* in the storyboard take the accent colour. One source of truth: change the storyboard, the film follows.
  // The words on screen. Three styles: "pill" (a glass bar near the bottom, the default for landscape), "pop" (a
  // few large words at a time, the default for portrait shorts) and "frame" (the top of the frame, a short line in
  // two weights: the words not yet said dim, each lit as it is said, and the shot's key words drawn inside a
  // selection frame with corner handles, the way the best product shorts letter their narration). A shot's
  // "keys": ["word", ...] names the words that get the frame (the narration itself stays plain).
  // In a film with no voice the caption carries the explanation. In a film that speaks, repeating the narration
  // word for word on screen makes it harder to follow, not easier, so a pill shows only a shot's "caption" (its key
  // phrase) and stays out of the way otherwise; set "subtitles": true in the storyboard to show every spoken line.
  // Pop captions do show what is said: a short is often watched with the sound off.
  // With a take that has word times, each word appears as it is said.
  const VOICE_LEAD = 0.15;
  const captions = ({ lead = 0.12, tail = 0.1, style = storyboard.captions ?? (portrait ? "pop" : "pill"), chunk } = {}) => {
    let box = $("#captions");
    if (!box) {
      box = Object.assign(document.createElement("div"), { id: "captions" });
      $("#vignette").before(box);
    }
    box.dataset.style = style;
    // A backing plate where the picture behind a caption is light: after each frame is drawn, the band behind every
    // caption on screen is read from the canvases (backdrop first, then the rest in page order, as they composite)
    // and its mean luminance sets the caption's --plate (0 over a dark picture, 1 from about 0.6 up). Read from the
    // frame itself, so every frame decides alone and a seek renders the same thing.
    const probe = Object.assign(document.createElement("canvas"), { width: 48, height: 12 });
    const pc = probe.getContext("2d", { willReadFrequently: true });
    afterJobs.push(() => {
      const shown = [...box.querySelectorAll(".caption")].filter((el) => el.style.visibility !== "hidden" && +getComputedStyle(el).opacity > 0.01);
      if (!shown.length) return;
      const layers = [...root.querySelectorAll("canvas")].filter((c) => c.width > 0 && getComputedStyle(c).visibility !== "hidden");
      for (const el of shown) {
        const r = el.getBoundingClientRect();
        pc.clearRect(0, 0, 48, 12);
        for (const c of layers) {
          const cb = c.getBoundingClientRect();
          const kx = c.width / cb.width, ky = c.height / cb.height;
          try {
            pc.drawImage(c, (r.left - cb.left) * kx, (r.top - cb.top) * ky, r.width * kx, r.height * ky, 0, 0, 48, 12);
          } catch {}
        }
        const d = pc.getImageData(0, 0, 48, 12).data;
        let lum = 0;
        for (let i = 0; i < d.length; i += 4) lum += ((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255) * (d[i + 3] / 255);
        lum /= d.length / 4;
        el.style.setProperty("--plate", Math.max(0, Math.min(1, (lum - 0.4) / 0.2)).toFixed(3));
      }
    });
    const limit = chunk ?? (style === "pop" ? { words: 3, chars: 18 } : style === "frame" ? { words: 5, chars: portrait ? 24 : 40 } : { words: 99, chars: portrait ? 56 : 92 });
    const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, "");
    for (const shot of storyboard.shots) {
      // "caption": false keeps a voiced shot's line off the screen (when the picture itself letters it).
      const said = shot.voice ? shot.voice.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim() : null;
      const subtitles = style === "pop" || style === "frame" || !narrated || storyboard.subtitles === true;
      const keys = new Set((shot.keys ?? []).map(norm));
      const text = shot.caption === false ? null : (shot.caption ?? (subtitles ? said : null));
      if (!text) continue;
      // Words, each knowing whether it carries the accent.
      const tokens = [];
      let joined = false; // the last part ended mid-word, against the next one ("*9/10*-nya")
      for (const part of text.split(/(\*[^*]+\*)/)) {
        if (!part) continue;
        const strong = part.startsWith("*");
        const inner = strong ? part.slice(1, -1) : part;
        inner.split(/\s+/).filter(Boolean).forEach((word, k) => {
          // Punctuation left outside the stars ("*Suara*?") belongs to the word before it.
          if (/^[.,;:!?)…]+$/.test(word) && tokens.length) tokens.at(-1).word += word;
          // A piece written straight against the last one is part of the same word on screen, with no space.
          else tokens.push({ word, strong: strong || keys.has(norm(word)), glue: k === 0 && joined && !/^\s/.test(inner) });
        });
        joined = !/\s$/.test(part);
      }
      // When each word is said. Known exactly, or spread by length across the time there is.
      const line = voiced[shot.id];
      const from = line?.exact ? line.from : line ? shot.start + VOICE_LEAD : shot.start + lead;
      // Read, not heard: the words arrive in the first part of the shot, so the last of them can still be read.
      const until = line?.exact ? line.to : line ? Math.min(shot.end - 0.05, from + line.speech) : shot.end - tail - Math.min(1.2, (shot.end - shot.start) * 0.3);
      const exact = line?.words?.length === tokens.filter((token) => !token.glue).length && !shot.caption;
      const weight = tokens.map((token) => token.word.length + 2);
      const total = weight.reduce((a, b) => a + b, 0);
      let run = 0;
      let spokenAt = -1; // which spoken word this token is
      tokens.forEach((token, i) => {
        if (!token.glue) spokenAt++;
        if (token.glue && i > 0) token.at = tokens[i - 1].at;
        else token.at = !exact ? from + ((until - from) * run) / total : line.exact ? line.words[spokenAt][0] : shot.start + VOICE_LEAD + line.words[spokenAt][0] - (line.lead ?? 0);
        run += weight[i];
      });
      // Groups of words shown together: a new group at the limit, or after a sentence ends.
      const groups = [[]];
      for (const token of tokens) {
        const now = groups.at(-1);
        const chars = now.reduce((n, t) => n + t.word.length + 1, 0);
        const stop = style === "frame" ? /[.!?,:;]$/ : style === "pop" ? /[.!?]$/ : null;
        const ended = now.length && stop && stop.test(now.at(-1).word);
        if (now.length && (now.length >= limit.words || chars + token.word.length > limit.chars || ended)) groups.push([token]);
        else now.push(token);
      }
      groups.forEach((group, g) => {
        const el = Object.assign(document.createElement("p"), { className: `caption ${style}` });
        // A film can restyle one shot's caption: .caption[data-shot="s03"] .key { ... }
        el.dataset.shot = shot.id;
        for (const token of group) {
          // Punctuation stays against the word before it, even when that word carries the accent.
          if (el.childNodes.length && !token.glue && !/^[.,;:!?)]/.test(token.word)) el.append(" ");
          el.append(Object.assign(document.createElement("span"), { className: token.strong ? "cw key" : "cw", textContent: token.word }));
        }
        box.append(el);
        const words = [...el.querySelectorAll(".cw")];
        const start = g === 0 ? Math.min(group[0].at, shot.start + lead) : group[0].at;
        const end = g < groups.length - 1 ? groups[g + 1][0].at : shot.end - tail;
        gsap.set(el, { autoAlpha: 0 });
        if (style === "frame") {
          // The line rises in dim; each word lights as it is said; a key word's frame draws in around it.
          for (const w of words) if (w.classList.contains("key")) w.append(Object.assign(document.createElement("i"), { className: "kf" }));
          gsap.set(el, { y: 14 });
          gsap.set(words, { opacity: 0.4 });
          gsap.set(el.querySelectorAll(".kf"), { scale: 1.25, autoAlpha: 0 });
          tl.to(el, { autoAlpha: 1, y: 0, duration: 0.24, ease: "power3.out" }, start);
          group.forEach((token, i) => {
            const at = Math.max(start, token.at);
            tl.to(words[i], { opacity: 1, duration: 0.1, ease: "power1.out" }, at);
            const kf = words[i].querySelector(".kf");
            if (kf) tl.to(kf, { scale: 1, autoAlpha: 1, duration: 0.22, ease: "power3.out" }, at);
          });
          tl.to(el, { autoAlpha: 0, y: -8, duration: 0.14, ease: "power1.in" }, end - 0.14);
        } else if (style === "pop") {
          // The group arrives as one, each word lighting as it is said.
          gsap.set(el, { scale: 0.86, y: 18 });
          gsap.set(words, { opacity: 0.38 });
          tl.to(el, { autoAlpha: 1, scale: 1, y: 0, duration: 0.2, ease: "back.out(2.2)" }, start);
          group.forEach((token, i) => tl.to(words[i], { opacity: 1, duration: 0.12, ease: "power1.out" }, Math.max(start, token.at)));
          tl.set(el, { autoAlpha: 0 }, end);
        } else {
          gsap.set(words, { opacity: 0, y: 14, filter: "blur(6px)" });
          // The pill arrives with its first word, never empty.
          tl.to(el, { autoAlpha: 1, duration: 0.16, ease: "power1.out" }, start);
          if (line) {
            group.forEach((token, i) => tl.to(words[i], { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.3, ease: "power3.out" }, Math.max(start, token.at - 0.06)));
          } else {
            // Read, not heard: the words take about a third of the time to arrive, never slower than a calm reading pace.
            // Read, not heard: the line fills almost at once, so the pill never sits half empty.
            const step = Math.min(0.035, ((end - start) * 0.2) / words.length);
            tl.to(words, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.36, ease: "power3.out", stagger: step }, start);
          }
          tl.to(el, { autoAlpha: 0, y: -10, duration: 0.2, ease: "power1.in" }, end - 0.2);
        }
      });
    }
  };

  // ── Chapters ─────────────────────────────────────────────────────────────
  // A rail of the storyboard's acts in the top left; the act on screen is lit and its line fills as it plays.
  const chapters = ({ from = 0, until = duration } = {}) => {
    const acts = (storyboard.acts ?? []).filter((act) => act.rail !== false);
    const rail = Object.assign(document.createElement("div"), { id: "rail", className: "rail" });
    const span = (act) => {
      const mine = storyboard.shots.filter((shot) => shot.act === act.id);
      return { start: mine[0].start, end: mine.at(-1).end };
    };
    acts.forEach((act, i) => {
      rail.insertAdjacentHTML("beforeend", `<span id="rail-${act.id}"><b>${String(i + 1).padStart(2, "0")}</b>${act.title}</span>${i < acts.length - 1 ? `<i><u id="rail-line-${act.id}"></u></i>` : ""}`);
    });
    $("#vignette").before(rail);
    gsap.set(rail, { autoAlpha: 0 });
    show(rail, from, 0.5);
    for (const [i, act] of acts.entries()) {
      const { start, end } = span(act);
      tl.to(`#rail-${act.id}`, { opacity: 1, duration: 0.3 }, Math.max(from, start));
      if (i < acts.length - 1) {
        tl.to(`#rail-line-${act.id}`, { scaleX: 1, duration: end - Math.max(from, start), ease: "none" }, Math.max(from, start));
        tl.to(`#rail-${act.id}`, { opacity: 0.55, duration: 0.3 }, end);
      }
    }
    if (until < duration) hide(rail, until, 0.3);
  };

  // ── Drawing a frame ──────────────────────────────────────────────────────
  function frame() {
    stage.t = tl.time();
    for (const job of jobs) job(stage.t);
    backdrop.render(stage);
    for (const job of afterJobs) job(stage.t);
  }
  const finish = () => {
    tl.set({}, {}, duration);
    window.__frame = frame;
    window.__timelines = { ...(window.__timelines ?? {}), root: tl };
    window.startRender = () => tl;
    frame();
    window.__ready = true;
    if (location.hash === "#play") {
      gsap.ticker.add(frame);
      tl.play(0);
    }
  };

  return { gsap, tl, $, $$, W, H, portrait, voiced, narrated, stage, shots, duration, each, show, hide, scene, land, pop, split, typeIn, typeOut, sheen, motionBlur, hit, whip, light, tintTo, draw, count, captions, chapters, finish };
}

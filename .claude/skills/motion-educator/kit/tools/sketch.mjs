// Draws one storyboard frame as a pencil sketch, from a short list of things placed in the real frame's coordinates
// (1920x1080 for a landscape film, 1080x1920 for a portrait one).
// The drawing is the plan: what is sketched at (x, y) here is built at (x, y) in the film, so a shot can be cut
// into its pieces straight from its frames.
//
// A frame is { note, draw: [ thing, ... ] }. Things (all sizes in frame pixels):
//   { planet: [x, y, r], light?: "left" | "right" }      a globe with a lit side, land and a ring of air
//   { sun: [x, y, r] }                                   a disc with rays
//   { beam: [x0, y, x1, w] }                             a band of light, travelling right
//   { prism: [x, y, size] }                              a glass wedge
//   { fan: [x, y, x1, y0, y1], n? }                      n coloured rays spreading from a point
//   { wave: [x0, x1, y, amp, length], colour?, phase? }  a sine wave
//   { molecule: [x, y, r], angle? }                      two atoms
//   { molecules: [x, y, w, h, n], seed? }                n of them adrift in a box
//   { scatter: [x, y, n, r0, r1], colour? }              n short rays leaving a point
//   { axes: [x, y, w, h], xlabel?, ylabel? }             chart axes, origin at the lower left
//   { curve: [[x, y], ...], colour? }                    a line through points
//   { bar: [x, y, w, h], colour?, label? }               a bar standing on y
//   { strip: [x, y, w, h] }                              the colours of the spectrum, violet to red
//   { panel: [x, y, w, h], title?, rows? }               a window with a head and rows of text
//   { card: [x, y, w, h], label? }                       a plain rounded card
//   { chip: [x, y], text }                               a small label
//   { title: [x, y], text, size?, align?, accent? }      big lettering (the words the viewer reads)
//   { label: [x, y], text, size?, align?, colour? }      smaller lettering
//   { number: [x, y], text, size? }                      a big figure
//   { person: [x, y, size] }                             someone standing
//   { horizon: [y] }                                     the ground line with low hills
//   { sky: [y0, y1], tone? }                             a graded sky between two heights ("day" | "dusk")
//   { magnifier: [x, y, r] }                             a lens
//   { dot: [x, y, r], colour? } { line: [x0, y0, x1, y1], dashed? } { arrow: [x0, y0, x1, y1], colour? }
//   { bracket: [x0, x1, y], text }                       a measure with its value
//   { glow: [x, y, r], colour? }                         where the stage's light sits
//   { ring: [x, y, r], colour?, dashed? }                a circle's outline: an orbit, a front of sound
//   { cloud: [x, y, w] }                                 a cloud, w wide
//   { bolt: [x0, y0, x1, y1], seed? }                    a jagged line: lightning, a crack, a spark
//   { path: "M0 0 L10 10 ...", colour?, width?, fill?, dashed? }   any shape the list above lacks, as an SVG path
//   { blueprint: "file", at: [x, y, w, h], crop?: [x, y, w, h], rotate?, opacity? }   a technical drawing itself,
//       exactly as it is (no pencil wobble), fitted into the box; crop is in the drawing's own pixels; the file is
//       relative to the film's folder (PNG, JPEG or WebP). Draw labels, arrows and moves over it as usual.
// Direction, drawn in blue pencil the way a storyboard artist marks it:
//   { move: [x0, y0, x1, y1], text? }                    this thing travels along the arrow
//   { camera: "push" | "pull" | "up" | "down" | "left" | "right" | "orbit", text? }   what the camera does
//   { cut: text }                                        how the shot leaves
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const INK = "#26262b";
const BLUE = "#2b62d9";
const SPECTRUM = ["#d9382e", "#e8891a", "#d9b81c", "#2f9e52", "#2f6fd6", "#5350c4", "#8a45cf"];
const COLOURS = { red: "#d9382e", orange: "#e8891a", yellow: "#d9b81c", green: "#2f9e52", blue: "#2f6fd6", violet: "#8a45cf", ink: INK, white: "#8d8d94" };
const esc = (text) => String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const colour = (name, fallback = INK) => COLOURS[name] ?? name ?? fallback;
const f = (n) => Number(n.toFixed(1));

function arrow([x0, y0, x1, y1], stroke = INK, width = 6, extra = "") {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const h = width * 4.2;
  return `<g stroke="${stroke}" stroke-width="${width}" fill="none" ${extra}><path d="M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)}"/><path d="M${f(x1 - Math.cos(a - 0.45) * h)} ${f(y1 - Math.sin(a - 0.45) * h)} L${f(x1)} ${f(y1)} L${f(x1 - Math.cos(a + 0.45) * h)} ${f(y1 - Math.sin(a + 0.45) * h)}"/></g>`;
}
const lettering = ([x, y], text, size, { align = "middle", fill = INK, weight = 400 } = {}) =>
  String(text)
    .split("\n")
    .map((line, i) => `<text x="${x}" y="${y + i * size * 1.08}" font-size="${size}" text-anchor="${align}" fill="${fill}" font-weight="${weight}" class="hand">${esc(line)}</text>`)
    .join("");

const DRAW = {
  planet: ([x, y, r], t, id) => {
    const side = t.light === "right" ? -1 : 1;
    const blobs = [
      [-0.35, -0.3, 0.26, 0.17],
      [0.1, -0.05, 0.3, 0.2],
      [-0.2, 0.35, 0.22, 0.13],
      [0.4, 0.4, 0.16, 0.1],
    ]
      .map(([dx, dy, rx, ry]) => `<ellipse cx="${f(x + dx * r)}" cy="${f(y + dy * r)}" rx="${f(rx * r)}" ry="${f(ry * r)}" fill="none" stroke="${INK}" stroke-width="3.5" stroke-dasharray="26 9"/>`)
      .join("");
    return `<defs><clipPath id="pc${id}"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath></defs>
      <circle cx="${x}" cy="${y}" r="${f(r * 1.06)}" fill="none" stroke="${BLUE}" stroke-width="5" stroke-dasharray="3 12" opacity=".9"/>
      <circle cx="${x}" cy="${y}" r="${f(r * 1.03)}" fill="none" stroke="${BLUE}" stroke-width="7" opacity=".55"/>
      <circle cx="${x}" cy="${y}" r="${r}" fill="#f8f6f0" stroke="${INK}" stroke-width="7"/>
      <g clip-path="url(#pc${id})">${blobs}<circle cx="${f(x + side * r * 0.62)}" cy="${f(y - r * 0.1)}" r="${f(r * 1.12)}" fill="url(#hatch2)"/><circle cx="${f(x + side * r * 1.05)}" cy="${f(y - r * 0.1)}" r="${f(r * 1.1)}" fill="url(#hatch)"/></g>`;
  },
  sun: ([x, y, r]) => {
    let rays = "";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      rays += `<path d="M${f(x + Math.cos(a) * r * 1.3)} ${f(y + Math.sin(a) * r * 1.3)} L${f(x + Math.cos(a) * r * (i % 2 ? 1.75 : 2.1))} ${f(y + Math.sin(a) * r * (i % 2 ? 1.75 : 2.1))}" stroke="${COLOURS.orange}" stroke-width="5"/>`;
    }
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff6dd" stroke="${COLOURS.orange}" stroke-width="7"/>${rays}`;
  },
  beam: ([x0, y, x1, w]) => {
    let flow = "";
    for (let x = x0 + 40; x < x1 - 60; x += 150) flow += `<path d="M${x} ${y} h56 m-20 -12 l20 12 l-20 12" stroke="${INK}" stroke-width="3.5" fill="none"/>`;
    return `<rect x="${x0}" y="${y - w / 2}" width="${x1 - x0}" height="${w}" fill="url(#hatch3)" stroke="none"/><path d="M${x0} ${y - w / 2} H${x1} M${x0} ${y + w / 2} H${x1}" stroke="${INK}" stroke-width="6" fill="none"/>${flow}`;
  },
  prism: ([x, y, s]) =>
    `<path d="M${x} ${f(y - s * 1.1)} L${f(x + s)} ${f(y + s * 0.85)} L${f(x - s)} ${f(y + s * 0.85)} Z" fill="url(#hatch3)" stroke="${INK}" stroke-width="7"/><path d="M${f(x - s * 0.12)} ${f(y - s * 0.75)} L${f(x - s * 0.7)} ${f(y + s * 0.42)}" stroke="${INK}" stroke-width="3" stroke-dasharray="20 12"/>`,
  fan: ([x, y, x1, y0, y1], t) => {
    const n = t.n ?? 7;
    let out = "";
    for (let i = 0; i < n; i++) out += `<path d="M${x} ${f(y + i * 5 - 15)} L${x1} ${f(y0 + ((y1 - y0) * i) / (n - 1))}" stroke="${SPECTRUM[Math.round((i * 6) / (n - 1))]}" stroke-width="9" fill="none"/>`;
    return out;
  },
  wave: ([x0, x1, y, amp, length], t) => {
    let d = "";
    for (let x = x0; x <= x1; x += 8) d += `${x === x0 ? "M" : "L"}${x} ${f(y + amp * Math.sin(((x - x0) / length) * Math.PI * 2 + (t.phase ?? 0)))}`;
    return `<path d="${d}" stroke="${colour(t.colour)}" stroke-width="${t.width ?? 8}" fill="none" ${t.faint ? 'opacity=".35"' : ""}/>`;
  },
  molecule: ([x, y, r], t) => {
    const a = t.angle ?? 0.4;
    const dx = Math.cos(a) * r * 0.75;
    const dy = Math.sin(a) * r * 0.75;
    return `<circle cx="${f(x - dx)}" cy="${f(y - dy)}" r="${r}" fill="#f8f6f0" stroke="${INK}" stroke-width="5"/><circle cx="${f(x + dx)}" cy="${f(y + dy)}" r="${r}" fill="url(#hatch3)" stroke="${INK}" stroke-width="5"/>`;
  },
  molecules: ([x, y, w, h, n], t) => {
    const rand = seeded(t.seed ?? 5);
    let out = "";
    for (let i = 0; i < n; i++) {
      const size = 12 + rand() * (t.size ?? 22);
      out += DRAW.molecule([f(x + rand() * w), f(y + rand() * h), f(size)], { angle: rand() * 6.3 });
    }
    return out;
  },
  scatter: ([x, y, n, r0, r1], t) => {
    let out = "";
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3;
      out += arrow([x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1], colour(t.colour, COLOURS.blue), t.width ?? 5);
    }
    return out;
  },
  axes: ([x, y, w, h], t) =>
    `${arrow([x, y, x + w, y], INK, 6)}${arrow([x, y, x, y - h], INK, 6)}${t.xlabel ? lettering([x + w / 2, y + 74], t.xlabel, 40) : ""}${t.ylabel ? `<g transform="translate(${x - 44} ${y - h / 2}) rotate(-90)">${lettering([0, 0], t.ylabel, 40)}</g>` : ""}`,
  curve: (points, t) => `<path d="${points.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join("")}" stroke="${colour(t.colour)}" stroke-width="${t.width ?? 9}" fill="none"/>`,
  bar: ([x, y, w, h], t) =>
    `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" rx="8" fill="url(#hatch2)" stroke="${colour(t.colour)}" stroke-width="7"/>${t.label ? lettering([x + w / 2, y + 60], t.label, 40) : ""}`,
  strip: ([x, y, w, h]) => SPECTRUM.toReversed().map((c, i) => `<rect x="${f(x + (w * i) / 7)}" y="${y}" width="${f(w / 7)}" height="${h}" fill="${c}" opacity=".55" stroke="${INK}" stroke-width="3"/>`).join(""),
  panel: ([x, y, w, h], t) => {
    const rows = t.rows ?? [];
    const head = t.title ? 84 : 0;
    const each = rows.length ? (h - head) / rows.length : 0;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="26" fill="#fbfaf5" stroke="${INK}" stroke-width="7"/>
      ${t.title ? `<path d="M${x} ${y + head} H${x + w}" stroke="${INK}" stroke-width="4"/>${lettering([x + 36, y + 58], t.title, 42, { align: "start", weight: 700 })}` : ""}
      ${rows.map((row, i) => `${i ? `<path d="M${x + 24} ${f(y + head + each * i)} H${x + w - 24}" stroke="${INK}" stroke-width="2.5" stroke-dasharray="6 10"/>` : ""}${lettering([x + 40, f(y + head + each * (i + 0.5) + 14)], row, Math.min(44, each * 0.42), { align: "start" })}`).join("")}`;
  },
  card: ([x, y, w, h], t) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="#fbfaf5" stroke="${INK}" stroke-width="7"/>${t.label ? lettering([x + w / 2, y + h - 70], t.label, 40) : ""}`,
  chip: ([x, y], t) => {
    const w = 60 + String(t.text).length * 27;
    return `<rect x="${x}" y="${y}" width="${w}" height="88" rx="44" fill="#fbfaf5" stroke="${INK}" stroke-width="5"/>${lettering([x + w / 2, y + 61], t.text, 52)}`;
  },
  title: ([x, y], t) => {
    const size = t.size ?? 120;
    const lines = String(t.text).split("\n");
    return lines
      .map((line, i) => {
        const yy = y + i * size * 1.1;
        if (!t.accent || !line.includes(t.accent)) return lettering([x, yy], line, size, { align: t.align ?? "middle", weight: 700 });
        const [before, after] = line.split(t.accent);
        return `<text x="${x}" y="${yy}" font-size="${size}" text-anchor="${t.align ?? "middle"}" font-weight="700" class="hand" fill="${INK}">${esc(before)}<tspan fill="${BLUE}">${esc(t.accent)}</tspan>${esc(after)}</text>`;
      })
      .join("");
  },
  label: ([x, y], t) => lettering([x, y], t.text, Math.max(28, t.size ?? 50), { align: t.align ?? "middle", fill: colour(t.colour) }),
  // An older spelling of label. It cannot be written in JSON with its words (the key "text" twice), so the
  // storyboard check warns about it; kept so an old board still draws.
  text: (at, t) => (Array.isArray(at) ? lettering(at, t.label ?? "", Math.max(46, t.size ?? 50), { align: t.align ?? "middle", fill: colour(t.colour) }) : ""),
  ring: ([x, y, r], t) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${colour(t.colour)}" stroke-width="${t.width ?? 6}" ${t.dashed ? 'stroke-dasharray="22 16"' : ""}/>`,
  cloud: ([x, y, w]) => {
    const r = w / 5;
    return `<path d="M${f(x - w / 2)} ${y} a${f(r * 0.8)} ${f(r * 0.8)} 0 0 1 ${f(r * 0.9)} ${f(-r * 0.9)} a${f(r * 1.1)} ${f(r * 1.1)} 0 0 1 ${f(r * 1.9)} ${f(-r * 0.5)} a${f(r)} ${f(r)} 0 0 1 ${f(r * 1.7)} ${f(r * 0.5)} a${f(r * 0.8)} ${f(r * 0.8)} 0 0 1 ${f(r * 0.5)} ${f(r * 0.9)} Z" fill="url(#hatch3)" stroke="${INK}" stroke-width="6"/>`;
  },
  bolt: ([x0, y0, x1, y1], t) => {
    const next = seeded(t.seed ?? 5);
    const steps = 7;
    let d = `M${x0} ${y0}`;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const side = i === steps ? 0 : (next() - 0.5) * Math.hypot(x1 - x0, y1 - y0) * 0.16;
      d += ` L${f(x0 + (x1 - x0) * k + side)} ${f(y0 + (y1 - y0) * k - side * 0.3)}`;
    }
    return `<path d="${d}" fill="none" stroke="${colour(t.colour)}" stroke-width="${t.width ?? 8}"/>`;
  },
  path: (d, t) => `<path d="${esc(d)}" fill="${t.fill ? colour(t.fill) : "none"}" ${t.fill ? 'fill-opacity=".25"' : ""} stroke="${colour(t.colour)}" stroke-width="${t.width ?? 6}" ${t.dashed ? 'stroke-dasharray="22 16"' : ""}/>`,
  number: ([x, y], t) => lettering([x, y], t.text, t.size ?? 150, { fill: colour(t.colour, BLUE), weight: 700 }),
  person: ([x, y, s]) =>
    `<circle cx="${x}" cy="${f(y - s * 0.86)}" r="${f(s * 0.13)}" fill="${INK}"/><path d="M${x} ${f(y - s * 0.72)} V${f(y - s * 0.3)} M${x} ${f(y - s * 0.3)} L${f(x - s * 0.14)} ${y} M${x} ${f(y - s * 0.3)} L${f(x + s * 0.14)} ${y} M${f(x - s * 0.16)} ${f(y - s * 0.56)} L${x} ${f(y - s * 0.64)} L${f(x + s * 0.2)} ${f(y - s * 0.8)}" stroke="${INK}" stroke-width="${f(s * 0.07)}" fill="none"/>`,
  horizon: ([y]) =>
    `<path d="M0 ${y + 20} C240 ${y - 40} 420 ${y + 30} 700 ${y - 6} S1180 ${y - 50} 1460 ${y + 4} S1800 ${y - 30} 1920 ${y + 10} V${SIZE.h} H0 Z" transform="scale(${f(SIZE.w / 1920)} 1)" fill="url(#hatch2)" stroke="${INK}" stroke-width="7"/>`,
  sky: ([y0, y1], t) => {
    const tones = t.tone === "dusk" ? ["#5350c4", "#d9382e", "#e8891a"] : ["#2f6fd6", "#2f6fd6", "#9cc0f2"];
    const step = (y1 - y0) / 3;
    return tones.map((c, i) => `<rect x="0" y="${f(y0 + step * i)}" width="${SIZE.w}" height="${f(step)}" fill="${c}" opacity="${0.16 + (t.tone === "dusk" ? 0.1 : 0) * i}"/><path d="M0 ${f(y0 + step * (i + 0.5))} H${SIZE.w}" stroke="${c}" stroke-width="3" stroke-dasharray="40 26" opacity=".7"/>`).join("");
  },
  magnifier: ([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fbfaf5" stroke="${INK}" stroke-width="9"/><path d="M${f(x + r * 0.72)} ${f(y + r * 0.72)} L${f(x + r * 1.5)} ${f(y + r * 1.5)}" stroke="${INK}" stroke-width="16"/>`,
  dot: ([x, y, r], t) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${colour(t.colour)}" stroke="${INK}" stroke-width="4"/>`,
  line: (p, t) => `<path d="M${p[0]} ${p[1]} L${p[2]} ${p[3]}" stroke="${colour(t.colour)}" stroke-width="${t.width ?? 5}" fill="none" ${t.dashed ? 'stroke-dasharray="18 14"' : ""}/>`,
  arrow: (p, t) => arrow(p, colour(t.colour), t.width ?? 6),
  bracket: ([x0, x1, y], t) => `<path d="M${x0} ${y - 20} V${y + 20} M${x0} ${y} H${x1} M${x1} ${y - 20} V${y + 20}" stroke="${INK}" stroke-width="5" fill="none"/>${lettering([(x0 + x1) / 2, y - 26], t.text, 46, { fill: colour(t.colour), weight: 700 })}`,
  glow: ([x, y, r], t) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${colour(t.colour, COLOURS.orange)}" stroke-width="4" stroke-dasharray="4 16" opacity=".8"/><circle cx="${x}" cy="${y}" r="${f(r * 0.66)}" fill="none" stroke="${colour(t.colour, COLOURS.orange)}" stroke-width="3" stroke-dasharray="4 20" opacity=".6"/>`,
  // Direction, in blue pencil.
  move: (p, t) => `${arrow(p, BLUE, 9, 'stroke-dasharray="34 14"')}${t.text ? lettering([(p[0] + p[2]) / 2, Math.min(p[1], p[3]) - 26], t.text, 48, { fill: BLUE, weight: 700 }) : ""}`,
  camera: (kind, t) => {
    const { w, h } = SIZE;
    const words = SIZE.lang === "id"
      ? { push: "KAMERA MAJU", pull: "KAMERA MUNDUR", up: "KAMERA NAIK", down: "KAMERA TURUN", left: "GESER KIRI", right: "GESER KANAN", orbit: "KAMERA MENGORBIT" }
      : { push: "CAMERA PUSHES IN", pull: "CAMERA PULLS BACK", up: "CAMERA RISES", down: "CAMERA DROPS", left: "PAN LEFT", right: "PAN RIGHT", orbit: "CAMERA ORBITS" };
    const label = words[kind] ?? String(kind).toUpperCase();
    let marks = "";
    if (kind === "push" || kind === "pull") {
      const inner = kind === "push";
      for (const [cx, cy, sx, sy] of [
        [150, 120, 1, 1],
        [w - 150, 120, -1, 1],
        [150, h - 120, 1, -1],
        [w - 150, h - 120, -1, -1],
      ]) {
        const from = inner ? [cx, cy] : [cx + sx * 130, cy + sy * 80];
        const to = inner ? [cx + sx * 130, cy + sy * 80] : [cx, cy];
        marks += arrow([...from, ...to], BLUE, 8);
      }
      const box = inner ? [w * 0.17, h * 0.21, w * 0.66, h * 0.58] : [90, 70, w - 180, h - 140];
      marks += `<rect x="${f(box[0])}" y="${f(box[1])}" width="${f(box[2])}" height="${f(box[3])}" fill="none" stroke="${BLUE}" stroke-width="5" stroke-dasharray="26 18" rx="14"/>`;
    } else if (kind === "orbit") {
      const half = Math.min(400, w * 0.3);
      marks += `<path d="M${f(w / 2 - half)} ${h - 80} Q${f(w / 2)} ${h - 4} ${f(w / 2 + half)} ${h - 80}" fill="none" stroke="${BLUE}" stroke-width="8"/>${arrow([w / 2 + half - 60, h - 66, w / 2 + half + 6, h - 82], BLUE, 8)}`;
    } else {
      const v = { up: [w / 2, 250, w / 2, 110], down: [w / 2, h - 250, w / 2, h - 110], left: [330, h / 2, 150, h / 2], right: [w - 330, h / 2, w - 150, h / 2] }[kind];
      if (v) marks += arrow(v, BLUE, 10);
    }
    return `${marks}<g><rect x="40" y="28" width="${80 + (t.text ?? label).length * 27}" height="78" rx="12" fill="#eaf0ff" stroke="${BLUE}" stroke-width="4"/>${lettering([74, 84], t.text ?? label, 46, { align: "start", fill: BLUE, weight: 700 })}</g>`;
  },
  cut: (text) => {
    const { w, h } = SIZE;
    const wide = Math.min(w - 80, 90 + String(text).length * 26);
    return `<g><rect x="${w - 40 - wide}" y="${h - 106}" width="${wide}" height="78" rx="12" fill="#eaf0ff" stroke="${BLUE}" stroke-width="4"/>${lettering([w - 70, h - 50], `→ ${text}`, 46, { align: "end", fill: BLUE, weight: 700 })}</g>`;
  },
};
// A drawing is placed as it is: embedded, not traced, so the board shows exactly what the blueprint shows.
DRAW.blueprint = () => "";
function blueprintImage(file, t) {
  const path = resolve(SIZE.base, file);
  if (!existsSync(path)) return `<g>${lettering([t.at?.[0] ?? 40, (t.at?.[1] ?? 40) + 60], `missing: ${file}`, 40, { align: "start", fill: COLOURS.red })}</g>`;
  const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", path], { encoding: "utf8" });
  const [iw, ih] = probe.stdout.trim().split(",").map(Number);
  const type = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[extname(path).toLowerCase()] ?? "image/png";
  const href = `data:${type};base64,${readFileSync(path).toString("base64")}`;
  const [x, y, w, h] = t.at ?? [40, 40, SIZE.w - 80, SIZE.h - 80];
  const [cx, cy, cw, ch] = t.crop ?? [0, 0, iw || 1000, ih || 1000];
  const turn = t.rotate ? ` transform="rotate(${t.rotate} ${x + w / 2} ${y + h / 2})"` : "";
  return `<g${turn} opacity="${t.opacity ?? 1}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/><svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${cx} ${cy} ${cw} ${ch}" preserveAspectRatio="xMidYMid meet"><image href="${href}" width="${iw}" height="${ih}"/></svg><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${INK}" stroke-width="3"/></g>`;
}
export const THINGS = Object.keys(DRAW);
// The size of the frame being drawn; sketch() sets it.
const SIZE = { w: 1920, h: 1080, lang: "en", base: "." };

// One frame as an SVG string. id keeps the clip paths of different frames apart on one page.
export function sketch(frame, id = "f", { width = 1920, height = 1080, lang = "en", base = "." } = {}) {
  SIZE.w = width;
  SIZE.h = height;
  SIZE.lang = lang;
  SIZE.base = base;
  let body = "";
  let plates = "";
  (frame.draw ?? []).forEach((thing, i) => {
    // A thing is named by its first key; the keys after it are its options.
    const kind = Object.keys(thing)[0];
    if (kind === "blueprint") plates += blueprintImage(thing.blueprint, thing);
    else if (kind in DRAW) body += DRAW[kind](thing[kind], thing, `${id}-${i}`);
  });
  return `<svg viewBox="0 0 ${width} ${height}" class="sketch" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="pencil-${id}" x="-3%" y="-3%" width="106%" height="106%"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="${(id.length * 7 + id.charCodeAt(id.length - 1)) % 90}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="13" xChannelSelector="R" yChannelSelector="G"/></filter>
      <filter id="grain-${id}"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .2  0 0 0 0 .18  0 0 0 0 .15  0 0 0 .09 0"/></filter>
      <pattern id="hatch" width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><line x1="0" y1="0" x2="0" y2="13" stroke="${INK}" stroke-width="5"/></pattern>
      <pattern id="hatch2" width="17" height="17" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><line x1="0" y1="0" x2="0" y2="17" stroke="${INK}" stroke-width="2.6"/></pattern>
      <pattern id="hatch3" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(-32)"><line x1="0" y1="0" x2="0" y2="26" stroke="${INK}" stroke-width="1.8" opacity=".7"/></pattern>
    </defs>
    <rect width="${width}" height="${height}" fill="#f6f3ec"/>
    ${plates}
    <g filter="url(#pencil-${id})" stroke-linecap="round" stroke-linejoin="round">${body}</g>
    <rect width="${width}" height="${height}" filter="url(#grain-${id})"/>
    <rect x="6" y="6" width="${width - 12}" height="${height - 12}" rx="22" fill="none" stroke="${INK}" stroke-width="10"/>
  </svg>`;
}

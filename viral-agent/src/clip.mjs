// Auto-clipper: finds the loudest, busiest moments in your own gameplay recording and cuts
// vertical 9:16 clips with a burned-in hook caption. Needs ffmpeg on PATH.
// usage: node src/clip.mjs <gameplay.mp4> <out-dir> [--count 5] [--len 14] [--hook "TEXT"]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const run = (args) => execFileSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 }).toString();
const probe = (f) => +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString();

// one sample per second: loudness (RMS dB) and amount of on-screen change (scene score)
function signals(file) {
  const dur = Math.floor(probe(file));
  const loud = new Array(dur).fill(-90), motion = new Array(dur).fill(0);
  const a = execFileSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "astats=metadata=1:reset=1:length=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-", "-vn", "-f", "null", "-"], { maxBuffer: 1 << 28 }).toString();
  let t = 0; for (const line of a.split("\n")) { const m = line.match(/pts_time:([\d.]+)/); if (m) t = Math.floor(+m[1]);
    const v = line.match(/RMS_level=(-?[\d.]+|-inf)/); if (v && t < dur) loud[t] = v[1] === "-inf" ? -90 : +v[1]; }
  const s = execFileSync("ffmpeg", ["-hide_banner", "-i", file, "-vf", "scale=320:-2,select='gte(scene,0)',metadata=print:key=lavfi.scene_score:file=-", "-an", "-f", "null", "-"], { maxBuffer: 1 << 28 }).toString();
  for (const line of s.split("\n")) { const m = line.match(/pts_time:([\d.]+)/); if (m) t = Math.floor(+m[1]);
    const v = line.match(/scene_score=([\d.]+)/); if (v && t < dur) motion[t] += +v[1]; }
  return { dur, loud, motion };
}

export function pickMoments({ dur, loud, motion }, count = 5, len = 14) {
  const norm = (arr) => { const lo = Math.min(...arr), hi = Math.max(...arr); return arr.map((v) => (v - lo) / (hi - lo || 1)); };
  const L = norm(loud), M = norm(motion), score = L.map((v, i) => 0.55 * v + 0.45 * M[i]);
  const windows = [];
  for (let s = 0; s + len <= dur; s++) windows.push({ start: s, score: score.slice(s, s + len).reduce((a, b) => a + b, 0) / len });
  windows.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const w of windows) { if (picked.every((p) => Math.abs(p.start - w.start) >= len)) picked.push(w); if (picked.length === count) break; }
  return picked.sort((a, b) => a.start - b.start);
}

export function cut(file, outDir, moments, { len = 14, hook = "", font = "" } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019");
  return moments.map((m, i) => {
    const out = path.join(outDir, `clip_${String(i + 1).padStart(2, "0")}_${m.start}s.mp4`);
    const text = hook ? `,drawtext=${font ? `fontfile='${font}':` : ""}text='${esc(hook)}':fontsize=82:fontcolor=white:borderw=8:bordercolor=black:x=(w-text_w)/2:y=h*0.16:enable='lt(t,3.2)'` : "";
    run(["-y", "-ss", String(m.start), "-t", String(len), "-i", file, "-vf",
      `crop='min(iw,ih*9/16)':ih,scale=1080:1920:flags=lanczos,eq=contrast=1.06:saturation=1.12${text}`,
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]);
    return out;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, outDir = "out/clips", ...rest] = process.argv.slice(2);
  if (!file) { console.error("usage: node src/clip.mjs <gameplay.mp4> <out-dir> [--count 5] [--len 14] [--hook TEXT]"); process.exit(2); }
  const opt = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d; };
  const len = +opt("len", 14), count = +opt("count", 5);
  const moments = pickMoments(signals(file), count, Math.min(len, Math.floor(probe(file))));
  console.log(JSON.stringify({ moments, clips: cut(file, outDir, moments, { len, hook: opt("hook", ""), font: opt("font", "") }) }, null, 2));
}

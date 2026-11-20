// Measures a rendered film: contact sheets to look at, frozen time, and the loudness of the mixed film.
//
//   node kit/tools/check.mjs films/NAME
//
// Reads films/NAME/out/picture.mp4 (and NAME.mp4 when it has been mixed). Writes out/sheets/sheet-01.png ...
// Looking at the sheets is the point: the numbers only say where to look.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const film = resolve(process.argv[2] ?? ".");
const picture = join(film, "out", "picture.mp4");
if (!existsSync(picture)) throw new Error(`no ${picture}: render the film first`);
const probe = (file, entries) => execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", entries, "-of", "csv=p=0", file]).toString().trim();
const [rate, frames] = probe(picture, "stream=r_frame_rate,nb_read_frames").split(",");
const duration = Number(probe(picture, "format=duration"));
const fps = Number(rate.split("/")[0]) / Number(rate.split("/")[1] ?? 1);
console.log(`picture: ${probe(picture, "stream=width,height").match(/\d+/g).slice(0, 2).join("x")}, ${frames} frames, ${duration.toFixed(3)} s at ${fps} fps${Math.abs(Number(frames) - duration * fps) < 1.5 ? "" : "  <- frame count does not match the length"}`);
const errors = spawnSync("ffmpeg", ["-v", "error", "-i", picture, "-f", "null", "-"]).stderr.toString().trim();
console.log(errors ? `decode errors:\n${errors}` : "decodes cleanly");
// The picture must be as long as the plan: a timeline that runs on past its last shot shows as a frozen tail.
const plan = existsSync(join(film, "storyboard.json")) ? JSON.parse(readFileSync(join(film, "storyboard.json"), "utf8")) : null;
if (plan?.duration && Math.abs(duration - plan.duration) > 1.5 / fps + 0.01) console.log(`  <- the picture is ${duration.toFixed(3)} s but the storyboard is ${plan.duration.toFixed(3)} s: something in film.js runs past the last shot, or the storyboard changed after the render`);

// A film made to loop: its last frame must lead into its first without a jump. Compare the two (SSIM, 1 = the same
// picture). A loop whose last frame is the first frame's state a moment earlier scores about 0.9 or more.
if (plan?.loop) {
  const lastAt = Math.max(0, duration - 1.5 / fps).toFixed(4);
  const ssim = spawnSync("ffmpeg", ["-hide_banner", "-i", picture, "-ss", lastAt, "-i", picture, "-filter_complex", "[0:v]trim=end_frame=1,setpts=PTS-STARTPTS[a];[1:v]trim=end_frame=1,setpts=PTS-STARTPTS[b];[b][a]ssim", "-f", "null", "-"]).stderr.toString();
  const score = Number(ssim.match(/All:([0-9.]+)/)?.[1]);
  console.log(`loop seam: last frame against the first, SSIM ${Number.isFinite(score) ? score.toFixed(3) : "?"}${score < 0.85 ? "  <- the picture jumps when the film loops: end on the first shot's picture (same camera, same things in place)" : ""}`);
}

// Contact sheets: a frame every half second, 36 to a sheet.
const sheets = join(film, "out", "sheets");
mkdirSync(sheets, { recursive: true });
const count = Math.ceil((duration * 2) / 36);
const [width, height] = probe(picture, "stream=width,height").match(/\d+/g).map(Number);
const tile = height > width ? "scale=216:-1,tile=9x4" : "scale=384:-1,tile=6x6";
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", picture, "-vf", `fps=2,${tile}:padding=4:color=0x444444`, "-frames:v", String(count), join(sheets, "sheet-%02d.png")]);
console.log(`${count} contact sheet(s) in ${sheets}: look at every one`);

// Frozen time: stretches where nothing in the picture moves, sampled ten times a second. The film's grain changes
// every frame, so the picture is averaged down to 96 pixels wide first, and the measure is the largest change
// anywhere in the frame: a held picture scores 2 or less, anything moving scores far more.
const diff = spawnSync("ffmpeg", ["-hide_banner", "-i", picture, "-vf", "fps=10,scale=96:-1:flags=area,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YMAX", "-an", "-f", "null", "-"]).stderr.toString();
const still = [...diff.matchAll(/YMAX=([0-9.]+)/g)].map((m, i) => ({ t: (i + 1) / 10, v: Number(m[1]) })).filter((sample) => sample.v <= 2.5);
const runs = [];
for (const sample of still) {
  const last = runs.at(-1);
  if (last && sample.t - last.end < 0.15) last.end = sample.t;
  else runs.push({ start: sample.t, end: sample.t });
}
const long = runs.filter((run) => run.end - run.start >= 0.5);
console.log(`frozen time: ${(still.length / 10).toFixed(1)} s in all${long.length ? `; holds of half a second or more at ${long.map((run) => `${run.start.toFixed(1)}-${run.end.toFixed(1)}`).join(", ")}` : "; no hold of half a second or more"}`);

// Loudness of the mixed film, read from the encoded file.
const mixed = join(film, "out", `${basename(film)}.mp4`);
if (existsSync(mixed)) {
  const out = spawnSync("ffmpeg", ["-hide_banner", "-i", mixed, "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr.toString();
  const summary = out.slice(out.lastIndexOf("Summary:"));
  const grab = (pattern) => summary.match(pattern)?.[1] ?? "?";
  const peak = Number(grab(/Peak:\s+(-?[\d.]+) dBFS/));
  console.log(`sound: ${grab(/I:\s+(-?[\d.]+) LUFS/)} LUFS, range ${grab(/LRA:\s+([\d.]+) LU/)} LU, true peak ${peak} dBFS${peak > -1 ? "  <- over -1 dBFS: lower the limiter" : ""}`);
} else {
  console.log(`no ${basename(mixed)} yet: mix the sound with kit/audio/mix.py`);
}

// The whole pipeline for one film, in order, stopping at the first step that fails.
//
//   node kit/tools/make.mjs films/NAME              storyboard check, voice check, render, mix, measure, share copy
//   node kit/tools/make.mjs films/NAME --draft      the same at 30 fps, for a first look
//   node kit/tools/make.mjs films/NAME --only 12-16 re-render only the segments that touch 12 s to 16 s, then the rest
//   node kit/tools/make.mjs films/NAME --jobs 2     render with two browsers (when the machine is shared)
//
// It does not replace looking: stills while building, the contact sheets it writes, and a reviewer who did not
// build the film (references/review.md).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const film = resolve(args.find((arg) => !arg.startsWith("--") && existsSync(join(arg, "storyboard.json"))) ?? ".");
if (!existsSync(join(film, "storyboard.json"))) throw new Error("pass the film's folder (the one with storyboard.json)");
const kit = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const name = basename(film);
const draft = args.includes("--draft");
const only = args.includes("--only") ? ["--only", args[args.indexOf("--only") + 1]] : [];
// Passed on to the renderer as given.
const jobs = args.includes("--jobs") ? ["--jobs", args[args.indexOf("--jobs") + 1]] : [];
const sb = JSON.parse(readFileSync(join(film, "storyboard.json"), "utf8"));
const began = Date.now();

function step(title, cmd, cmdArgs) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(4, 66 - title.length))}`);
  const result = spawnSync(cmd, cmdArgs, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`\nstopped at "${title}". Fix it and run make again: finished segments are reused.`);
    process.exit(result.status ?? 1);
  }
}

step("storyboard", "node", [join(kit, "tools", "storyboard.mjs"), film]);
if ((sb.shots ?? []).some((shot) => shot.voice)) step("narration", "node", [join(kit, "audio", "voice.mjs"), film]);
step(draft ? "render (draft, 30 fps)" : "render", "node", [join(kit, "tools", "render.mjs"), film, ...(draft ? ["--fps", "30"] : []), ...only, ...jobs]);
if (existsSync(join(film, "cues.json"))) {
  step("mix", "python3", [join(kit, "audio", "mix.py"), film]);
  step("mix (music and voice only)", "python3", [join(kit, "audio", "mix.py"), film, "--no-sfx", "--out", join(film, "out", `${name}-no-sfx.mp4`)]);
}
step("measure", "node", [join(kit, "tools", "check.mjs"), film]);
const finished = existsSync(join(film, "out", `${name}.mp4`)) ? join(film, "out", `${name}.mp4`) : join(film, "out", "picture.mp4");
const share = join(film, "out", `${name}-share.mp4`);
step("share copy", "ffmpeg", ["-y", "-loglevel", "error", "-i", finished, "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", share]);
console.log(`\ndone in ${((Date.now() - began) / 60000).toFixed(1)} min\n  master  ${finished}\n  share   ${share}\n  sheets  ${join(film, "out", "sheets")}  <- look at every one`);

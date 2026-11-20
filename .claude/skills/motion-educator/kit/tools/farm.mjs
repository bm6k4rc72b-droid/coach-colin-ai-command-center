// Renders a film on a render worker (kit/farm/worker.mjs) instead of this machine, and brings the picture back.
//
//   FARM_URL=https://host/farm FARM_TOKEN=... node kit/tools/farm.mjs films/NAME [render.mjs options]
//
// It packs the workspace's kit/, package.json and the film (not its out/), sends it, prints the worker's log as it
// renders, and writes films/NAME/out/picture.mp4. Options pass through to render.mjs (--only 12-16, --fps 30,
// --force...). The worker keeps each film's segments, so a later --only renders only what changed.
// FARM_TOKEN_FILE may name a file holding the token instead. Transfers go through curl, so a proxy set in the
// environment (HTTPS_PROXY) is used.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";

const [filmArg, ...pass] = process.argv.slice(2);
const film = resolve(filmArg ?? ".");
if (!existsSync(join(film, "index.html"))) throw new Error(`no index.html in ${film}: pass the film's folder`);
let ws = film;
while (!existsSync(join(ws, "kit", "engine", "motion.js"))) {
  if (dirname(ws) === ws) throw new Error("no kit/ folder above the film");
  ws = dirname(ws);
}
const base = process.env.FARM_URL?.replace(/\/$/, "");
const token = process.env.FARM_TOKEN ?? (process.env.FARM_TOKEN_FILE ? readFileSync(process.env.FARM_TOKEN_FILE, "utf8").trim() : "");
if (!base || !token) throw new Error("set FARM_URL and FARM_TOKEN (or FARM_TOKEN_FILE)");
const rel = relative(ws, film);
const curl = (args) => {
  const r = spawnSync("curl", ["-sS", "--fail-with-body", "-H", `x-farm-token: ${token}`, ...args], { maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`curl ${args.at(-1)}: ${r.stderr}${r.stdout}`);
  return r.stdout;
};

const archive = join(tmpdir(), `farm-${process.pid}.tar.gz`);
// The film's finished segments travel too (not its stills, sheets or mixes), so the worker renders only what is
// missing or out of date instead of the whole film again.
const skip = ["out/*.mp4", "out/*.wav", "out/*.txt", "out/stills", "out/sheets", "out/segments/part-*", "out/segments/list.txt", "storyboard"].flatMap((p) => ["--exclude", `${rel}/${p}`]);
// --no-wildcards-match-slash: "out/*.mp4" must not also match the segments in out/segments/.
const tar = spawnSync("tar", ["-czf", archive, "-C", ws, "--no-wildcards-match-slash", ...skip, "--exclude", "node_modules", "--exclude", "kit/audio/lib", "kit", "package.json", rel]);
if (tar.status !== 0) throw new Error(`tar: ${tar.stderr}`);
console.log(`sending ${rel} (${(statSync(archive).size / 1e6).toFixed(1)} MB) to ${base}`);
const key = basename(film).replace(/^[^a-z0-9]+/i, "").replace(/[^a-z0-9._-]/gi, "-").slice(0, 60) || "film";
const query = new URLSearchParams({ key, film: rel, args: JSON.stringify(pass) });
const { id } = JSON.parse(curl(["-X", "POST", "--data-binary", `@${archive}`, "-H", "content-type: application/gzip", `${base}/jobs?${query}`]));
unlinkSync(archive);

let seen = 0;
let state = "queued";
const began = Date.now();
let misses = 0;
while (state === "queued" || state === "running") {
  spawnSync("sleep", ["4"]);
  let job;
  try {
    job = JSON.parse(curl([`${base}/jobs/${id}?lines=400`]));
    misses = 0;
  } catch (error) {
    // A gateway hiccup is retried; a worker that restarted has forgotten the job: say so, and how to go on.
    if (/no such job/.test(error.message)) throw new Error("the worker restarted and lost the job (out of memory? lower FARM_JOBS). Run the same command again: the segments it finished are kept there.");
    if (++misses > 15) throw error;
    continue;
  }
  state = job.state;
  for (const line of job.log.slice(Math.min(seen, job.log.length))) console.log(`  farm: ${line}`);
  seen = job.log.length;
}
if (state !== "done") throw new Error(`the worker's job ${state}`);
const out = join(film, "out");
mkdirSync(out, { recursive: true });
curl(["-o", join(out, "picture.mp4"), `${base}/jobs/${id}/picture`]);
console.log(`picture back in ${((Date.now() - began) / 1000).toFixed(0)} s -> ${relative(process.cwd(), join(out, "picture.mp4"))}`);

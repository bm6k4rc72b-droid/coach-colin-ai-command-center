// Renders a film to MP4 by seeking its paused timeline one frame at a time, so no frame is ever dropped.
//
//   node kit/tools/render.mjs films/NAME                    the whole picture -> films/NAME/out/picture.mp4 (silent)
//   node kit/tools/render.mjs films/NAME --only 12-16       re-render only the segments that touch 12 s to 16 s (several: 12-16,30-34)
//   node kit/tools/render.mjs films/NAME --force            re-render every segment
//   node kit/tools/render.mjs films/NAME --stills 1,5.5     finished PNG stills at those seconds -> out/stills/
//   node kit/tools/render.mjs films/NAME --serve            serve the film to watch it live in a browser (#play)
//   --fps 30 halves the frames, --jobs 1 uses one browser, --raw skips the finishing pass, --dir writes elsewhere,
//   --safe (stills only) shades the parts of the frame an app would cover.
//
// The frame's size is the storyboard's "format": 1920x1080 unless it says otherwise (1080x1920 for a short).
//
// The picture is rendered in four-second segments, each its own file that starts on a keyframe. A fix to one shot
// re-renders its segments and the rest are reused, which is what makes a review loop affordable.
// Without --only, every segment is rendered again when anything the picture is made from has changed (the film's
// pages, scripts, styles and storyboard, its narration's timings, the kit's engine and look) and none when nothing
// has: a change to the cue sheet alone costs no rendering. An interrupted render picks up where it stopped: each
// finished segment records what it was made from.
// Needs `npm install` in the workspace, Playwright with Chromium, and FFmpeg on PATH.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { availableParallelism } from "node:os";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const film = resolve(args.find((arg) => !arg.startsWith("--") && existsSync(join(arg, "index.html"))) ?? ".");
if (!existsSync(join(film, "index.html"))) throw new Error(`no index.html in ${film}: pass the film's folder`);
// The workspace is the nearest folder above the film that holds the kit; the film's pages load everything from it.
let workspace = film;
while (!existsSync(join(workspace, "kit", "engine", "motion.js"))) {
  const up = dirname(workspace);
  if (up === workspace) throw new Error("no kit/ folder above the film");
  workspace = up;
}
const out = resolve(flag("--dir") ?? join(film, "out"));
const fps = Number(flag("--fps") ?? 60);
const jobs = Number(flag("--jobs") ?? Math.min(4, availableParallelism()));
// One way to draw WebGL, the fastest the machine has: its GPU when there is one (any Mac or Windows machine, Linux
// with a render node or an NVIDIA card), else Mesa's lavapipe, software Vulkan that spreads each frame over every CPU
// core (measured on a heavy 1080x1920 3D frame: 1.1 s, against 7.1 s for Chromium's own software renderer, with
// the same pixels). A CPU-only Linux machine needs it installed: apt install mesa-vulkan-drivers.
const LAVAPIPE = ["/usr/share/vulkan/icd.d/lvp_icd.json", "/etc/vulkan/icd.d/lvp_icd.json"].find(existsSync);
const HAS_GPU = process.platform === "darwin" || process.platform === "win32" || existsSync("/dev/nvidia0") || (existsSync("/dev/dri") && readdirSync("/dev/dri").some((name) => name.startsWith("renderD")));
if (!HAS_GPU && !LAVAPIPE && !args.includes("--serve")) throw new Error("no GPU and no Mesa lavapipe on this machine: install it (Debian/Ubuntu: apt install mesa-vulkan-drivers), or render on a bigger machine (kit/tools/farm.mjs)");
const GL = HAS_GPU
  ? { args: ["--ignore-gpu-blocklist", "--enable-gpu", "--use-gl=angle"], env: {} }
  : {
      args: ["--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=vulkan", "--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan", "--disable-vulkan-surface"],
      // llvmpipe draws with a thread per core; split the cores between the jobs so they do not fight.
      env: { VK_ICD_FILENAMES: LAVAPIPE, LP_NUM_THREADS: process.env.LP_NUM_THREADS ?? String(Math.max(1, Math.floor(availableParallelism() / Math.max(1, jobs)))) },
    };
const SEGMENT = Number(flag("--segment") ?? 4);
const plan = existsSync(join(film, "storyboard.json")) ? JSON.parse(readFileSync(join(film, "storyboard.json"), "utf8")) : {};
const [W, H] = (flag("--size") ?? plan.format ?? "1920x1080").split("x").map(Number);
if (!(W > 0 && H > 0) || W % 2 || H % 2) throw new Error(`the frame size "${W}x${H}" must be two even numbers, like 1920x1080`);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
Object.assign(TYPES, { ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".json": "application/json", ".mp3": "audio/mpeg" });
const server = createServer((req, res) => {
  const file = normalize(join(workspace, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!file.startsWith(workspace) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  createReadStream(file).pipe(res);
});
await new Promise((ready) => server.listen(args.includes("--serve") ? Number(flag("--port") ?? 4700) : 0, "127.0.0.1", ready));
const url = `http://127.0.0.1:${server.address().port}/${relative(workspace, film).split("\\").join("/")}/index.html`;

if (args.includes("--serve")) {
  console.log(`${url}#play`);
} else {
  const { chromium } = createRequire(import.meta.url)("playwright");
  mkdirSync(out, { recursive: true });
  // One browser per job: pages in the same browser share a compositor and would take turns.
  async function openFilm() {
    const browser = await chromium.launch({ args: GL.args, env: { ...process.env, ...GL.env } });
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    // Capture through the DevTools protocol with its fast encoder: the same JPEG bytes, a third less time.
    page.capture = await page.context().newCDPSession(page);
    const problems = [];
    page.on("pageerror", (error) => {
      problems.push(error.message);
      console.error(`page error: ${error.message}`);
    });
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      problems.push(message.text());
      console.error(`page: ${message.text()}`);
    });
    page.on("requestfailed", (request) => problems.push(`could not load ${request.url()}`));
    page.on("response", (response) => response.status() >= 400 && problems.push(`${response.status()} for ${response.url()}`));
    await page.goto(url);
    try {
      await page.waitForFunction(() => window.__ready && [...document.images].every((img) => img.complete), null, { timeout: 120000 });
    } catch {
      // The film never said it was ready: say why, instead of a bare timeout.
      const state = await page.evaluate(() => ({ ready: Boolean(window.__ready), images: [...document.images].filter((img) => !img.complete).map((img) => img.src) })).catch(() => null);
      await browser.close();
      throw new Error(
        `the film did not get ready in 120 s.\n${problems.length ? `What went wrong in the page:\n  ${[...new Set(problems)].slice(0, 8).join("\n  ")}` : "The page reported no error: check that film.js ends with film.finish()."}${state?.images?.length ? `\nImages still loading: ${state.images.join(", ")}` : ""}`,
      );
    }
    if (!openFilm.checked) {
      openFilm.checked = true;
      const renderer = await page.evaluate(() => {
        const c = document.createElement("canvas").getContext("webgl2");
        const info = c?.getExtension("WEBGL_debug_renderer_info");
        return c ? c.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : c.RENDERER) : "none";
      });
      const expected = HAS_GPU ? !/swiftshader|llvmpipe|software/i.test(renderer) : /llvmpipe/i.test(renderer);
      if (expected) console.log(`WebGL: ${renderer}`);
      else console.warn(`WebGL runs on "${renderer}", not on ${HAS_GPU ? "the GPU" : "lavapipe"}: rendering will be slow. Check the machine's graphics drivers.`);
    }
    return { browser, page };
  }
  const grab = async (page) => Buffer.from((await page.capture.send("Page.captureScreenshot", { format: "jpeg", quality: 98, optimizeForSpeed: true })).data, "base64");
  const seek = (page, time) =>
    page.evaluate((t) => {
      window.__timelines.root.time(t);
      window.__frame();
    }, time);
  const ffmpeg = (ffmpegArgs, stdin = "ignore") => {
    const child = spawn("ffmpeg", ["-y", "-loglevel", "error", ...ffmpegArgs], { stdio: [stdin, "inherit", "inherit"] });
    const done = new Promise((ok, fail) => {
      child.on("error", fail);
      child.on("close", (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited with ${code}`))));
    });
    return { child, done };
  };
  // The finishing pass: highlights bloom into their surroundings (blurred at quarter size, which is far cheaper and
  // looks the same), then fine grain that changes every frame.
  const FINISH =
    `format=gbrp,split[a][b];[b]scale=${W / 4}:${H / 4},curves=all='0/0 0.56/0 1/1',gblur=sigma=6.5,scale=${W}:${H}:flags=bicubic[glow];[a][glow]blend=all_mode=screen:all_opacity=0.34,noise=alls=5:allf=t,format=yuv420p`;
  const finish = args.includes("--raw") ? ["-pix_fmt", "yuv420p"] : ["-filter_complex", FINISH];

  // In time order: a film whose state cannot run backwards would draw a wrong frame after a seek back.
  const stills = flag("--stills")?.split(",").map(Number).sort((a, b) => a - b);
  if (stills) {
    const dir = flag("--dir") ? out : join(out, "stills");
    mkdirSync(dir, { recursive: true });
    const { browser, page } = await openFilm();
    if (args.includes("--safe")) await page.evaluate(() => document.documentElement.setAttribute("data-safe", ""));
    for (const time of stills) {
      await seek(page, time);
      const raw = join(dir, `.raw-${time.toFixed(2)}.png`);
      writeFileSync(raw, Buffer.from((await page.capture.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
      const still = join(dir, `still-${time.toFixed(2).padStart(6, "0")}.png`);
      await ffmpeg(["-i", raw, ...finish, "-frames:v", "1", "-update", "1", "-pix_fmt", "rgb24", still]).done;
      unlinkSync(raw);
    }
    console.log(`${stills.length} stills in ${dir}`);
    await browser.close();
  } else {
    const first = await openFilm();
    const duration = await first.page.evaluate(() => window.__timelines.root.duration());
    const segments = Math.ceil(duration / SEGMENT);
    const segDir = join(out, "segments");
    mkdirSync(segDir, { recursive: true });
    const file = (i) => join(segDir, `seg-${String(i).padStart(3, "0")}-${fps}.mp4`);
    // --only 12-16 or several ranges at once: --only 12-16,30-34
    const only = flag("--only")?.split(",").map((range) => range.split("-").map(Number));
    // What the picture is made from, as one fingerprint.
    const fingerprint = createHash("sha256");
    const walk = (dir, skip) => {
      for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const path = join(dir, entry.name);
        if (skip(entry.name, path)) continue;
        if (entry.isDirectory()) walk(path, skip);
        else if (entry.isFile()) fingerprint.update(entry.name).update(readFileSync(path));
      }
    };
    walk(film, (name) => ["out", "storyboard", "node_modules"].includes(name) || /^cues\.|^storyboard\.html$|\.mp3$|\.wav$|\.py$|^\./.test(name));
    walk(join(workspace, "kit", "engine"), () => false);
    walk(join(workspace, "kit", "css"), () => false);
    fingerprint.update(`${W}x${H}@${fps}/${SEGMENT}${args.includes("--raw") ? "raw" : ""}`);
    const source = fingerprint.digest("hex");
    const stamp = join(segDir, `source-${fps}.sha`);
    const unchanged = existsSync(stamp) && readFileSync(stamp, "utf8") === source;
    const wanted = [];
    for (let i = 0; i < segments; i++) {
      // A segment is current when it was made from this source: by its own stamp (written as each segment finishes,
      // so an interrupted render resumes where it stopped), or by the whole render's stamp (older renders).
      const own = `${file(i)}.sha`;
      const current = existsSync(own) ? readFileSync(own, "utf8") === source : unchanged;
      const touches = only ? only.some(([a, b]) => i * SEGMENT < b && (i + 1) * SEGMENT > a) : args.includes("--force") || !current;
      if (touches || !existsSync(file(i))) wanted.push(i);
    }
    if (!wanted.length) console.log("nothing the picture is made from has changed: every segment is reused (--force renders them anyway)");
    const perSegment = Math.round(SEGMENT * fps);
    const total = Math.round(duration * fps);
    const encode = [...finish, "-c:v", "libx264", "-preset", "fast", "-crf", "15", "-r", String(fps)];
    const queue = [...wanted];
    let drawn = 0;
    const frames = wanted.reduce((n, i) => n + Math.min(perSegment, total - i * perSegment), 0);
    const began = Date.now();
    await Promise.all(
      Array.from({ length: Math.min(jobs, Math.max(1, queue.length)) }, async (_, job) => {
        const { browser, page } = job === 0 ? first : await openFilm();
        while (queue.length) {
          const i = queue.shift();
          const from = i * perSegment;
          const to = Math.min(total, from + perSegment);
          // JPEG at near-lossless quality: Chromium encodes it more than ten times faster than PNG for grainy frames.
          const input = ["-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-"];
          const part = join(segDir, `part-${i}-${fps}.mp4`);
          const { child, done } = ffmpeg([...input, ...encode, part], "pipe");
          for (let frame = from; frame < to; frame++) {
            await seek(page, frame / fps);
            const shot = await grab(page);
            if (!child.stdin.write(shot)) await new Promise((drain) => child.stdin.once("drain", drain));
            if (++drawn % 120 === 0) console.log(`${drawn} of ${frames} frames, ${((Date.now() - began) / 1000).toFixed(0)}s`);
          }
          child.stdin.end();
          await done;
          renameSync(part, file(i));
          writeFileSync(`${file(i)}.sha`, source);
        }
        await browser.close();
      }),
    );
    writeFileSync(stamp, source);
    // --only says the change touches only those seconds: the other segments stand for this source too, so a later
    // run without --only (make.mjs after a fix) reuses them instead of rendering the whole film again.
    if (only) for (let i = 0; i < segments; i++) if (existsSync(file(i))) writeFileSync(`${file(i)}.sha`, source);
    const list = join(segDir, "list.txt");
    writeFileSync(list, Array.from({ length: segments }, (_, i) => `file '${file(i)}'\n`).join(""));
    const picture = flag("--out") ?? join(out, "picture.mp4");
    await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", picture]).done;
    console.log(`${wanted.length} of ${segments} segments rendered (${frames} frames at ${fps} fps) -> ${picture}`);
  }
  server.close();
}

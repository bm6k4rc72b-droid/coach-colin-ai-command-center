// Checks that this machine can make a film, and says what to do about anything it cannot.
//
//   node kit/tools/doctor.mjs
//
// Exit code 1 when something a film needs is missing. Things marked "optional" only limit what you can do.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const kit = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = dirname(kit);
let failed = 0;
const ok = (name, detail = "") => console.log(`  ok       ${name}${detail ? `  ${detail}` : ""}`);
const missing = (name, fix) => {
  failed++;
  console.log(`  MISSING  ${name}\n           ${fix}`);
};
const optional = (name, fix) => console.log(`  optional ${name}\n           ${fix}`);
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { encoding: "utf8" });
  return result.status === 0 ? (result.stdout || result.stderr).trim() : null;
};

console.log("Motion Educator: environment check");
const node = Number(process.versions.node.split(".")[0]);
if (node >= 20) ok("Node", process.versions.node);
else missing(`Node 20 or newer (this is ${process.versions.node})`, "install a current Node");

const ffmpeg = run("ffmpeg", ["-version"]);
if (ffmpeg && run("ffprobe", ["-version"])) ok("FFmpeg", ffmpeg.split("\n")[0].replace("ffmpeg version ", "").split(" ")[0]);
else missing("FFmpeg and ffprobe on PATH", "install FFmpeg (apt install ffmpeg, brew install ffmpeg)");
if (ffmpeg && !/--enable-libx264/.test(ffmpeg)) missing("FFmpeg with libx264", "install an FFmpeg build that has the x264 encoder");

const numpy = run("python3", ["-c", "import numpy; print(numpy.__version__)"]);
if (numpy) ok("Python 3 with numpy", numpy);
else missing("Python 3 with numpy (the sound mixer)", "pip install numpy");

for (const pkg of ["gsap", "three", "@fontsource-variable/sora", "@fontsource-variable/inter", "@fontsource-variable/jetbrains-mono", "@fontsource/patrick-hand"]) {
  if (!existsSync(join(workspace, "node_modules", pkg))) {
    missing(`npm package ${pkg}`, `run "npm install" in ${workspace}`);
    break;
  }
}
if (!failed || existsSync(join(workspace, "node_modules", "gsap"))) ok("npm packages", "gsap, three, fonts");

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)("playwright"));
} catch {
  missing("Playwright", 'run "npm install -D playwright && npx playwright install chromium"');
}
if (chromium) {
  try {
    // The renderer's one way to draw: the GPU, else Mesa lavapipe (render.mjs). Check the same here.
    const lvp = ["/usr/share/vulkan/icd.d/lvp_icd.json", "/etc/vulkan/icd.d/lvp_icd.json"].find(existsSync);
    const gpu = process.platform === "darwin" || process.platform === "win32" || existsSync("/dev/nvidia0") || (existsSync("/dev/dri") && readdirSync("/dev/dri").some((n) => n.startsWith("renderD")));
    if (!gpu && !lvp) missing("a GPU or Mesa lavapipe", "apt install mesa-vulkan-drivers   (software Vulkan: the renderer needs it on a machine with no GPU)");
    const browser = await chromium.launch(
      gpu || !lvp
        ? { args: ["--ignore-gpu-blocklist", "--enable-gpu", "--use-gl=angle"] }
        : { args: ["--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=vulkan", "--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan", "--disable-vulkan-surface"], env: { ...process.env, VK_ICD_FILENAMES: lvp } },
    );
    const page = await browser.newPage();
    const gl = await page.evaluate(() => {
      const context = document.createElement("canvas").getContext("webgl2");
      if (!context) return null;
      const info = context.getExtension("WEBGL_debug_renderer_info");
      return info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : "WebGL2";
    });
    await browser.close();
    if (gl) ok("Chromium with WebGL2", /llvmpipe/i.test(gl) ? "on Mesa lavapipe (no GPU): heavy 3D about a second a frame" : /swiftshader/i.test(gl) ? "on SwiftShader, which the renderer does not use: install a GPU driver or mesa-vulkan-drivers" : `on the GPU: ${gl.slice(0, 60)}`);
    else missing("WebGL2 in headless Chromium", "the stage and 3D layers need it; try a newer Chromium");
  } catch (error) {
    missing("a Chromium that Playwright can launch", `npx playwright install chromium   (${String(error.message).split("\n")[0]})`);
  }
}

const lib = join(kit, "audio", "lib");
const count = (folder) => (existsSync(join(lib, folder)) ? readdirSync(join(lib, folder)).filter((file) => file.endsWith(".mp3")).length : 0);
if (count("sfx") >= 40 && count("music") >= 3) ok("sound library", `${count("sfx")} effects, ${count("music")} music tracks`);
else optional("sound library not downloaded", "bash kit/audio/fetch.sh   (music and effects; a film can still be rendered silent)");

if (process.env.ELEVENLABS_API_KEY) ok("ELEVENLABS_API_KEY", "narration can be generated with kit/audio/voice.mjs --generate");
else optional("no ELEVENLABS_API_KEY", "narration is then performed through a speech connector and handed in with kit/audio/voice.mjs --take (see references/voice.md)");

try {
  const hand = execFileSync("fc-list", [":family"], { encoding: "utf8" });
  if (!/emoji/i.test(hand)) optional("no emoji font installed", "emoji in a film would render as boxes; films in this kit do not use them");
} catch {}

console.log(failed ? `\n${failed} thing(s) missing: fix them, then run this again.` : "\nReady to make a film.");
process.exit(failed ? 1 : 0);

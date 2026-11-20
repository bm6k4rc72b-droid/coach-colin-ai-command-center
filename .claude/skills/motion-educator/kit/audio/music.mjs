// A music bed made for one film: composed by ElevenLabs Music to the film's length and mood, so it fits the
// film instead of a stock track cut to size.
//
//   node kit/audio/music.mjs films/NAME --prompt "what the music should be"     compose it (ELEVENLABS_API_KEY)
//   node kit/audio/music.mjs films/NAME                                          status: the bed and its prompt
//
// The status measures how the bed moves, not just its average level: a silent lead-in, silence inside, a wide
// loudness range (swells under a voice), music that stops before the picture. Each is a reason to compose again.
//
// It writes films/NAME/music/bed.mp3 (and bed.json: the prompt, the length, when) and points cues.json's music at
// it. The length is the storyboard's duration plus a second and a half, so the music never stops before the
// picture; the mixer fades its tail.
//
// What makes a good prompt (references/sound.md): instrumental, the mood of the subject, one or two instruments,
// a tempo, "no vocals", and how it should move ("starts at once, settles under a voice, swells a little near the
// end, resolves on the last chord"). Under narration ask for something sparse: no lead melody, nothing in the
// voice's range. Each call is one composition; do not ask for another unless the first is wrong for the film.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const film = resolve(args.find((arg, i) => !arg.startsWith("--") && args[i - 1] !== "--prompt" && existsSync(join(arg, "storyboard.json"))) ?? ".");
if (!existsSync(join(film, "storyboard.json"))) throw new Error("pass the film's folder (the one with storyboard.json)");
const sb = JSON.parse(readFileSync(join(film, "storyboard.json"), "utf8"));
const here = dirname(fileURLToPath(import.meta.url));
const dir = join(film, "music");
const bed = join(dir, "bed.mp3");
const prompt = flag("--prompt");

if (prompt) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("composing needs ELEVENLABS_API_KEY in the environment");
  const length = Math.round((sb.duration + 1.5) * 1000);
  if (length > 300000) throw new Error("the film is longer than five minutes: compose its bed in parts");
  mkdirSync(dir, { recursive: true });
  const request = join(dir, ".request.json");
  writeFileSync(request, JSON.stringify({ prompt, music_length_ms: length, model_id: "music_v1" }));
  // Through curl, which honours a proxy; the key on standard input, never on the command line.
  const call = spawnSync(
    "curl",
    ["-sS", "--max-time", "600", "-o", bed, "-w", "%{http_code}", "-X", "POST", "-H", "@-", "-H", "content-type: application/json", "--data-binary", `@${request}`, "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128"],
    { input: `xi-api-key: ${key}\n`, encoding: "utf8" },
  );
  rmSync(request, { force: true });
  const status = Number(call.stdout);
  if (call.status !== 0 || status !== 200) {
    const text = existsSync(bed) ? readFileSync(bed, "utf8").slice(0, 300) : call.stderr;
    rmSync(bed, { force: true });
    throw new Error(`ElevenLabs Music answered ${status || "nothing"}: ${text}`);
  }
  writeFileSync(join(dir, "bed.json"), `${JSON.stringify({ prompt, length_ms: length, film_duration: sb.duration, made: new Date().toISOString().slice(0, 10) }, null, 2)}\n`);
  // Point the cue sheet's music at it; the level and fades stay as they are.
  const cuesFile = join(film, "cues.json");
  const cues = existsSync(cuesFile) ? JSON.parse(readFileSync(cuesFile, "utf8")) : { music: {}, events: [] };
  // A composed bed sits under the film: at -22 LUFS unless the cue sheet already asks for something quieter.
  const lufs = Math.min(-22, cues.music?.lufs ?? -22);
  cues.music = { fade_out: 1.8, ...cues.music, lufs, file: relative(here, bed).split("\\").join("/"), start: 0 };
  writeFileSync(cuesFile, `${JSON.stringify(cues, null, 2)}\n`);
  console.log(`composed ${(length / 1000).toFixed(1)} s -> ${relative(process.cwd(), bed)}; cues.json now plays it`);
}

// ── Status ─────────────────────────────────────────────────────────────────
if (!existsSync(bed)) {
  console.log("no bed composed for this film yet: it uses the cue sheet's library track");
  process.exit(0);
}
const info = existsSync(join(dir, "bed.json")) ? JSON.parse(readFileSync(join(dir, "bed.json"), "utf8")) : {};
const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", bed], { encoding: "utf8" });
const seconds = Number(probe.stdout);
const loud = spawnSync("ffmpeg", ["-hide_banner", "-i", bed, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" }).stderr;
const lufs = loud.slice(loud.lastIndexOf("Summary:")).match(/I:\s+(-?[\d.]+) LUFS/)?.[1];
console.log(`bed: ${seconds.toFixed(1)} s, ${lufs} LUFS, for a ${sb.duration.toFixed(1)} s film${seconds < sb.duration ? "  <- SHORTER than the film: compose it again" : ""}`);
// How it moves, not just how loud it is on average: a silent lead-in, a range of swells, an early end.
const range = Number(loud.slice(loud.lastIndexOf("Summary:")).match(/LRA:\s+(-?[\d.]+) LU/)?.[1]);
const quiet = spawnSync("ffmpeg", ["-hide_banner", "-i", bed, "-af", "silencedetect=n=-45dB:d=0.4", "-f", "null", "-"], { encoding: "utf8" }).stderr;
const gaps = [...quiet.matchAll(/silence_start: (-?[\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)].map((m) => [Math.max(0, Number(m[1])), Number(m[2])]);
const trail = quiet.match(/silence_start: ([\d.]+)(?![\s\S]*silence_end)/);
const lead = gaps.find(([a]) => a < 0.05);
if (lead) console.log(`  <- ${lead[1].toFixed(1)} s of silence before the music starts: compose it again ("starts at once, no intro")`);
if (Number.isFinite(range)) console.log(`loudness range ${range} LU${range > 10 ? "  <- it swells and drops: under a voice ask for an even level" : ""}`);
const inside = gaps.filter(([a, b]) => a >= 0.05 && b < seconds - 0.5);
if (inside.length) console.log(`  <- silent inside: ${inside.map(([a, b]) => `${a.toFixed(1)}-${b.toFixed(1)} s`).join(", ")}`);
if (trail && Number(trail[1]) < sb.duration) console.log(`  <- the music falls silent at ${Number(trail[1]).toFixed(1)} s, before the picture ends at ${sb.duration.toFixed(1)} s`);
if (info.prompt) console.log(`prompt: ${info.prompt}`);
if (Math.abs((info.film_duration ?? sb.duration) - sb.duration) > 1) console.log("  <- the film's length changed since the bed was composed: compose it again so it ends with the film");

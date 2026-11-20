// A smoke test of the whole kit, in both formats: the storyboard check, the scaffold, stills, a short render, the
// narration tool and the mixer. About two minutes on four cores.
//
//   node kit/tools/test.mjs            (or: npm test)
//
// It needs what a film needs (run kit/tools/doctor.mjs first) but not the sound library and not an API key.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sketch } from "./sketch.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tool = (name) => join(repo, "kit", "tools", name);
let failed = 0;
let count = 0;
function test(name, fn) {
  count++;
  const began = Date.now();
  try {
    fn();
    console.log(`  pass  ${name}  (${((Date.now() - began) / 1000).toFixed(1)} s)`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(error.message).split("\n").slice(0, 6).join("\n        ")}`);
  }
}
const run = (cmd, args, { expect = 0, cwd } = {}) => {
  const result = spawnSync(cmd, args, { encoding: "utf8", cwd });
  if (result.status !== expect) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} exited with ${result.status}, expected ${expect}\n${(result.stderr || result.stdout).trim().split("\n").slice(-5).join("\n")}`);
  return result.stdout + result.stderr;
};
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};
const probe = (file, entries) => execFileSync("ffprobe", ["-v", "error", "-show_entries", entries, "-of", "csv=p=0", file]).toString().trim();
// A picture's size as "WxH". Read by pattern: some ffprobe builds add fields after the two numbers.
const size = (file) => {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", file]).toString();
  return out.match(/(\d+)x(\d+)/)?.[0] ?? out.trim();
};
// Mean brightness of an image, 0 to 255: a blank frame is under 5.
const brightness = (file) => {
  const out = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-vf", "format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-frames:v", "1", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  return Number(out.match(/YAVG=([0-9.]+)/)?.[1] ?? 0);
};

console.log("Motion Educator: smoke test");

test("the sketcher draws both formats", () => {
  const frame = { at: 0, note: "", draw: [{ glow: [540, 700, 300] }, { title: [540, 800], text: "Why?", size: 120 }, { horizon: [1500] }] };
  assert(sketch(frame, "a").includes('viewBox="0 0 1920 1080"'), "landscape viewBox is wrong");
  assert(sketch(frame, "b", { width: 1080, height: 1920 }).includes('viewBox="0 0 1080 1920"'), "portrait viewBox is wrong");
});

for (const example of readdirSync(join(repo, "examples"))) {
  if (!existsSync(join(repo, "examples", example, "storyboard.json"))) continue;
  test(`examples/${example}: storyboard passes`, () => {
    const out = run("node", [tool("storyboard.mjs"), join(repo, "examples", example)]);
    assert(/ 0 errors/.test(out), out.trim().split("\n").at(-1));
  });
}

const workspace = mkdtempSync(join(tmpdir(), "motion-educator-test-"));
try {
  test("the scaffold makes a workspace with a landscape and a portrait film", () => {
    run("node", [tool("new.mjs"), workspace, "wide"]);
    run("node", [tool("new.mjs"), workspace, "tall", "--portrait"]);
    symlinkSync(join(repo, "node_modules"), join(workspace, "node_modules"), "dir");
    assert(existsSync(join(workspace, "kit", "engine", "motion.js")), "the kit was not copied");
    assert(JSON.parse(readFileSync(join(workspace, "films", "tall", "storyboard.json"), "utf8")).format === "1080x1920", "the portrait film is not 1080x1920");
  });

  test("the template's storyboard is refused until it is written", () => {
    const out = run("node", [join(workspace, "kit", "tools", "storyboard.mjs"), join(workspace, "films", "wide")], { expect: 1 });
    assert(/error/.test(out), "expected rule errors for the one-shot template");
  });

  for (const [name, want] of [["wide", "1920x1080"], ["tall", "1080x1920"]]) {
    test(`${name}: a still is ${want} and not blank`, () => {
      const film = join(workspace, "films", name);
      run("node", [join(workspace, "kit", "tools", "render.mjs"), film, "--stills", "1.5"]);
      const still = join(film, "out", "stills", "still-001.50.png");
      assert(size(still) === want, `the still is ${size(still)}`);
      assert(brightness(still) > 8, `the still is nearly black (mean ${brightness(still)})`);
    });
  }

  const tall = join(workspace, "films", "tall");
  const keepPlain = () => writeFileSync(join(workspace, "films", "tall-plain.json"), readFileSync(join(tall, "storyboard.json")));
  keepPlain();
  // A stand-in film that speaks: three speaking shots and a silent last one, and a stand-in take whose "words" are
  // bursts of tone at known times, with a long pause before the third line.
  const voiceTool = join(workspace, "kit", "audio", "voice.mjs");
  test("tall: the script is one take; a performance is taken in, matched to the script and the film is cut to it", () => {
    const plan = JSON.parse(readFileSync(join(tall, "storyboard.json"), "utf8"));
    const base = plan.shots[0];
    plan.voice = { voice_id: "test-voice", name: "Test", model: "eleven_v4", language: "en" };
    plan.shots = [
      { ...base, id: "s01", voice: "Why is the sky *blue*?" },
      { ...base, id: "s02", voice: "Because air scatters blue light most." },
      { ...base, id: "s03", voice: "[warmly] That is the whole answer." },
      { ...base, id: "s04", start: 0, end: 1.5 },
    ];
    writeFileSync(join(tall, "storyboard.json"), `${JSON.stringify(plan, null, 2)}\n`);
    const script = JSON.parse(run("node", [voiceTool, tall, "--script"]));
    assert(script.shots.length === 3 && script.take.includes("Because air") && !script.take.includes("*"), "the script should be one take of three lines, without accent marks");
    run("node", [voiceTool, tall], { expect: 1 }); // no take yet
    const heard = "why is the sky blue because air scatters blue light most that is the hole answer".split(" ");
    const starts = [0.3, 0.55, 0.75, 0.95, 1.2, 2.0, 2.4, 2.7, 3.1, 3.4, 3.7, 6.0, 6.3, 6.5, 6.7, 7.0, 7.3];
    const words = heard.map((text, k) => ({ text, start: starts[k], end: starts[k] + 0.2, type: "word" }));
    writeFileSync(join(workspace, "words.json"), JSON.stringify({ words }));
    const take = join(workspace, "take.mp3");
    run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=220:duration=8", "-ar", "44100", take]);
    const out = run("node", [voiceTool, tall, "--take", take, "--words", join(workspace, "words.json")]);
    assert(/retimed: 4 shots/.test(out), out.trim().split("\n")[0]);
    const voice = JSON.parse(readFileSync(join(tall, "voice", "voice.json"), "utf8"));
    assert(voice.missed.join() === "whole", `expected only "whole" to be unheard, got ${voice.missed}`);
    assert(voice.pieces.length === 2, `the long pause should open the take once: ${voice.pieces.length} stretches`);
    const cut = JSON.parse(readFileSync(join(tall, "storyboard.json"), "utf8"));
    const [a, b, c, d] = cut.shots;
    assert(a.start === 0 && Math.abs(voice.film.s01.from - 0.15) < 0.01, "the first word should come 0.15 s into the film");
    assert(Math.abs(b.start - (voice.film.s02.from - 0.1)) < 0.03, "a shot should start just before its first word");
    assert(voice.film.s03.from - voice.film.s02.to < 0.85, "a pause held too long should be shortened");
    assert(Math.abs(d.end - d.start - 1.5) < 0.01 && Math.abs(cut.duration - d.end) < 0.001, "the silent shot keeps its length and ends the film");
    for (let k = 1; k < voice.pieces.length; k++) assert(voice.pieces[k].from >= voice.pieces[k - 1].to - 0.001, "two stretches of the take overlap");
    assert(/film:/.test(run("node", [voiceTool, tall])), "the status should pass once the film is cut to the take");
    // A silent beat right after a line the performer barely paused after: the stretches must not share sound,
    // and the next line's words must come after the beat.
    const tight = JSON.parse(readFileSync(join(tall, "storyboard.json"), "utf8"));
    tight.shots.splice(1, 0, { ...base, id: "s01b", start: 0, end: 1.0 });
    delete tight.shots[1].voice;
    writeFileSync(join(tall, "storyboard.json"), `${JSON.stringify(tight, null, 2)}\n`);
    run("node", [voiceTool, tall, "--retime"]);
    const again = JSON.parse(readFileSync(join(tall, "voice", "voice.json"), "utf8"));
    const beat = JSON.parse(readFileSync(join(tall, "storyboard.json"), "utf8")).shots[1];
    for (let k = 1; k < again.pieces.length; k++) assert(again.pieces[k].from >= again.pieces[k - 1].to - 0.001, "stretches overlap around a silent beat");
    assert(again.film.s02.from >= beat.end + 0.05, `the line after a silent beat starts at ${again.film.s02.from}, before the beat ends at ${beat.end}`);
    // Splitting a speaking shot in two, with the words unchanged, needs only a retime.
    const split = JSON.parse(readFileSync(join(tall, "storyboard.json"), "utf8"));
    const at = split.shots.findIndex((shot) => shot.id === "s02");
    split.shots.splice(at, 1, { ...split.shots[at], id: "s02a", voice: "Because air scatters" }, { ...split.shots[at], id: "s02b", voice: "blue light most." });
    writeFileSync(join(tall, "storyboard.json"), `${JSON.stringify(split, null, 2)}\n`);
    assert(/retimed: 6 shots/.test(run("node", [voiceTool, tall, "--retime"])), "a retime after splitting a shot should keep the take");
    writeFileSync(join(tall, "storyboard.json"), `${JSON.stringify(cut, null, 2)}\n`);
    run("node", [voiceTool, tall, "--retime"]);
  });

  test("tall: the check reads the script as a listener would", () => {
    const out = run("node", [join(workspace, "kit", "tools", "storyboard.mjs"), tall], { expect: 1 });
    assert(!/does not open on a question/.test(out), "a script that opens on a question was flagged");
    const plan = JSON.parse(readFileSync(join(tall, "storyboard.json"), "utf8"));
    const stiff = { ...plan, language: "id", voice: { ...plan.voice, language: "id" }, shots: plan.shots.map((shot, k) => (k === 1 ? { ...shot, voice: "Hal ini tidak hanya terjadi 343 kali." } : shot)) };
    writeFileSync(join(workspace, "films", "wide", "storyboard.json"), `${JSON.stringify({ ...stiff, format: "1920x1080" }, null, 2)}\n`);
    const report = run("node", [join(workspace, "kit", "tools", "storyboard.mjs"), join(workspace, "films", "wide")], { expect: 1 });
    for (const expected of ['"tidak" is written Indonesian', '"hanya" is written Indonesian', "has digits", '"hal ini" is written Indonesian']) assert(report.includes(expected), `the check missed: ${expected}`);
  });

  test("tall: a short render has every frame, at 1080x1920", () => {
    run("node", [join(workspace, "kit", "tools", "render.mjs"), tall, "--fps", "10", "--jobs", "2"]);
    const picture = join(tall, "out", "picture.mp4");
    assert(size(picture) === "1080x1920", `the picture is ${size(picture)}, not 1080x1920`);
    const frames = Number(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", picture]).toString().match(/\d+/)?.[0]);
    const expected = Math.round(JSON.parse(readFileSync(join(tall, "storyboard.json"), "utf8")).duration * 10);
    assert(Math.abs(frames - expected) <= 1, `${frames} frames, expected ${expected}`);
  });

  test("tall: rendering again with nothing changed reuses every segment", () => {
    const out = run("node", [join(workspace, "kit", "tools", "render.mjs"), tall, "--fps", "10", "--jobs", "2"]);
    assert(/every segment is reused/.test(out) && /0 of \d+ segments rendered/.test(out), out.trim().split("\n").slice(-2).join(" | "));
  });

  test("the sketcher draws every kind of thing, and the check refuses a thing without its numbers", () => {
    const things = [{ ring: [540, 900, 200] }, { cloud: [540, 300, 400] }, { bolt: [540, 300, 500, 1200] }, { path: "M100 100 L300 400" }, { label: [540, 1500], text: "343 m/s" }];
    const svg = sketch({ at: 0, note: "", draw: things }, "k", { width: 1080, height: 1920 });
    assert((svg.match(/<circle|<path|<text/g) ?? []).length >= 5, "some things drew nothing");
    const plan = JSON.parse(readFileSync(join(workspace, "films", "tall-plain.json"), "utf8"));
    plan.shots[0].frames[0].draw.push({ ring: "540" });
    writeFileSync(join(workspace, "films", "wide", "storyboard.json"), `${JSON.stringify({ ...plan, format: "1920x1080" }, null, 2)}\n`);
    const out = run("node", [join(workspace, "kit", "tools", "storyboard.mjs"), join(workspace, "films", "wide")], { expect: 1 });
    assert(/"ring" needs its numbers in a list/.test(out), "the check did not refuse a ring without numbers");
  });

  test("tall: the mixer lays the narration on the picture at the target loudness", () => {
    writeFileSync(join(tall, "cues.json"), '{ "music": { "file": "none" }, "events": [] }\n');
    const out = run("python3", [join(workspace, "kit", "audio", "mix.py"), tall, "--no-music"]);
    assert(/2 voice stretches/.test(out), `the mix did not lay both stretches of the take: ${out.trim()}`);
    const lufs = Number(out.match(/mix: (-?[\d.]+) LUFS/)?.[1]);
    assert(Math.abs(lufs + 14) < 1.5, `mixed at ${lufs} LUFS, expected about -14`);
    assert(probe(join(tall, "out", "tall.mp4"), "stream=codec_type").includes("audio"), "the mixed film has no sound");
  });

  test("tall: the measurements run on the finished film", () => {
    const out = run("node", [join(workspace, "kit", "tools", "check.mjs"), tall]);
    assert(/decodes cleanly/.test(out) && /LUFS/.test(out), out.trim());
  });
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} of ${count} failed` : `\nall ${count} passed`);
process.exit(failed ? 1 : 0);

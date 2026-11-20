// The narration. A film that speaks is written as one script, performed as one take, and cut to that take:
// the voice is never chopped into sentences and re-spaced, because a voice that restarts on every line is the
// first thing a listener hears as fake.
//
//   node kit/audio/voice.mjs films/NAME                  status: the script, the take, how well they agree, the cut
//   node kit/audio/voice.mjs films/NAME --script         the text to perform, as JSON (the whole take and each shot's part)
//   node kit/audio/voice.mjs films/NAME --take AUDIO --words WORDS
//                                                        take in a performance: AUDIO is a file or an https URL, WORDS the
//                                                        time of every word in it (a transcription with word times: a file
//                                                        or an https URL)
//   node kit/audio/voice.mjs films/NAME --generate       perform it with the ElevenLabs API (ELEVENLABS_API_KEY), which
//                                                        returns the take and its word times together
//   node kit/audio/voice.mjs films/NAME --retime         set every shot's start and end in storyboard.json from the take
//
// In storyboard.json each speaking shot has "voice": its part of the script, in order. Read one after another the
// parts are the script. A shot with no "voice" is a silent beat and keeps the length it was given; "hold": seconds
// on a speaking shot adds silence after its line. The storyboard names the voice once:
//   "voice": { "voice_id": "...", "name": "...", "model": "eleven_v3", "language": "id" }
//
// --take and --generate end by retiming. After that the storyboard's times are the take's: a shot starts just before
// its first word. Exit code 1 when there is no take, the script changed since it was performed, or the storyboard's
// times are not the take's.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const film = resolve(args.find((arg, i) => !arg.startsWith("--") && !["--take", "--words"].includes(args[i - 1]) && existsSync(join(arg, "storyboard.json"))) ?? ".");
const boardFile = join(film, "storyboard.json");
if (!existsSync(boardFile)) throw new Error("pass the film's folder (the one with storyboard.json)");
const sb = JSON.parse(readFileSync(boardFile, "utf8"));
const dir = join(film, "voice");
const manifestFile = join(dir, "voice.json");
let manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : null;

// How the cut sits on the voice. A shot starts LEAD before its first word; the film's first word comes at FIRST;
// a pause the performer held longer than PAUSE is shortened to it; the film runs TAIL past the last word when no
// silent shot follows.
const cut = { first: 0.15, lead: 0.1, pause: sb.voice?.max_pause ?? 0.75, tail: 0.9 };
const round = (n) => Math.round(n * 1000) / 1000;

// ── The script ─────────────────────────────────────────────────────────────
const shots = sb.shots ?? [];
const speaking = shots.filter((shot) => typeof shot.voice === "string" && shot.voice.trim());
// What is performed keeps its direction tags ([warmly], [pause]); what is read and matched does not.
const plain = (text) => text.replace(/\[[^\]]*\]/g, " ").replaceAll("*", "").replace(/\s+/g, " ").trim();
const tokensOf = (text) => plain(text).split(" ").filter(Boolean);
const key = (word) => word.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
// One take, a paragraph an act: a new act is a new breath.
function takeText() {
  let text = "";
  let act = null;
  for (const shot of speaking) {
    text += text ? (shot.act !== act ? "\n\n" : " ") : "";
    text += shot.voice.replaceAll("*", "").trim();
    act = shot.act;
  }
  return sb.voice?.direction ? `${sb.voice.direction} ${text}` : text;
}
// What makes a take stale: other words, another voice or model. Not where the acts fall: that only moves a breath.
const sha = () => createHash("sha256").update(`${sb.voice?.voice_id ?? ""}\n${sb.voice?.model ?? ""}\n${sb.voice?.direction ?? ""}\n${speaking.map((shot) => shot.voice.replaceAll("*", "").trim()).join(" ")}`).digest("hex").slice(0, 16);

if (args.includes("--script")) {
  console.log(JSON.stringify({ voice: sb.voice ?? null, characters: takeText().length, take: takeText(), shots: speaking.map((shot) => ({ id: shot.id, text: shot.voice })) }, null, 2));
  process.exit(0);
}

// ── Taking in a performance ────────────────────────────────────────────────
async function bring(source, name) {
  mkdirSync(dir, { recursive: true });
  const local = join(dir, name);
  if (/^https:\/\//.test(source)) {
    // curl first: it honours a proxy set in the environment, which Node's own fetch does not.
    if (spawnSync("curl", ["-fsSL", "--max-time", "180", "-o", local, source]).status !== 0) {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`could not fetch ${name}: ${response.status}`);
      writeFileSync(local, Buffer.from(await response.arrayBuffer()));
    }
  } else if (resolve(source) !== local) copyFileSync(source, local);
  return local;
}
// Word times arrive in several shapes: { words: [{ text, start, end, type }] } from a transcription, a bare list of
// the same, or [[start, end, word], ...].
function readWords(file) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  const list = Array.isArray(data) ? data : (data.words ?? data.transcripts?.[0]?.words ?? []);
  return list
    .map((w) => (Array.isArray(w) ? { start: w[0], end: w[1], text: w[2] } : { start: w.start ?? w.start_time, end: w.end ?? w.end_time, text: w.text ?? w.word, type: w.type }))
    // A delivery tag such as [warmly] can come back in the list as if it were a word; it was not said.
    .filter((w) => w.text?.trim() && !/^\[.*\]$/.test(w.text.trim()) && (w.type ?? "word") === "word" && Number.isFinite(w.start) && Number.isFinite(w.end));
}
// Lines the heard words up with the written ones (longest common run of matching words), then gives every written
// word a time: its own where it was heard, otherwise shared out between its neighbours by length.
function align(heard) {
  const written = speaking.flatMap((shot) => tokensOf(shot.voice).map((word) => ({ shot: shot.id, word })));
  const a = written.map((w) => key(w.word));
  const b = heard.map((w) => key(w.text));
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) table[i][j] = a[i] && a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  let i = 0;
  let j = 0;
  let matched = 0;
  while (i < a.length && j < b.length) {
    if (a[i] && a[i] === b[j]) {
      Object.assign(written[i], { start: heard[j].start, end: heard[j].end, heard: true });
      matched++;
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  // Fill the words that were not heard as written (a number read out, a name said another way).
  for (let k = 0; k < written.length; k++) {
    if (written[k].heard) continue;
    let end = k;
    while (end < written.length && !written[end].heard) end++;
    const from = k > 0 ? written[k - 1].end : (heard[0]?.start ?? 0);
    const to = end < written.length ? written[end].start : (heard.at(-1)?.end ?? from);
    const size = written.slice(k, end).reduce((n, w) => n + w.word.length + 1, 0);
    let run = 0;
    for (let m = k; m < end; m++) {
      written[m].start = from + ((to - from) * run) / size;
      run += written[m].word.length + 1;
      written[m].end = from + ((to - from) * run) / size;
    }
    k = end;
  }
  // What was said that is not in the script, and what is in the script that was not heard: the places to listen to.
  const missed = written.filter((w) => !w.heard).map((w) => w.word);
  return { written, matched, missed, agreement: written.length ? matched / written.length : 0 };
}

function store(takeFile, heard, source) {
  const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", takeFile]).toString());
  const { written, missed, agreement } = align(heard);
  const lines = {};
  for (const shot of speaking) {
    const mine = written.filter((w) => w.shot === shot.id);
    lines[shot.id] = { text: shot.voice, from: round(mine[0].start), to: round(mine.at(-1).end), words: mine.map((w) => [round(w.start), round(w.end), w.word]) };
  }
  manifest = { version: 2, voice: sb.voice ?? null, sha: sha(), source, take: { file: "take.mp3", duration: round(duration) }, agreement: round(agreement), missed, lines };
}

if (args.includes("--take")) {
  const takeFile = await bring(flag("--take"), "take.mp3");
  if (!flag("--words")) throw new Error("--take needs --words: the time of every word in the take (transcribe it with word times, then pass that file or URL)");
  const wordsFile = await bring(flag("--words"), "words.json");
  store(takeFile, readWords(wordsFile), "take and transcription");
}

if (args.includes("--generate")) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("--generate needs ELEVENLABS_API_KEY; without a key, perform the text from --script with a speech connector and hand it back with --take and --words");
  if (!sb.voice?.voice_id) throw new Error('the storyboard names no voice: add "voice": { "voice_id": "..." }');
  const body = { text: takeText(), model_id: sb.voice.model ?? "eleven_v3", ...(sb.voice.language ? { language_code: sb.voice.language } : {}), ...(sb.voice.settings ? { voice_settings: sb.voice.settings } : {}) };
  // Through curl: it honours a proxy set in the environment, which Node's own fetch does not. The key goes in on
  // curl's standard input, never on its command line.
  mkdirSync(dir, { recursive: true });
  const reply = join(dir, ".reply.json");
  const bodyFile = join(dir, ".request.json");
  writeFileSync(bodyFile, JSON.stringify(body));
  const call = spawnSync(
    "curl",
    ["-sS", "--max-time", "300", "-o", reply, "-w", "%{http_code}", "-X", "POST", "-H", "@-", "-H", "content-type: application/json", "--data-binary", `@${bodyFile}`, `https://api.elevenlabs.io/v1/text-to-speech/${sb.voice.voice_id}/with-timestamps?output_format=mp3_44100_128`],
    { input: `xi-api-key: ${apiKey}\n`, encoding: "utf8" },
  );
  rmSync(bodyFile, { force: true });
  const status = Number(call.stdout);
  const text = existsSync(reply) ? readFileSync(reply, "utf8") : "";
  rmSync(reply, { force: true });
  if (call.status !== 0 || status !== 200) throw new Error(`ElevenLabs answered ${status || call.stderr.trim()}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "take.mp3"), Buffer.from(data.audio_base64, "base64"));
  // The time of every word, from the time of every character it was given.
  const heard = [];
  const a = data.alignment ?? data.normalized_alignment;
  let word = "";
  let from = 0;
  let depth = 0;
  a?.characters?.forEach((ch, i) => {
    if (ch === "[") depth++;
    if (depth === 0 && !/\s/.test(ch)) {
      if (!word) from = a.character_start_times_seconds[i];
      word += ch;
    } else if (word) {
      heard.push({ text: word, start: from, end: a.character_end_times_seconds[i - 1] });
      word = "";
    }
    if (ch === "]") depth = Math.max(0, depth - 1);
  });
  if (word) heard.push({ text: word, start: from, end: a.character_end_times_seconds.at(-1) });
  writeFileSync(join(dir, "words.json"), `${JSON.stringify({ words: heard.map((w) => ({ ...w, type: "word" })) })}\n`);
  store(join(dir, "take.mp3"), heard, "ElevenLabs API with timestamps");
}

// ── The cut: every shot's time, from the take ──────────────────────────────
// The take plays through unbroken wherever one line follows another; it is only opened up at a silent beat, a hold,
// or a pause the performer held too long.
function timeline() {
  const L = manifest.lines;
  const pieces = [];
  const times = {};
  const stretch = {}; // which stretch of the take each line is in
  let film = 0; // where the film is
  let piece = null; // the stretch of take now playing: { from, to, at }
  let last = null; // the last speaking shot
  const order = speaking.map((shot) => shot.id);
  const after = (id) => L[order[order.indexOf(id) + 1]];
  // A stretch ends a little after its last word and the next begins a little before its first: never more than
  // half the performer's pause each, so two stretches cannot hold the same sound.
  const close = (id, keep) => {
    const room = after(id) ? Math.max(0, after(id).from - L[id].to) : 0.5;
    piece.to = Math.min(manifest.take.duration, L[id].to + (keep ?? Math.min(0.18, room / 2)));
    pieces.push(piece);
    const end = piece.at + (piece.to - piece.from);
    piece = null;
    return end;
  };
  const open = (line, wordAt, keep) => {
    const room = last ? Math.max(0, line.from - L[last].to) : line.from;
    const pre = keep ?? Math.min(0.12, room / 2);
    piece = { from: line.from - pre, at: wordAt - pre };
  };
  for (const shot of shots) {
    const line = L[shot.id];
    if (!line) {
      // A silent beat: the take stops for as long as the shot was given.
      const length = Math.max(0.4, shot.end - shot.start || 1.5);
      if (piece) film = Math.max(film, close(last));
      times[shot.id] = { start: film, end: film + length };
      film += length;
      continue;
    }
    if (!piece) {
      // The take starts, or resumes after a silent beat: the first word comes FIRST (or LEAD) after the cut.
      open(line, film + (last === null && film === 0 ? cut.first : cut.lead));
      if (piece.at < film) piece.at = film;
      times[shot.id] = { start: film };
    } else {
      const gap = line.from - L[last].to;
      const extra = shots.find((s) => s.id === last).hold ?? 0;
      if (gap > cut.pause + 0.05 || extra > 0) {
        // A pause held too long becomes PAUSE; a hold adds its silence. The take is opened in the middle of the pause.
        const keep = Math.min(gap, cut.pause) / 2;
        const end = close(last, keep);
        open(line, end + extra + keep, keep);
      }
      // The cut to this shot falls just before its first word.
      const start = piece.at + (line.from - piece.from) - Math.min(cut.lead, Math.max(0.02, Math.min(gap, cut.pause) / 2));
      times[last].end = start;
      times[shot.id] = { start };
    }
    stretch[shot.id] = piece;
    film = piece.at + (line.to - piece.from);
    last = shot.id;
    // A speaking shot ends where the next one starts; until one does, it ends after its last word.
    const next = shots[shots.indexOf(shot) + 1];
    times[shot.id].end = film + (next && !L[next.id] ? 0.3 : cut.tail) + (shot.hold ?? 0);
    if (next && !L[next.id]) film = times[shot.id].end;
  }
  if (piece) close(last, 0.25);
  const duration = times[shots.at(-1).id].end;
  // Each line's words in the film's own time, for captions that keep step with the voice.
  const said = {};
  for (const shot of speaking) {
    const line = L[shot.id];
    const shift = stretch[shot.id].at - stretch[shot.id].from;
    said[shot.id] = { from: round(line.from + shift), to: round(line.to + shift), words: line.words.map(([a, b, w]) => [round(a + shift), round(b + shift), w]) };
  }
  for (const p of pieces) Object.assign(p, { from: round(p.from), to: round(p.to), at: round(p.at) });
  for (const t of Object.values(times)) Object.assign(t, { start: round(t.start), end: round(t.end) });
  return { pieces, times, said, duration: round(duration) };
}

// Subtitles for the platform's own captions: one cue a shot, in the film's time.
function writeSubtitles(plan) {
  const stamp = (t) => {
    const ms = Math.round(t * 1000);
    const pad = (n, size = 2) => String(n).padStart(size, "0");
    return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
  };
  const cues = speaking.map((shot, i) => `${i + 1}\n${stamp(plan.said[shot.id].from)} --> ${stamp(plan.said[shot.id].to + 0.15)}\n${plain(shot.voice)}\n`);
  writeFileSync(join(dir, "subtitles.srt"), cues.join("\n"));
}

function retime() {
  const plan = timeline();
  Object.assign(manifest, { pieces: plan.pieces, film: plan.said, duration: plan.duration });
  mkdirSync(dir, { recursive: true });
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  const board = JSON.parse(readFileSync(boardFile, "utf8"));
  for (const shot of board.shots) Object.assign(shot, plan.times[shot.id]);
  board.duration = plan.duration;
  writeFileSync(boardFile, `${JSON.stringify(board, null, 2)}\n`);
  for (const shot of shots) Object.assign(shot, plan.times[shot.id]);
  sb.duration = plan.duration;
  writeSubtitles(plan);
  return plan;
}

// Shots split, joined or renamed after the take, with the words unchanged: the take still fits, so match its words
// to the shots again before cutting.
if (manifest?.version === 2 && args.includes("--retime") && speaking.some((shot) => !manifest.lines[shot.id])) {
  if (!existsSync(join(dir, "words.json"))) throw new Error("the shots changed since the take and voice/words.json is missing: hand the take back with --take and --words");
  store(join(dir, manifest.take.file), readWords(join(dir, "words.json")), manifest.source);
}

if (manifest?.version === 2 && (args.includes("--take") || args.includes("--generate") || args.includes("--retime"))) {
  const plan = retime();
  console.log(`retimed: ${shots.length} shots, ${plan.duration.toFixed(2)} s, the take in ${plan.pieces.length} stretch(es)`);
  for (const junk of [".incoming-take", ".incoming-words"]) rmSync(join(dir, junk), { force: true });
}

// ── Status ─────────────────────────────────────────────────────────────────
let bad = 0;
const problem = (text) => {
  bad++;
  console.log(`  FIX  ${text}`);
};
if (!speaking.length) {
  console.log("no shot has a voice line: this film explains with captions only");
  process.exit(0);
}
const text = takeText();
const words = speaking.reduce((n, shot) => n + tokensOf(shot.voice).length, 0);
console.log(`script: ${speaking.length} speaking shots, ${words} words, ${text.length} characters${sb.voice?.name ? `, voice ${sb.voice.name}` : ""}${sb.voice?.model ? ` (${sb.voice.model})` : ""}`);
if (!manifest || manifest.version !== 2) {
  problem(manifest ? "this film was recorded line by line (the old way): perform the whole script as one take (--script, then --take and --words, or --generate)" : "no take yet: perform the script (--script, then --take and --words, or --generate)");
} else {
  if (manifest.sha !== sha()) problem("the script or the voice changed after the take was performed: perform it again");
  const spoken = manifest.lines[speaking.at(-1).id].to - manifest.lines[speaking[0].id].from;
  // The word times come from the speech service itself (or a transcription of its audio): matching them says the
  // alignment worked, not that every word was pronounced well. Only a person listening can say that.
  console.log(`take:   ${manifest.take.duration.toFixed(2)} s, ${(words / (spoken / 60)).toFixed(0)} words a minute, ${(manifest.agreement * 100).toFixed(0)}% of the script aligned with the take (not a pronunciation check)`);
  if (manifest.missed.length) console.log(`        not heard as written (listen to these): ${manifest.missed.slice(0, 16).join(" ")}${manifest.missed.length > 16 ? " ..." : ""}`);
  if (manifest.agreement < 0.8) problem("less than 80% of the script was heard as written: the take may have gone wrong, or the word times belong to another take");
  if (!manifest.pieces) problem("the take has not been cut: run --retime");
  else {
    const plan = timeline();
    const drift = shots.some((shot) => Math.abs(shot.start - plan.times[shot.id].start) > 0.02 || Math.abs(shot.end - plan.times[shot.id].end) > 0.02);
    if (drift) problem("the storyboard's times are not the take's (it was rewritten after the take): run --retime");
    for (const shot of shots) {
      const line = manifest.lines[shot.id];
      const t = plan.times[shot.id];
      console.log(`${shot.id.padEnd(5)} ${t.start.toFixed(2).padStart(6)} → ${t.end.toFixed(2).padStart(6)}  ${(t.end - t.start).toFixed(2).padStart(5)} s  ${line ? plain(line.text).slice(0, 64) : "(silent)"}`);
    }
    console.log(`film:   ${plan.duration.toFixed(2)} s`);
  }
}
process.exit(bad ? 1 : 0);

// The storyboard gate. Checks a film's storyboard.json against the standard in references/storyboard.md and draws it
// as a board a person can read: every shot as a row of pencil frames, drawn in the real frame's coordinates, beside
// everything the shot must do. A contact sheet of all the frames in order comes first.
//
//   node kit/tools/storyboard.mjs films/NAME            check, and write films/NAME/storyboard.html
//   node kit/tools/storyboard.mjs films/NAME --png      also write storyboard/storyboard-01.png ... (needs Playwright)
//
// Exit code 1 when a rule is broken. Nothing is built until this passes and the person has seen the board.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sketch, THINGS } from "./sketch.mjs";

const args = process.argv.slice(2);
const film = resolve(args.find((arg) => !arg.startsWith("--")) ?? ".");
const file = join(film, "storyboard.json");
if (!existsSync(file)) throw new Error(`no storyboard.json in ${film}`);
const sb = JSON.parse(readFileSync(file, "utf8"));

// ── The standard ───────────────────────────────────────────────────────────
const TYPES = ["type", "object3d", "diagram", "chart", "macro", "wide", "ui", "compare", "recap", "endcard"];
const MIN = { teaches: 20, screen: 70, motion: 45, transition: 20, sound: 15, check: 15 };
const SHOT = { shortest: 1.0, longest: 6.0, average: 3.2 };
const READING = { warn: 17, error: 21, longest: 104 };
// Frames: a shot is drawn at its start and at its end at least, and once more when it runs long; across the film,
// about one frame for every 1.25 seconds, so the board shows what happens and not only where things sit.
const FRAMES = { each: 2, long: 3.4, perSecond: 1 / 1.25 };
// Narration. A film that speaks is cut to one continuous take (kit/audio/voice.mjs): once the take exists, the
// storyboard's times are the take's. Before that, a shot's length is only a plan.
const [W, H] = (sb.format ?? "1920x1080").split("x").map(Number);
const portrait = H > W;
const take = existsSync(join(film, "voice", "voice.json")) ? JSON.parse(readFileSync(join(film, "voice", "voice.json"), "utf8")) : null;
const cutToTake = take?.version === 2 && Boolean(take.pieces);
const plain = (text) => text.replace(/\[[^\]]*\]/g, " ").replaceAll("*", "").replace(/\s+/g, " ").trim();
// Words that make Indonesian narration sound like a textbook, with what people say instead.
const STIFF_ID = { tidak: "nggak", hanya: "cuma", mengapa: "kenapa", bagaimana: "gimana", merupakan: "itu / adalah dihilangkan", namun: "tapi", anda: "kamu", apakah: "(tanya langsung, atau: ... nggak?)", sangat: "banget", kemudian: "terus / habis itu", tersebut: "itu / tadi", yakni: "yaitu dihilangkan", dapat: "bisa", ialah: "itu", saat: "waktu / pas", ketika: "waktu / pas", seperti: "kayak (kalau santai)", telah: "udah / sudah", sebab: "soalnya / karena", agar: "biar / supaya" };
const STIFF_ID_PHRASES = { "oleh karena itu": "makanya", "di mana": "(pecah jadi dua kalimat)", "yang mana": "(pecah jadi dua kalimat)", "akan tetapi": "tapi", "dengan demikian": "jadi", "selain itu": "terus / lagi pula", "hal ini": "ini", "hal tersebut": "itu" };
const PERSONA_ID = ["gue", "gua", "gw", "lo", "lu", "elo", "elu"];
// Phrases that mark a script as machine-made or as an essay read aloud.
const TELLS = [/\bin this video\b/i, /\blet'?s dive\b/i, /\bdelve\b/i, /\bto understand (why|how|this)\b/i, /\bnot just\b.*\bbut\b/i, /\btestament\b/i, /\bit'?s worth noting\b/i, /\bpada video (kali )?ini\b/i, /\bmari kita\b/i, /\bhalo (teman|sobat|guys)\b/i, /\bbukan hanya\b.*\btetapi juga\b/i, /\bperlu diketahui\b/i];

const errors = [];
const warns = [];
const err = (where, text) => errors.push(`${where}: ${text}`);
const warn = (where, text) => warns.push(`${where}: ${text}`);
const need = (obj, key, where, min = 1) => {
  const value = obj?.[key];
  if (typeof value !== "string" || value.trim().length < min) err(where, `"${key}" is missing or too thin (needs at least ${min} characters)`);
};

for (const key of ["title", "question", "audience", "promise", "language"]) need(sb, key, "storyboard", key === "promise" ? 30 : 2);
if (!(sb.duration > 0)) err("storyboard", '"duration" in seconds is missing');
if (!(W > 0 && H > 0) || W % 2 || H % 2) err("storyboard", `"format" must be like "1920x1080" (landscape) or "1080x1920" (portrait); got "${sb.format}"`);
const narrated = (sb.shots ?? []).some((shot) => shot.voice);
if (narrated && !sb.voice?.voice_id) err("storyboard", 'shots have "voice" lines but the storyboard names no voice: add "voice": { "voice_id", "name", "model", "language" }');
if (take && take.version !== 2 && narrated) warn("storyboard", "the narration was recorded line by line (the old way): perform the script as one take with kit/audio/voice.mjs");

// ── The script, read as a listener hears it ────────────────────────────────
// These catch what makes narration sound written or machine-made. They cannot hear it: a person still has to.
if (narrated) {
  const lines = (sb.shots ?? []).filter((shot) => shot.voice).map((shot) => ({ id: shot.id, text: plain(shot.voice) }));
  const script = lines.map((line) => line.text).join(" ");
  const sentences = script.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const count = (text) => text.split(/\s+/).filter(Boolean).length;
  const indonesian = (sb.voice?.language ?? sb.language) === "id";
  const longest = indonesian ? 18 : 22;
  for (const sentence of sentences) if (count(sentence) > longest) warn("script", `a sentence of ${count(sentence)} words is too long to follow by ear (keep under ${longest}): "${sentence.slice(0, 60)}..."`);
  // Captions read aloud: three short sentences in a row, none leaning on the one before.
  for (let i = 2; i < sentences.length; i++) {
    if ([sentences[i - 2], sentences[i - 1], sentences[i]].every((sentence) => count(sentence) <= 5)) {
      warn("script", `three clipped sentences in a row sound like captions read aloud: join them or let one lean on the last ("${sentences[i - 2]} ${sentences[i - 1]} ${sentences[i]}")`);
      break;
    }
  }
  if (!/\?/.test(sentences.slice(0, 2).join(" "))) warn("script", "the script does not open on a question: the first two sentences should raise the one question the film answers");
  for (const line of lines) {
    if (/\d/.test(line.text)) warn(`shot ${line.id}`, `the spoken line has digits ("${line.text.match(/\S*\d\S*/)[0]}"): write numbers the way they are said, in words, and round them`);
    for (const tell of TELLS) if (tell.test(line.text)) warn(`shot ${line.id}`, `"${line.text.match(tell)[0]}" marks the script as an essay or as machine-made: say the specific thing instead`);
    if (indonesian) {
      const words = line.text.toLowerCase().replace(/[^\p{L}\s-]/gu, " ").split(/\s+/);
      for (const word of words) {
        if (STIFF_ID[word]) warn(`shot ${line.id}`, `"${word}" is written Indonesian; said aloud it is usually "${STIFF_ID[word]}"`);
        if (PERSONA_ID.includes(word)) warn(`shot ${line.id}`, `"${word}" belongs to a creator with a persona; a narrator with no face says "kamu" or "kita"`);
      }
      for (const [phrase, instead] of Object.entries(STIFF_ID_PHRASES)) if (line.text.toLowerCase().includes(phrase)) warn(`shot ${line.id}`, `"${phrase}" is written Indonesian; said aloud: ${instead}`);
    }
  }
  const total = count(script);
  if (cutToTake) {
    const first = take.lines[lines[0].id];
    const last = take.lines[lines.at(-1).id];
    const wpm = total / ((last.to - first.from) / 60);
    const [slow, fast] = indonesian ? [105, 165] : [120, 175];
    if (wpm < slow || wpm > fast) warn("script", `the take runs at ${wpm.toFixed(0)} words a minute (explaining sits between ${slow} and ${fast}): ${wpm > fast ? "it will feel rushed" : "it will drag"}`);
    if (take.agreement < 0.9) warn("script", `only ${(take.agreement * 100).toFixed(0)}% of the script aligned with the take: listen to ${take.missed.slice(0, 8).join(", ")}`);
  }
  // On screen, the narration's own words again: harder to follow, not easier.
  if (!portrait) for (const shot of sb.shots ?? []) if (shot.voice && shot.caption && plain(shot.caption).toLowerCase() === plain(shot.voice).toLowerCase() && count(plain(shot.caption)) > 5) warn(`shot ${shot.id}`, "the caption repeats the spoken line word for word: make it the key phrase (three or four words), or leave it out");
}
if (!sb.look?.accent) err("storyboard", '"look.accent" is missing: the one colour that carries the point');
need(sb.look ?? {}, "mood", "look", 20);
if (!sb.music?.bpm) warn("storyboard", '"music.bpm" is missing: cuts cannot be checked against the beat');
const facts = new Map((sb.facts ?? []).map((fact) => [fact.id, fact]));
for (const fact of sb.facts ?? []) {
  need(fact, "claim", `fact ${fact.id}`, 12);
  need(fact, "source", `fact ${fact.id}`, 8);
}
if (facts.size === 0) err("storyboard", "no facts: an explainer states what it claims and where each claim comes from");
const acts = new Map((sb.acts ?? []).map((act) => [act.id, act]));
for (const act of sb.acts ?? []) {
  need(act, "title", `act ${act.id}`, 2);
  need(act, "goal", `act ${act.id}`, 20);
}
if (acts.size < 3) err("storyboard", "fewer than three acts: a hook, the explanation and a recap are the minimum");

const shots = sb.shots ?? [];
// A film that shows real things in 3D builds them from a reference: each model names where its shape comes from
// and the parts a viewer would see in a teardown (references/detail.md).
const CAMERA_TYPES = ["object3d", "macro"];
const modelled = shots.filter((shot) => CAMERA_TYPES.includes(shot.type));
// Storyboards written before this standard ("standard" below 2) get warnings, not errors.
const strict = (sb.standard ?? 1) >= 2;
const must = strict ? err : warn;
if (modelled.length) {
  const models = sb.models ?? [];
  if (!models.length) must("storyboard", '3D shots but no "models": list each real object you build, its reference and its parts (references/detail.md)');
  for (const model of models) {
    const where = `model ${model.name ?? "?"}`;
    need(model, "name", where, 2);
    need(model, "reference", where, 15);
    if (!(typeof model.variant === "string" && model.variant.trim().length >= 12)) must(where, '"variant" is missing: which real version you replicate, and why (the one your viewer knows, by their language and place)');
    if (!(typeof model.looks === "string" && model.looks.trim().length >= 20)) must(where, '"looks" is missing: the colours, materials, markings and proportions you saw in the reference photos');
    // A replica is built from technical drawings (shape and parts) and photographs (colour and finish), never from a
    // guess: the board waits until someone has looked at both.
    const listed = (key) => (Array.isArray(model[key]) ? model[key].filter((p) => typeof p === "string" && p.trim()) : []);
    if (!listed("blueprints").length) ((sb.standard ?? 1) >= 3 ? err : warn)(where, '"blueprints" is empty: find the technical drawings first (blueprint, dimensional drawing, exploded view, parts list, cross-section, patent figures), look at them, and list each one; the model and the storyboard are built from them (references/detail.md)');
    if (!listed("photos").length) warn(where, '"photos" is empty: the drawings give the shape; list the photographs you took colour, finish and markings from, or ask the person for some');
    // A mechanism is shown on the board as its drawing shows it: the blueprint itself, placed in the frame.
    const placed = shots.some((shot) => (shot.frames ?? []).some((fr) => fr.from || (fr.draw ?? []).some((thing) => "blueprint" in thing)));
    if (listed("blueprints").length && !placed) warn(where, 'no frame shows a blueprint: put the drawing itself in the mechanism shots ({ "blueprint": "file", "at": [x, y, w, h], "crop": [...] }), or trace it exactly and name the drawing in the frame\'s "from"');
    // Every part the drawings show is either drawn somewhere in the film or listed as left out, with why.
    const said = JSON.stringify(shots.map((shot) => [shot.screen, shot.camera, shot.motion, shot.caption, shot.voice, shot.frames])).toLowerCase();
    const skipped = listed("notShown").join(" ").toLowerCase();
    for (const part of Array.isArray(model.parts) ? model.parts : []) {
      const name = String(part).toLowerCase().replace(/\(.*?\)/g, "").split(/[:,;]/)[0].trim();
      const key = name.split(/\s+/).filter((w) => w.length > 3).slice(0, 2);
      if (key.length && !key.some((w) => said.includes(w)) && !key.some((w) => skipped.includes(w))) warn(where, `part "${name}" is in the model sheet but no shot shows or names it: draw it where it matters, or list it in "notShown" with why`);
    }
    if (typeof model.looks === "string" && /assum|guess|unverified|belum dicek|asumsi/i.test(model.looks)) warn(where, '"looks" still holds assumptions: confirm them from a photo, or ask the person, before you build the model');
    if (!Array.isArray(model.parts) || model.parts.length < 5) must(where, '"parts" needs at least five named parts, as a teardown or cross-section shows them');
  }
}
const used = new Set();
let previousEnd = 0;
let frameCount = 0;
shots.forEach((shot, i) => {
  const where = `shot ${shot.id ?? i + 1}`;
  need(shot, "id", where);
  if (!acts.has(shot.act)) err(where, `act "${shot.act}" is not one of the storyboard's acts`);
  if (!TYPES.includes(shot.type)) err(where, `type "${shot.type}" is not one of ${TYPES.join(", ")}`);
  for (const [key, min] of Object.entries(MIN)) need(shot, key, where, min);
  if (i < shots.length - 1) need(shot, "carries", where, 8);
  if (CAMERA_TYPES.includes(shot.type) && !(typeof shot.camera === "string" && shot.camera.trim().length >= 30)) must(where, '"camera" is missing or too thin: where the camera starts and ends, the lens and what is in focus (references/detail.md)');
  if (i >= 1 && shot.camera && shots[i - 1].camera && shot.camera.trim() === shots[i - 1].camera.trim()) warn(where, "the same camera move as the shot before: change the angle or the move");
  if (Math.abs(shot.start - previousEnd) > 1e-3) err(where, `starts at ${shot.start} but the shot before ends at ${previousEnd}: no gaps, no overlaps`);
  const dur = shot.end - shot.start;
  if (dur < SHOT.shortest) err(where, `${dur.toFixed(2)} s is too short to read (minimum ${SHOT.shortest} s)`);
  if (dur > SHOT.longest) err(where, `${dur.toFixed(2)} s is too long without a new picture (maximum ${SHOT.longest} s): split it`);
  previousEnd = shot.end;
  // A spoken line. Once the film is cut to its take, the shot's length is the line's and there is nothing to fit.
  if (shot.voice) {
    if (!cutToTake) {
      const speed = plain(shot.voice).length / Math.max(0.3, dur - 0.3);
      if (speed > 27) err(where, `the spoken line is ${plain(shot.voice).length} characters for a ${dur.toFixed(1)} s shot: no voice speaks that fast (the take will set the real length)`);
    }
    if (/\d/.test(shot.voice) && !(shot.facts?.length > 0)) err(where, "the spoken line states a number but the shot cites no fact");
    else if (/\b(juta|ribu|ratus|persen|miliar|million|thousand|hundred|percent|billion)\b/i.test(shot.voice) && !(shot.facts?.length > 0)) err(where, "the spoken line states a number but the shot cites no fact");
  }
  // Captions are read, so they get a reading-speed check. (A shot with no caption shows its spoken line instead.)
  if (shot.caption) {
    const text = shot.caption.replaceAll("*", "");
    const speed = text.length / Math.max(0.5, dur - 0.5);
    if (text.length > READING.longest) err(where, `caption is ${text.length} characters (maximum ${READING.longest}): it will not fit two lines`);
    if (speed > READING.error) err(where, `caption needs ${speed.toFixed(0)} characters a second (maximum ${READING.error}): shorten it or lengthen the shot`);
    else if (speed > READING.warn) warn(where, `caption needs ${speed.toFixed(0)} characters a second (comfortable is under ${READING.warn})`);
    // A number on screen is a claim: it has to point at a fact.
    if (/\d/.test(text) && !(shot.facts?.length > 0)) err(where, "the caption states a number but the shot cites no fact");
  }
  for (const id of shot.facts ?? []) {
    if (!facts.has(id)) err(where, `cites fact "${id}", which is not in the fact sheet`);
    used.add(id);
  }
  // The frames: the shot drawn, more than once, in the frame's own coordinates.
  const frames = shot.frames ?? [];
  frameCount += frames.length;
  const wanted = dur >= FRAMES.long ? FRAMES.each + 1 : FRAMES.each;
  if (frames.length < wanted) err(where, `has ${frames.length} drawn frame(s): a ${dur.toFixed(1)} s shot needs at least ${wanted} (how it starts, what happens, how it ends)`);
  frames.forEach((frame, k) => {
    const at = `${where} frame ${k + 1}`;
    need(frame, "note", at, 20);
    if (!(frame.at >= 0 && frame.at <= 1)) err(at, '"at" must say where in the shot this frame is, from 0 (its start) to 1 (its end)');
    if (!(frame.draw?.length >= 2)) err(at, "draws fewer than two things: sketch the subject and what is around it");
    for (const thing of frame.draw ?? []) {
      const kind = Object.keys(thing)[0];
      if (!THINGS.includes(kind)) err(at, `draws something the sketcher does not know: ${JSON.stringify(thing).slice(0, 60)}`);
      else if (kind === "text") warn(at, 'uses "text" as a thing, which draws nothing: write { "label": [x, y], "text": "..." }');
      else if (!["camera", "cut", "path", "blueprint"].includes(kind) && !Array.isArray(thing[kind])) err(at, `"${kind}" needs its numbers in a list, like { "${kind}": [x, y, ...] }; got ${JSON.stringify(thing[kind]).slice(0, 40)}`);
    }
    if (k > 0 && !(frame.at > frames[k - 1].at)) err(at, "comes before the frame before it");
  });
  // Cuts sit on the music's grid when there is one.
  if (sb.music?.beat && i > 0 && !narrated) {
    const off = (((shot.start - (sb.music.offset ?? 0)) % sb.music.beat) + sb.music.beat) % sb.music.beat;
    if (Math.min(off, sb.music.beat - off) > 0.05) warn(where, `starts ${Math.min(off, sb.music.beat - off).toFixed(2)} s off the beat`);
  }
  if (i >= 2 && shots[i - 1].type === shot.type && shots[i - 2].type === shot.type) err(where, `third "${shot.type}" shot in a row: change the kind of picture`);
});
if (shots.length && Math.abs(previousEnd - sb.duration) > 1e-3) err("storyboard", `the last shot ends at ${previousEnd} but the film is ${sb.duration} s`);
if (shots.length && shots[0].start !== 0) err("storyboard", "the first shot must start at 0");
// Before a narrated film has its take, its length is a guess: the counts are checked, but only as warnings.
const guessed = narrated && !cutToTake;
const countRule = guessed ? (where, text) => warn(where, `${text} (judged on the planned length; the take sets the real one)`) : err;
const fewest = Math.ceil(sb.duration / SHOT.average);
// In a narrated film the lines set the shots: a shot short of the average is a warning there (each shot's own
// length is still checked, and so is the number of drawn frames), not a reason to split a line in two.
const shotRule = narrated ? (where, text) => warn(where, `${text}: if a shot holds one picture too long, give it a second frame or split its line`) : countRule;
if (shots.length < fewest) shotRule("storyboard", `${shots.length} shots for ${sb.duration} s: at least ${fewest} are needed (one new picture about every ${SHOT.average} s)`);
const fewestFrames = Math.ceil(sb.duration * FRAMES.perSecond);
if (frameCount < fewestFrames) countRule("storyboard", `${frameCount} drawn frames for ${sb.duration} s: at least ${fewestFrames} are needed (about one every 1.25 s)`);
if (new Set(shots.map((shot) => shot.type)).size < 4) err("storyboard", "fewer than four kinds of shot: vary the picture (type, 3D, diagram, chart, macro, wide...)");
// A shot made of type says its line itself; every other shot needs a caption.
const spoken = shots.filter((shot) => !["type", "endcard"].includes(shot.type));
if (spoken.length && spoken.filter((shot) => shot.caption || shot.voice).length / spoken.length < 0.85) err("storyboard", "fewer than 85% of the shots that are not type carry a caption: the film must explain itself with the sound off");
// A short made to loop ends by running into its own start: its last line leads into its first, its last picture
// into its first. It has no endcard and no silent poster (references/narration.md, "The loop").
if (sb.loop) {
  const where = "loop";
  if (typeof sb.loop !== "object") err(where, '"loop" is an object: { "line": how the last line runs into the first, "picture": how the last frame becomes the first }');
  else {
    need(sb.loop, "line", where, 20);
    need(sb.loop, "picture", where, 20);
  }
  const last = shots.at(-1);
  if (last && !last.voice && narrated) err(where, `the last shot ${last.id} is silent: in a loop the last words run into the first, so the film ends while someone is speaking`);
  if (last?.type === "endcard") err(where, "an endcard stops the loop: end on the picture the film opens with");
  const firstWord = shots[0]?.voice?.trim().split(/\s+/)[0];
  const lastLine = [...shots].reverse().find((shot) => shot.voice)?.voice.trim();
  if (lastLine && /[.!?]["')\]]*$/.test(lastLine)) warn(where, `the last line ends on "${lastLine.slice(-12)}": a full stop closes the loop; end it open, so it runs on into "${firstWord ?? "the first line"}"`);
} else {
  if (shots.length && !["recap", "endcard"].includes(shots.at(-1).type)) err("storyboard", 'the last shot must be a "recap" or an "endcard"');
  if (shots.length && !shots.some((shot) => shot.type === "recap")) err("storyboard", "no recap shot: say again, in one frame, what the viewer now knows");
  if (portrait && narrated) warn("storyboard", 'a portrait short that does not loop: shorts are replayed, so make the end run into the start ("loop", references/narration.md)');
}
for (const act of acts.keys()) if (!shots.some((shot) => shot.act === act)) err(`act ${act}`, "has no shots");
for (const id of facts.keys()) if (!used.has(id)) warn(`fact ${id}`, "is never cited by a shot");

// ── The board ──────────────────────────────────────────────────────────────
const esc = (text) => String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const rich = (text) => esc(text).replace(/\*([^*]+)\*/g, "<b>$1</b>");
const time = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;
const accent = esc(sb.look?.accent ?? "#ffb90e");
let number = 0;
const all = [];
const frameOf = (shot, frame, k) => {
  number++;
  const at = shot.start + (shot.end - shot.start) * frame.at;
  const svg = sketch(frame, `${shot.id}-${k}`, { width: W, height: H, lang: sb.language, base: film });
  all.push({ n: number, shot, at, svg, frame });
  return `<figure><div class="pic">${svg}</div><figcaption><span>frame ${number} · ${time(at)}</span>${esc(frame.note)}</figcaption></figure>`;
};
const row = (shot, i) => `
  <article class="shot">
    <header><b>${esc(shot.id)}</b><span class="t">${time(shot.start)} → ${time(shot.end)} · ${(shot.end - shot.start).toFixed(2)} s</span><em class="ty">${esc(shot.type)}</em><em>${esc(acts.get(shot.act)?.title ?? shot.act)}</em>
      ${shot.caption ? `<q>${rich(shot.caption)}</q>` : shot.voice ? "<q class='none'>the spoken line is the caption</q>" : "<q class='none'>no caption: the lettering in the frame is the line</q>"}<i>${i + 1} / ${shots.length}</i></header>
    <div class="body">
      <div class="frames n${(shot.frames ?? []).length}">${(shot.frames ?? []).map((frame, k) => frameOf(shot, frame, k)).join("")}</div>
      <dl>
        ${shot.voice ? `<dt>Voice</dt><dd class="say">${esc(shot.voice)}${cutToTake && take.film?.[shot.id] ? ` <u>${(take.film[shot.id].to - take.film[shot.id].from).toFixed(1)} s</u>` : " <u>not performed yet</u>"}</dd>` : ""}
        <dt>Teaches</dt><dd>${esc(shot.teaches)}</dd>
        <dt>On screen</dt><dd>${esc(shot.screen)}</dd>
        ${shot.camera ? `<dt>Camera</dt><dd>${esc(shot.camera)}</dd>` : ""}
        <dt>Motion</dt><dd>${esc(shot.motion)}</dd>
        <dt>Carries on</dt><dd>${esc(shot.carries ?? "the film ends here")}</dd>
        <dt>Transition</dt><dd>${esc(shot.transition)}</dd>
        <dt>Sound</dt><dd>${esc(shot.sound)}</dd>
        <dt>Check</dt><dd>${esc(shot.check)}</dd>
        ${shot.facts?.length ? `<dt>Facts</dt><dd>${shot.facts.map((id) => `<u>${esc(id)}</u>`).join(" ")}</dd>` : ""}
      </dl>
    </div>
  </article>`;
const PER_PAGE = 3;
const rows = shots.map(row);
const pages = [];
for (let i = 0; i < rows.length; i += PER_PAGE) pages.push(rows.slice(i, i + PER_PAGE).join(""));
const SHEET = portrait ? 36 : 24;
const sheets = [];
for (let i = 0; i < all.length; i += SHEET) {
  sheets.push(
    all
      .slice(i, i + SHEET)
      .map((f) => `<figure><div class="pic">${f.svg}</div><figcaption><span>${f.n} · ${esc(f.shot.id)} · ${time(f.at)}</span>${f.shot.caption && f.frame === f.shot.frames[0] ? rich(f.shot.caption) : ""}</figcaption></figure>`)
      .join(""),
  );
}
const actBar = [...acts.values()]
  .map((act) => {
    const mine = shots.filter((shot) => shot.act === act.id);
    if (!mine.length) return "";
    const span = mine.at(-1).end - mine[0].start;
    return `<div style="flex:${span}"><b>${esc(act.title)}</b><span>${time(mine[0].start)} · ${span.toFixed(1)} s · ${mine.length} shots</span><p>${esc(act.goal)}</p></div>`;
  })
  .join("");
// The lettering in the frames is a handwriting face from the workspace's packages, when it is installed.
let workspace = film;
while (!existsSync(join(workspace, "node_modules")) && dirname(workspace) !== workspace) workspace = dirname(workspace);
const hand = join(workspace, "node_modules/@fontsource/patrick-hand/files/patrick-hand-latin-400-normal.woff2");
const face = existsSync(hand) ? `@font-face{font-family:"Hand";src:url("${relative(film, hand).split("\\").join("/")}") format("woff2")}` : "";
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(sb.title)} · storyboard</title><style>
  ${face}
  *{box-sizing:border-box;margin:0;padding:0}body{background:#09090a;color:#ededf0;font:400 15px/1.45 ui-sans-serif,system-ui,sans-serif;padding:40px;width:1920px}
  .page{width:1840px;padding:8px 0 40px;break-after:page}h1{font:650 46px/1.1 ui-sans-serif,system-ui;letter-spacing:-.03em}h1 small{display:block;margin-top:10px;color:#a9a9b0;font:400 22px/1.3 ui-sans-serif,system-ui;letter-spacing:0}
  .meta{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:28px 0}.meta div{padding:16px 18px;border:1px solid #26262a;border-radius:14px;background:#111113}.meta b{display:block;margin-bottom:6px;color:#85858d;font:600 11px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}
  .sw{display:inline-block;width:16px;height:16px;margin-right:8px;border-radius:50%;vertical-align:-3px}
  .acts{display:flex;gap:6px;margin:10px 0 28px}.acts div{min-width:0;padding:14px 16px;border-radius:12px;background:#151517;border-top:3px solid ${accent}}.acts b{display:block;font-size:17px}.acts span{color:#85858d;font:500 12px/1.6 ui-monospace,monospace}.acts p{margin-top:6px;color:#a9a9b0;font-size:13px}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}td,th{padding:9px 12px;border-bottom:1px solid #222226;text-align:left;vertical-align:top}th{color:#85858d;font:600 11px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}td:first-child{color:${accent};font:600 13px/1.5 ui-monospace,monospace;white-space:nowrap}
  .sketch{display:block;width:100%;border-radius:8px}.sketch .hand{font-family:"Hand","Comic Sans MS",ui-sans-serif,sans-serif}
  figure{min-width:0}.pic{position:relative}.pic>b{position:absolute;left:8px;top:8px;min-width:30px;padding:4px 8px;border-radius:8px;background:#26262b;color:#fff;font:650 14px/1.2 ui-monospace,monospace;text-align:center}
  figcaption{margin-top:7px;color:#c9c9cf;font-size:13px;line-height:1.35}figcaption span{display:block;color:${accent};font:600 12px/1.5 ui-monospace,monospace}figcaption b{color:${accent}}
  .sheet{display:grid;grid-template-columns:repeat(${portrait ? 12 : 6},1fr);gap:16px 14px}dd.say{color:#fff;font-size:14.5px;font-style:italic}
  .shot{margin-bottom:22px;border:1px solid #26262a;border-radius:16px;background:#111113;overflow:hidden}
  .shot header{display:flex;align-items:center;gap:12px;padding:13px 18px;border-bottom:1px solid #222226}.shot header>b{color:${accent};font:650 20px/1 ui-monospace,monospace}.shot .t{color:#a9a9b0;font:500 13px/1 ui-monospace,monospace}
  .shot em{font-style:normal;padding:4px 10px;border-radius:99px;background:#1d1d20;color:#a9a9b0;font-size:12px}.shot em.ty{background:${accent}22;color:${accent}}.shot header i{margin-left:auto;color:#55555c;font:500 12px/1 ui-monospace,monospace;font-style:normal}
  .shot q{quotes:"“" "”";margin-left:10px;font:550 19px/1.3 ui-sans-serif,system-ui}.shot q b{color:${accent}}.shot q.none{color:#6b6b72;font:italic 400 14px/1.3 ui-sans-serif,system-ui;quotes:none}
  .body{display:grid;grid-template-columns:1fr 470px;gap:20px;padding:16px 18px 18px}.frames{display:grid;gap:12px;align-content:start}.frames.n2{grid-template-columns:repeat(2,1fr)}.frames.n3{grid-template-columns:repeat(3,1fr)}.frames.n4{grid-template-columns:repeat(4,1fr)}
  ${portrait ? ".body{grid-template-columns:auto 1fr}.frames,.frames.n2,.frames.n3,.frames.n4{grid-template-columns:repeat(4,230px)}dl{grid-template-columns:96px 1fr}dd{font-size:14.5px}" : ""}
  dl{display:grid;grid-template-columns:86px 1fr;gap:6px 12px;align-content:start}dt{color:#85858d;font:600 10.5px/1.7 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}dd{color:#d5d5da;font-size:13px}dd u{text-decoration:none;padding:2px 7px;border-radius:6px;background:#1d1d20;color:${accent};font:600 12px/1 ui-monospace,monospace}
  .report{margin:18px 0;padding:14px 18px;border-radius:12px;font:500 14px/1.6 ui-monospace,monospace}.ok{background:#12251a;color:#7fe0a8}.bad{background:#2a1512;color:#f7a898}.warn{background:#2a2412;color:#f1d48a}
  h2{margin:26px 0 12px;font:650 22px/1 ui-sans-serif,system-ui}h2 small{margin-left:12px;color:#85858d;font:400 14px/1 ui-sans-serif,system-ui}
</style></head><body>
<section class="page">
  <h1>${esc(sb.title)}<small>${esc(sb.question)}</small></h1>
  <div class="meta">
    <div><b>Promise</b>${esc(sb.promise)}</div><div><b>Audience</b>${esc(sb.audience)}</div>
    <div><b>Length</b>${sb.duration} s · ${shots.length} shots · ${frameCount} drawn frames · ${W}×${H} · ${sb.fps ?? 60} fps · ${esc(sb.language)}${narrated ? ` · voice: ${esc(sb.voice?.name ?? sb.voice?.voice_id ?? "?")}` : " · captions only"}</div>
    <div><b>Look</b><span class="sw" style="background:${accent}"></span>${accent}${sb.look?.accent2 ? ` <span class="sw" style="background:${esc(sb.look.accent2)};margin-left:10px"></span>${esc(sb.look.accent2)}` : ""}<br>${esc(sb.look?.mood)}</div>
  </div>
  <div class="report ${errors.length ? "bad" : "ok"}">${errors.length ? `${errors.length} rule(s) broken:<br>${errors.map(esc).join("<br>")}` : `The storyboard passes the standard: ${shots.length} shots, ${frameCount} drawn frames, ${facts.size} facts, ${acts.size} acts.`}</div>
  ${warns.length ? `<div class="report warn">${warns.length} to look at:<br>${warns.map(esc).join("<br>")}</div>` : ""}
  <h2>Acts</h2><div class="acts">${actBar}</div>
  <h2>Fact sheet</h2><table><tr><th>Id</th><th>Claim</th><th>Source</th></tr>${[...facts.values()].map((fact) => `<tr><td>${esc(fact.id)}</td><td>${esc(fact.claim)}</td><td>${esc(fact.source)}</td></tr>`).join("")}</table>
  ${sb.music ? `<h2>Music</h2><p>${esc(sb.music.track ?? "")} · ${sb.music.bpm ?? "?"} BPM · ${esc(sb.music.note ?? "")}</p>` : ""}
</section>
${sheets.map((cells, i) => `<section class="page"><h2>The film in frames<small>${i + 1} of ${sheets.length} · blue pencil marks the camera and what moves</small></h2><div class="sheet">${cells}</div></section>`).join("\n")}
${pages.map((cards) => `<section class="page">${cards}</section>`).join("\n")}
</body></html>`;
writeFileSync(join(film, "storyboard.html"), html);

for (const line of errors) console.error(`error  ${line}`);
for (const line of warns) console.warn(`warn   ${line}`);
console.log(`${shots.length} shots, ${frameCount} frames, ${sb.duration} s, ${errors.length} errors, ${warns.length} warnings -> ${join(film, "storyboard.html")}`);

if (args.includes("--png")) {
  const { chromium } = createRequire(import.meta.url)("playwright");
  const dir = join(film, "storyboard");
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(film, "storyboard.html")).href);
  await page.evaluate(() => document.fonts.ready);
  const sections = await page.locator(".page").all();
  for (const [i, section] of sections.entries()) await section.screenshot({ path: join(dir, `storyboard-${String(i + 1).padStart(2, "0")}.png`) });
  await browser.close();
  console.log(`${sections.length} pages in ${dir}`);
}
process.exit(errors.length ? 1 : 0);

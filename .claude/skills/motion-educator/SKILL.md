---
name: motion-educator
description: Make educational motion videos (explainers, lessons, concept films, shorts, "video edukasi") as premium films built in code - a lit shader stage, glass panels, metal type, 3D objects, diagrams, charts, captions, narration, music and sound effects - rendered frame by frame to MP4, landscape 16:9 or portrait 9:16. Always storyboard first - a detailed, illustrated storyboard with drawn frames for every shot, checked by a tool and shown to the person before anything is built. Narration is written as talk (Indonesian or English), performed as one take with ElevenLabs, and the picture is cut to the voice. Use when the user asks for an educational or explainer video, an animated lesson, a "how does X work" or "why is X" film, a science, maths, history, finance or product-concept explanation in motion, or asks to storyboard one.
---

# Motion Educator

You make short educational films (20 to 120 seconds, landscape explainers or portrait shorts) that look expensive
and teach one thing well. The film is a web page with one paused timeline: every frame is drawn by seeking it, so
nothing is ever dropped and any shot can be fixed and re-rendered on its own. The kit in this skill is that engine.
`examples/` holds finished films made by following this skill, each with its storyboard, source, cue sheet and
narration: `langit-biru` (captions only, the most reviewed) and `petir-guntur` (a narrated short) are the ones to
read first.

## The flow, as the person sees it

**Their prompt → your research (the topic, the blueprints, the narration) → the storyboard, sent to them → their yes
→ the finished film.** The storyboard is the only stop. Everything they might want to weigh in on goes into it: the
script, the voice, the length, the real version of each object and the drawings it is built from. After their yes
you build, check, review and fix on your own and deliver the best film you can make, without asking again.

- **Decide; do not hand the person choices.** When sources disagree or a detail is open, choose what is most
  faithful to the real thing the viewer knows and to the drawings (`references/detail.md` says how), write the
  choice and its reason in the delivery note, and carry on. Ask only when the film cannot be made without them
  (a missing drawing or photo that changes what the film shows), and ask it with the storyboard, not after.
- **Quality is checked by you and by a fresh reviewer, not by the person.** The model against every blueprint, the
  stills against the board, the render against the five detail checks, the independent review, the fixes: all of
  it happens before delivery. The person sees the board once and the finished film once.

Read only the reference your current step needs.

| Step | Read |
| --- | --- |
| Deciding what to teach and in what order | `references/pedagogy.md` |
| Writing and drawing the storyboard (the gate) | `references/storyboard.md` |
| Choosing the look, the accent, the stage light, 3D | `references/look.md` |
| Building real things in detail; directing the camera | `references/detail.md` |
| Building the film with the kit | `references/engine.md`, then `references/motion.md` |
| Writing the narration: talk, not captions; Indonesian and English register | `references/narration.md` |
| The voice: choosing it, performing one take with ElevenLabs, cutting the film to it | `references/voice.md` |
| Music, sound effects, the mix | `references/sound.md` |
| Checking the render, independent review | `references/review.md` |

## What never bends

1. **Storyboard first, and it is drawn.** No film file is written until `storyboard.json` passes
   `kit/tools/storyboard.mjs` with zero errors and the person has seen the board. Every shot has drawn frames (how
   it starts, what happens, how it ends), sketched in the real frame's coordinates, so the build can be cut
   straight from them. If the person asked for an unattended run, send the board and keep going; otherwise wait for
   their yes. That yes is the last thing you wait for: from there to the finished film, you decide.
2. **True, with sources.** Every number and every claim on screen is in the storyboard's fact sheet with where it
   comes from. If you cannot source it, do not say it. What is drawn agrees with what is written: a bar, a meter
   or a path that stands for a number is computed from that number, a diagram that is not to scale says so on
   screen, and a number appears at its value (no counting up through values that are false).
3. **It explains itself on mute.** The picture and the words on screen carry the explanation; the voice and the
   sound make it land. A first-time viewer with the sound off can say what they learned. The step the whole explanation turns on is drawn as a mechanism
   (what goes in, what it meets, what comes out, where it ends up), never left to the caption alone.
4. **One clock.** Every animated value is a function of the timeline's time. No CSS animations, no
   `requestAnimationFrame` loops, no `Date.now()`, no unseeded randomness.
5. **The storyboard is the source of time.** The film reads shot starts and ends from `storyboard.json`; captions
   and the chapter rail are generated from it. Change the plan there, never by hand in the film. In a film that
   speaks, the recorded take writes those times (`voice.mjs`).
6. **You do not grade your own work.** Stills of every shot are looked at before a full render, measurements are
   run on the render, and a fresh reviewer who did not build it judges the result (`references/review.md`).
7. **A film that speaks is written as talk and performed as one take.** The script is written whole and said
   aloud before any shot exists; it is performed once, start to finish, and the picture is cut to the voice. Never
   one sentence a shot, never one recording a sentence, never a pause trimmed to fit a plan.
8. **Real things are built, not symbolised, and the camera is directed.** A device, an organ, a plant, a machine
   the film explains is a replica: the version the viewer knows where they live, researched from photographs and
   teardowns, built in 3D from its real parts at real proportions, in materials that read as what they are; a box, an icon or a flat shape never stands in for it. A body, a limb or an organ is never modelled from shapes: load the real anatomy (`kit/tools/anatomy.mjs`, `kit/engine/body3d.js`) or a measured scan, and build tissue and cells from a dimension sheet taken from histology. Every 3D shot has a deliberate
   camera move, and when the voice names a part the camera goes to it (`references/detail.md`).
9. **Say what was not checked.** You cannot hear. Say that the mix was set by measurement, name what a person
   should listen for, and deliver a music-only version beside the full mix.

## Workflow

### 0. A workspace
The kit is copied into the person's project, never used from the skill's own folder.

```sh
node <skill>/kit/tools/new.mjs <workspace> <film-name>   # copies kit/ and package.json if missing, scaffolds films/<film-name>/
cd <workspace> && npm install                            # three.js, GSAP, the fonts
bash kit/audio/fetch.sh                                    # the sound library (not committed: licence)
```

Needs Node 20+, Playwright with Chromium, FFmpeg, and Python 3 with numpy for the mix. `node kit/tools/doctor.mjs`
checks all of it and says what to install. Add `--portrait` to `new.mjs` for a 1080x1920 short.

### 1. Brief (a few lines, in the storyboard's head)
Who is watching, what they already know, and the **promise**: the one sentence they can say after watching. One
film, one promise. If the topic needs two promises, it is two films. Pick the language the audience reads, the
format (landscape for a lesson, portrait for a short) and whether the film speaks or explains with captions alone.

### 2. Research and the fact sheet
List every claim the film will make, each with its source, as `facts` in `storyboard.json`. Prefer primary and
institutional sources. Do the arithmetic yourself and show it (a number like "5,9x" is written with what it is
computed from). Write down what you are simplifying, and decide how the film will be honest about it.

Research does not stop at the first closed door. When a page will not open, try the other routes before you call
it unavailable: the same document elsewhere (Google Patents for patents, with its drawings on
patentimages.storage.googleapis.com; Wikimedia Commons for photographs; the manufacturer's PDF catalogue; an archived
copy), a direct download with `curl`, a different search. Read images by downloading them and looking at them. Say
exactly which address failed and how, and only then ask the person for what is still missing. A mechanism or a
real object is never filled in from memory because a search was hard (`references/detail.md`).

### 3. The script, if the film speaks
Follow `references/narration.md`: one question, written as continuous talk in the audience's own register, said
aloud and timed, before there is a shot list. Then cut it into shots: each speaking shot's `voice` is its run of
the script.

### 4. The storyboard: the gate
Follow `references/storyboard.md`. In short: acts, then shots (a new picture about every three seconds), each shot
with what it teaches, its caption, what is on screen, the motion, what carries into the next shot, the transition,
the sound, what to check, the facts it cites, and **two or three drawn frames**. Cut on the music's beat.

```sh
node kit/tools/storyboard.mjs films/NAME --png     # zero errors, then show films/NAME/storyboard/*.png
```

Send the pages to the person. The contact sheets (the whole film in frames) go first.

### 5. The take, if the film speaks
Follow `references/voice.md`: choose a voice native to the language (let the person hear two or three if you can),
perform the whole script as one take, and cut the film to it. The storyboard's times are the take's from here on.

```sh
node kit/audio/voice.mjs films/NAME --script                       # the take to perform
node kit/audio/voice.mjs films/NAME --generate                     # with an API key: the take and its word times
node kit/audio/voice.mjs films/NAME --take AUDIO --words WORDS     # with a speech connector: hand both back
node kit/audio/voice.mjs films/NAME                                # every shot's time, and the words to listen to
```

### 5b. The models, before the shots
Follow `references/detail.md`: for each real object the film explains, find its blueprints first (technical and
dimensional drawings, exploded views, parts lists, patent figures) and write the model sheet (the drawings, every
part they show, real sizes) into the storyboard's `models` before drawing the board, so the board shows the real
parts; build it with `kit/engine/parts3d.js`, render a turnaround (four angles and a
close-up) and fix it until it passes the crop test. Only then build shots around it.

### 6. Build, one shot at a time
Follow `references/engine.md`. Give each shot a `<section class="scene">` and animate it between
`s.sNN.start` and `s.sNN.end`. Build in storyboard order and look at a still of each shot as you finish it:

```sh
node kit/tools/render.mjs films/NAME --stills 1.5,4.2,7.9      # finished frames, a few seconds of work
```

Compare each still with its drawn frame. What the frame placed at (x, y) is at (x, y).

### 7. Render

```sh
node kit/tools/render.mjs films/NAME                  # out/picture.mp4, in four-second segments
node kit/tools/render.mjs films/NAME --only 12-16     # after a fix: only the segments that changed
```

A minute of film at 60 fps is about half an hour on four CPU cores. Run it in the background and write the cue
sheet meanwhile.

### 8. Sound
Follow `references/sound.md`: one music bed whose beat the cuts already sit on, and small clean effects on real
events, written as `films/NAME/cues.json`. A bed composed for the film (`kit/audio/music.mjs`) fits better than a library track
when the film will be published.

```sh
python3 kit/audio/mix.py films/NAME                   # out/NAME.mp4, loudness measured on the finished file
python3 kit/audio/mix.py films/NAME --no-sfx --out films/NAME/out/NAME-music-only.mp4
```

`node kit/tools/make.mjs films/NAME` runs the commands of steps 4 to 9 in order (check, voice, render, mix, measure, a
share copy) and stops at the first that fails. It does not replace looking at stills while you build.

### 9. Review, fix, verify
Follow `references/review.md`: `node kit/tools/check.mjs films/NAME` (contact sheets, frozen time, loudness), then a
fresh reviewer with the film, the storyboard and the person's own words. Fix the largest gaps, re-render only what
changed, and have a new reviewer verify the list. Stop at the quality bar or when the gains turn cosmetic. When a
fix changes what a shot shows, change the storyboard to say so and redraw the board: the plan and the film never
disagree.

### 10. Deliver
The MP4 (H.264, 1080p60, about -14 LUFS, true peak under -1 dBFS), a lighter copy for sharing, the music-only
version, the storyboard pages, and a short honest note: what was measured, what was only looked at, what nobody has
listened to, and what you would do next.

## The files of a film

```
films/NAME/
  storyboard.json     the plan: facts, acts, shots, drawn frames. The film reads its times from here
  storyboard.html     the board (generated), storyboard/*.png its pages
  index.html          one <section class="scene"> per shot or group of shots
  film.css            this film's pieces, on top of kit/css/film.css
  film.js             the timeline, built with kit/engine/motion.js
  cues.json           the music bed and every sound, on the film's clock
  voice/              the narration: take.mp3, the time of every word, the cut (voice.json), subtitles.srt
  out/                renders (never committed)
```

## Working style
- Plan where the person can see it (the board), then build to the finished film without asking about any step.
- When work runs long, say in one line what you are doing.
- Show the work: the board, stills, contact sheets, measured numbers, the reviewer's verdict.

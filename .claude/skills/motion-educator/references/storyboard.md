# The storyboard

The storyboard is the film on paper: every shot drawn, timed and justified. It is also the film's data: the timeline
reads its times from it and its captions are generated from it. Nothing is built until it passes the check and the
person has seen it.

```sh
node kit/tools/storyboard.mjs films/NAME --png
```

`examples/langit-biru/storyboard.json` is a complete one (22 shots, 63 drawn frames, 9 facts).
`examples/langit-biru/storyboard.build.py` shows a convenient way to write one: shot lengths counted in beats of the
music, frames written with a few helper functions, and the JSON generated from that.

## The head

```json
{
  "title": "Kenapa langit berwarna biru?",
  "question": "the question the film answers, as the viewer would ask it",
  "audience": "who is watching and what they already know",
  "promise": "the one thing the viewer can say in their own words afterwards",
  "language": "id",
  "format": "1920x1080",
  "duration": 66.977,
  "fps": 60,
  "look": { "accent": "#4da3ff", "accent2": "#ffb21a", "mood": "one or two sentences on the stage, the light and the materials" },
  "music": { "track": "...", "bpm": 86, "beat": 0.697674, "offset": 0, "start": 0.679, "note": "why this track, and how it sits on the cuts" },
  "standard": 3,
  "facts": [{ "id": "f4", "claim": "what is true, with the arithmetic if there is any", "source": "who says so" }],
  "models": [{ "name": "the real object you build", "variant": "which real version, and why", "reference": "what you looked at", "blueprints": ["each technical drawing used"], "photos": ["photographs for colour and finish"], "looks": "colours, materials, markings", "scale": "1 unit = 1 mm", "parts": ["every part the drawings show, numbered as they number them"], "notShown": ["parts left out, each with why"] }],
  "acts": [{ "id": "hook", "title": "Pertanyaan", "goal": "what this act does for the viewer", "rail": false }],
  "shots": []
}
```

`models` is the model sheet for every real object built in 3D (`detail.md`): required, with `camera` on every
`object3d` and `macro` shot, when `standard` is 2 or more (the template's is 3, which also requires `blueprints`).

`loop` makes a short that runs into its own start: `{ "line": "the last line, which completes into the first",
"picture": "how the last frame becomes the first" }`. A portrait short has it by default (`new.mjs --portrait`).
With a loop, the film ends while someone is speaking, on the first shot's picture: no endcard, no silent poster,
and no recap is required (the recap, if any, comes before the bridge). Without a loop the last shot is a recap or
an endcard, as below.

**Draw mechanisms with their blueprints.** A shot that shows how a real thing works places the technical drawing
itself in its frames, exactly as it is, cropped to the part: `{ "blueprint": "reference/x.png", "at": [x, y, w, h],
"crop": [x, y, w, h] }` (the file relative to the film's folder, the crop in the drawing's pixels). Labels, arrows,
moves and the camera are drawn over it. A redrawing is allowed when it is exact: traced over the drawing, every part
in it, at its proportions, with the frame's `"from"` naming the drawing. A loose hand copy is not: it loses parts,
and the model is built from what the board shows. Placing the drawing itself is the surest way.

`rail: false` keeps an act (the hook, the recap) out of the chapter rail the film shows.

`format` is the frame: `"1920x1080"` for a landscape film, `"1080x1920"` for a portrait short. Every coordinate in
the drawn frames is in that frame. A film that speaks also names its `voice` and gives each speaking shot its run
of the script (`narration.md`, `voice.md`); its shot times are then set by the recorded take, not by hand.

## A shot

```json
{
  "id": "s11",
  "act": "hamburan",
  "type": "diagram",
  "start": 27.907,
  "end": 30.698,
  "caption": "Yang pendek *terhambur* ke segala arah.",
  "teaches": "the one thing this shot teaches, or the job it does",
  "screen": "what is on screen, concretely: every element, where it is, what it looks like",
  "camera": "for 3D shots: where the camera starts and ends (angle, distance), the lens, what is in focus",
  "motion": "the main move, the supporting moves, the small detail",
  "carries": "what stays on screen into the next shot",
  "transition": "how the shot leaves",
  "sound": "the music's state and each effect",
  "check": "what to look for in the render to know this shot is right",
  "facts": ["f4"],
  "frames": [
    { "at": 0, "note": "how the shot starts", "draw": [] },
    { "at": 0.55, "note": "what happens", "draw": [] },
    { "at": 1, "note": "how it ends", "draw": [] }
  ]
}
```

`type` is the kind of picture: `type`, `object3d`, `diagram`, `chart`, `macro`, `wide`, `ui`, `compare`, `recap`,
`endcard`. Words wrapped in `*stars*` in a caption take the accent colour on screen.

## The rules the check enforces

| Rule | Number | Why |
| --- | --- | --- |
| A new picture | about every 3.2 s (at least duration / 3.2 shots) | a held picture stops teaching |
| Shot length | 1 s to 6 s | shorter cannot be read, longer wants a new picture |
| Drawn frames | 2 per shot, 3 when it runs 3.4 s or more; about one per 1.25 s over the film | a single frame shows where things sit, not what happens |
| Captions | a caption or a spoken line on at least 85% of shots that are not pure type | the film must explain itself on mute |
| Reading speed | caption characters / (shot length - 0.5 s): 17 is comfortable, 21 is the limit | a caption nobody can finish teaches nothing |
| Caption length | 104 characters | two lines |
| Numbers | a caption or a spoken line with a digit must cite a fact | a number is a claim |
| The script | warnings for: a sentence too long for the ear, three clipped sentences in a row, no opening question, digits in a spoken line, written-register Indonesian, machine-made phrases, a caption that repeats its line | narration is heard once, by ear |
| Variety | at least four types; never three of the same in a row | the eye needs a new kind of picture |
| Shape | starts at 0, no gaps, ends on the duration; at least three acts; a `recap` shot; ends on `recap` or `endcard` | |
| Beat | shot starts within 0.05 s of a beat (warning) | cuts on the grid feel intended |

The check cannot judge the rest. You can:

- **Frame 0 is a finished picture.** The first drawn frame of the first shot is not black and not half-arrived.
- **The question comes first**, in the first three seconds, in the viewer's own words.
- **One idea a shot.** If `teaches` needs an "and", it is two shots.
- **Concrete before abstract.** Show the thing, then name it, then measure it (the experiment, then "Rayleigh
  scattering", then the curve and the number).
- **Something carries over every cut.** The beam becomes the light entering the prism; the blue point on the chart
  becomes the sky. `carries` names it. A shot that starts from nothing is a slide.
- **Answer the objection the viewer will have** ("then why isn't the sky violet?").
- **The recap is one frame** holding the three or so ideas, each with its small picture.
- **The last frame is a poster**: the line to remember, readable for at least two seconds. In a loop the last
  frame is instead the first shot's picture a moment early, and the line to remember is said just before the bridge.

## Drawing the frames

A frame is a list of things placed in the real frame (1920 x 1080, origin top left). The sketcher
(`kit/tools/sketch.mjs`) draws them as a pencil sketch. What you place at (x, y) here is built at (x, y) in the film:
that is what makes the build cuttable from the board. Each thing is one object whose first key names it.

| Thing | Draws |
| --- | --- |
| `{ "planet": [x, y, r], "light": "left" }` | a globe with a lit side, land and a ring of air |
| `{ "sun": [x, y, r] }` | a disc with rays |
| `{ "beam": [x0, y, x1, w] }` | a band of light travelling right |
| `{ "prism": [x, y, size] }`, `{ "fan": [x, y, x1, y0, y1], "n": 7 }` | a glass wedge; coloured rays spreading from a point |
| `{ "wave": [x0, x1, y, amp, length], "colour": "blue" }` | a sine wave |
| `{ "molecule": [x, y, r] }`, `{ "molecules": [x, y, w, h, n], "seed": 3 }` | two atoms; n of them adrift in a box |
| `{ "scatter": [x, y, n, r0, r1] }` | n short rays leaving a point |
| `{ "axes": [x, y, w, h], "xlabel": "", "ylabel": "" }`, `{ "curve": [[x, y], ...] }`, `{ "bar": [x, y, w, h] }`, `{ "strip": [x, y, w, h] }` | chart parts; the spectrum |
| `{ "panel": [x, y, w, h], "title": "", "rows": [] }`, `{ "card": [x, y, w, h], "label": "" }`, `{ "chip": [x, y], "text": "" }` | a window with rows; a card; a small label |
| `{ "title": [x, y], "text": "two\nlines", "size": 130, "align": "start", "accent": "word" }` | the big lettering the viewer reads |
| `{ "label": [x, y], "text": "" }`, `{ "number": [x, y], "text": "5,9x" }`, `{ "bracket": [x0, x1, y], "text": "450 nm" }` | smaller lettering; a big figure; a measure |
| `{ "ring": [x, y, r] }`, `{ "cloud": [x, y, w] }`, `{ "bolt": [x0, y0, x1, y1] }` | a circle's outline (an orbit, a front of sound); a cloud; a jagged line |
| `{ "path": "M100 100 L300 400 ...", "colour": "blue", "fill": "blue" }` | any shape the list lacks, as an SVG path in the frame's coordinates |
| `{ "person": [x, y, size] }`, `{ "horizon": [y] }`, `{ "sky": [y0, y1], "tone": "dusk" }` | someone standing; the ground; a graded sky |
| `{ "magnifier": [x, y, r] }`, `{ "dot": [x, y, r] }`, `{ "line": [x0, y0, x1, y1], "dashed": true }`, `{ "arrow": [x0, y0, x1, y1] }`, `{ "glow": [x, y, r] }` | a lens, marks, where the stage's light sits |

Direction is drawn in blue pencil, the way a storyboard artist marks it:

| Thing | Means |
| --- | --- |
| `{ "move": [x0, y0, x1, y1], "text": "what moves" }` | this travels along the arrow |
| `{ "camera": "push" }` (`pull`, `up`, `down`, `left`, `right`, `orbit`) | what the camera does in this frame |
| `{ "cut": "how the shot leaves" }` | written in the corner of a shot's last frame |

How to draw a shot well:

- **Three moments, not three copies.** The first frame is the arrival (what comes in, the camera mark), the middle
  one is the event the shot exists for, the last is the state the next shot inherits, with its `cut`.
- **Draw the lettering the viewer will read**, at its real size and place, with its accent word. Do not write
  "title here".
- **Use the frame.** In a feature shot the subject covers most of it. A small thing in a large empty field is the
  commonest way a film looks cheap, and it shows on the board first.
- **Mark every motion** with a `move` or a `camera`. A frame with no blue pencil is a still.
- A topic that needs a thing the sketcher cannot draw gets a new entry in `DRAW` in `kit/tools/sketch.mjs` (a few
  lines of SVG). Do not fake it with boxes.

If an image model is connected and the person wants painted frames (characters, places), generate them from each
frame's `note` and `screen`, save them under `films/NAME/storyboard/art/`, and keep the sketched frames as the
layout of record: a painted frame shows mood, the sketch shows where things are.

## Showing it to the person

Send the PNG pages: the contact sheets first (the whole film in frames, in order), then the shot pages, then the
summary with the fact sheet. Ask the two questions that matter: is the explanation right and in the right order, and
is anything missing or too long. Their corrections go into `storyboard.json`, the check runs again, and only then is
anything built.

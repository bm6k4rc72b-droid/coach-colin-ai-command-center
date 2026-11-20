# Review

You built it, so you cannot see what is wrong with it. Three layers catch what you miss: looking at stills as you
build, measuring the render, and a reviewer who did not build it.

## While building: stills

After each shot, render a still from its middle and one from each transition, and look at them:

```sh
node kit/tools/render.mjs films/NAME --stills 1.5,4.2,7.9
```

Compare each with its drawn frame in the storyboard, and run the five checks at the end of `detail.md` (the crop
test, the parts count, no placeholders, the camera log, side by side with the bar). Check: is the subject where the frame put it; is anything
clipped, overlapping or unreadable; is the frame mostly empty; did a bright thing blow out; is the lettering the
right size. Do not start a full render with a shot you have not looked at.

## After rendering: measurements

```sh
node kit/tools/check.mjs films/NAME
```

It writes contact sheets (a frame every half second) to `out/sheets/`, counts frozen time (stretches where nothing
moves) and, when the mixed film exists, reads its loudness. Look at every sheet.

| Check | Target |
| --- | --- |
| Frozen time | none over 0.6 s, except the last frame |
| Frame count and length | exactly duration x fps; the file decodes without errors |
| Loudness | about -14 LUFS integrated, true peak under -1 dBFS, measured on the encoded file |
| Sounds on events | each lands within a frame or two of its picture; each lifts at least about 5 dB over the half second before it |
| Captions | readable at phone size; never over the subject of the shot |
| Facts | every number on screen matches the fact sheet |

## The reviewer who did not build it

Give a fresh agent the rendered film, the storyboard and the person's own words, and nothing of your reasoning. It
extracts its own frames. Fix the largest gaps, re-render only the segments that changed, then give a **new**
reviewer the new cut and the old report to verify item by item. Two rounds is usual. Stop when the remaining items
are cosmetic.

### First review

```
You are an independent, harsh critic. You did NOT build this; judge rendered pixels and measurable audio, not
intentions. Do not edit any file; work in a scratch folder. Return the report as your final message.

Artifact: <path> (<seconds> s, 1920x1080, 60 fps, with audio). An educational film that answers: "<question>".
Promise: <the storyboard's promise>. Audience: <audience>. Storyboard: <path to storyboard.json> (the plan and the
fact sheet). Scene map: <shot ids with start times>.
The person's criteria, in their words: <verbatim>.
Benchmark: the best product-teardown and science explainers: real objects built in detail (you could name every part
from a close-up), a directed camera (orbits, push-ins, macro close-ups with shallow focus, parts lifting apart),
labels riding on the parts, rich lighting and material, no wasted space, sound that lands on the picture.
A blueprint or patent drawing pasted into the picture is a crutch, not a teardown: rate it ordinary.
A schematic stand-in for a real object the film explains (a box for a chip, a cone icon for a speaker, a flat shape
for an ear or a hand) is "ordinary" at best, however clean it is.

Method: contact sheets every 0.25 s that you can read; native frames at the middle of every shot; dense windows at
1/30 s around every cut. Frame differences for frozen stretches. Audio by measurement (you cannot listen: say so):
loudness, true peak, and whether an onset sits on each visual event.

Report (under 900 words):
1. Teaching: could a first-time viewer, on mute, say the promise afterwards? Where does the explanation skip a step,
   state something unsupported, or disagree with the fact sheet?
2. Fidelity: is each real object the version the audience knows (their country's petrol nozzle, their wall
   socket, their motorbike), and does it match photographs of the real thing? For each, crop it from a frame. Would a stranger name it from the
   silhouette? Name its parts from the close-up? List what a real one has that this one lacks (parts, bevels,
   seams, markings, surface), against the storyboard's `models`. For a living thing, compare each level with a
   real anatomy plate or micrograph: a limb or organ built from primitives, or a cell whose parts sit in the wrong
   place or at the wrong size, is "ordinary" however well it is lit.
3. Camera: list each 3D shot's move. Which shots are static or straight-on, which repeat the shot before, which
   name a part without going close to it?
4. Per shot: what is on screen, how much of the frame is empty, premium or ordinary and exactly why, defects with
   timestamps and screen regions.
5. Per transition: intended or cheap; any defect frames (pops, overlaps, half-drawn states).
6. Audio findings with numbers.
7. The top eight changes, ranked by impact, each concrete and implementable.
Be blunt. No praise for its own sake.
```

### Verification

```
You are an independent critic doing a verification pass on a film you did not build. Do not edit any file.
New cut: <path>. The previous report: <paste it>. Timings that moved: <list>.
For each item of that report: FIXED / PARTLY / STILL PRESENT, with a timestamp and what you see.
Then NEW defects, which matter most: glitch or pop frames, text over text, clipped elements, half-drawn states.
Audio: loudness, true peak, the lift of each named event.
Under 500 words. End with SHIP or ONE MORE PASS (at most three fixes, each concrete).
```

### Script review (before the take, for any film that speaks)

```
You did not write this. Read this narration script as the listener would hear it: <language>, for <audience>.
Script: <the take text from voice.mjs --script>. The standard it was written to: <path to references/narration.md>.
Do not rewrite it into your own style. Mark every sentence that sounds written rather than said, that does not lean
on the sentence before it, that a person of this audience would not say this way in this language, or that only
names what the picture shows. For Indonesian: mark written-register words, forced slang, particles overused, and
numbers that would be read awkwardly. Then: does it open on one question and end by answering it? Give the three
changes that matter most, each as the line now and the line as it should be said. Under 400 words.
```

A model reviewing a script is a weak stand-in for a person listening. Say so when you deliver, and ask the person
to listen to the take before the film is built whenever they are reachable.

### Storyboard review (before building, when the stakes justify it)

```
Review this storyboard for a <seconds> s educational film answering "<question>" for <audience>. You did not write
it. Storyboard: <path to storyboard.json and its pages>. Check: is every claim in the fact sheet true and is its
source real; does the explanation go in an order a newcomer can follow, with no step skipped; does each shot teach
one thing; is the objection a sharp viewer would raise answered; which shots are filler; is the recap complete.
Return a ranked list of problems with one concrete fix each.
```

## Keep a record

For each round: what was reviewed, the top findings, what changed, and the measured result. It goes in the delivery
note, and it is how the next film starts better than this one did.

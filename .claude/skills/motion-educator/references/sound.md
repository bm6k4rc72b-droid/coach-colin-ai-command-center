# Sound

Sound is half of why a film feels finished, and the half you cannot check: you cannot listen. Work by measurement,
keep it restrained, and say plainly in the delivery what a person has to listen for.

## The library

`kit/audio/sources.json` lists 49 sound effects and 3 music tracks from Mixkit, each with its measurements (length,
where its loudest moment is, how much of it is sub-bass or hiss). `kit/audio/fetch.sh` downloads them into
`kit/audio/lib/`, which is never committed: the Mixkit licences allow the sounds inside a video but not handing the
raw files on. `kit/audio/screen.py` measures a new candidate the same way. Sounds were chosen by title and
measurement, not by ear.

| Cue | Use |
| --- | --- |
| `whoosh_fast_1..8`, `whoosh_long_1..3` | a real transition: a whip, a push, a dive |
| `riser_1` (ends on its peak), `riser_3` (bright air) | the second before a hit |
| `impact_big_1..4`, `sub_drop_1..3` | the few big moments: the question, the name, the last line |
| `shimmer_1..2` | light crossing a heading or an object |
| `pop_1..3`, `tick_1..2`, `click_1..2`, `card_1..3`, `key_1..3` | labels, counters locking, clicks, cards landing, typing |
| `success_1..3` | a result confirmed |
| `tension_1..4`, `typing_1..2`, `alert_1..2` | beds and warnings |
| `music/xceed_thru_johann` (86 BPM, a smooth rise, no drop) | a calm, curious underscore: the default for explaining |
| `music/masking_the_masters` (100 BPM, quiet then a build to full) | a dramatic launch-style film |
| `music/odd_beats_01` (117 BPM, hard drop) | unheard and tagged "disturbing": listen before using |

## A bed made for the film

The library's few tracks end up under every film. When the film is worth it, compose its own bed with ElevenLabs
Music, at the film's exact length and in its mood:

```sh
node kit/audio/music.mjs films/NAME --prompt "Instrumental underscore for a calm health explainer: warm felt piano and soft strings, gentle pulse at 85 BPM, sparse, no lead melody, no vocals. Starts at once, sits low under a voice, lifts a little near the end and resolves on the last chord."
```

It writes `films/NAME/music/bed.mp3`, records the prompt, and points `cues.json` at it (at -22 LUFS under a
voice). Compose it after the take, when the film's length is final: the bed is made a second and a half longer
than the film and its tail is faded.

- Describe the subject's mood, not a genre label alone: "curious and light" for a science question, "tense then
  relieved" for a myth that gets broken, "warm and reassuring" for health.
- Under narration: sparse, no lead melody, nothing busy in the voice's range (roughly 200 Hz to 4 kHz). Say "no
  vocals" every time.
- Ask for an even level in so many words ("plays at full level from the first beat, no intro silence, an even
  loudness all the way through, no big swells or drops"): a composed track likes to build, and under a voice a
  build is a swell that fights the words.
- Then read `node kit/audio/music.mjs films/NAME`: it reports a silent lead-in, silence inside, a loudness range
  over 10 LU, and music that stops before the picture. Each is a reason to compose again; the average level alone
  says nothing about them.
- The poster is heard as well as seen: the mixer warns when the sound stops more than half a second before the last
  frame. A composed bed often fades out early; ride it up over its decay or shorten `fade_out` so it rings to the end.
- One composition per film. Ask again only if the first is clearly wrong (wrong mood, too busy, it stops early, or
  the status above flags it).
- Nobody can hear it here: say so, and name the prompt in the delivery note so a person can judge it.

## Music first

- Choose the track for the viewer, not for "tech". Explaining wants a calm pulse that rises; a launch wants a build.
- Find the track's beat (`sources.json` has `bpm` and `beat_offset_s`) and start it so a beat falls on the film's
  first frame. Then count every shot in beats, in the storyboard. The cuts land on the music because the plan was
  made on its grid, not because anything was nudged afterwards.
- Put the film's biggest moments on bars, and the track's own change (a build arriving, a step up) on the film's
  turn.

### A bed for a loop

A short that loops has no ending: ask for music that "keeps the same groove to the last second, with no ending, no
final chord and no fade", and leave out "lands on a resolved chord". `music.mjs` composes a second and a half past
the film's end; with the storyboard's `loop`, `mix.py` lays that run-on over the opening, so the music carries on
when the player jumps back. Put no hit on the last frame: the last effect is a soft one that also works under the
first word.

## The cue sheet

`films/NAME/cues.json`: the music, then every sound on the film's clock.

```json
{
  "music": { "file": "lib/music/xceed_thru_johann.mp3", "start": 0.679, "lufs": -18, "fade_out": 2.4, "duck_db": -6 },
  "events": [
    { "t": 8.372, "file": "lib/sfx/impact_big_1.mp3", "db": -5, "align": "peak", "duck": true, "trim": [0, 1.6], "fade": 1.0, "note": "THE QUESTION lands" },
    { "t": 12.2, "file": "lib/sfx/shimmer_1.mp3", "db": -14, "align": "peak", "note": "the colours open" }
  ]
}
```

`align: "peak"` puts the sound's loudest moment on `t` (use it for anything that must land on a frame), `"end"` its
last sample (a riser into a hit). `db` is the level of the sound's own peak. `duck` dips the music under a hit.
`trim` and `fade` cut a long tail so the next sound is heard. `pan` is -1 left to 1 right. On the music, `ride` is a
list of `[seconds, dB]` points that moves its level over time, for a passage where the track itself gets too loud
(a track that keeps building under a quiet end card).

```sh
python3 kit/audio/mix.py films/NAME
python3 kit/audio/mix.py films/NAME --no-sfx --out films/NAME/out/NAME-music-only.mp4
```

The mixer levels the music, places every sound, brings the whole to -14 LUFS, holds peaks with a look-ahead limiter
and measures the finished file (the encoder itself can add a decibel or two on hard hits, so the true peak is read
after encoding). The first line of `NAME.mix.txt` is that measurement.

## Levels that held up

These are peaks in dBFS before the master gain, against music at -17 to -18 LUFS.

| Sound | Explaining (calm) | Launch (dramatic) |
| --- | --- | --- |
| The two or three big hits | -5 | -1 to -2 |
| Smaller hits on a beat | -10 to -12 | -5 to -7 |
| Whooshes on real transitions | -14 to -16 | -7 to -9 |
| Shimmers | -14 to -17 | -11 |
| Pops, ticks, clicks | -13 to -16 | -7 to -11 |
| Cards landing | -14 | -2.5 (they are short and soft) |
| Counter ticks, typing | -22 | -14 |
| Beds (a hum, typing) | -21 | -9 to -12 |

Under narration these are too quiet: a pop at -14 measured a lift of 0 to 3 dB against the voice and the bed. With
a voice in the film, small effects sit at -8 to -11, they go between the words (not under them), and the music bed
drops to -20 LUFS or lower. Measure the lift of each one; raise what lifts less than about 4 dB.

## Rules

- **A sound for a real event only**: something lands, opens, locks, arrives. No sound for decoration.
- **One whoosh per real transition**, soft and short. Repeated boomy whooshes are the first thing people hate.
- **A riser must lose to its hit.** In a calm film, leave the riser out: twice a reviewer measured the hit failing
  to rise above the riser's own last 20 ms, at 7 dB under and again at 14 dB under. If the moment needs a lead-in,
  let the picture do it. Cut the previous hit's tail (`trim`, `fade`) so the next one is heard.
- **Small sounds get buried.** Measure the lift of each event over the half second before it; under about 5 dB it
  will not be heard. Raise it or duck the music.
- **Explaining is not a trailer.** Keep the hits few and the effects small; the film is talking.
- **In a 3D teardown film, the sound follows the motion.** Every camera move gets a soft air whoosh shaped to the
  move (fade in with its ease-in, out with its ease-out, panned the way it travels); every part that moves gets its
  own small sound: a click as a cover lifts, a tick as a label lands, a hum as the coil moves, a rustle in the
  foam. The best product shorts carry a hundred such sounds in a minute, each 12-20 dB under the voice and faded
  in and out, so the picture feels physical without the viewer ever hearing an "effect". They sit under the words
  as well as between them, because they are quiet; the hits on the turn and the payoff are the only loud ones.
- **Leave headroom.** True peak under -1 dBFS on the encoded file.
- **Always make the music-only version**, so a complaint about "that sound" can be traced to the right layer.

## What to say when you deliver

That nobody has listened to it; that the sounds were chosen by title and measurement; the measured loudness and
peak; and one or two specific things to listen for (is any effect cheesy or too loud; does the big hit land on the
picture). Ask for timestamps.

## Narration

The kit's films explain through captions. A voice-over is a cue like any other: generate or record it per shot,
place each line with `align: "start"` at the shot's start, and duck the music under it (`duck: 1.5`). Keep the
captions: many people watch muted.

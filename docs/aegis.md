# Aegis — nobody falls alone

A fall guardian for a home. It fuses a camera, a phone carried in a pocket and
the room's own sound; it refuses to raise an alarm on any one of them alone;
and when it does think somebody has gone down it **asks them first**, out loud,
by name, before it escalates to anybody else.

Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/aegis/>
Locally it is `/aegis/` (`http://localhost:4173/aegis/` under `./start.sh`).

It runs entirely in a browser on iPhone, Android or any laptop with a webcam.
Nothing is recorded, nothing is uploaded, and there is no face recognition
anywhere in it.

---

## The problem is not detecting falls

Detecting a fall is the easy half, and every product in this category can do it.
The hard halves are the two nobody demonstrates:

**Not detecting the things that look like falls.** A person who is not standing
up is not, in general, a person in trouble. Somebody asleep is horizontal.
Somebody doing up a shoelace is folded to a third of their height. Somebody
kneeling at a low cupboard is on the floor. Somebody who sat down hard produced
a three-g impact. A posture-only detector fires on all four, every day, and a
household that is woken three times for nothing unplugs the camera before the
fourth.

**Responding without treating an adult as an incident.** Roughly half of the
people who go down in their own home get themselves up within a minute. A system
whose response to a detection is to telephone a daughter across a city has
turned an embarrassment into an emergency, and the person it happened to will
ask for it to be switched off.

Aegis is built around those two problems. The detector's job is to be *hard to
fool*; the receptionist's job is to make the response *proportionate*.

---

## What it does, and what it refuses to do

**It does**

- Measure how tall somebody is *right now* against how tall they stand, thirty
  times a second, and tell a fall from a sit by the rate of the descent, where
  the descent stopped, and whether they got up again.
- Keep measuring when the furniture hides their legs, because the measurement is
  referred to the head, not to the bounding box.
- Take a second opinion from a phone in a pocket — the impact, the reorientation,
  and whether anything in the stillness afterwards is still breathing.
- Take a third from the room's sound, reduced to four numbers a frame.
- Ask, by name, with a way to wave it off, before it escalates to anybody.
- Write every episode down, including the ones it got wrong.

**It refuses to**

- Raise an alarm on a single line of evidence. There is exactly one exception
  and it is a stricter rule, not a looser one: a camera that watched *both* the
  descent and the seven seconds afterwards has made two independent observations.
- Claim it saw a fall it did not see. Somebody discovered already on the floor is
  reported as `found-down`, capped below the score a watched fall can reach, and
  the message contacts receive says so in those words.
- Say anything about injury. It is a movement detector. It does not measure a
  pulse, it cannot tell whether anybody is hurt, and the console says so.
- Record, upload or store a single frame or a single second of audio.
- Dial a telephone. A web page cannot, and any product implying otherwise is
  lying to somebody about their mother's safety. What it does is put the message
  and the number one tap away, and say that the tap is required.

---

## The measurement that makes it work indoors

The obvious way to tell standing from lying is the shape of the silhouette: a
standing person is tall and thin, a fallen one is short and wide. It works
beautifully in a clear corridor and fails in every room anybody actually lives
in, because rooms contain furniture. A sofa, a bed, a coffee table — each of them
cuts the bottom off the silhouette. The bounding box shortens. Height over width
collapses. The app announces that somebody standing behind their own sofa has
fallen over, and it does that every single time they walk past it.

The way out is an observation about furniture rather than about people:
**furniture is low.** A coffee table hides shins. A sofa hides a body to the
waist. Almost nothing in a home hides a standing adult's head.

So the measurement is not the height of the silhouette. It is the **row the head
occupies**, referred to a floor position that is tracked separately and held
steady while the feet are hidden:

```
stature  =  (floor row − head row) ÷ standing height at that floor row
```

- **1.0** standing
- **0.55** on a chair
- **0.20** on the floor

Standing height at a floor row is learned, not calibrated. A straight-line fit of
observed height against floor row — perspective is close enough to linear across
the band of a room a camera can usefully watch — from frames where the subject
is unambiguously upright. There is no calibration ritual: you do not measure
anything, mark anything, or type in a camera height.

Three consequences are visible in the interface rather than buried:

- The floor line on the picture is **solid when the feet were seen and dashed
  when the reference is being carried forward**. That one visual distinction is
  the whole occlusion story.
- The reference is **spent by movement, not by time**. An earlier version aged it
  in seconds and was wrong in exactly the case the app is for: somebody lying
  motionless behind a sofa has a reference thirty seconds old and perfectly
  valid, because nothing has moved. Timing them out downgraded the system's
  confidence precisely as the situation got more serious.
- When too little of the body is showing to measure anything, it says
  `obscured` and **widens its window rather than filling in a number**.

The scale model is fitted to the **upper envelope** of its samples rather than
through the middle of them, and that detail is load-bearing. Standing height is
the tallest a person is; every measurement error makes them look shorter and
none makes them look taller. A least-squares fit through the middle of that
cloud learns a height somewhere between standing and crouching, and then a
genuine slow collapse measures as a stature of 0.5 instead of 0.26 and reads as
sitting down. It cost a whole scenario to find.

---

## Telling a fall from everything else

Not the posture. The *transition*, and four properties of it:

| | Sitting down | Shoelace | Into bed | A fall |
|---|---|---|---|---|
| **Rate** | ~0.3 /s | ~0.35 /s | ~0.25 /s | **> 0.85 /s** |
| **Ends at** | seat height | knee height | bed height | **floor** |
| **Where** | anywhere | anywhere | **rest zone** | anywhere |
| **Then** | stays | **up in 6 s** | stays | **stays down** |

1. **Rate.** Sitting is a controlled lowering against the legs and takes a second
   and a half. A fall is a body accelerating under gravity and takes under one.
2. **Where it stops.** Somebody who lowers quickly but settles at chair height
   sat down quickly. That is a person in a hurry, not a person in trouble.
3. **Where it happened.** Rest zones are drawn over the bed and the armchair.
   Horizontal in the place you go to be horizontal is not an event.
4. **What happens next.** The shoelace defeats every posture-only system and is
   defeated here by patience: an alarm is only ever raised from a body that went
   down **and stayed there**. That costs a delay before anything is said, and the
   delay is the price of not crying wolf — which is also why the response starts
   by *asking* rather than by calling anybody.

There is a fifth rule that is about honesty rather than physics. The machine will
not call something a fall unless it **watched the descent**. A subject already on
the floor when tracking begins is `found-down` — treated seriously, capped below
a watched fall, and never dressed up as an observation the system did not make.
"I saw her fall" and "I can see her lying down" are not the same sentence and
must never be reported as though they were.

The states, in full: `away`, `upright`, `lowering`, `descending`, `seated`,
`resting`, `grounded`, `recovering`, `down`, `found-down`, `obscured`.

---

## Three sensors that fail differently

Each channel is beatable on its own, and each is beatable in a *different* way.
That is the entire reason there are three.

| Channel | Weight | Beaten by | Blind to |
|---|---|---|---|
| **Camera** | 1.00 | a coat off a hook, a pet, a violent light change | the bathroom, the stairs |
| **Carried phone** | 0.85 | being set down hard | a dressing gown with no pocket |
| **Room sound** | 0.45 | a dropped saucepan, a slammed door | a quiet fall |

What none of them share is a *failure mode*. The coat that fools the camera makes
no sound and moves no accelerometer. The saucepan that fools the microphone
leaves the camera looking at somebody standing up.

### The carried phone

A camera cannot see into the bathroom, and the bathroom is where people fall. The
second channel is `devicemotion` on a second phone in a pocket or on a lanyard —
no app store, no pairing, no wearable to buy. It looks for four things together:

1. **A dip.** The sensor unloads as the body goes. Real falls rarely reach true
   free fall — a hand catches a counter — so the test is for partial unloading.
2. **A spike.** Impact, tens of milliseconds, several g. Worth almost nothing
   alone: setting a phone down firmly produces a bigger one.
3. **A turn.** Gravity's direction relative to the device changes and *stays*
   changed. Somebody who sat down heavily produced the spike and not this.
4. **A silence.** Stillness afterwards.

And then the test that stops the channel being fooled by a handset sliding onto a
rug, which produces one, two and four beautifully: **a still person is not a still
object, because a still person breathes.** A body at rest moves its chest, and the
sensor sees it — a few thousandths of a g, oscillating eight to thirty times a
minute. A phone on a floor produces an order of magnitude less and no rhythm at
all. If the silence has no breathing in it, the channel reports that as a
*finding*, and it pulls the total down.

The crossings are counted on a smoothed trace. The sensor's own noise is the same
order as the signal; on the raw trace the estimated rate comes out at fifteen
hertz for everything, alive or not.

### The room's sound

A household will not, and should not, accept an always-on microphone in a
bedroom. So this is not one. Audio is reduced, in the tick it arrives, to four
numbers: energy below 500 Hz, 500 Hz–2 kHz, above that, and the spectral
centroid. The waveform is never copied out of the analyser's scratch buffer.
**There is no code path by which a sound can be stored, replayed or transmitted**,
and what survives a frame is a chord of four scalars from which no speech could
be recovered by anybody.

Those four numbers separate a body (dull, sudden, under 500 Hz, decaying in
200 ms) from a dropped object (bright centroid, ringing) and from a television
(continuous, so the onset test — which measures a frame against the half second
before it — never fires; turning the volume up does not produce alarms).

The channel is capped at **0.58**, deliberately below the level at which the
receptionist speaks. It cannot tell a body landing on a floor from a body landing
on a sofa, so on its own it may make the system pay attention and nothing more.

---

## The corroboration rule

Evidence is combined in log-odds. The strongest claim sets the belief and every
other claim moves it from there.

Two properties are enforced rather than trusted:

**Silence is not testimony.** A channel contributes only when it makes a claim.
A sensor that is on and has seen nothing contributes exactly zero. Getting this
wrong the first time broke the whole system in a way that looked like arithmetic
and was really a category error: a quiet accelerometer was being read as *proof
nobody fell*, so a camera watching somebody slide to the floor in silence was
voted down by two sensors that had simply observed nothing.

**An alarm needs two independent lines.** A belief resting on one channel is
capped at 0.62, below the alarm threshold of 0.80, however confident that channel
is. The one exception satisfies the same requirement by a different route: a
camera that watched the descent *and* watched the body stay down past the dwell
has made two observations seven seconds apart, and either alone would be
insufficient.

| Belief | Level | What happens |
|---|---|---|
| < 0.35 | calm | nothing |
| 0.35 | watching | the interface changes; nothing is said |
| 0.60 | checking | Vera asks |
| 0.80 | alarm | the ladder starts climbing |

The console states its coverage permanently — the percentage of available sensing
in service, and a plain sentence for each channel that is not. A camera-only
installation is perfectly reasonable and most will be exactly that; it is also
blind to the two rooms where people most often fall, and that is a fact about the
installation, on the screen, all the time.

---

## Vera, and why the receptionist is not decoration

The response to a fall is a conversation, and Vera is the one having it.

She is a hologram at the front of the console — a volumetric figure rendered as
scan strips through a silhouette profile, on a lit dais, with her light following
the real energy of the audio. She is drawn as a function rather than played as a
video, which is the point: when the belief rises she straightens and turns toward
the picture; when she asks whether somebody is all right she leans in; when the
console alarms her whole palette shifts to crimson. Somebody glancing at this
console from across a room should read its state off her posture before they read
a number, and that is the one job a receptionist has that a status chip cannot do.

No face is drawn. Rendering eyes and a mouth at this scale lands in the uncanny
valley and, worse, invites the viewer to read an expression the system has no
business implying. What is drawn is the light that falls where a face is, plus a
band at the mouth that moves with the audio.

### The ladder

| Rung | Length | What she does |
|---|---|---|
| **Attentive** | — | nothing is said; the interface changes |
| **Asking** | 20 s | by name, warmly, with two ways to answer |
| **Confirming** | 45 s | says what she is about to do, and counts down out loud |
| **Alerting** | — | contacts raised, with the measurements attached |

Two shortcuts cut across it in both directions, and they matter more than the
rungs. Saying **"help"** goes straight to alerting — a conscious person who knows
they need an ambulance must never be made to wait out a countdown designed to
protect them from a false positive. And **getting back up** stands the whole
thing down from any rung, silently, with a note in the ledger, because the fall
still happened and somebody's doctor may want to know it did.

Confidence does not shorten the asking. It is tempting to skip to the countdown
when the belief is high, and it is exactly backwards: a high belief means
somebody really is on the floor, and somebody on the floor is the person most
likely to be able to answer and most entitled to the chance.

A stand-down suppresses the ladder for two minutes. A ladder that re-climbs three
seconds after somebody said they were fine is a ladder that gets switched off.

### Her voice

A browser cannot clone a voice. `speechSynthesis` offers whatever the operating
system installed, and no parameter in it will turn one person's voice into
another's. What it *can* get right is the register and the cadence, which is most
of what anybody hears:

- The installed voices are **ranked and the best one chosen**, not the default —
  the default on every platform is the flattest one there.
- Lines are **spoken in clauses**, each with its own rate and pitch. Pitch
  declines across a statement (declination, which every language does and no
  default synthesiser does) and lifts on the last clause of a question.
- An **urgent line is slower and lower**, not faster and higher. That is the
  opposite of the intuition and the reason emergency announcements are
  intelligible.
- A voice panel exposes pitch, pace, warmth (how far the pitch moves across a
  sentence) and breath (the pause between clauses), and remembers them.

For an **exact match** there is a bridge: an ElevenLabs or OpenAI-compatible key
and a voice id in the voice panel, and Vera speaks through that instead — with
the audio played through an analyser, so the hologram is driven by the real
waveform rather than an estimate. That path leaves the device, the panel says so
in those words, and it is off unless somebody turns it on. If the key is refused
she falls back to the local voice rather than going silent.

She also **hears** "I'm fine" typed or spoken. Typographic apostrophes are folded
before matching: iOS keyboards and every speech recogniser on the platform
produce U+2019, so a pattern written with a plain apostrophe silently fails to
hear the single most important sentence this product listens for, from the device
most likely to be saying it.

---

## The demonstration

You cannot demonstrate a fall detector by falling over, and you certainly cannot
demonstrate one by asking an eighty-year-old to. So there are eight synthetic
scenarios — but the important word is *demonstration*, not *simulation*.

**There is no demo branch inside the detector.** The scenarios produce ordinary
RGBA frames, ordinary accelerometer samples and ordinary band energies, and hand
them to precisely the same segmentation, posture, kinematics, inertial, acoustic
and fusion code that a real camera and a real phone feed. If the detector is
wrong, the demonstration shows it being wrong, which is the only kind worth
putting in front of anybody.

Press **Run the demonstration** and Vera narrates all eight. Number keys 1–8 jump
between them; space advances.

The order is the argument — four things that look like falls and are not, then a
sensor deliberately fooled, and only then the falls:

| # | Scenario | Should | Why it is here |
|---|---|---|---|
| 1 | Walking through | stay quiet | the baseline |
| 2 | Sitting down heavily | stay quiet | fast is not falling; it stops at a chair |
| 3 | Doing up a shoelace | stay quiet | defeats every posture-only detector |
| 4 | Going to bed | stay quiet | horizontal where horizontal is expected |
| 5 | **The phone is dropped** | stay quiet | built to fool the accelerometer completely |
| 6 | A fall in the open | **alarm** | all three channels agree |
| 7 | A fall behind the coffee table | **alarm** | on a coasted floor reference |
| 8 | A slow slide down a wall | **alarm** | on the dwell, not on the speed |

Scenario 5 is the one to watch in a room full of sceptics. It gives the inertial
channel free fall, a 4.8 g impact and total silence afterwards — and the fusion
stage refuses it, because there is no breathing in the silence and the camera is
looking at somebody standing up. The panel says exactly that, in words, while it
happens.

---

## Privacy

- **No frame is stored.** Frames are measured and the buffer overwritten.
- **No audio is stored.** It becomes four scalars before anything else sees it.
- **No face recognition.** There is none in the code; it could not tell you who
  somebody is if you asked it.
- **Nothing leaves the device** unless the operator explicitly configures the
  cloud voice bridge, which sends only Vera's own lines, and says so.
- **The ledger is local.** No account, no sync, no server — which is a real
  limitation: clearing the browser's data clears the history with it. Export is
  the answer and the panel says so.
- The service worker caches the code and never a measurement, because no
  measurement ever becomes a request.

---

## Running the checks

```sh
npm run test:aegis   # 63 checks: the whole chain, the channels, the ladder
npm run qa:aegis     # headless end-to-end through the real DOM, all 8 scenarios
```

The unit suite replays every scenario through the real pipeline and asserts the
verdict — the four negatives are the important half. It also drives the
escalation ladder at a thousand times real speed through every rung, including
the ones that are supposed to be skipped, because the lines it speaks at the top
are heard on the worst night of the year and never on any other.

The QA script proves what a unit test cannot see: real canvases, real device
pixel ratios, the real animation loop, and the real DOM a person reads a verdict
off.

---

## Layout

```
public/aegis/
  index.html            the console
  styles.css            obsidian, champagne gold, three state colours
  js/
    mathkit.js          the shared arithmetic
    silhouette.js       Gaussian background model, shadow rejection, regions
    posture.js          stature from the head row; the learned floor model
    kinematics.js       the fall state machine
    inertial.js         the carried phone: dip, spike, turn, silence, breathing
    acoustic.js         the room as a vibration sensor, four numbers a frame
    fusion.js           corroboration, contradiction, coverage
    escalation.js       the response ladder and the message to contacts
    vera.js             what she knows and what she says
    voice.js            voice ranking, prosody, the exact-match bridge
    hologram.js         her, drawn
    demo.js             eight scenarios: frames, motion and sound
    views.js            grading and the evidence overlay
    ledger.js           what happened, kept on this device
    app.js              permissions, canvases, pointers, wiring
tests/aegis/            harness, pipeline, fusion, sensing, console
scripts/qa-aegis.mjs    headless end-to-end
```

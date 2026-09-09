# Touchline — what actually happened, in metres

A match-analysis app for a phone on a fence, a laptop by the touchline, or a
clip you already have. It turns footage of a pitch into **real distances,
speeds, possession and passing lanes**, measured on your own device, and shows
the caveat next to every number.

It runs entirely in the browser: no upload, no account, no API key, no build
step, and — after the first visit — no signal. Frames are measured and
discarded. Nothing is recorded and nobody is identified.

Locally it is `/touchline/` (`http://localhost:4173/touchline/` under
`./start.sh`). The camera needs a secure context, so HTTPS or `localhost` only;
a video file works either way, including straight off disk.

Open it and press **Run the built-in demo** to see the whole thing working
against a synthetic clip whose answers are known.

---

## The post this came from

The brief was an Instagram carousel: a football match with every player tagged
with a speed, pass options annotated "~95%", a possession bar reading 81/19, and
a strapline about a model that had "reconstructed everything in this match" from
one video. It is a good-looking image and almost none of it is a measurement.

Rather than reproduce the graphic, this app builds the parts that can be
measured honestly and states plainly what the rest would take.

| The post shows | What you get |
| --- | --- |
| Every player tagged with a speed in km/h | **Yes**, once you mark four pitch landmarks. Within about 3% on the built-in clip. |
| Player identities and shirt numbers | **No.** No number recognition, no faces. Sides come from kit colour; a player who leaves the frame returns as a new label. |
| "~95%" pass completion beside each option | **No, deliberately.** You get the lane's length, the nearest defender's clearance from it, whether it is screened, and whether it is closing while the ball is in flight. See below. |
| Possession 81% / 19% | **Yes, with the denominator.** Shares of the time that could be attributed, printed beside the share of the clock that was. |
| Local space control | **Yes.** Who would reach each patch of grass first, given where everyone is and how they are moving. |
| Pressure — nearest defender in metres | **Yes**, with how fast they are closing. |
| Tactical radar / plan view | **Yes.** Everyone on a scale pitch, with paths and territory. |
| A 3D reconstruction of the match | **No.** One camera on a plane gives positions on the grass, not height. |
| Works on any clip, any camera, any angle | **No.** One fixed view per calibration. A pan or zoom kills the fit, and the app says so rather than reporting nonsense. |

### Why there is no completion percentage

A completion probability is a claim about what *will* happen. Producing one
honestly needs thousands of labelled passes from footage like yours, the
passer's technique, the state of the pitch, and whether the receiver expected
it. None of that is in a phone video.

What geometry does know is worth having, so that is what is reported: the pass
is 23 m, the nearest defender is 16.6 m off the line, and by the time the ball
arrives they would be 16.2 m off it. A coach can argue with those. Nobody can
argue with 95%.

---

## Turning pixels into metres

Every number comes through one homography, fitted to landmarks you mark on a
pitch whose dimensions you type in. Twenty pixels near the far touchline is a
different number of metres from twenty pixels near the camera, and a tool that
ignores that reports a winger accelerating every time they run away from the
lens.

A homography is the right model and a camera pose is not: the pitch is a plane,
the image is a plane, and any pinhole camera looking at a plane relates the two
by a 3x3 matrix — whatever its height, tilt, roll, zoom or lens. That matters
because nobody knows the focal length of the phone on the fence.

The cost of eight coefficients nobody can eyeball is paid openly. The fit
reports the worst distance, in metres, that a marked point lands from where the
matrix puts it, and that figure sits on screen the whole time the app runs.
Above a metre or so, the marks were sloppy or the pitch is not flat, and
everything downstream is decoration. The fitted pitch is also drawn back over
the footage, which is the check a person can actually make: if the drawn lines
sit on the painted ones, the model is right.

Two assumptions are load-bearing and neither is hidden. **The plane is the
ground**, so a player's position is taken at their feet, never their centre — a
blob's centre floats above the grass by half a player, which at the far end of a
pitch is several metres of error pointing away from the camera. And **the camera
does not move**: small nudges are measured and compensated, a pan or zoom marks
the calibration stale, and every metric on screen is struck through until you
re-mark.

One correction worth naming, because getting it wrong is invisible: a player's
pixel *height* comes from the lateral ground scale, not the averaged one. A
homography's local scale differs by a factor of ten between the two image axes,
and using the wrong one makes every distant player four pixels tall — so the
size gate throws away the half of the team furthest from the camera.

---

## Finding players without a neural network

The obvious approach — frame differencing, the way a security camera finds
intruders — is wrong for sport and wrong invisibly. A centre-back standing still
for eight seconds is not background; they are the reason the possession figure
is what it is. Anything that detects only movement reports possession computed
from half a team.

So the app segments by colour. A pitch is the most reliable thing in the
picture, and everything that is not grass and is the right size to be a person
is a player — standing, sprinting, or arguing with the referee.

Three things make it work rather than half-work:

- **The turf model is fitted, not hardcoded.** Grass runs from the blue-green of
  a wet winter pitch to August yellow under floodlights. The greenness of the
  pixels inside the marked pitch is measured every few seconds, and the
  threshold is set from their median and spread — a median, so that the players
  standing on it cannot drag it.
- **The paint is removed by shape.** White lines are emphatically not grass and
  light up the mask everywhere; left in, the penalty area, goal area and goal
  line become one connected structure that swallows every player inside it —
  precisely during the passages anyone is watching the video for. An erosion
  cannot fix it, because a line three pixels wide has a spine that survives any
  kernel small enough to leave a player standing. So a pixel is dropped when it
  is white and the pixels a line's width away on either side, **in any of four
  directions**, are not white. Four directions rather than two because a line
  running diagonally is six pixels wide and nine pixels of horizontal crossing,
  and an axis-only test calls it thick. A run that is thin in *all* four
  directions is not a line at all — it is a small round white thing on grass,
  which in this sport is the ball, and it is kept.
- **Size is judged in metres.** A blob is a player if it is roughly as tall as a
  person *at that point on the pitch*, which the homography knows and a pixel
  threshold cannot. It also has to be at least as tall as it is wide, which is
  what keeps a two-metre stretch of far touchline out of the team sheet.

Two players who overlap in the picture are one blob, and the app says so rather
than inventing a split the pixels do not support. On an empty pitch it finds
nobody at all — asserted as zero, not "few", because an invented player who
never moves silently changes the possession figure, the territory map and the
team totals while looking entirely reasonable.

---

## Keeping one identity on one player

Everything the app reports is a statement about a *player*, and a player only
exists once positions are threaded into a history. Each way that thread breaks
corrupts a number rather than merely losing one.

- **Swapped identities.** Two players cross, become one blob, and the naive
  nearest-neighbour assignment hands each the other's history — both totals now
  fiction, both plausible. So an assignment costs distance from where the track
  was *predicted* to be, plus how different the shirt colour is.
- **Phantom distance.** A player standing still has a foot point that jitters by
  a pixel or two a frame; at the far end of a pitch one pixel is most of a
  metre. Left alone, a goalkeeper covers kilometres. The obvious guard — ignore
  any frame-to-frame step below a noise floor — fails in the *opposite*
  direction and just as silently: at 25 fps a genuine sprint advances 28 cm per
  frame, below the noise floor at the far touchline, so a per-frame threshold
  throws away every metre anyone runs. Distance is therefore measured from an
  anchor: displacement from the last credited position is banked once it clears
  the floor. Jitter about a fixed point never leaves the floor, so a stationary
  player scores **exactly zero** — the test asserts equality, not a tolerance,
  because any tolerance grows all afternoon.
- **Occlusion.** When detection reports a blob that is more than one player, the
  tracks inside it share it: each coasts, none accumulates distance, and all are
  flagged. The alternative gives one player a two-metre jump and another a
  disappearance, and both show up as sprints.

Speed is measured over a one-second window rather than frame to frame, and the
reported peak is the median of seven consecutive windows, so a peak has to be
held to be believed. Fitting a line through the window instead of measuring it
end to end was tried and is *worse*: the positions have already been through the
tracker's filter, so consecutive samples share most of their error, and a
least-squares slope over correlated samples has a wider tail than the chord.

---

## Teams, without knowing who anybody is

Kit colour is enough, because the Laws require it to be: the two sides must be
distinguishable to a referee at a glance. Shirts are sampled from the torso
only — averaging a whole player mixes shirt, shorts, socks, grass and a head
into the same muddy middle for every kit in the league — and as chromaticity, so
a cloud passing over does not reassign the team.

Goalkeepers and officials wear a third colour and belong to neither side.
Forcing every tracked person into one of two clusters puts the referee in
midfield for whichever team he happens to resemble, and the possession figures
inherit it. So the clusters are trimmed and refitted — the cut taken from the
median distance, because the outlier being removed is exactly what inflates a
mean — and anything sitting outside a team's own colour spread is labelled
`other`. When the two kits are too close to separate, the app says the team
labels are unreliable instead of drawing a confident bar out of a coin flip.

Labels are a running vote over a player's history, not a per-frame guess.

---

## The ball, and admitting when it is lost

This is the weakest thing in the app, and it is reported on every frame rather
than hidden behind a confident number.

A football is 22 cm across — one pixel at the far end of a pitch in phone
footage. Kicked hard it crosses two metres between frames. It spends much of the
match under the player who has it. So the specification is not "track the ball"
but "say where it is when it can be seen, and say plainly when it cannot".

Everything small, white and round is a candidate, and a pitch offers one at
every crossing of two painted lines. Two rules use knowledge the app already
has: a speck sitting on one of the lines this pitch is *known* to have is
declined, and a speck that stays in one place for a couple of seconds is written
off as scenery until it moves again. The second is wrong for exactly one
situation — a ball placed for a corner — and there the app reports the ball as
unseen, which beats reporting a sprinkler head as the ball.

---

## Possession, with the denominator kept in view

Time is credited to a team only while the ball is visible *and* one player is
unambiguously nearest to it *and* the ball is slow enough to be under someone's
foot. Everything else — out of frame, hidden, in flight, two opponents equally
close — goes into a fourth bucket reported alongside the two teams rather than
shared between them.

A run of play where the ball was visible for eight seconds out of sixty reads as
5% / 8% / 87% unassigned. That is honest and useful. The same passage rendered
as 38% / 62% is neither, and it is what every possession graphic without a
denominator is doing.

Changing sides needs evidence: a tackle takes a second and detection noise takes
a frame, so a turnover is only recorded once the new holder has been nearest for
several consecutive frames.

---

## Space, and what a coach reads

Territory is defined plainly: a patch of grass belongs to whoever would reach it
first. The refinement over a Voronoi diagram of standing positions is that
players are moving — a full-back sprinting forward already owns the ten metres
in front of them — so each player is projected forward along their velocity for
a short, stated horizon before the cells are handed out.

It is not expected threat, it is not a probability that a pass into a zone
succeeds, and it is drawn as a map rather than reduced to one number that would
hide how it was made.

Every player row carries the fraction of the session that player was tracked
for, as a bar rather than a figure. Nine kilometres is a normal match total; a
player tracked for a third of a session and reported at three kilometres has not
run a third as far, they were watched a third as long — and coaches make
substitutions on that difference. **Nothing is extrapolated.**

---

## The written report

Every sentence is generated from a number the app computed, and prints that
number beside the claim. There is no template that says "Team A dominated":
dominance is a judgement, and a judgement with no figure attached is where a
tool like this stops being useful and starts being flattering.

The report leads with what it could not see — how long it ran, how often the
ball was visible, how much of the clock could be attributed, the calibration
error, how many frames the camera had moved for — because a reader who skips the
caveat and quotes the possession figure has been failed by the layout.

An optional language model can restate it and answer follow-up questions. It is
handed the numbers and nothing else: no frame, no crop, no still. There is no
way to send an image from here, which is the design rather than an omission —
footage of children playing football is not something an app should be able to
post to a third party because a setting was left on. Its rules forbid scaling a
coverage-limited figure up to a match total, quoting a possession share without
its denominator, and rating any player.

---

## What it cannot do

- **Recognise a player.** No shirt numbers, no faces, no identity of any kind.
- **Predict whether a pass would be completed.** See above.
- **Reconstruct a match in 3D.** A header, a chipped pass and a shot over the
  bar are the same to a ground plane.
- **Follow a moving camera.** Small nudges are compensated; a pan or zoom marks
  the metres stale.
- **See the ball reliably**, or at all when it is too small to resolve — the
  calibration panel says how many pixels across a ball would be before you
  waste a session finding out.
- **Report a full-match total from partial tracking.**

---

## Running the checks

```bash
npm run test:touchline   # 75 unit tests
npm run qa:touchline     # 42 end-to-end checks driving the real app in Chromium
```

The unit suite renders scenes through the app's own demo generator — a real
pinhole camera looking at a real 105 x 68 m pitch, with striped noisy grass,
paint at its true width, and players who move at speeds written in the test. The
frames are deliberately unkind: they are the combination that breaks a naive
green threshold, a mean-based turf model, and any segmentation that forgets the
lines.

The end-to-end harness drives the shipped app in a browser against the built-in
demo, whose choreography is a break at 7 m/s, a covering run at 3 m/s, and five
players who never move. It checks the numbers on screen against those, not
merely that numbers appeared: the break comes back at 25.9 km/h against a
choreographed 25.2, over 31.8 m against 32.2, and the five who stood still log
exactly zero.

---

## Layout

```
public/touchline/
  index.html          the interface, and the list of what it cannot do
  styles.css
  js/pitch.js         homography, pitch model, ground scales, camera drift
  js/segment.js       turf model, paint removal, player regions, kit sampling
  js/track.js         the tracker: identity, distance, speed, sprints
  js/teams.js         kit clustering into two sides, and neither
  js/ball.js          ball candidates, and the honesty about losing it
  js/possession.js    control, spells, and the unattributed bucket
  js/passing.js       lane geometry: length, clearance, screening, closing
  js/space.js         territory, local space, team shape
  js/metrics.js       player rows and team totals, with coverage
  js/overlay.js       the broadcast overlay, drawing only what was measured
  js/report.js        the written summary and the digest a model may see
  js/llm.js           optional analyst, numbers only
  js/demo.js          the synthetic match — shipped, and used by the tests
  js/app.js           capture, calibration, the loop, the panels
tests/touchline/      geometry, vision and analysis suites
scripts/qa-touchline.mjs
```

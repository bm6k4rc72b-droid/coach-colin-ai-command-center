# Fenceline Night Watch

A self-contained, offline demo of a ranch predator-and-herd monitoring console —
built to be opened on a laptop in front of a ranch owner, with no camera, no
account, no network and no signal.

Open `index.html` in a browser. That is the whole install.

## What it is

Two scenarios, one engine:

- **Cattle · Night** — 24 head on open pasture, a coyote working down the NE
  draw. The console detects the *herd's* reaction, calls a threat bearing before
  the predator is visible to the camera, and offers a deterrent.
- **Poultry · Dawn** — 16 hens and 2 roosters in the home yard, a raptor
  overhead. The rooster's aerial alarm call is the first detection; the flock
  flushes to cover; the coop door can close from the alert.

## Why it is a simulation, and why that is fine

Every animal is an agent in a flocking model with a fear-contagion term — an
animal that perceives the predator raises its own fear, and its neighbours catch
it. Nothing is on rails: the predator is another agent, and pressing **Deter**
genuinely changes what happens next.

The telemetry is then **measured off that scene**, frame by frame, the same four
ways a real pipeline would measure it off a tracker's output:

| Signal | Computed as |
| --- | --- |
| Bunching / flush | Mean nearest-neighbour distance vs a rolling calm baseline |
| Polarisation | Magnitude of the mean unit-velocity vector |
| Heads up / alarm call | Mean head elevation across the group |
| Motion | Mean speed vs the grazing baseline |

The Herd Risk Index is a weighted sum of the four; the threat bearing is the
herd's flight vector reversed; the fence readout is the real distance from the
leading animal to the nearest wire. Change the scene and every number moves.
That is what makes the demo survive being poked at.

Two behaviours in it are worth pointing out because they are the actual product
decisions, not decoration:

- **The dwell timer.** The index has to hold above threshold for a sustained
  window before an alert fires, and there is a 25-second re-alert lockout after
  one does. False alarms, not detection, are what get a system muted.
- **Cattle bunch; chickens scatter.** The same engine runs both, with the sign
  of the dispersion signal flipped. A detector that does not know which species'
  anti-predator strategy it is watching will read a flock flush as calm.

For poultry the bearing readout deliberately reports `SCATTER — N/A` rather than
inventing a direction: a radial scatter points every way at once.

## What a real build would need

The behaviour maths above is the easy half. The rest:

- a livestock detector and multi-object tracker that holds up at distance, at
  night, in weather;
- a season of labelled footage from the actual property — thresholds do not
  transfer between pastures;
- thermal or genuinely good IR, since the hours that matter are 22:00–04:00;
- an alert path that survives with no cell service (edge inference on the post,
  LoRa for the alert itself, video syncing only when a link exists).

## Not a claim

This is a design demo. The scene is synthetic and labelled as such on screen; it
is not footage of a real ranch and must not be presented as one. The ROI
calculator contains no assumptions about system performance — it multiplies out
whatever numbers the person in the room gives you, and it will happily tell you
the deal does not clear.

# MakeCNS Fly

`public/makecns-fly/` — a self-contained, offline web app that builds the machine
described in a viral post about a fruit fly connectome flying a drone, and then
measures which part of it is actually doing the flying.

Run it with `npm run dev` and open `/makecns-fly/`. Nothing is fetched, nothing
is uploaded, and the camera frames are read and discarded in the same tick.

## The claim under test

> Reconstructed Fruit Fly Brain Flies Real Drone With Zero Flight Logic. […] a
> live simulation of 166,700 neurons and 25 million synaptic connections […] a
> lone camera tracks hand gestures, mapping palm openness directly to the neural
> network's sensory inputs […] without any PID loops, stability code, or
> pre-programmed flight parameters […] within just 11 seconds of operation, the
> simulated brain began holding altitude and hovering autonomously.

Every element of that is built here and can be switched on and off independently.

## What the app establishes

These are outputs of the code in this repository, reproducible from a seed.

**The stated sensor configuration cannot work, for a reason that needs no
simulation.** If palm openness is the only input, nothing entering the network
depends on the drone's altitude or attitude. The loop is open, no error signal
exists, and no amount of machinery downstream can correct an error it cannot
observe. The app shows this as a permanent `LOOP OPEN` indicator, and flying in
that configuration tumbles exactly as an uncontrolled airframe does. Closing the
loop takes six proprioceptive channels — an inertial measurement unit — that the
account does not mention having.

**The airframe is not flying itself.** Under constant throttle the airframe
reaches an unrecoverable tilt in **165 ms** on the app's default seed, and
between 165 and 300 ms across seeds — dominated by its centre-of-mass offset
rather than by rotor mismatch. There is no stabilisation anywhere in `plant.js`,
and the figure is computed from the airframe's own imperfections rather than from
a nominal imbalance.

**A generously configured version does fly — after a great deal of help.** With
proprioception, a readout fitted by recursive least squares to a hand-tuned PD
controller, a control-axis output basis, the airframe's hover throttle supplied
free, 60 s of supervised training and a 30 s gradual hand-over, the network holds
the commanded altitude for the full unsupervised window on most seeds (hold
fraction 1.00 on seeds 2, 3 and 5; 0.46–0.98 on others, at 2,048 neurons).

**Whether the network transmits or destroys information is set by one constant.**
Tonic drive decides whether the pool is driven by its input or by itself, and
there is a narrow window where it is both busy and listening:

| Tonic drive | Holds altitude | Neurons that fired |
| --- | --- | --- |
| 0.06 | 100% | 18% — the interneuron pool is silent |
| 0.10 (default) | 100% | 89% |
| 0.14 | 52% | 96% |
| 0.20 | 17% | 98% |

Above the window a linear readout of motor-pool rates recovers roll with an
R-squared near zero; inside it, about 0.66. The wiring is identical across every
row. Only whether it was listening changed.

**Most of the elaboration is load-bearing in ways the story omits.** Five things
had to be added before anything flew, and each is a measurable step, documented
in the module that contains it:

1. A **control-axis output basis** (`decode.js`). Fitting four absolute rotor
   throttles puts almost all the variance in the common mode, so least squares
   reproduces the collective and discards the sub-1% differential that keeps the
   craft upright. It holds altitude beautifully for a third of a second and then
   tumbles. The `rotors` basis is kept so this can be watched.
2. **Teacher gains placed from the airframe's constants** (`teacher.js`). The
   first hand-picked gains were ~30× too stiff, so the teacher lived on its clamp
   and the readout was being fitted to a square wave.
3. **Persistent excitation** (`loop.js`). A well-flown quadrotor never leaves
   level flight, so training on the teacher's own trajectory teaches nothing
   about roll.
4. **A gradual hand-over** (`loop.js`). Pure imitation only ever sees states the
   teacher's good flying produced; the moment the readout takes over, its own
   errors carry it somewhere it was never trained. That is covariate shift (Ross,
   Gordon and Bagnell, 2011) — and a demonstration that flies for a few seconds
   and then ends is exactly what it looks like.
5. **Two rate timescales** (`net.js`). One low-pass filter bank cannot produce
   phase lead, and attitude control is mostly phase lead.

## The ledger

The Ledger panel runs eight flights, each removing one component, and attributes
the outcome to whatever changes it. Measured at 2,048 neurons, seed 5, with a
20 s unsupervised window:

| Condition | Holding | Ended | RMS error |
| --- | --- | --- | --- |
| Airframe alone, placed at altitude | 1% | tumbled at 0.2 s | 0.01 m |
| PD controller, no network | 95% | flew the window | 0.15 m |
| Fitted readout, intact network | **100%** | flew the window | 0.12 m |
| Recurrent connections cut at hand-off | 3% | crashed | 0.61 m |
| Spikes replaced by rate-matched noise | 2% | crashed | 0.08 m |
| Network frozen at hand-off | 2% | crashed | 0.10 m |
| Readout weights random, never fitted | 0% | never took off | 0.92 m |
| Sensors as described: palm openness only | 3% | never took off | 0.88 m |

Attribution: network 60%, readout 20%, sensing 20%.

That is not the result this app was built expecting, and it is reported as
measured. In this configuration the network is genuinely load-bearing: every way
of handicapping it destroys the flight.

**One caveat does most of the work of qualifying that, and the app prints it
beside the number.** The three network ablations are not refitted. Cutting
recurrence, scrambling spikes or freezing the pool all shift the rate statistics
the readout was fitted to, and a linear readout operating outside its calibration
fails for reasons that have nothing to do with computation being removed. The
network's 60% is therefore an **upper bound**, not an estimate. A stricter
experiment would refit the readout under each ablation and compare; this app does
not do that.

The rows free of that confound say what they appear to say, and they are the ones
that bear on the original claim: an unfitted readout does not fly, and the
demonstration's own sensor configuration does not fly.

Scoring runs to the end of the window, not to the crash. That distinction is
worth stating because it reverses conclusions: scored only over the seconds it
survived, the `poisson-surrogate` condition reports a 70% hold, which reads as
"the spiking barely matters". Scored over the whole window, where a wreck counts
as not holding, it reports 2%.

## Modules

| File | What it holds |
| --- | --- |
| `js/rng.js` | Seeded, splittable randomness, so a rerun is a check |
| `js/connectome.js` | Synthetic network matched to published statistics; importer for a real edge list |
| `js/net.js` | Leaky integrate-and-fire pool, participation metric, four ablations |
| `js/encode.js` | Population coding; the `hand-only` vs `hand+proprioception` choice |
| `js/decode.js` | Linear readout, RLS fitting, control-axis basis |
| `js/teacher.js` | The PD controller the claim says does not exist |
| `js/plant.js` | Quadrotor rigid body — no stabilisation of any kind |
| `js/loop.js` | Sensor→spike→throttle→physics loop, phases and scoring |
| `js/ledger.js` | Ablation conditions, attribution arithmetic, verdict |
| `js/vision.js` | Skin-tone palm-openness estimator with a confidence it respects |
| `js/link.js` | MSP framing and the interlocks in front of real propellers |
| `js/render.js` | The four panes |
| `js/app.js` | Wiring |

## Hardware output

`link.js` frames throttles as `MSP_SET_RAW_RC` over Web Serial. It refuses to arm
until a transport is attached, a bench state is declared (propellers removed, or
a net — there is no default), and a throttle ceiling is set, which is then
enforced on every frame. Arming expires, and the link disarms itself if frames
stop arriving, because the likeliest failure in a browser control loop is a tab
that stopped being scheduled while the motors kept running. The app only ever
streams the unsupervised phase to hardware.

## Tests

```
npm run test:makecns-fly    # 58 unit tests
npm run qa:makecns-fly      # end-to-end, needs a browser
```

The interesting unit tests assert failures and refusals: that a hold which did
not last is not reported as a hold, that supervised samples are never scored,
that an ablation which improves matters earns no authority, that the vision
estimator refuses an empty frame rather than guessing, and that the link will not
arm.

## Limits

The network is generated, not reconstructed; nothing in it corresponds to an
identified neuron, and what a real connectome would do here is unknown. The
airframe is a model. Results vary with the seed — hold fraction and participation
both move substantially — and the app reports the seed rather than hiding it.
None of this can establish what happened in someone else's video. It can only
establish what such a video would have to show before it is worth believing.

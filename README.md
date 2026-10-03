# God's Eye View — Command Center skin

A copy of [**God's Eye View**](https://github.com/bilawalsidhu/gods-eye-view) by
[Bilawal Sidhu](https://github.com/bilawalsidhu), re-skinned with a dark,
high-tech instrumentation theme.

The upstream project is a real-time intelligence console for planet Earth: a
photorealistic 3D globe carrying live aircraft, vessels, satellites,
earthquakes, fires, traffic and public camera feeds, with hands-free voice
control. All application logic, data plumbing and features here are upstream's.
This fork changes **how it looks**, not what it does.

Upstream's own documentation is preserved verbatim as
[`README.upstream.md`](README.upstream.md) — read that for the full feature
list, data-source catalogue and operating notes.

---

## Also in here: Highlight Cutter · AI video highlights

At [`highlight-cutter/`](highlight-cutter): find the best moments of a video and export them as a
reel, all inside the browser. It scores every half-second using Web Audio loudness, frame
differencing, luma-histogram scene-cut detection and an optional TensorFlow.js COCO-SSD object
detector. A picker then chooses the top peaks, adds padding and merges them, and MediaRecorder
exports the reel. A synthetic demo match comes with an answer key: five real highlights and two
traps. You can watch each technique succeed or get fooled. A tech panel covers what pro tools
add: Whisper, CLIP, YAMNet, pose estimation, LLMs and ffmpeg.wasm. It is a standalone Vite +
TypeScript project.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/highlight-cutter/>**

---

## Also in here: Flight Club · jet suit simulator

At [`flight-club/`](flight-club): fly an Iron Man-style suit with two boot jets and two palm jets.
It uses rigid-body physics, quaternion attitude and a four-thruster mixer. There are three assist
levels (manual, stability and flight computer) and three courses (hover test, ring run and a gusty
rooftop landing). A PID tuning lab plots the altitude step response, and the endurance figures for
kerosene turbines, batteries and the fictional "arc reactor" are real calculations. A guided tour
walks through the control-software stack. It is a standalone Vite + TypeScript + Three.js project.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/flight-club/>**

---

## Also in here: Night Interceptor · Batmobile-style vehicle builder

At [`batmobile-builder/`](batmobile-builder): design an armoured night-pursuit car (chassis,
powertrain, armour, tyres, drive, suspension, wing) and test it on a night-city proving ground:
0–100 and quarter mile, top speed, braking, a hairpin with rollover physics, a 20 m canal jump
with suspension landing loads, a barrier crash and range. Only about 6% of builds pass all eight
requirements; a guided tour shows the trade-offs. It is a standalone Vite + TypeScript +
Three.js project.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/batmobile-builder/>**

---

## Also in here: WAYNE VEIL · optical cloak

At [`public/wayne-veil/`](public/wayne-veil): a single-page live invisibility cloak. MediaPipe person segmentation hides you from the camera and fills the hole with a locked clean plate, a learned background or a camo pattern. Hand gestures drive it: two fingers swept back and forth toggle the cloak; open palm then fist fires a simulated EMP blackout. Sensor views include thermal (white-hot, iron, arctic), night vision, a depth proxy, frame-diff "radar" motion and a red-team detector score. Device HUDs for phone, laptop, DJI, smart glasses and watch, plus voiced "Bruce Wayne" lines and a synth soundtrack. Static HTML and MP3s; needs camera permission and network for the MediaPipe models.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/wayne-veil/>**

---

## Also in here: Cloak Lab · invisibility, sensors & EMP hardening

At [`cloak-lab/`](cloak-lab): an educational lab on how close today's tech gets to an invisibility
cloak. The **AI Stack** tab sorts real tools (MediaPipe, COCO-SSD/YOLO, SAM 2, generative
inpainting, Depth Anything, Gaussian splats, AI coding assistants) into shipping, prototype,
research and fiction, and has a 30 fps latency-budget calculator. **Live Cloak** runs real
in-browser person segmentation and clean-plate compositing on your webcam or a synthetic actor,
with a COCO-SSD "red team" detector. **Spectrum Lab** pits your loadout against visible, thermal,
radar, acoustic and Wi-Fi sensors. **EMP Lab** is defensive hardening of the cloak's electronics.
There is also a guided tour and a quiz. It is a standalone Vite + TypeScript project: run
`cd cloak-lab && npm install && npm run dev`.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/cloak-lab/>**

---

## Also in here: PCI Sim · educational mid-LAD stenting

At [`pci-sim/`](pci-sim): a browser-based **educational** simulator of percutaneous coronary
intervention for medical students. You stent a 90% mid-LAD stenosis via right radial access: guide
catheter up the arm, left-main engagement under a virtual C-arm with pulsed fluoroscopy and
contrast cines, wire steering, pre-dilation, DES deployment and final angiography. A patient
monitor shows ST changes, a mentor guides each step, a scripted demo runs the whole case, and the
case ends in a scored debrief. It is a standalone Vite + TypeScript + Three.js project with its own
`package.json`. Run `cd pci-sim && npm install && npm run dev`.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/pci-sim/>**

It is for education and
demonstration only, not clinical training or medical advice.

---

## Also in here: BROKER RANCH · liquid command site

At [`public/broker-ranch/`](public/broker-ranch): a single-page site for Broker Ranch with a WebGL liquid-glass background that warps with scroll speed, a drag-to-patrol section wheel, six hover-to-x-ray "files", and Reginald, a front-desk concierge with scripted lines, agent handoffs, a gate protocol, a clearance slip and optional browser speech. Static HTML and images only; no backend.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/broker-ranch/>**

---

## Also in here: ColinGrudenV1 · Football Pose & Play Analysis

An installable PWA at [`public/colingrudenv1/`](public/colingrudenv1) that runs
MediaPipe pose tracking on-device, from the live camera or an uploaded play
clip, and shows joint angles and estimated muscle load, power, leverage and
fatigue. Estimates come from joint positions, not EMG. Video never leaves the
device. First launch needs internet to fetch the pose model. No build step.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/colingrudenv1/>**
— open it on a phone and add it to the home screen. Locally it is
`/colingrudenv1/` (`http://localhost:4173/colingrudenv1/` under `./start.sh`).

---

## Also in here: FOXHOUND Virtual Armory

A single-page armory showcase at [`public/armory/`](public/armory) — armory,
exploded view, range and stack sections with narrated voice-over. No build step.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/armory/>**
— locally it is `/armory/` (`http://localhost:4173/armory/` under `./start.sh`).

---

## Also in here: CLIPSIM · IC-PC Aneurysm Clipping Simulator

An educational simulator of microsurgical clipping of a right IC-PC aneurysm
through a pterional, transsylvian approach, viewed through an operating
microscope, at [`public/clipsim/`](public/clipsim). It is for education and
demonstration only, not clinical training or medical advice. No build step.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/clipsim/>**
— locally it is `/clipsim/` (`http://localhost:4173/clipsim/` under `./start.sh`).

---

## Also in here: GRIDIRON IQ · QB reads + Iron Lab

A football-IQ and strength trainer by Coach Colin at
[`public/gridiron/`](public/gridiron), with two modes:

- **Field**: a quarterback read simulator. Read the coverage (Cover 0–4), set the
  protection, call the concept that beats it, snap, look off the safety and
  throw to the open receiver, then watch the All-22 film. A drive has 5 plays
  and ends in a debrief.
- **Weight Room (Iron Lab)**: a form coach for the squat, deadlift and bench
  press. A side-view biomechanics model shows joint torques, bar path, bar speed
  and muscle activation live, and flags faults as fatigue builds.

It has EN/日本語 text and a demo mode. It is for education only, not coaching or
medical advice. No build step; it is fully separate from CLIPSIM.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/gridiron/>**
— locally it is `/gridiron/` (`http://localhost:4173/gridiron/` under `./start.sh`).

---

## Also in here: RAPTOR LAB · full-flow rocket engine test stand

A cinematic simulator of a GENERIC full-flow staged-combustion methane/oxygen
engine at [`public/raptorlab/`](public/raptorlab): chill-down, purge, spin-start,
fuel-lead ignition, closed-loop mainstage, gimbal test and a fuel-rich shutdown.
Real 1-D nozzle theory (c*, Newton area-Mach, thrust coefficient with Summerfield
separation, Prandtl-Pack Mach-diamond spacing) and an RK4 turbopump/hydraulic
model drive the plume, telemetry, live equations and the debrief. Education only;
not affiliated with any manufacturer.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/raptorlab/>**

---

## Also in here: JET ATELIER · private-jet configurator

A cinematic configurator at [`public/jet/`](public/jet): airframe class, livery,
cabin zones, leather/veneer/metal, colour temperature, then a mission on a
holographic globe (haversine great circles, ISA cabin altitude, Breguet range
with reserves). Studio, cabin, walk-through, golden-hour flight and globe views,
a build sheet and a cinematic tour. Figures are illustrative.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/jet/>**

---

## Also in here: GUARDIAN · safety at home for older adults

At [`public/guardian/`](public/guardian): a 3D home walk-through where you find and
fix fall hazards (and watch the night route to the bathroom turn from red to
green), a balance check built on the CDC STEADI tools, a scam-spotting trainer,
a caregiver dashboard and a printable family report. Education only, not medical
advice.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/guardian/>**

---

## Also in here: HEARTBEAT · heart, stroke, mitochondria and recovery

At [`public/heartbeat/`](public/heartbeat): a holographic heart driven by a live
left-heart model (time-varying elastance + Windkessel, with ECG, pressure traces,
PV loop and atrial fibrillation with CHA₂DS₂-VASc). Watch a clot embolise to the
brain, then run a real-time stroke case: BE-FAST, CT, CTA/perfusion, thrombolysis
and thrombectomy, with core and penumbra growing on the brain and a neuron-loss
counter. Also a haemorrhage case with ABC/2 and the ICH score. Inside a neuron, a
mitochondria model plays out the ischaemic cascade: ATP synthase reversal, anoxic
depolarisation, calcium overload, the succinate-driven ROS burst on reperfusion,
mPTP opening and apoptosis, plus the treatments that can rescue the cell. Recovery
covers PREP2, proportional recovery, neuroplasticity and mitochondria's role in
rehabilitation. EN/JA, with a guided tour. Education only, not medical advice.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/heartbeat/>**

---

## Also in here: CHROMA FORCE · five-colour hero team physics

At [`public/chroma/`](public/chroma): an original five-colour hero team (red, blue, gold, green, pink) on a canyon plateau at sunset, five machines that combine into a 43 m mech, and a monster that grows ×22.
- **Morph.**
  - Each hero morphs from street clothes into a glossy suit with a helmet and a visor shape of their own, with converging light particles.
  - Each colour maps to a wavelength, with photon energy E = hc/λ. Pink has no single wavelength: the eye mixes red and violet.
  - E = mc² for an 11 kg suit made from energy (≈ 236 Mt TNT), compared with ½mv² to deploy a stored suit.
- **Strike lab.**
  - Impulse–momentum: F̄ = m_eff·v/Δt against break thresholds for a pine board, a concrete paver and a brick. A board snaps in half when the force is enough.
  - The goal is to break concrete by shortening the contact time instead of adding a power boost.
  - Jumps and flips: h = v²/2g, t = 2v/g, ω = 2πn/t.
- **Mech.**
  - Five machines fly in and combine.
  - Square–cube law: m ∝ ρs³ while leg stress σ = σ₀ρs. This gives a safety factor and H_max for aluminium, steel, titanium and nanotube.
  - Walking speed from Froude 0.25, step time π√(L/g), ground pressure and fall time.
- **Battle.**
  - A five-lane rhythm game (A S D F G).
  - Team strikes add as Gaussian impulses: peak = max Σ F·e^(−(t−tᵢ)²/2w²). Perfect sync gives 20 kN, while sloppy timing gives far less.
  - The grown monster's bone safety factor (≈ 1.3) shows why real giants can't exist.

EN/JA, guided tour, debrief. An original team inspired by the classic five-colour hero genre, not affiliated with any series. Education only.

## Also in here: SILENT VECTOR · stealth infiltration science

At [`public/vector/`](public/vector): an original stealth operative (sneaking suit, vest, headband with animated tails, flip-down night-vision goggles) in a rain-soaked night compound with sodium lamps, a sweeping searchlight and four patrolling guards.
- **Suit.**
  - Adaptive camouflage: the suit's procedural camo shifts toward the chosen terrain, and the match is scored with CIE L*a*b* ΔE*ab.
  - Thermal signature: q = ΔT/(R_suit + R_surf), apparent temperature (εT_s⁴ + (1−ε)T_env⁴)^¼, and the heat stored in the body (minutes to +1 °C core).
  - Night-vision and thermal goggle views.
- **Infiltrate.**
  - A playable mission (WASD, run, crouch, crawl) to reach the terminal, download for 4 s and return to extraction.
  - Guards have view cones with line of sight; detection builds as v = light·(1−0.85·camo)·stance·motion. They also investigate footsteps they hear. A live tactical map is included.
- **Acoustics.** Footsteps by gait and surface: L(r) = L₁ − 20 log₁₀ r, with the audible radius set against background noise (rain masks you).
- **Comms.** A radio link budget (FSPL, sensitivity −174 + 10 log B + NF + SNR). An eavesdropper is defeated with a directional antenna, spread-spectrum processing gain and short bursts (P = 1 − e^(−τ/T)).

EN/JA, guided tour, debrief. Original fictional scenario. Education only.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/vector/>**

---

## Also in here: NOCTURNE · cave-lair suit tech

At [`public/nocturne/`](public/nocturne): an original matte tactical suit in a limestone cave lair, with a waterfall, a bat swarm and a wall of live screens. It has five field-readiness goals.
- **Suit.**
  - A layered armour rig with a finned cowl and a real cloth-simulated cape (Verlet particles, distance constraints, body collisions).
  - Cowl optics: night vision (image intensifier) and thermal (ironbow palette; the wearer's body heat glows).
  - Assembly and a perch pose.
- **Glide.**
  - The cape locks to wrists and ankles as a low-aspect wing. Drag polar C_D = C_D0 + kC_L², (L/D)max = 1/(2√(C_D0·k)), V = √(2mg cos γ/(ρSC_L)).
  - A full 2-D lift/drag flight from the rooftop (with the phugoid). Landing equals a 60 m fall unless a canopy is deployed (v = √(2mg/(ρC_DA))).
- **Armour.**
  - NIJ 0101.06 test threats, from 9 mm up to .30-06 AP: E = ½mv², p = mv, and why bullets don't knock people over.
  - Aramid, UHMWPE or ceramic at a chosen areal density, fired on a test rig.
- **Grapnel.**
  - Gas launch v = √(2PAL/m), a Dyneema line's breaking strength, and the shock load F = mg + √((mg)² + 2mg·k·h) with an optional absorber.
  - The pendulum swing is simulated with live tension T = m(g cos θ + Lθ′²).
- **Sonar.**
  - c = 331.3√(1 + T/273.15), λ = c/f, and range from 40 log r + 2αr loss.
  - Pings ray-march the cave into a point cloud, and five hidden caches must be found.

EN/JA, guided tour, readiness report. Original fictional suit. Education only.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/nocturne/>**

---

## Also in here: VANGUARD · powered-armour suit & pilot clearance

At [`public/vanguard/`](public/vanguard): an original articulated armour suit (82 pieces on a jointed rig) that welds itself around the pilot plate by plate, then hovers on four repulsors. To fly it, the pilot must pass a five-part clearance protocol.
- **Suit.**
  - Assembly animation with sparks, plus a hover pose with lit repulsors.
  - Momentum-theory flight physics: T = mg, P = T^(3/2)/√(2ρA)/FM, jet speed 2w, hover endurance, and turn load factor n = √(1 + (v²/rg)²).
- **Wellness: skin scan.**
  - A real camera rPPG pipeline (CHROM method: skin-colour signal → band-pass → FFT heart rate → beat-to-beat RMSSD) estimates heart rate and HRV, giving a nervous-system index.
  - PHQ-2 and GAD-2 screeners (with support resources), plus sleep and physical readiness. Video never leaves the browser; a demo scan is built in.
- **Labs.** 22 markers with clearance and optimal bands, all of which must be in range:
  - Heart: LDL, ApoB, HDL, TG, Lp(a), BP, resting HR.
  - Inflammation: hs-CRP, IL-6, homocysteine, fibrinogen, WBC, ferritin.
  - Metabolic: glucose, HbA1c, insulin, vitamin D.
  - Mitochondria: lactate, lactate/pyruvate, CoQ10, CK, VO₂max.
  - Also shows HOMA-IR and TG/HDL.
- **Fitness.**
  - Dead-stop bench 400 lb off pins, paused RDL 500 × 5, one-arm DB press 100 lb × 5 (paused, 3 s eccentric), and +100 lb wide-grip pull-ups × 5 with a 2 s top pause, each with form checks.
  - Bike: 10 × 10 s max sprints (HRmax = 208 − 0.7·age, fatigue index, W/kg).
- **Neuro.** A reaction battery: simple RT (< 250 ms), choice RT (< 400 ms, ≥ 90 %) and go/no-go (≤ 1 false press).

EN/JA, guided tour, clearance certificate. Fictional suit. Not medical advice.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/vanguard/>**

---

## Also in here: GENOME ATHLETE · sports genetics with exact maths

At [`public/genome/`](public/genome): 14 real sports-genetics variants on a B-DNA helix, including ACTN3 R577X, ACE I/D, PPARGC1A, PPARA, AMPD1, VEGFA, MCT1, HFE, AGT, HIF1A, IL6, COL5A1, COL1A1 and GDF5.
- **Genome.**
  - Pick genotypes or load sprinter/marathoner profiles.
  - Hardy–Weinberg frequencies (p², 2pq, q²), plus total genotype scores (Williams & Folland) for endurance, power and tendon resilience.
  - Exact population distributions by convolution, your percentile, and how rare an "optimal" profile is (Π f²).
- **Inheritance.**
  - A Punnett square for any gene, plus the exact distribution of a child's whole-panel score.
  - The breeder's equation for VO₂max: E = μ + h²(m − μ), SD = σ√(1 − h⁴/2), and regression to the mean.
- **Trainability.**
  - The HERITAGE Family Study: +384 ± 202 mL/min, h² ≈ 0.47.
  - A 21-SNP model calibrated so carriers of ≤9 and ≥19 favourable alleles reproduce the published +221 and +604 mL/min.
  - A 3D cohort cloud, plus the probabilities of being a low or high responder.
- **Plan.** A training emphasis drawn from your profile, what genes cannot tell you, and the 2015 consensus against using genetic tests for talent ID.

EN/JA, guided tour, debrief. Not a genetic test. Education only.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/genome/>**

---

## Also in here: APEX · race-car engineering

At [`public/apex/`](public/apex): engineer a 798 kg, 735 kW single-seater for the Neon Bay night street circuit (4.54 km, built from exact straights and constant-radius arcs that close to the millimetre).
- **Garage.**
  - Front and rear wing, ride height, final drive, brake bias, fuel and tyre compound.
  - Aero map: C_LA, C_DA, balance and a Gaussian ground-effect peak that stalls and porpoises below 24 mm.
  - Every change re-solves the whole lap in ~12 ms, with a delta to your baseline, top speed from ηP = ½ρC_DAv³ + C_rr·mgv, and per-corner speed changes.
  - Exploded view of the car.
- **Lap.**
  - A quasi-steady-state lap solver: corner limit v² = μmg / (m|κ| − μ·½ρC_LA), then forward (power and traction ellipse) and backward (braking) passes.
  - About 1:15, 325 km/h, 4 g lateral and 5.6 g braking.
  - Replayed on the racing line with chase, onboard, TV and heli cameras.
  - Telemetry HUD: speed, gear, RPM, pedals, live g-g point, track map and delta. Also wheel loads with aero and weight transfer.
- **Tyres.** Pacejka magic-formula force curves, load sensitivity, temperature windows per compound, and degradation with a cliff.
- **Strategy.** A 58-lap race model (wear, fuel weight, a 21.4 s pit loss) that searches every 1- and 2-stop plan and split, with lap-time and gap charts.

EN/JA, guided tour, debrief. Fictional car and circuit. Education only.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/apex/>**

---

## Also in here: CHRONOS · the physics of time machines

At [`public/chronos/`](public/chronos): every time machine that real physics allows, with exact formulas.
- **Twin paradox.** A relativistic rocket at constant proper acceleration:
  - β = tanh(aτ), γ = cosh(aτ), t = sinh(aτ)/a, x = (cosh aτ − 1)/a.
  - Accelerate, flip and decelerate to Proxima, Sirius, Vega, the Pleiades, the galactic centre or Andromeda, and back.
  - The panel shows Earth versus ship ages, the fuel mass ratio from the relativistic rocket equation, and kinetic energy.
  - A spacetime diagram marks proper-time ticks and the ship's line of simultaneity.
  - The starfield applies relativistic aberration and Doppler colour and brightness in a shader.
- **Gravity.**
  - Satellite clocks at any altitude: +45.7 µs/day from gravity and −7.2 µs/day from speed, for +38.6 µs/day at GPS. That is an 11.6 km/day error if uncorrected, and speed and gravity cancel at 3,186 km.
  - A ray-traced Schwarzschild black hole with null geodesics integrated per pixel and a Doppler-beamed accretion disk.
  - Hover time dilation √(1 − r_s/r), thrust, tidal stretch, and Miller's planet.
- **Wormhole.**
  - Morris–Thorne throat and its embedding diagram, with the exotic mass |m| ≈ c²b/G (~0.7 Jupiter masses per metre).
  - The Thorne time machine: Δ = T(1 − 1/γ), and a closed timelike curve once Δ > D/c.
  - Notes on the Tipler cylinder, the Gödel universe, the Alcubierre drive and chronology protection.
- **Paradox.** The billiard-ball paradox, solved for self-consistent histories (Novikov) as fixed points H = R(H). It shows the naive inconsistent history, a glancing-blow resolution, and cases with more than one consistent past.

EN/JA, guided tour, logbook. Education only.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/chronos/>**

---

## Also in here: NEUROLENS · neural photography & videography

At [`public/neurolens/`](public/neurolens): a white holographic, anamorphic lab for how a brain decides what is attractive and when attention is lost.
- **Brain.** A pearl-glass 3D brain with 16 regions, each with a description, its chemistry and a tip for creators:
  - Reward: VTA, nucleus accumbens, vmPFC, OFC.
  - Salience and arousal: amygdala, insula, ACC, locus coeruleus.
  - Attention: dlPFC, superior colliculus.
  - Novelty and memory: hippocampus.
  - Vision: V1, V4, MT, FFA.
  - Mind-wandering: the default mode network.

  Animated dopamine, noradrenaline and visual pathways connect them. Schultz's experiment runs as TD learning, δ = r + γV′ − V. The burst moves from the reward to the cue, and an omitted reward gives a dip.
- **Viewer.** Seven traits: novelty seeking, reward sensitivity, face bias, colour, motion, arousal and executive control. Five presets. The panel shows the derived habituation time, novelty bonus, dopamine gain, Yerkes–Dodson efficiency and the attention span on an unedited shot. Notes explain DRD4/D2, COMT, ADHD, age, sleep and caffeine.
- **Screen.** A procedural film analysed at 10 Hz on real pixels:
  - Itti–Koch saliency (intensity, colour opponency, orientation and motion, with centre–surround and normalisation) and a heat map.
  - Predicted gaze, plus colourfulness (Hasler–Süsstrunk), contrast, edge density and focus.
  - Simulated viewer: reward prediction error, adaptive-gain noradrenaline, attention with a default-mode takeover, and a retention curve.
  - Editor's notes say why attention was lost and how to fix it.
  - Shots can be edited, a tuned cut compared, and your own video uploaded.
- **Photo.** A saliency heat map and a 7-fixation scanpath (winner-take-all with inhibition of return), with thirds, centring and symmetry checks. Attraction is scored for each viewer type, with suggestions. You can upload your own photo.

EN/JA, guided tour, report. Education only; it does not read anyone's brain.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/neurolens/>**

---

## Also in here: RANCH OPS · flock management & drone surveillance

At [`public/ranch/`](public/ranch): run a sheep ranch from the air.
- **Flock.** 120 ewes follow Reynolds boids rules: separation, alignment, cohesion and a flight zone. Under threat, cohesion rises (the selfish herd). Live panels show RMS spread, polarisation, dry-matter intake (2.7 % of body weight), water needs and stocking rate. You can send the dog through, or have it drive the flock gate to gate.
- **Pasture.** Six paddocks regrow on a logistic curve, dB/dt = rB(1 − B/K) − NI/A. The tab shows grazing days, regrowth time, AUM carrying capacity and an NDVI view, and simulates a 60-day rotation plan.
- **Drone.** Rotor power comes from momentum theory with Glauert induced velocity, profile and parasite power. That gives endurance, best-endurance and best-range speeds, and cruise tilt. Mission planning covers GSD = s·h/(f·N), the camera footprint, lawn-mower lanes, battery reserve and Koopman POD. Johnson criteria set the chance to detect, recognise or identify each sheep. Thermal surveys count the flock, flag fevers and find the missing ewe, all checked against FAA Part 107 basics.
- **Night watch.** A thermal patrol orbits the flock with a slewing gimbal and detects coyotes by slant-range GSD. The response is non-lethal: a spotlight and siren, the guardian dog, or moving the flock to the night pen.

EN/JA, guided tour, ranch report. Education only.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/ranch/>**

---

## Also in here: DIRECTOR'S CHAIR · blocking, lenses, light & the cut

At [`public/director/`](public/director): direct a 30-second scene, *The Last Deal*, set on a rain-soaked neon rooftop.
- **Set.** Two actors with blocking and a six-line script. Place three cameras, and the line of action and each camera's frustum are drawn live on the set.
- **Camera.** Choose a lens (14–135 mm, or any focal length up to 200 mm), a T-stop, focus and the sensor (Super 35, full frame, large format, IMAX), with an optional 2× anamorphic. Framing buttons compute the focal length from f = Sₕ·d/h. The live optics show field of view, circle of confusion (c = d/1500), hyperfocal distance, near and far focus, and a blur-circle chart. The viewfinder uses a physical depth-of-field shader built on b = (f²/N)·|d − s| / (d·(s − f)), with oval bokeh on anamorphic. It also has a dolly zoom (f₂ = f₁·d₂/d₁) and recorded takes.
- **Light.** Key, fill and back fixtures placed by illuminance, with intensity = E·d² and a Kelvin colour. An incident meter computes N = √(E·t·ISO/C), and the lighting ratio is shown in stops. You also get shutter angle, ISO, ND, white balance and a false-colour exposure view. The image is exposed with the same equation, so a correctly metered face lands at mid grey.
- **Cut.** Switch cameras live with keys 1–3, or load the editor's cut. Every cut is checked against the 180° rule, the 30° rule and jump cuts, and each line is checked for dialogue coverage.

EN/JA, guided tour, wrap report. Education only.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/director/>**

---

## Also in here: ORBIT · cockpit, spaceplane, orbit, range & cyber

At [`public/orbit/`](public/orbit): four connected simulators, each running live math.
- **Cockpit.** Fly an F-16-class fighter from the cockpit, with a conformal HUD and two MFDs. The flight model is point-mass lift, drag and thrust with a fly-by-wire g command. A fuel-economy panel plots specific range against speed and shows the Breguet range.
- **Spaceplane.** Launch VOLTA, a concept spaceplane, from a runway to orbit. It climbs a 50 kPa corridor on combined-cycle engines to Mach 5, then switches to an electric-pump-fed methalox rocket. Live panels show the Δv budget with gravity, drag and steering losses, the mass breakdown, the rocket equation, and pump power and battery sizing. Deploy the payload once in orbit.
- **Orbit.** 3D two-body motion plus J2, with vis-viva, Hohmann transfers, plane changes, launch azimuth, sun-synchronous inclination and propellant cost for every burn.
- **Range.** A tactical radar display of ADS-B, AIS and primary radar tracks, launch and aircraft hazard areas, and public-risk Ec against the 1×10⁻⁴ limit. It also has a telemetry link budget with a jamming case, a GO/NO-GO poll, and a live instantaneous-impact-point track with destruct lines.
- **Cyber range.** A defensive security-operations drill with alerts for GNSS spoofing, command replay, brute-force logins, jamming, unsigned firmware, phishing, false positives and network segmentation.

EN/JA, guided tour, debrief. Education only.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/orbit/>**

---

## Also in here: CinematicX · Revan-Class Energy Sword

A motion-tracked, sound-reactive 3D lightsaber hilt at
[`public/cinematicx/`](public/cinematicx) — a single-page Three.js app with
ignite, exploded view, crystal colours (dual / purple / red) and phone motion
control (hold the phone like a hilt and swing). No build step.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/cinematicx/>**
— locally it is `/cinematicx/` (`http://localhost:4173/cinematicx/` under `./start.sh`).

---

## Also in here: EMPx

A classified-briefing style demo at [`public/empx/`](public/empx) — a simulated,
fully reversible software EMP: Coach Colin voice receptionist, six narrated
sections (brief, architecture, sequence, nodes, stack, close), a tactical score
and a hold-to-discharge EMP button. Voice clips live in
[`public/empx/audio/`](public/empx/audio).

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/empx/>**
— locally it is `/empx/` (`http://localhost:4173/empx/` under `./start.sh`).

---

## Also in here: SupermanX

A fitness-AI coaching prototype at [`public/supermanx/`](public/supermanx) — Rex
voice lines, live camera pose tracking (MediaPipe), simulated sets and VBT-based
prescriptions. Voice clips live in [`public/supermanx/audio/`](public/supermanx/audio).

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/supermanx/>**
— locally it is `/supermanx/` (`http://localhost:4173/supermanx/` under `./start.sh`).

---

## Also in here: Optics Lab (CinematicX)

An interactive optics lab at [`public/opticslab/`](public/opticslab). Turn the
focusing ring (drag it, or use the slider) and the moving glass group shifts
the **plane of focus** through a low-poly diorama. The blur is a real
depth-of-field pass keyed to that plane, and the sensor screen shows what the
lens actually sees.

- **Director mode** tours nine camera perspectives: establishing, exploded
  view, glass macro, top-down plan, fly-through, rack focus, viewfinder
  (sensor POV with focus peaking), the CinematicX wall and crane out. The
  filmstrip is built into the bench console: click a thumbnail or the arrows
  to cut. Space pauses and switches to free cam; ←/→ change shot; `1 2 3`
  focus presets; `E` explode; `F` aperture; `H` hides the overlays.
- **CinematicX** runs live on a monitor on the lab wall: Attention, Emotion,
  Reward, Memory, Effort and Purchase intent, a Now Playing feed and a signal
  heatmap. The CinematicX button opens the same data with CSV and Markdown
  report export. The signals are simulated from what is on screen (motion,
  cuts, what the plane is holding, aperture, product time); they are not
  biometric measurements.
- **Seedance 2.5 cut**: a 10 s hero clip generated on Higgsfield plays from
  the filmstrip. To host it locally, drop the file at
  `public/opticslab/media/seedance-optics-lab.mp4`.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/opticslab/>**
— locally it is `/opticslab/` (`http://localhost:4173/opticslab/` under `./start.sh`).

---

## Also in here: TrackerX Command

A single-page command dashboard at [`public/trackerx/`](public/trackerx) with its
HUD imagery and Rex voice-over clips in [`public/trackerx/assets/`](public/trackerx/assets).

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/trackerx/>**
— locally it is `/trackerx/` (`http://localhost:4173/trackerx/` under `./start.sh`).

---

## Also in here: the Agent Swarm

A multi-agent orchestration console built on top of the globe. Press
**AGENTS** (bottom right) or **Ctrl/Cmd+Shift+A**, type a goal in plain
language, and it plans the goal into a task graph, assigns each task to a
specialist agent, runs independent tasks in parallel, and folds the results
into one answer.

The agents can **drive the globe**, which is what makes it more than a chat
box. *"Find the biggest active wildfire in California, put it on screen, and
write me a one-page brief"* becomes a research task, a `geo-analyst` task that
genuinely enables the fires layer and flies the camera, and a writer task —
one job, run to completion.

Eight built-in agents (researcher, geo-analyst, recon, writer, engineer,
critic, summarizer, generalist), plus your own via **+ AGENT**. Globe tools are
resolved from the same `GEV_REALTIME_TOOLS` array that backs voice control, so
the two surfaces can never drift on what `fly_to_location` means. Each agent's
tool list is an enforced allowlist, not a hint.

Needs only `OPENAI_API_KEY` (the same one voice control uses); a Tavily or
Brave key additionally turns on web search. Full write-up, including the
failure and safety model, in [`docs/AGENT-SWARM.md`](docs/AGENT-SWARM.md).

```sh
npm run test:agents      # 46 unit tests, no key or browser needed
npm run qa:agent-swarm   # headless end-to-end run through the real console
```

---

## Also in here: MakeCNS Fly

A viral post described a reconstructed fruit fly brain flying a real drone from a
single camera watching a hand, with "zero flight logic", self-stabilising within
eleven seconds. [`public/makecns-fly/`](public/makecns-fly) builds that machine —
spiking network, camera, quadrotor, the lot — and then **measures which part of it
is actually flying**, by removing one part at a time and watching what changes.

Locally it is `/makecns-fly/` (`http://localhost:4173/makecns-fly/` under
`./start.sh`). It runs offline, fetches nothing, and discards every camera frame
in the tick it was read.

- **The stated sensor configuration cannot work, and needs no simulation to
  refute.** If palm openness is the only input, nothing entering the network
  depends on the drone's altitude or attitude. There is no error signal, so there
  is nothing for any amount of downstream machinery to correct. The app carries a
  permanent `LOOP OPEN` indicator for that configuration. Closing the loop takes
  six proprioceptive channels — an IMU — that the account never mentions.
- **The airframe is not flying itself.** Constant throttle reaches an
  unrecoverable tilt in **165 ms** on the default seed — under 300 ms on every
  seed tried — dominated by the centre-of-mass offset rather than rotor mismatch.
  There is no stabilisation anywhere in the plant.
- **One constant decides whether the network transmits or destroys information.**
  At a tonic drive of 0.20 the pool is busy on its own and a linear readout of
  motor rates recovers roll with an R-squared near zero; at 0.10 the same wiring
  recovers it at about 0.66 and holds altitude perfectly. Identical network. Only
  whether it was listening changed.
- **A generous version does fly — after a lot of help that no telling of the
  story includes.** Five things had to be added before anything flew: a
  control-axis output basis, teacher gains placed from the airframe's constants,
  persistent excitation during training, a gradual hand-over against covariate
  shift, and two rate timescales so the readout can form a derivative. Each is a
  measurable step and each is documented where it lives.
- **The ledger does the attribution.** Eight flights, each removing one
  component: the bare airframe, the PD controller, the intact network, the
  network with recurrence cut, with every spike replaced by rate-matched noise,
  frozen, with an unfitted readout, and with the demonstration's own sensors. On
  the default settings the intact system holds altitude 100% of the window, the
  PD controller 95%, and every network ablation collapses to a few percent — so
  in this configuration the network really is load-bearing. The app prints the
  caveat that qualifies it: those ablations are not refitted, so a readout out of
  calibration is being counted as a computation removed, and the network's share
  is an upper bound. The rows free of that confound are the ones that bear on the
  original claim — an unfitted readout does not fly, and the demonstration's own
  sensor configuration does not fly.
- **Scoring runs to the end of the window, not to the crash**, which reverses
  conclusions: scored only over the seconds it survived, the rate-matched-noise
  condition reports a 70% hold; scored over the whole window, where a wreck counts
  as not holding, it reports 2%.

It also refuses to lie about its own network: it ships no connectome, generates
one from published summary statistics, says so on a banner that never scrolls
away, and reports what fraction of its neurons fired at all during the flight you
are looking at.

```bash
npm run test:makecns-fly   # 58 unit tests
npm run qa:makecns-fly     # end-to-end in a real browser
```

Full notes: [`docs/makecns-fly.md`](docs/makecns-fly.md).

---

## Also in here: Emberline

A fire tracker at [`public/emberline/`](public/emberline) that fuses **satellite
detections, camera cross-bearings and network node loss** into ranked fire
hypotheses, projects each one forward with **Rothermel's surface spread model**,
and draws every piece of it at the size its uncertainty actually is.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/emberline/>**
— open it on a phone and add it to the home screen. Locally it is `/emberline/`
(`http://localhost:4173/emberline/` under `./start.sh`). It opens on a scenario
whose answers are known before it starts, so nothing on screen has to be taken
on trust.

- **A detection is a pixel, not a point.** VIIRS resolves 375 m at nadir and
  about 800 m at the swath edge; MODIS runs from 1 km to nearly 5 km. FIRMS
  publishes the real footprint per detection in its `scan` and `track` columns
  and almost nothing draws them. The demo's three pixels are 14, 36 and 266
  hectares — as dots they look identical.
- **The spread projection is a band, not a line.** The whole Rothermel model is
  run three times, at the expected inputs and at both ends of a stated plausible
  range for wind and fuel moisture, because neither was measured. Arrival at a
  place is a window — "21–81 minutes", never "51 minutes" — and past eight hours
  it says why the number should not be planned against. Fuel model 1 at 2 m/s
  midflame returns 25.3 m/min against BehavePlus's ~26.
- **The network dying is a measurement.** A fire destroys the hardware on the
  ground it crosses, so a mesh of surveyed nodes is a grid of fire sensors that
  already exists — seconds old, no pixel size, no cloud in the way. It requires
  spatial *and* temporal progression before it will say "front", because an
  upstream switch failure takes every node down at once in no spatial order, and
  simultaneity is the signature of a fault where progression is the signature of
  a fire.
- **Corroboration counts independent sources, not observations.** Forty VIIRS
  pixels off one overpass share a pass, a calibration and a geolocation
  solution — they are one look, and they score 0.27. A pixel plus a camera
  bearing plus a destroyed node are three unrelated failure modes, and score
  0.81.
- **A camera fix carries the ellipse it earns.** Two bearings crossing at 80°
  from 5 km give a few hundred metres; at 4° from 30 km they give a sliver 97 km
  long. Both print as a latitude and a longitude. A grazing fix is marked
  unusable and told where to put a third observer.
- **It knows a camera sees smoke, not fire.** A column leans downwind as it
  rises, so its visible top can be kilometres from the burning ground. The fix
  is moved upwind and its error widened, rather than two observers on the same
  side agreeing confidently and both pointing downwind.
- **It refuses crown fire, spotting, and any single arrival time**, and it will
  not sense through walls without hardware — no browser has a radio API, so that
  panel names the four devices that would fill it and otherwise stays empty.

Full write-up, including everything it refuses to do and why:
[`docs/emberline.md`](docs/emberline.md). Tests: `npm run test:emberline`
(38 unit tests — the physics against published BehavePlus values and physical
invariants, the sensors against the cases where each must refuse to answer).

---

## Also in here: Vice Command

A scroll-driven 1986 crime picture at [`public/vice/`](public/vice) with three
real things inside it: **the apps, an outreach and automation swarm, and
licensed in-person security**. Press start and a generated city drifts past over
eight acts — the police arrive at a quarter of the way down, the army at half, a
saucer detonates the skyline at three quarters, and a shield stops the front.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/vice/>** — locally it is `/vice/`
(`http://localhost:4173/vice/` under `./start.sh`).

No build step, no framework, no video file, no audio file, no API key, and no
signal after the first visit. The city is generated from a seed, the cast is
drawn as vector paths, and the score is synthesised in Web Audio while you
scroll.

- **The set pieces land on the marks, at every width.** The brief put the chase
  at 25%, the gunships at 50% and the detonation at 75%, and those are the spec.
  Section heights are *solved* rather than chosen — every section is measured at
  its natural height, the document's scroll distance is set to the smallest
  value at which each one fits its act's share, and each is padded to exactly
  that share — and progress is then interpolated between the measured section
  tops rather than computed from the page height. So the gunships arrive when
  the cavalry section does, on a laptop and on a phone, and the end-to-end
  harness asserts all three marks at both sizes.
- **Nothing can get stuck.** The film holds no state: every frame, the explosion
  included, is a pure function of the scroll position, with the debris on
  closed-form ballistics rather than an accumulating simulation. Scrub back up
  and the fireball collapses, the rubble flies home and the five felony stars go
  out one at a time. The suite asserts that the frame at any position is
  identical whether you arrived going down or coming back up.
- **The swarm console does the arithmetic that agency decks leave out.** Ten
  agents across email, Instagram, Facebook, TikTok, YouTube, LinkedIn, X, SMS,
  phone and reviews — and a planner that answers how many touches a week that
  is, how many hours of *your* time approving them costs, and which channels
  land above the volume that gets accounts restricted. Select everything at full
  throttle and it refuses to call the plan ready: 3,620 touches a week, 10.9
  hours of approvals against a five-hour budget, four channels over the line.
  One button bisects for the highest throttle that clears every line.
- **Every price says what it assumed.** Six protective services — open house,
  private event, estate post, executive protection, ranch patrol, vacant listing
  watch — with a live estimator whose rate card is a single constant, so the
  page cannot quote two different numbers. When the four-hour minimum raises a
  booking it says so, and says what you asked for. Licensing and insurance are
  printed beside every figure.
- **The fiction is labelled and the music is original.** The chase, the cavalry
  and the detonation are a parody set piece, stated as such in the footer. The
  two commercial recordings the brief named are not here — publishing a
  copyrighted master on a marketing site is the owner's liability, not a
  technical problem — so there are five original synthesised cues instead, and a
  one-line hook that plays a licensed file per cue if the rights are ever
  bought. No real person is depicted destroying the city.

Full write-up, including the act table and what each module owns:
[`docs/vice.md`](docs/vice.md). Tests: `npm run test:vice` (77 unit tests) and
`npm run qa:vice` (57 end-to-end checks driving the real page in Chromium at
1440px and 390px — act boundaries against the table, nothing pinned taller than
the window, no sideways scroll, the rack laid out rather than stacked, the
console refusing an over-committed plan, and the on-screen quote matching the
module).

---

## Also in here: Touchline

A match-analysis app at [`public/touchline/`](public/touchline) that turns
footage of a pitch into **real distances, speeds, possession and passing lanes**
— from a phone on a fence, a laptop by the touchline, or a clip you already
have. Nothing is uploaded, nobody is identified, and every number carries the
caveat that belongs to it.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/touchline/>** — open it on a phone and add it to the home screen. Locally it is
`/touchline/` (`http://localhost:4173/touchline/` under `./start.sh`). Press
**Run the built-in demo** to see the whole thing working against a synthetic
clip whose answers are known before it starts.

It was built from an Instagram post claiming a model had "reconstructed
everything in this match" from one video — every player tagged with a speed,
pass options marked "~95%", a possession bar reading 81/19. This builds the
parts that can be measured and states plainly what the rest would take.

- **The metres are real.** Mark four painted landmarks, type the pitch size, and
  it solves the ground homography and reports speeds, distances, pass lengths
  and defender clearances from it. The fit's error, in metres, sits on screen
  the whole time, and the fitted pitch is drawn back over the footage so you can
  see where it is wrong rather than trust a residual.
- **A player who never moves logs exactly zero metres.** Foot-point jitter
  summed over a half turns a goalkeeper into a marathon; the obvious guard — a
  per-frame threshold — throws away every metre of a real sprint instead,
  because at 25 fps a sprint advances 28 cm a frame. Distance is banked from an
  anchor, and the test asserts equality, not a tolerance.
- **There is no pass-completion percentage, deliberately.** You get the lane's
  length, the nearest defender's clearance from it, whether anyone is inside the
  corridor, and how much of that closes while the ball is in the air. A
  probability needs thousands of labelled passes from footage like yours; one
  invented from geometry and printed as "95%" is a guess in a trustworthy
  typeface.
- **Possession comes with its denominator.** Time is credited only while the
  ball is visible and one player is clearly nearest to it. Everything else is
  reported beside the two teams rather than split between them — because a bar
  reading 81/19 over footage where the ball was visible for eight seconds is an
  assertion about eight seconds, presented as a fact about ninety minutes.
- **Nobody is recognised.** No shirt-number reading, no faces. Sides come from
  kit colour, the way a referee tells them apart, and goalkeepers and officials
  are labelled as neither instead of being forced onto a team and dragging the
  possession figures with them.
- **Nothing is extrapolated.** Every player row carries the fraction of the
  session they were actually tracked for, as a bar you cannot skim past.
- **American football works too**, because almost none of this is about
  football: the measurements need a flat rectangle of known size, and a gridiron
  is as flat as a pitch. Pick the sport in Setup and the markings, the paint, the
  ball's colour and the sprint threshold all change together. Hash marks turn out
  to be the best calibration targets in either sport — a hash is a one-yard stub
  crossing a yard line, so the crossing is a point you can hit, where a corner
  flag is two long lines meeting at a shallow angle.
- **A painted yard number is not a player**, which took measuring rather than
  guessing. A six-foot "4" is the same height as a standing player, the same
  width, and fills its box to the same degree — nothing about its geometry gives
  it away. What does is that paint lies flat: a number measures 0.80–0.88 of a
  player's height under foreshortening, and a player standing on that same
  number takes the region to 1.18. Colour cannot do it — a white jersey on a
  white number measures 0.97 paint against the number's 1.00 — so height does,
  and it works the same whatever colour the jersey is.
- **Possession is refused for American football** rather than invented. The
  machinery would produce two percentages that added to a hundred and meant
  nothing: the ball is in a player's hands for most of a play, and possession is
  decided by downs. Separation — distance to the nearest opponent, and how fast
  it is closing — is measured instead, and needs no ball.

It **cannot** follow a broadcast, or a phone pointed at a television. Filming a
screen is fine in principle — one plane seen through another is still a
homography — but a broadcast camera pans, zooms and cuts every few seconds, and
each of those kills a fit made for one fixed view. It would spend the whole game
correctly reporting that its metres were stale.

Full write-up, including what it refuses to do and why:
[`docs/touchline.md`](docs/touchline.md). Tests: `npm run test:touchline`
(97 unit tests) and `npm run qa:touchline` (59 end-to-end checks driving the
real app in Chromium against both sports — a 7.5 m/s football break returns
27.5 km/h against a true 27.0, a 9.6 m/s route returns 35.2 against 34.6, the
painted numbers never join the team sheet, and the players who never move log
exactly zero).

---

## Also in here: Sentry

A security-camera app at [`public/sentry/`](public/sentry) that watches a piece
of ground and **draws the path of anything that crosses it, in metres** — a
person, an animal, a vehicle — then writes each subject up from what it
measured. iPhone, Android, or any laptop with a webcam. Nothing is uploaded,
nothing is recorded, and there is no face recognition anywhere in it.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/sentry/>** — open it on a phone and add it to the home screen. Locally it is
`/sentry/` (`http://localhost:4173/sentry/` under `./start.sh`).

- **The metres are real.** Mark the four corners of something you have measured
  — a patio, a parking bay — and it solves for the camera's height, tilt and
  field of view, then reports distances, speeds and standing heights from the
  ground plane. A 4.0 m / 28° / 62° camera comes back as 3.99 / 27.8 / 61.9.
- **A subject who never moves logs exactly zero metres.** Centroid jitter summed
  over a night turns a parked car into something that walked a kilometre, and
  every distance the app reports becomes worthless at the same moment. Three
  separate guards prevent it, and the test asserts equality, not a tolerance.
- **It measures gait, not motives.** Step cadence from head bob, path sinuosity,
  pauses, direction reversals, posture and a fall pattern. The written summary
  prints the figure beside every sentence and never speculates about intent —
  there is no threat score, because a threat score is a guess about a person's
  mind dressed as arithmetic.
- **Ironbow is labelled as a palette, not as thermal.** It spreads eight bits of
  murky night luminance across a ramp the eye can read. Bright means bright, not
  hot; a white shirt reads "hot". Real thermal needs a sensor no phone has, and
  the app says so where somebody might otherwise conclude a room is empty.
- **Through-wall WiFi sensing is an adapter, not a pretence.** No browser exposes
  a radio and no phone exposes channel state data, so the app connects to real
  RF hardware over a documented WebSocket and, with nothing attached, reports
  nothing rather than inventing a contact.
- **Zones live on the ground, in metres**, so they still mean the same thing
  after the camera is nudged — areas with loiter timers, directional tripwires,
  hysteresis on every rule so a subject on a boundary does not raise an event a
  frame.

Full write-up, including what it refuses to do and why:
[`docs/sentry.md`](docs/sentry.md). Tests: `npm run test:sentry` (59 unit tests)
and `npm run qa:sentry` (24 end-to-end checks driving the real app in Chromium
against a clip that walks a 1.75 m subject 6.8 m at 0.8 m/s — the app returns
6.67 m, 0.85 m/s, 1.75 m and 108 steps a minute).

Point it at ground you are entitled to watch. It is built for a perimeter you
own, not for following people.

---

## Also in here: Baseline

A camera-vitals app at [`public/baseline/`](public/baseline) that measures
**resting pulse, heart-rate variability and breathing rate from forty seconds
of your face**, then prescribes today's training session from how those compare
with *your own* recent history. iPhone, Android, or any laptop with a webcam.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/baseline/>** — open it on a phone and add it to the home screen. Locally it is
`/baseline/` (`http://localhost:4173/baseline/` under `./start.sh`).
Self-contained like the others: no build step, no dependencies, no backend, no
account, and it keeps working with the signal off.

- **It really does read your pulse off your skin.** Haemoglobin absorbs green
  light, so a face darkens by about half a per cent on every beat. The mixing
  is POS with CHROM as a second opinion — both cancel, exactly, anything that
  changes all three colour channels together, which is why leaning toward a
  lamp does not become a heart rate.
- **It says when it could not read you.** Every scan carries a signal-to-noise
  figure, and a scan that fails it is reported as unusable with the reason
  named — too dark, too much movement, face left the oval — rather than
  printing the largest bump in a spectrum made of noise.
- **Variability is held to a stricter bar than rate**, because RMSSD needs
  every individual beat located to a few milliseconds. Peaks are refined below
  the frame grid, and the figure is withheld entirely when the scan cannot
  support it.
- **It refuses to score you for the first four scans.** A resting pulse of 58
  means nothing without knowing yours; readiness is quoted against your own
  median and spread, computed robustly so one bad morning cannot redefine
  normal.
- **The coach is a decision engine, not a chat model** — tier rules, sixteen
  session templates, and Karvonen zones from your measured resting rate, each
  prescription showing the rule that produced it. An optional API key lets a
  language model reword the same decision; it never overrules it.
- **Paced breathing that measures whether it worked** — the camera keeps
  reading your pulse through the round, so it ends with how far your rate swung
  and whether the swing was locked to the pacing.

Full write-up, including the signal processing and the honest limits:
[`docs/baseline.md`](docs/baseline.md). Tests: `npm run test:baseline`
(75 unit tests) and `npm run qa:baseline` (32 end-to-end checks driving the
real app in Chromium against a synthetic face that pulses at exactly 66 bpm).

Baseline is a training tool, not a medical device, and says so on every result.

---

## Also in here: Jose Montes — Central Coast

A luxury estate site at [`public/jose-montes/`](public/jose-montes), built as
a scroll-linked film: a holographic house that **assembles itself as you
scroll**, cinematic property plates, the real monthly numbers behind every
asking price, a concierge who answers out loud, and — if you want it —
**scrolling with your hand through the camera**.

Locally it is `/jose-montes/` (`http://localhost:4173/jose-montes/` under
`./start.sh`). Like the other two it is self-contained: no build step, no
dependencies, no backend, no account, and it keeps working with the signal
off.

- **Every motion is a function of the scroll offset** — nothing is on a timer,
  so scrubbing back up runs each shot backwards exactly. Three scenes are
  pinned: the hero builds the house, the signature listing opens its plate
  like a shutter, and the interiors reel travels sideways while the page
  travels down.
- **A hand-written WebGL2 hologram** — slab, terrace, two floors, cantilevered
  roof, infinity pool and olive trees over a wireframe ocean, generated from
  about a hundred numbers in metres. Each edge carries an assembly order, so
  the estate draws itself from the foundations up in the vertex shader with no
  CPU work and no geometry uploads.
- **A concierge with a mind and a mouth in separate files** — the grammar and
  the answers are pure functions tested from Node; the voice is the platform's
  own synthesis, choosing the best installed voice and speaking in clauses so
  a line has a contour. She answers from the portfolio and the mortgage maths,
  so the figure she says is the figure on the page.
- **Hands-free scrolling** — frame differencing on a 160×120 camera feed,
  tracked by centre of mass, with a latch threshold, a deadzone and a release
  so a passing shadow does nothing and a still hand does not creep the page.
  No frame leaves the device.
- **A generative score** — a four-chord pad, a felt-piano voice and a surf bed
  synthesised with Web Audio, ducking under the concierge. No file, no
  licence, no loop seam.
- **The whole monthly cost, not just the mortgage** — loan, county tax,
  insurance and PMI, with affordability inverted by bisection and an equity
  projection that separates appreciation from principal paid down.
- **Ten cinematic plates at 88 KB total**, each with the full-resolution
  original as a network-only upgrade that a blocked connection simply skips.

Full write-up, including the design notes and the known limits:
[`docs/jose-montes.md`](docs/jose-montes.md). Tests: `npm run test:realtor`
(41 unit tests) and `npm run qa:realtor` (21 end-to-end checks driving the
real page in Chromium).

---

## Also in here: ASTRA — Peptide Intelligence Platform

A research facility for peptide science at [`public/astra/`](public/astra),
built around one idea: **every claim carries its evidence tier, and every tier
opens into its sources.** Search, compare, verify, understand.

Locally it is `/astra/` (`http://localhost:4173/astra/` under `./start.sh`).
Self-contained like the rest: no build step, no dependencies, no backend, no
account, and it keeps answering with the signal off.

It is deliberately **not** a platform that tells anyone what to take — no
diagnosis, no dosing, no protocols. That constraint is the product: a platform
that recommends has to defend each recommendation, while one that teaches
evidence literacy only has to be honest, and honesty is something you can build
in code and assert in CI.

- **A confidence meter that cannot be talked upward.** Seven evidence tiers,
  each a *band* rather than a point: the best available design picks the band,
  and replication and consistency place you inside it. Every animal reading is
  capped at 45%; every reading with a relevant randomised human trial starts at
  62%. "Ten mouse studies never reach one randomised trial" is a property of the
  arithmetic, with a test asserting it.
- **Relevance scored separately from design quality** — the way most evidence
  summaries flatter a compound. TB-500's cited randomised trials used the
  full-length parent protein, applied topically, to an eye, for dry eye disease;
  it is counted two tiers down and the study card says why. The result is a
  library where the approved drugs read 82–86% and the popular repair peptides
  read 22–39%.
- **A scroll-linked descent into a hand-written WebGL2 laboratory** — hexagonal
  vault, peptide helix, vial plinth, and a knowledge graph you fly through. Every
  vertex generated from maths, no model files. Deck changes fly the camera
  between waypoints, device tilt parallaxes the volume, and each deck has its own
  chord in a synthesised score.
- **An AR bench** — the compound stands in your room through the device camera,
  turning on a plinth with its evidence orbiting it: each claim with its tier,
  each study with its design, population, sample size and a live link to the
  literature. Drag, tilt or let it rotate; capture a card with the citation and
  disclosure baked in. Works on a laptop, an iPhone and an Android, and works
  without a camera at all.
- **Printable QR cards** — a code per compound that opens its AR bench from a
  phone's native camera, generated in-browser from the live URL so they work on
  any deployment. The encoder is dependency-free and every code is verified by
  round-tripping through a real decoder in the tests.
- **Ten decks**: the intelligence engine and its eight-section dossier with
  "Show me the science" on every claim; the knowledge graph; a paper decoder that
  tells you what a study *doesn't* prove; a comparison lab, a four-reviewer
  debate room and a study-design simulator; a myth detector, social fact checker
  and marketing compliance guardian; a content studio turning one paper into
  thirty governed assets; a private command centre with a live Europe PMC radar
  and a campaign generator behind an approval gate.
- **A progression loop that only rewards research literacy** — points for
  opening primary sources, decoding papers and finding contradicting evidence;
  none for time on site. Calm mode switches the streaks and reward drops off,
  offered plainly rather than buried.

Full write-up, including the evidence model and the known limits:
[`docs/astra.md`](docs/astra.md). Tests: `npm run test:astra` (134 unit tests)
and `npm run qa:astra` (97 end-to-end checks driving the real platform in
Chromium).

---

## Also in here: AETHER NEXUS

A holographic command centre at [`public/nexus/`](public/nexus) that teaches
**AI agents**, **AI app craft** and **cyber defence** — with a voice
receptionist standing on the dais, six interactive ranges, the phone camera
wired in, and a live picture of the sky on the globe behind her.

Locally it is `/nexus/` (`http://localhost:4173/nexus/` under `./start.sh`).
Like HarvestEye it is self-contained: no build step, no dependencies, no
backend, no account, and it keeps working with the signal off.

- **A hand-written WebGL2 hall** — rotunda, dais, curved video wall, and a
  holographic receptionist built as a point cloud from a parametric body
  profile. No model files, no 3D library. Drag to orbit, tilt the phone for
  gyroscope parallax, press **◍** to swap her for a wireframe Earth carrying
  the live feeds.
- **A receptionist who answers offline** — platform speech synthesis and
  recognition, plus a BM25 index over the syllabus so every answer arrives
  with the lesson it came from. Connect a Claude or OpenAI-compatible key and
  she reasons past the lessons; without one she still teaches.
- **22 lessons across three tracks**, each module ending in a check.
- **Six ranges with real analysis** — phishing triage graded asymmetrically,
  a password forge that shows the collapse from naive to effective entropy
  against four attacker profiles, a crypto bench running actual Web Crypto,
  an injection range with a defended and an undefended agent, an agent-loop
  builder, and a QR scanner that pulls a link apart before you follow it.
- **The phone camera** — front and rear, torch, capture, presence detection
  and code scanning, all on-device; no frame is uploaded or stored.
- **Live aircraft, launches, satellites, earthquakes, space weather and
  vulnerability feeds**, each degrading LIVE → CACHED → SIM and saying on
  screen which one it is.
- **An agent swarm** whose specialists hold tool allowlists enforced in code,
  not in a prompt — and a trace that shows the refusal when one is exceeded.

Full write-up, including the design notes and the known limits:
[`docs/nexus.md`](docs/nexus.md). Tests: `npm run test:nexus` (27 unit tests)
and `npm run qa:nexus` (29 end-to-end checks driving the real console in
Chromium).

---

## Also in here: HarvestEye

A second, self-contained app lives at [`public/harvest-eye/`](public/harvest-eye)
— **on-device crop maturity detection** through a phone camera, for iPhone and
Android. It shares nothing with the globe app but the repository and the dark
instrument aesthetic: no backend, no API key, no upload, and it keeps working
with the signal off.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/harvest-eye/>** — open it on a phone and add it to the home screen. Locally
it is `/harvest-eye/` (`http://localhost:4173/harvest-eye/` under `./start.sh`).

What it does beyond drawing boxes on fruit:

- **Measures each block's own ripening rate** from repeat scans and forecasts
  the harvest window from that, instead of from a generic crop table.
- **Calibrates to the light** off any neutral surface, so readings taken at dawn
  and at noon are comparable.
- **Learns your cultivar** — tap a fruit, name its stage, and the crop's colour
  path bends toward what you actually grow.
- **Walks a row** with GPS, producing a ripeness strip and hotspot list for a
  picking crew.
- **Keeps a field ledger** — dated, geotagged, sorted by urgency, exportable as
  CSV or GeoJSON.
- **Reads the canopy, not just the fruit** — a second mode scores leaves with
  published visible-band vegetation indices (NGRDI, VARI, GLI, TGI, ExG), paints
  a false-colour zone map over the live view, and reports canopy cover,
  yellowing, necrosis and how far the weak zones sit below the best of the same
  field. Real NDVI unlocks if you attach an IR-converted camera; a stock phone
  cannot see near-infrared and the app says so rather than faking it.
- **Turns a drone photo into a zone map** — the same index over a whole aerial
  shot, with a numbered hotspot list and a CSV of every zone.

Full write-up, including how the detector works and where it can be wrong:
[`docs/harvest-eye.md`](docs/harvest-eye.md). Tests: `npm run test:harvest-eye`
and `npm run qa:harvest-eye` (drives the real app in Chromium against a
synthetic camera feed).

---

## Also in here: Carrier

A bench for building **vertical security-briefing reels** at
[`public/carrier/`](public/carrier). You write a script — kicker, headline,
caption, a diagram and three numbers per scene — and it renders 1080×1920 frames
you can scrub, then records the episode to a video file. It ships with one
finished episode: *Your walls are not opaque to your Wi-Fi*, seven scenes on
passive Wi-Fi sensing and what to do about it.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/carrier/>** — locally it is `/carrier/`
(`http://localhost:4173/carrier/` under `./start.sh`).

What makes it more than a template:

- **The layout starts from the platform's furniture, not the canvas.** A reel is
  played inside an app that covers the top ~300 px and the bottom ~470 px with
  its own navigation and handle. Carrier anchors the caption card above that
  band and works upward, so the headline is never delivered underneath
  somebody's UI — the failure you can see in most reels of this kind.
- **Diagrams are drawn, not drawn on.** Five native panels — an RF containment
  heatmap with a real path-loss model behind it, a facility floor plan with
  occupancy and a timed patrol, a passive capture table, a pose reconstruction
  in both its confidence-map and stick-figure forms, and a media slot for real
  footage — all animated, all re-themeable, none of them a screenshot.
- **Captions are timed against reading speed.** The checker says, per scene,
  whether the narration can finish before the cut, and refuses to be quiet about
  a scene that states a research claim with no source attached.
- **It corrects the story it tells.** The shipped episode names what the famous
  through-wall footage actually used (a custom FMCW radio, not a Wi-Fi sniffer),
  what the real Wi-Fi result did use (three commodity routers, camera-supervised
  training), and where both fall apart (a layout they were not trained on).
- **Nothing leaves the tab.** Footage is read into the page and drawn straight to
  the canvas; the script lives in `localStorage`; the export is produced by the
  browser's own recorder.

Full write-up, including the script format and the export's real-time
constraint: [`docs/carrier.md`](docs/carrier.md). Tests: `npm run test:carrier`
(49 unit tests, no browser needed) and `npm run qa:carrier`, which drives the
real app in Chromium and checks on pixels that the host's chrome band is empty
and the headline below it is not.

---

## Also in here: Black Optic 6

A **ranch perimeter console** at [`public/black-optic-6/`](public/black-optic-6),
built around one rule: no number appears on screen without a badge saying where
it came from, and only measured numbers may raise an alarm.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/black-optic-6/>** — locally it is `/black-optic-6/`
(`http://localhost:4173/black-optic-6/` under `./start.sh`).

Fourteen decks: optics with every thermal palette a thermal camera offers, a
Reolink Argus / IP camera setup that writes your relay config, tells you whether
frames will be *measurable* as well as visible, and reaches the camera through a
same-origin proxy so they are, a camera picker that takes a DJI Pocket in
USB webcam mode like any other camera, and a detection chain that reports metres
once calibrated; contacts, an event log and a pan-tilt loop that keeps a subject
centred, plus colour and appearance trackers that follow one specific thing even
when it stops moving; an acoustic watch; harvest tracking with a finish window
rather than a promised time; airborne contacts measured in angles with what they
are consistent with; a geofence that refuses to call a crossing the
satellite fix cannot support; vegetation indices with the bare alleys masked out
and the worst cells ranked; sonar occupancy mapping with an honest drift
estimate; a Bluetooth wearable link; real NASA imagery over your coordinates with
the next overpass times; an evidence vault that keeps the thirty seconds *before*
an event and hashes the clip; links for external sensors; a world deck carrying
the feeds from off the property — USGS earthquakes with a range and bearing from
your gate, public traffic cameras on the roads out, active-fire points and
regional headlines; and a capability ledger.

The ledger is the point. Every capability on the specification is answered with
one of six states — measured here, measured by a device you link, modelled with
its error, blocked by the platform, needs hardware, or **unsound**. That last
group is thirteen rows the console will not build at any price: an autonomous turret
with a firing mechanism, identifying a drone from one camera, calling a palette
over a visible camera thermal, naming a nutrient from a spectrum, intent and aggression
scoring, threat percentages, concealed-object detection, gait identification,
mass from a silhouette, heartbeats through walls at perimeter range, and magnetic
firearm detection. Each says what is actually true and what the console does
instead — the turret row's alternative, a pan-tilt loop with no notion of where a
subject will be, is enforced by a test rather than by a comment.

Nothing was rewritten to build it: the detection chain, the ironbow view and the
external-sensor link come from Sentry, the overpass prediction and geodesy from
Emberline. One implementation of each number, so two panels cannot disagree
about how fast something was moving.

Full write-up, including the refusals in detail:
[`docs/black-optic-6.md`](docs/black-optic-6.md). Tests:
`npm run test:black-optic-6` (213 unit tests) and `npm run qa:black-optic-6`,
which drives the real console in Chromium with a synthetic camera and microphone.

Of the world feeds, exactly one works on the static deploy with no setup at all:
USGS sends the CORS header a browser needs, so the seismic panel reads it
directly. The other three need the same free relay the fence cameras already
use, and the deck says which is which in place rather than failing quietly. The
seismic panel will not compute what the shaking was *at the ranch* — it reports
the intensity USGS published, prefers what people actually reported over what
ShakeMap modelled, and where neither exists it says so instead of estimating one
from magnitude and distance.

---

## And its film: the Black Optic 6 showcase

A scroll-driven cinematic site for the console at
[`public/black-optic-6-site/`](public/black-optic-6-site) — anamorphic WebGL
backdrop, parallax plates, a 3D card reveal, an operator who walks toward the
lens as you scroll, an interactive demo, a ballistics trainer, and a different
synthesised voice explaining each of the eleven acts.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/black-optic-6-site/>**
— locally `/black-optic-6-site/` under `./start.sh`.

Its one rule is the same as the console's, pointed at marketing: **every feature
claim is read out of the capability ledger at load time, wearing whatever state
that ledger gives it.** There is no second copy of the text to sweeten later. A
row the ledger calls UNSOUND appears on the site as UNSOUND, in the section about
the thing it sits next to — the turret row is in the marksmanship act, the Apple
Watch row is beside the strap that does work. The title card's counts come from
`tally()`, the thirteen palettes from the renderer that draws them, the five
satellites from the orbital panel. A typo in a capability id throws at load
rather than rendering a confident blank card.

The operator is a photographic plate, feathered into the page at every edge
rather than cut out — the plate is graded cold, so the white hat reads bluer than
the sky behind it and the leather coat is the same pixel value as the dark frame
corners, and no matte pullable from it avoids either eating the hat or leaving a
blue rim. Kept whole and feathered, it lands on the near-black page with no
visible edge and keeps the Earth and console panels that were always part of the
artwork. The approach is a push-in at a constant rate of growth, with a small bob
at the footfall rate, and each act declares which side the plate takes so it
always clears the text column. A vector figure drawn from a joint rig carries the
first frames of every load and the whole film if the plates never arrive.

The voices are the browser's own speech engine, offline and free, reading
sentences composed from the ledger; a test walks all 88 of them and fails if any
contains copy that exists nowhere in the catalogue.

The range act is a ballistics trainer against static steel — drop, lag-time wind
drift, holdover, and a solver that turns its own rows amber past transonic where
it stops being trustworthy. It is not a targeting system, and it says so on the
page.

Write-up: [`docs/black-optic-6-site.md`](docs/black-optic-6-site.md). Tests:
`npm run test:black-optic-6-site` (95 unit tests) and
`npm run qa:black-optic-6-site` (40 checks), which drives the real page in
Chromium and checks that the shader paints, the operator moves, both plates
decode and reach the canvas, the feather still reaches zero on every edge, the
demo runs without a camera, and the honest rows survived onto the rendered page.

---

## What the skin changes

Four files. No upstream rule was deleted, so pulling new commits from upstream
stays a clean merge.

| File | Change |
| --- | --- |
| `theme/command-center.css` | **New.** The entire skin: token overrides plus a decorative HUD layer. |
| `index.html` | Two lines — loads the theme after `style.css`, adds the `#cc-atmosphere` element. |
| `style.css` | Tokenized 98 hardcoded `rgba(0, 212, 255, …)` literals to `rgba(var(--accent-rgb), …)`. |
| `src/*.test.mjs` | 7 regex assertions widened to accept either colour notation (see below). |

Upstream's suite passes **2587/2587**, identical to a pristine checkout, and
`npm run build` is clean.

### Why `style.css` had to be touched

Upstream is about half-tokenized: 73 call sites use `var(--accent)`, but 98
inline the same cyan as a literal. Overriding the token alone would have
re-tinted roughly half the interface and left the rest on the old colour.

The sweep only rewrote literals that **exactly equalled upstream's own
`--accent` value**, so it is a provable no-op under upstream's palette —
`--accent-rgb: 0, 212, 255` is defined next to `--accent` in `style.css`, and
the file still renders identically with the theme removed. Deliberately left
alone: the cockpit teal (`#22e6e6`), the ambers, and every other colour that
was a genuine design distinction rather than a duplicated accent.

Four tests in `panelStackLayout.test.mjs` and `cockpitMarkup.test.mjs` matched
those literals with regexes, so 7 assertions were widened from
`rgba\(0, 212, 255, 0\.18\)` to
`rgba\((?:0, 212, 255|var\(--accent-rgb\)), 0\.18\)` — the colour *notation*
became flexible, nothing else. Selector, gradient shape, stop positions, alpha
values and box-shadow blur radius are all still asserted exactly, and the
originals still match, so the tests pass against pristine upstream too.

### The design

*Reading instruments in a dark room.*

- **The globe is the light source.** Chrome drops to near-black (`#03060b`) with
  a blue cast so the Earth is the only warm thing on screen.
- **Two accents, each with a job.** Signal cyan (`#38f0ff`) means live/active;
  ember amber (`#ffa63d`) means alert/attention.
- **Machined, not rounded.** Panel radius 16px → 4px, with a lit hairline along
  the top edge and bracket marks at opposing corners — targeting furniture, not
  soft cards.
- **Data reads as data.** Monospaced, tabular figures, uppercase labels tracked
  out at 0.14em, values glowing and labels receding.
- **Atmosphere.** One non-interactive film over the globe: a survey graticule
  masked to fade at centre, faint scanlines, and a vignette.

Layout tokens (`--left-stack-x`, `--dock-*`, and friends) are untouched.
Geometry stays exactly as upstream tuned it.

### Accessibility

The atmosphere layer is `pointer-events: none` at `z-index: 1` and can never
intercept a click. Scanlines drop under `prefers-reduced-motion`; the whole film
drops and glass goes opaque under `prefers-reduced-transparency`. Keyboard
focus rings were given an explicit cyan outline so they stay legible against
the darker ground.

---

## Running it

**Just run this:**

```bash
./start.sh
```

Then open <http://localhost:4173/>. That's it — it installs what it needs on
first run, creates your `.env`, and starts the app. Ctrl+C stops it. You only
need [Node.js](https://nodejs.org) installed first (the LTS build; `start.sh`
checks the version and tells you if it's too old).

### No API keys required

The app used to abort with `GOOGLE_MAPS_API_KEY not found`, so a keyless run
gave a dead white sphere. That check is now optional — `src/main.js` skips the
Google tileset when there's no key and lets `MapStackController`'s existing
keyless path take over, which was already written and already defaulted to
`'osm'` whenever no tileset was passed. Nothing else changed.

So with **zero keys, zero signup, zero credit card** you get:

- a real globe with OpenStreetMap imagery, and the whole interface and skin
- the no-key live layers: flights, military ADS-B, satellites, earthquakes,
  CCTV, radio, bikeshare, launches, and the bundled infrastructure datasets

Keys only add things on top. Put them in `.env` whenever you like:

| Key | Unlocks | Cost |
| --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | Photorealistic 3D tiles — the cinematic look | 1,000 free sessions/mo, then ~$6/1,000 |
| `CESIUM_ION_TOKEN` | Bing imagery, Cesium World Terrain | Free tier |
| `AISSTREAM_API_KEY` | Live ships | Free |
| `FIRMS_MAP_KEY` | Active fires | Free |
| `TOMTOM_API_KEY` | Real road traffic | Free tier |
| `OPENAI_API_KEY` | Voice control | Metered, $5 session cap |

Keys are brokered server-side by the dev server, never exposed to the browser.
It binds to localhost by default — putting it on a LAN exposes your keys with
it, so set budget caps provider-side too.

## Publishing a link (and its limits)

`.github/workflows/pages.yml` publishes a static copy to GitHub Pages. Enable
it under **Settings → Pages → Source → GitHub Actions**, then run it from the
Actions tab.

**Read this before relying on it.** A static host has no backend, and this app
is not a static app: `vite.config.js` implements **16 `/api/*` routes** that
proxy and key-broker every live feed. Deployed statically you get the globe,
the interface and the skin — but aircraft, ships, CCTV, traffic, fires and
voice have nothing to call and report unavailable.

The link is a shop window. `./start.sh` is the app.

There is also no way to publish this as a Claude Artifact: Artifact pages are
sandboxed with a CSP that blocks all outbound fetch/XHR/WebSocket, which is
every data source and every map tile this depends on.

`scripts/build-static.sh` produces the same build locally. It handles two
things a plain `vite build` gets wrong for a project subpath: `vite-plugin-cesium`
writes its runtime to `dist/<base>/cesium` while the app requests
`/<base>/cesium` (so it is hoisted), and the hand-written root-absolute asset
paths (`/logo.svg`, `/models/*.glb`) are rewritten to include the base.

## Tweaking or removing the skin

Every colour, radius and glow lives in the `:root` block at the top of
`theme/command-center.css`. Change `--accent` and `--accent-rgb` together and
the entire interface re-tints.

To go back to stock, delete the two `index.html` lines that reference
`command-center.css` and `#cc-atmosphere`. `style.css` is standalone-correct on
its own and needs no revert.

---

## Attribution and licence

God's Eye View is © 2026 Bilawal Sidhu, released under the MIT Licence, which
is retained unmodified in [`LICENSE`](LICENSE). This copy is a derivative work
under those terms.

- Upstream: https://github.com/bilawalsidhu/gods-eye-view
- Announcement: https://www.spatialintelligence.ai/p/i-open-sourced-gods-eye-view

Bundled datasets carry their own separate terms — see
[`DATA_SOURCES.md`](DATA_SOURCES.md). Upstream's stated scope limit is kept as
is: the project does not build features for named-person search, face
recognition, or tracking individuals.

**Not vendored:** `docs/media/` (68 MB of demo GIFs). Image links in
`README.upstream.md` will not resolve; the upstream repo has them.

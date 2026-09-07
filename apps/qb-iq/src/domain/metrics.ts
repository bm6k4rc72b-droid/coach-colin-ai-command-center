/**
 * The metric dictionary.
 *
 * Nothing is rendered as a bare number in this app. Every figure on screen is
 * looked up here first, so it arrives with a unit, a measurement definition, a
 * reason a staff would care, and — where one exists in the literature — the
 * published range it sits in. If a metric cannot be given those four things it
 * does not belong on the screen.
 *
 * `better` says which direction is good. `'band'` means the metric has a target
 * window rather than a direction: more hip–shoulder separation is not
 * indefinitely better, it is better up to a point and then it is a red flag.
 */

export type MetricDomain = 'biomechanics' | 'cognition' | 'ooda' | 'stress' | 'outcome';

export interface MetricDef {
  id: MetricId;
  /** Full name, for headers and the dictionary. */
  label: string;
  /** Abbreviated name, for tight tiles and axes. */
  short: string;
  /** Unit string as displayed. Empty for dimensionless counts. */
  unit: string;
  /** Decimal places. */
  precision: number;
  domain: MetricDomain;
  /** How the number is measured. */
  definition: string;
  /** Why a coach, trainer, biomechanist or agent should look at it. */
  why: string;
  better: 'higher' | 'lower' | 'band';
  /** Target window for `better: 'band'`, in the metric's own unit. */
  band?: [number, number];
  /** Typical published range at this level, for orientation only — never a pass/fail. */
  reference?: string;
}

export const METRICS = {
  // ── Release and ball flight ────────────────────────────────────────────────
  timeToRelease: {
    id: 'timeToRelease',
    label: 'Time to Release',
    short: 'TTR',
    unit: 's',
    precision: 2,
    domain: 'biomechanics',
    definition:
      'Snap to the ball leaving the hand, from the tracking clock. Sacks, scrambles and throwaways are excluded so the figure is a release time and not a survival time.',
    why: 'The single number that governs how much protection a scheme has to buy. Every tenth here is a tenth the offensive line does not have to hold.',
    better: 'lower',
    reference: 'NFL starters average ≈2.7 s; the quickest operate near 2.4 s',
  },
  releaseHeight: {
    id: 'releaseHeight',
    label: 'Release Height',
    short: 'REL HT',
    unit: 'in',
    precision: 1,
    domain: 'biomechanics',
    definition: 'Height of the ball above the ground at the instant of release.',
    why: 'Sets the batted-ball and interior-window risk. Read it with arm slot, not alone: a lower slot can be schemed around, a low release with a low slot cannot.',
    better: 'higher',
    reference: '74–82 in for a 6 ft 2 in–6 ft 5 in passer',
  },
  releaseConsistency: {
    id: 'releaseConsistency',
    label: 'Release Point Consistency',
    short: 'REL σ',
    unit: 'in',
    precision: 2,
    domain: 'biomechanics',
    definition:
      'Root-mean-square scatter of the release point about the athlete’s own mean, in the vertical/lateral plane, across the reps in view. Smaller is tighter.',
    why: 'Ball placement is downstream of release repeatability. A slot that moves rep to rep shows up as misses that look like accuracy problems but are mechanical.',
    better: 'lower',
    reference: 'Elite repeatability lands near 1.5–3.0 in RMS',
  },
  armSlot: {
    id: 'armSlot',
    label: 'Arm Slot',
    short: 'SLOT',
    unit: '°',
    precision: 1,
    domain: 'biomechanics',
    definition: 'Angle of the throwing forearm above horizontal at release.',
    why: 'Defines the throwing windows a QB actually owns. Tracked for drift: a slot that drops across a season is usually fatigue or a shoulder talking.',
    better: 'band',
    band: [48, 66],
    reference: 'Three-quarters ≈ 45–60°, over-the-top ≈ 70–85°',
  },
  velocity: {
    id: 'velocity',
    label: 'Throw Velocity',
    short: 'VELO',
    unit: 'mph',
    precision: 1,
    domain: 'biomechanics',
    definition: 'Ball speed measured over the first 5 yards of flight, before drag has meaningfully acted.',
    why: 'Buys throwing windows — the intermediate dig and the deep out exist or do not exist based on this. Read against air yards, since velocity is throw-dependent.',
    better: 'higher',
    reference: 'NFL in-game intermediate throws ≈ 52–62 mph; max-effort ≈ 60–65 mph',
  },
  spinRate: {
    id: 'spinRate',
    label: 'Spin Rate',
    short: 'SPIN',
    unit: 'rpm',
    precision: 0,
    domain: 'biomechanics',
    definition: 'Revolutions per minute about the ball’s long axis, from the ball-tracking solve.',
    why: 'Gyroscopic stability. Only meaningful beside spiral efficiency — a fast wobble is worse than a slow spiral.',
    better: 'higher',
    reference: '520–720 rpm across professional passers',
  },
  spiralEfficiency: {
    id: 'spiralEfficiency',
    label: 'Spiral Efficiency',
    short: 'SPIRAL',
    unit: '%',
    precision: 1,
    domain: 'biomechanics',
    definition:
      'Share of the ball’s total angular momentum about its long axis. 100% is a pure spiral; the remainder is precession the air has to fight.',
    why: 'Predicts flight-path repeatability and catchability in wind. Efficiency falls before velocity does when a hand or a wrist is compromised.',
    better: 'higher',
    reference: '≥90% is a clean professional spiral',
  },
  wobble: {
    id: 'wobble',
    label: 'Spin-Axis Wobble',
    short: 'WOBBLE',
    unit: '°',
    precision: 1,
    domain: 'biomechanics',
    definition: 'Half-angle of spin-axis precession — the cone the nose traces in flight.',
    why: 'The direct read on release cleanliness. Wobble climbing while velocity holds is a grip or wrist story, and it is an early one.',
    better: 'lower',
    reference: 'Under 4° reads as a tight ball on broadcast',
  },

  // ── Joint kinematics ──────────────────────────────────────────────────────
  shoulderEr: {
    id: 'shoulderEr',
    label: 'Shoulder External Rotation',
    short: 'MAX ER',
    unit: '°',
    precision: 1,
    domain: 'biomechanics',
    definition: 'Peak external rotation of the throwing shoulder at the end of arm cocking — the lay-back.',
    why: 'The elastic load that velocity is drawn from, and the position where the anterior shoulder is most exposed. Watched as a window, not a maximum.',
    better: 'band',
    band: [155, 175],
    reference: 'Quarterbacks ≈155–175°, below the 175–185° of baseball pitchers',
  },
  elbowFlexionRelease: {
    id: 'elbowFlexionRelease',
    label: 'Elbow Flexion at Release',
    short: 'ELB REL',
    unit: '°',
    precision: 1,
    domain: 'biomechanics',
    definition: 'Included elbow angle at ball release; 0° would be a fully straight arm.',
    why: 'Whether the arm finished its extension into the ball. Reps that release flexed are usually rushed or blocked by a defender in the throwing lane.',
    better: 'band',
    band: [18, 32],
    reference: '20–30° at release in healthy overhand throwing',
  },
  hipShoulderSeparation: {
    id: 'hipShoulderSeparation',
    label: 'Hip–Shoulder Separation',
    short: 'X-FACTOR',
    unit: '°',
    precision: 1,
    domain: 'biomechanics',
    definition:
      'Angle between the pelvis and upper-torso transverse axes at front-foot plant — how far the hips have opened while the shoulders are still closed.',
    why: 'The stretch across the trunk that the whole chain is loaded from. Separation is the strongest single kinematic correlate of ball velocity in throwing populations.',
    better: 'band',
    band: [38, 52],
    reference: '35–50° at foot plant in high-velocity throwers',
  },
  frontKneeFlexion: {
    id: 'frontKneeFlexion',
    label: 'Front-Knee Flexion at Release',
    short: 'KNEE',
    unit: '°',
    precision: 1,
    domain: 'biomechanics',
    definition: 'Lead-knee angle at release. Lower means a straighter, firmer blocking leg.',
    why: 'A lead leg that extends converts linear momentum into rotation. A knee that stays soft leaks that energy and the arm makes up the difference.',
    better: 'band',
    band: [30, 50],
    reference: '30–55° at release in quarterbacks',
  },
  trunkTilt: {
    id: 'trunkTilt',
    label: 'Trunk Lateral Tilt',
    short: 'TILT',
    unit: '°',
    precision: 1,
    domain: 'biomechanics',
    definition: 'Lateral lean of the trunk away from the throwing arm at release.',
    why: 'Sets release height and slot together. Sudden extra tilt is the classic compensation for a tired or sore shoulder — the athlete drops under the throw instead of over it.',
    better: 'band',
    band: [14, 28],
    reference: '15–30° in overhand throwing',
  },

  // ── Kinetic chain ─────────────────────────────────────────────────────────
  sequenceOrder: {
    id: 'sequenceOrder',
    label: 'Sequencing Compliance',
    short: 'SEQ',
    unit: '%',
    precision: 0,
    domain: 'biomechanics',
    definition:
      'Share of reps whose five segment peaks — pelvis, trunk, shoulder internal rotation, elbow extension, wrist — fire in strict proximal-to-distal order.',
    why: 'Out-of-order reps put the load on the arm rather than the trunk. This is the cleanest early-warning signal in the whole biomechanics block.',
    better: 'higher',
    reference: 'Healthy high-level throwers sequence correctly on the large majority of reps',
  },
  pelvisPeak: {
    id: 'pelvisPeak',
    label: 'Peak Pelvis Angular Velocity',
    short: 'PELVIS ω',
    unit: '°/s',
    precision: 0,
    domain: 'biomechanics',
    definition: 'Maximum transverse-plane rotation rate of the pelvis during the throw.',
    why: 'The first big number the chain produces. Ground force that never becomes pelvis speed cannot become ball speed.',
    better: 'higher',
    reference: '450–700 °/s',
  },
  trunkPeak: {
    id: 'trunkPeak',
    label: 'Peak Trunk Angular Velocity',
    short: 'TRUNK ω',
    unit: '°/s',
    precision: 0,
    domain: 'biomechanics',
    definition: 'Maximum transverse-plane rotation rate of the upper torso.',
    why: 'The amplifier stage. A trunk peak that fails to exceed the pelvis by a clear margin means the separation was never used.',
    better: 'higher',
    reference: '800–1150 °/s',
  },
  shoulderIrPeak: {
    id: 'shoulderIrPeak',
    label: 'Peak Shoulder Internal Rotation Velocity',
    short: 'SHLD ω',
    unit: '°/s',
    precision: 0,
    domain: 'biomechanics',
    definition: 'Maximum internal rotation rate of the throwing shoulder, the fastest human joint motion measured in sport.',
    why: 'Where velocity is finally delivered — and where the load is highest. Tracked with elbow varus torque, never on its own.',
    better: 'higher',
    reference: '2500–4500 °/s in quarterbacks',
  },
  transferLag: {
    id: 'transferLag',
    label: 'Segment Transfer Lag',
    short: 'LAG',
    unit: 'ms',
    precision: 0,
    domain: 'biomechanics',
    definition: 'Mean time between consecutive segment peaks in the chain, pelvis through wrist.',
    why: 'Too long and the stretch has relaxed before the next segment uses it; too short and the segments fire as a block. Both cost velocity for the same joint load.',
    better: 'band',
    band: [18, 40],
    reference: '20–40 ms between adjacent peaks',
  },
  elbowVarus: {
    id: 'elbowVarus',
    label: 'Peak Elbow Varus Torque',
    short: 'VARUS',
    unit: 'N·m',
    precision: 0,
    domain: 'biomechanics',
    definition: 'Peak internal varus torque at the throwing elbow, the joint’s resistance to being pulled into valgus during cocking.',
    why: 'The medial-elbow load number. Read as a ratio to velocity: torque rising while velocity is flat is the pattern that precedes arm trouble.',
    better: 'lower',
    reference: 'Scales with throw effort; the trend against the athlete’s own baseline is what matters',
  },

  // ── Footwork ──────────────────────────────────────────────────────────────
  dropTime: {
    id: 'dropTime',
    label: 'Drop Time',
    short: 'DROP',
    unit: 's',
    precision: 2,
    domain: 'biomechanics',
    definition: 'Snap to the last step of the drop, split by play type because a five-step and an RPO are not the same task.',
    why: 'Timing throws only work if the feet arrive when the route does. A drop that drifts late shows up as a late ball long before it shows up as an incompletion.',
    better: 'lower',
    reference: '3-step ≈1.0–1.2 s, 5-step ≈1.5–1.7 s, play-action ≈1.9–2.3 s',
  },
  baseWidth: {
    id: 'baseWidth',
    label: 'Base Width',
    short: 'BASE',
    unit: 'in',
    precision: 1,
    domain: 'biomechanics',
    definition: 'Ankle-to-ankle stance width at the top of the drop.',
    why: 'Too narrow and there is nothing to rotate against; too wide and the hips cannot clear. The window is individual, which is why it is scored against the athlete’s own mean.',
    better: 'band',
    band: [22, 30],
    reference: 'Roughly 110–130% of shoulder width',
  },
  strideLength: {
    id: 'strideLength',
    label: 'Stride Length',
    short: 'STRIDE',
    unit: '% ht',
    precision: 1,
    domain: 'biomechanics',
    definition: 'Distance from trail-foot toe-off to lead-foot plant, as a percentage of standing height.',
    why: 'Normalising by height is what makes the number comparable across a room. Shortened strides under pressure are the first mechanical thing to go.',
    better: 'band',
    band: [58, 72],
    reference: '55–75% of height in quarterbacks; pitchers stride longer',
  },

  // ── Cognition ─────────────────────────────────────────────────────────────
  coverageIdTime: {
    id: 'coverageIdTime',
    label: 'Coverage Identification Time',
    short: 'COV ID',
    unit: 'ms',
    precision: 0,
    domain: 'cognition',
    definition:
      'Snap to a committed coverage declaration, charted from gaze and from where the ball went. Rotations after the snap restart the clock and are counted separately.',
    why: 'The gate on everything after it. A QB who names the coverage 200 ms sooner has 200 ms more to spend on the throw.',
    better: 'lower',
    reference: 'Experienced passers resolve the shell inside ≈700 ms on static looks',
  },
  coverageIdAccuracy: {
    id: 'coverageIdAccuracy',
    label: 'Coverage ID Accuracy',
    short: 'COV ACC',
    unit: '%',
    precision: 1,
    domain: 'cognition',
    definition: 'Share of reps where the declared coverage matched the coverage actually played.',
    why: 'Speed without accuracy is a turnover engine. Always read beside identification time — the pair is the metric, not either half.',
    better: 'higher',
  },
  decisionLatency: {
    id: 'decisionLatency',
    label: 'Decision Latency',
    short: 'DEC LAT',
    unit: 'ms',
    precision: 0,
    domain: 'cognition',
    definition:
      'Read complete to the first frame of the throwing motion. Isolated from footwork and from arm speed, so it is processing time and nothing else.',
    why: 'The core reaction-time measure in this app, and the one that responds to coaching fastest. Benchmarked against the athlete’s own rolling average, not a league mean.',
    better: 'lower',
    reference: 'Practised reads land near 200–350 ms',
  },
  progressionSpeed: {
    id: 'progressionSpeed',
    label: 'Per-Progression Time',
    short: 'PROG',
    unit: 'ms',
    precision: 0,
    domain: 'cognition',
    definition: 'Mean gaze dwell per progression stop before the eyes move to the next receiver.',
    why: 'Separates a QB who is slow because he is stuck from one who is slow because he is reading deep into the progression. Different fixes entirely.',
    better: 'lower',
    reference: '250–450 ms per stop',
  },
  workingMemoryLoad: {
    id: 'workingMemoryLoad',
    label: 'Working-Memory Load',
    short: 'WM LOAD',
    unit: 'vars',
    precision: 1,
    domain: 'cognition',
    definition:
      'Count of live variables the call asked the QB to hold simultaneously — protection identification, hot conversions, sight adjustments, checks, tempo.',
    why: 'Turns "he struggles with the hard calls" into a plot. Completion rate against load says exactly where the install has to be trimmed.',
    better: 'band',
    band: [3, 5],
    reference: 'Working memory holds ≈4 chunks; expertise raises the size of a chunk, not the count',
  },
  anticipatoryRate: {
    id: 'anticipatoryRate',
    label: 'Anticipatory Throw Rate',
    short: 'ANTIC',
    unit: '%',
    precision: 1,
    domain: 'cognition',
    definition: 'Share of throws released before the receiver’s break, from the tracking timestamps of release and break.',
    why: 'The cleanest available proxy for pattern recognition: throwing to where a route will be requires the picture to have been solved early.',
    better: 'higher',
    reference: 'Anticipation carries roughly a third to a half of professional throws',
  },
  gazeDwell: {
    id: 'gazeDwell',
    label: 'Primary-Read Gaze Dwell',
    short: 'DWELL',
    unit: 'ms',
    precision: 0,
    domain: 'cognition',
    definition: 'Time the gaze stayed on the primary read before moving, from eye tracking where available and charted film where not.',
    why: 'Long dwell is how safeties find the ball. This is the measurable half of "stop staring down your first read".',
    better: 'band',
    band: [400, 750],
  },
  lookOffRate: {
    id: 'lookOffRate',
    label: 'Safety Displacement Rate',
    short: 'LOOK-OFF',
    unit: '%',
    precision: 1,
    domain: 'cognition',
    definition: 'Share of middle-of-field throws where the QB’s eyes moved a deep safety at least two yards off the throwing lane before release.',
    why: 'A learned, coachable skill that directly widens deep windows, and one of the few eye-discipline behaviours that can be scored objectively.',
    better: 'higher',
  },

  // ── OODA ──────────────────────────────────────────────────────────────────
  oodaLoop: {
    id: 'oodaLoop',
    label: 'OODA Loop Time',
    short: 'LOOP',
    unit: 'ms',
    precision: 0,
    domain: 'ooda',
    definition:
      'Snap to release, decomposed into observe, orient, decide and act. The four spans partition the release time exactly, so the loop is the release clock seen by function rather than by phase.',
    why: 'Locates where time is actually going. Two QBs at 2.6 s can be a slow-orient problem and a slow-act problem, and those are opposite coaching weeks.',
    better: 'lower',
  },
  oodaObserve: {
    id: 'oodaObserve',
    label: 'Observe',
    short: 'OBSERVE',
    unit: 'ms',
    precision: 0,
    domain: 'ooda',
    definition: 'Snap to acquisition of the post-snap defensive picture — rotation resolved, rush count seen.',
    why: 'Almost entirely trainable with pre-snap discipline and rapid-exposure work. The cheapest span to buy back.',
    better: 'lower',
  },
  oodaOrient: {
    id: 'oodaOrient',
    label: 'Orient',
    short: 'ORIENT',
    unit: 'ms',
    precision: 0,
    domain: 'ooda',
    definition: 'Picture acquired to picture matched: this look against the install, leverage and help resolved.',
    why: 'The span that carries experience. A shrinking orient span across a season is the clearest evidence that the install has become automatic.',
    better: 'lower',
  },
  oodaDecide: {
    id: 'oodaDecide',
    label: 'Decide',
    short: 'DECIDE',
    unit: 'ms',
    precision: 0,
    domain: 'ooda',
    definition: 'Picture matched to target locked, including the decision to abandon the play design and create.',
    why: 'Where hesitation shows up. Decide time that swells only on third down is a confidence problem, not a processing one.',
    better: 'lower',
  },
  oodaAct: {
    id: 'oodaAct',
    label: 'Act',
    short: 'ACT',
    unit: 'ms',
    precision: 0,
    domain: 'ooda',
    definition: 'Target locked to ball out — the mechanical span, footwork through release.',
    why: 'The one span a biomechanist can move directly. If the loop is long and act owns it, the work is physical, not mental.',
    better: 'lower',
  },
  loopStability: {
    id: 'loopStability',
    label: 'Loop Stability Under Disorder',
    short: 'STABILITY',
    unit: '%',
    precision: 1,
    domain: 'ooda',
    definition:
      'Chaos-rep loop time expressed against structured-rep loop time: 100% means the loop does not lengthen at all when the pocket breaks down.',
    why: 'Separation between good and elite lives here. Everyone is fast on schedule; the ones who stay fast off schedule are the ones who win late.',
    better: 'higher',
  },

  // ── Stress and outcome ────────────────────────────────────────────────────
  composure: {
    id: 'composure',
    label: 'Composure Score',
    short: 'COMPOSURE',
    unit: '',
    precision: 0,
    domain: 'stress',
    definition:
      'A 0–100 index built from four measured deltas between pressured and clean reps: on-target rate, decision latency, release-point scatter and loop time — each scored against the athlete’s own clean-pocket performance, then weighted equally.',
    why: 'Gives the pressure conversation a number that is not "he looked rattled". Movement in it is trainable through graded exposure work.',
    better: 'higher',
  },
  pressureDelta: {
    id: 'pressureDelta',
    label: 'Pressure On-Target Delta',
    short: 'Δ ON-TGT',
    unit: 'pp',
    precision: 1,
    domain: 'stress',
    definition: 'On-target rate under pressure minus on-target rate in a clean pocket, in percentage points.',
    why: 'The plainest statement of what a rusher in the pocket actually costs this passer, before any interpretation.',
    better: 'higher',
    reference: 'League-wide, pressure costs roughly 15–20 points of accuracy',
  },
  situationalScore: {
    id: 'situationalScore',
    label: 'Situational Decision Score',
    short: 'SIT DEC',
    unit: '',
    precision: 0,
    domain: 'stress',
    definition:
      'A 0–100 score of decision fit to game state — down, distance, field position, clock and score — charted per rep against the correct answer for that state, then averaged.',
    why: 'Checkdown discipline in a two-minute drill and in the first quarter are different skills. This is where a coordinator finds out which one is missing.',
    better: 'higher',
  },
  recognitionRt: {
    id: 'recognitionRt',
    label: 'Recognition Reaction Time',
    short: 'RECOG RT',
    unit: 'ms',
    precision: 0,
    domain: 'stress',
    definition: 'Mean correct-response time on rapid-exposure coverage-recognition drills — a pre-snap picture shown for a fixed exposure, then answered.',
    why: 'A dose-response training measure. It moves in weeks, and the transfer to on-field observe time is directly checkable in this app.',
    better: 'lower',
  },
  hrvRmssd: {
    id: 'hrvRmssd',
    label: 'HRV (RMSSD)',
    short: 'RMSSD',
    unit: 'ms',
    precision: 0,
    domain: 'stress',
    definition:
      'Root mean square of successive R–R interval differences, from the chest strap worn during protocol work. A parasympathetic-tone index.',
    why: 'The measurable half of the breathing work: it says whether the protocol actually changed the athlete’s state, rather than whether he did the reps.',
    better: 'higher',
    reference: 'Within-athlete change is the signal; between-athlete comparison is not meaningful',
  },
  leadLegBraking: {
    id: 'leadLegBraking',
    label: 'Lead-Leg Braking Force',
    short: 'LEAD GRF',
    unit: '×BW',
    precision: 2,
    domain: 'biomechanics',
    definition:
      'Peak vertical ground-reaction force on the front leg between plant and release, divided by bodyweight. Force plates in the practice field, or an estimate from the mocap solve.',
    why: 'The block. A front leg that stops the body hard is what turns the stride into rotation — when this number falls, the arm is usually the thing making up the difference.',
    better: 'higher',
    reference: '1.6–2.6 ×BW in high-level throwing; the athlete’s own trend is the useful read',
  },
  trailLegDrive: {
    id: 'trailLegDrive',
    label: 'Trail-Leg Drive Force',
    short: 'TRAIL GRF',
    unit: '×BW',
    precision: 2,
    domain: 'biomechanics',
    definition: 'Peak vertical ground-reaction force on the back leg during the stride, divided by bodyweight.',
    why: 'The push. Paired with lead-leg braking it says whether a velocity change came from producing more force or from stopping it better.',
    better: 'higher',
  },
  pelvisAsymmetry: {
    id: 'pelvisAsymmetry',
    label: 'Pelvis Rotation Asymmetry',
    short: 'PELVIS ASYM',
    unit: '%',
    precision: 1,
    domain: 'biomechanics',
    definition:
      'Throwing-side minus glove-side pelvis rotation contribution, as a percentage of their mean. Zero is a symmetric turn.',
    why: 'Persistent one-sided rotation is a hip-mobility or trunk-control finding, and it is one of the few asymmetries that shows up in the data weeks before it shows up in a complaint.',
    better: 'band',
    band: [-8, 8],
  },
  armStress: {
    id: 'armStress',
    label: 'Arm Stress Index',
    short: 'STRESS',
    unit: 'N·m/mph',
    precision: 2,
    domain: 'biomechanics',
    definition:
      'Peak elbow varus torque divided by ball velocity on the same rep — the joint load being paid per unit of output.',
    why: 'Velocity alone hides the cost of producing it. When this ratio climbs while velocity is flat, the athlete is spending more of the arm for the same throw, which is the pattern worth catching early.',
    better: 'lower',
  },
  onTargetRate: {
    id: 'onTargetRate',
    label: 'On-Target Rate',
    short: 'ON-TGT',
    unit: '%',
    precision: 1,
    domain: 'outcome',
    definition:
      'Share of charted throws placed where the route and the leverage required, whether or not they were caught. Drops and contested catches do not move it.',
    why: 'Separates the QB’s work from the receiver’s. It is the accuracy number that survives a change of personnel.',
    better: 'higher',
  },
  placement: {
    id: 'placement',
    label: 'Ball Placement',
    short: 'PLACE',
    unit: '',
    precision: 1,
    domain: 'outcome',
    definition: 'Per-throw 0–100 score of ball position relative to the receiver’s leverage and the nearest defender, charted at the catch point.',
    why: 'Yards after catch and contested-catch rate both live downstream of this. It is the difference between completing a throw and creating one.',
    better: 'higher',
  },
  epaPerDropback: {
    id: 'epaPerDropback',
    label: 'EPA per Dropback',
    short: 'EPA/DB',
    unit: '',
    precision: 3,
    domain: 'outcome',
    definition: 'Expected points added per dropback, sacks and scrambles included.',
    why: 'The common currency between this app and every front-office model. It is here so the process metrics can be checked against something a general manager already trusts.',
    better: 'higher',
  },
} as const satisfies Record<string, Omit<MetricDef, 'id'> & { id: string }>;

export type MetricId = keyof typeof METRICS;

/** Look up a metric definition. Throws on an unknown id, which is a programming error. */
export function metric(id: MetricId): MetricDef {
  const def = METRICS[id] as MetricDef | undefined;
  if (!def) throw new Error(`Unknown metric: ${String(id)}`);
  return def;
}

export const METRIC_IDS = Object.keys(METRICS) as MetricId[];

/** Every metric in one domain, in declaration order. */
export function metricsByDomain(domain: MetricDomain): MetricDef[] {
  return METRIC_IDS.map(metric).filter((m) => m.domain === domain);
}

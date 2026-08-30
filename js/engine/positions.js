/* ============================================================
   POSITION PACKS
   The OODA engine, the sensors, the renderer, the progression and the
   whole UI shell are position-agnostic. What changes between a
   quarterback and a receiver is four things:

     · the PICTURE       what the hologram shows and from where
     · the MENUS         what the four phases are actually asking
     · the BENCHMARKS    a receiver's orient window is not a QB's
     · the OPPONENT CLOCK what Δ-loop is measured against

   A pack supplies exactly those. Everything else is shared.
   ============================================================ */
import { COVERAGES, COVERAGE_IDS } from './playbook.js';
import { buildDefense, chooseDisguise } from './defense.js';
import { LOOKS, LOOK_IDS, SPOTS, SPOT_IDS, buildWrPicture, wrCamera, wrRecognition } from './wrplaybook.js';
import { applyBench, applyPhaseNotes } from './ooda.js';
import { pick } from '../core/rng.js';

const QB_CAM = { x:0, y:-14, h:22, focal:0.36, horizon:0.26, near:2.2, baseYaw:0, yawLimit:62, pocket:true };

/* Recognition descriptor for the shared flash-recognition drill. */
const qbRecognition = {
  ids: COVERAGE_IDS,
  question: 'NAME IT',
  meta: id => ({ label:COVERAGES[id].label, short:COVERAGES[id].short, tell:COVERAGES[id].tell }),
  build: (id, { level = 4, disguise = 0 } = {}) => ({
    picture: buildDefense({
      coverage:id,
      disguise: Math.random() < disguise ? chooseDisguise(id, level) : null,
      blitz: id === 'C0' || Math.random() < 0.14,
      strength: Math.random() < 0.5 ? 1 : -1,
    }),
    cam: QB_CAM,
  }),
};

export const POSITIONS = {
  qb: {
    id:'qb', code:'QB', name:'QUARTERBACK', accent:'#4DF0FF',
    blurb:'Four phases, one snap, raced against the coverage\'s own decision cycle.',
    opponentClock:'the coverage finishing its rotation',
    camera: QB_CAM,
    recognition: qbRecognition,
    bench:{
      observe:{ elite:220, good:380, ok:600 },
      orient: { elite:420, good:700, ok:1100 },
      decide: { elite:300, good:520, ok:850 },
      act:    { elite:220, good:360, ok:600 },
    },
    phaseNotes:{
      observe:'Time from the rotation to your first eyes-on reaction.',
      orient: 'Time to classify the coverage. Boyd\'s decisive phase.',
      decide: 'Time to commit to the read the coverage dictates.',
      act:    'Time from decision to ball out of your hand.',
    },
    drills:[
      { id:'loopbreak', unlock:0 },
      { id:'orient',    unlock:0 },
      { id:'twitch',    unlock:400 },
      { id:'periph',    unlock:600 },
      { id:'pulse',     unlock:900 },
      { id:'ironhand',  unlock:1200 },
    ],
    copy:{},
  },

  wr: {
    id:'wr', code:'WR', name:'WIDE RECEIVER', accent:'#7CFF9E',
    blurb:'Leverage, technique, the top of the coverage — then a break he cannot recover from.',
    opponentClock:'the defender flipping his hips',
    camera: wrCamera(SPOTS.Z_FIELD),
    recognition: wrRecognition,
    /* A receiver's whole cycle lives inside about half a second off the
       line, so every phase benchmark tightens. Scoring a WR against QB
       numbers would flatter them into meaninglessness. */
    bench:{
      observe:{ elite:180, good:300, ok:480 },
      orient: { elite:330, good:560, ok:900 },
      decide: { elite:260, good:440, ok:700 },
      act:    { elite:190, good:320, ok:520 },
    },
    phaseNotes:{
      observe:'Time to get your eyes on the man who declares the look.',
      orient: 'Time to classify leverage, technique and the top of the coverage.',
      decide: 'Time to convert the route to the answer that look demands.',
      act:    'Time from decision to the plant — the break itself.',
    },
    drills:[
      { id:'wrread',   unlock:0 },
      { id:'orient',   unlock:0 },
      { id:'twitch',   unlock:400 },
      { id:'track',    unlock:700 },
      { id:'periph',   unlock:900 },
      { id:'pulse',    unlock:1200 },
      { id:'ironhand', unlock:1600 },
    ],
    /* Shared drills, re-aimed at what the position actually does. */
    copy:{
      orient:{
        name:'LEVERAGE READ',
        tag:'PICTURE LIBRARY',
        desc:'Flash-recognition of what the defender gave you. Exposure shrinks as you get it right.',
        line:'One frame of a defender\'s alignment and technique, then it is gone. Name what he gave you.',
        science:'A receiver has roughly one step to classify leverage, technique and the top of the coverage — and that classification is pure pattern matching, not deliberation. Exposure is staircased against your own accuracy so you sit at threshold, where perceptual learning is steepest, and looks are interleaved rather than blocked so the recognition survives past the session.',
      },
      twitch:{
        name:'OFF THE BALL',
        tag:'RELEASE BURST',
        desc:'Get-off latency and release consistency, read off the accelerometer.',
        line:'The ball moves and you move. The sensor timestamps the burst, not your thumb.',
        science:'Get-off is the one part of a route nobody can scheme for you. Simple reaction time bottoms out around 180–200ms, so the trainable variable is the standard deviation around it — a receiver who releases in a consistent 260ms beats one who ranges from 210 to 400, because the quarterback\'s timing is built on the number he can predict. Randomised foreperiods block the anticipation strategy that fakes a good score.',
      },
      periph:{
        name:'SPLIT VISION',
        tag:'UFOV + STEM',
        desc:'Run the stem with your eyes on your key while the safety moves in your periphery.',
        line:'The look you are given pre-snap is not the one you run against. Catch the change without looking at it.',
        science:'Coverages rotate after the snap, and a receiver who has to turn his head to find the safety has already lost the route. This is a genuine dual task: a discrimination at the fixation point while a target resolves in the periphery. Useful field of view constricts under sympathetic arousal, which is exactly why a rotation you would read easily in practice disappears in a two-minute drill.',
      },
      ironhand:{
        name:'HOLD',
        tag:'INHIBITION',
        desc:'Release on the snap. Freeze on the hard count. Measures true SSRT.',
        line:'A launched motor plan, cancelled before it costs five yards.',
        science:'The stop-signal paradigm (Logan & Cowan) is the standard measure of response inhibition, and the network behind it — right inferior frontal gyrus and pre-SMA driving the subthalamic nucleus — responds to practice. For a receiver it cashes out twice: flinching off the line on a hard count, and aborting a break when the play breaks down behind you. Stop-signal delay staircases toward 50% inhibition so the SSRT estimate stays valid.',
      },
      pulse:{
        line:'Finger on the lens. Baseline, load, reset — and a real number for your recovery.',
      },
    },
  },
};

export const POSITION_IDS = Object.keys(POSITIONS);

let active = 'qb';

export function activeId(){ return active; }
export function pack(id = active){ return POSITIONS[id] || POSITIONS.qb; }

/** Point the shared engine at a position. Called at boot and on switch. */
export function usePosition(id){
  active = POSITIONS[id] ? id : 'qb';
  const p = POSITIONS[active];
  applyBench(p.bench);
  applyPhaseNotes(p.phaseNotes);
  return p;
}

/* Re-exported so drills can reach the WR tables without another import
   hop, and so the pack stays the single place a position is described. */
export { LOOKS, LOOK_IDS, SPOTS, SPOT_IDS, buildWrPicture, wrCamera };

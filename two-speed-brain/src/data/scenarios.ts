// Scenarios: a trigger, the timeline of regional activity that follows, and
// the narrative phases. Times are milliseconds after the trigger.
//
// Timings are illustrative: they follow typical latencies reported in the
// literature (cited per phase) but real brains vary widely, and regions work
// in overlapping networks rather than a strict relay.

import type { RegionId } from './regions';

export interface Pulse {
  region: RegionId;
  start: number;
  peak: number;
  /** Activity has decayed to zero by `end` (use > DURATION for sustained). */
  end: number;
  level: number;
}

export type PathwayId = 'lowRoad' | 'highRoad' | 'regulation' | 'alarm' | 'salience' | 'habit' | 'context' | 'action';

export interface PathEvent {
  path: PathwayId;
  at: number;
  /** Travel time in ms. */
  dur: number;
}

export interface Phase {
  at: number;
  system: 'fast' | 'slow' | 'body' | 'sense' | 'habit';
  title: string;
  text: string;
  regions: RegionId[];
  ref?: string;
  rating?: import('./evidence').Rating;
}

export interface Scenario {
  id: string;
  tag: string;
  title: string;
  trigger: string;
  pulses: Pulse[];
  paths: PathEvent[];
  phases: Phase[];
  takeaway: string;
}

export const DURATION = 3000;

const p = (region: RegionId, start: number, peak: number, end: number, level = 1): Pulse => ({ region, start, peak, end, level });

export const SCENARIOS: Scenario[] = [
  {
    id: 'criticised',
    tag: 'Offense',
    title: 'Criticised in front of others',
    trigger: 'In a meeting, a colleague says: “Honestly, this isn’t good enough.”',
    pulses: [
      p('thalamus', 0, 25, 160, 0.9),
      p('auditory', 15, 120, 700, 0.8),
      p('amygdala', 60, 170, 1400, 1),
      p('insula', 140, 320, 1700, 0.85),
      p('brainstem', 180, 450, 2600, 0.6),
      p('hypothalamus', 220, 700, 4000, 0.7),
      p('cingulate', 250, 480, 1800, 0.75),
      p('mpfc', 350, 800, 2400, 0.7),
      p('lpfc', 420, 1100, 3200, 0.8),
      p('ofc', 600, 1400, 3400, 0.75),
      p('hippocampus', 300, 700, 1800, 0.5),
      p('motor', 1500, 2100, 2900, 0.55),
    ],
    paths: [
      { path: 'lowRoad', at: 20, dur: 60 },
      { path: 'highRoad', at: 30, dur: 450 },
      { path: 'alarm', at: 200, dur: 400 },
      { path: 'salience', at: 260, dur: 250 },
      { path: 'context', at: 320, dur: 300 },
      { path: 'regulation', at: 900, dur: 500 },
      { path: 'action', at: 1600, dur: 400 },
    ],
    phases: [
      {
        at: 0,
        system: 'sense',
        title: 'Sound reaches the thalamus',
        text: 'The words arrive as sound. The thalamus relays them to the auditory cortex and sends a rough copy straight to the amygdala.',
        regions: ['thalamus', 'auditory'],
        ref: 'ledoux1996',
        rating: 'moderate',
      },
      {
        at: 70,
        system: 'fast',
        title: 'Tone registers as a threat',
        text: 'The amygdala reacts to the tone and the social setting (“in front of others”) within about a tenth of a second, before the meaning of the sentence is clear.',
        regions: ['amygdala'],
        ref: 'mendez2016',
        rating: 'moderate',
      },
      {
        at: 150,
        system: 'fast',
        title: 'The sting',
        text: 'The insula turns the alarm into a body feeling: heat in the face, a tight chest. This is the moment that feels like “being offended.”',
        regions: ['insula'],
        ref: 'eisenberger2003',
        rating: 'mixed',
      },
      {
        at: 250,
        system: 'body',
        title: 'Body alarm starts',
        text: 'Hypothalamus and brainstem raise heart rate and release adrenaline. Cortisol will keep rising for the next 20 to 30 minutes, and being judged by others produces the biggest cortisol responses.',
        regions: ['hypothalamus', 'brainstem'],
        ref: 'dickerson2004',
        rating: 'strong',
      },
      {
        at: 400,
        system: 'slow',
        title: 'Now you understand the words',
        text: 'Meaning settles at around 400 ms. By now you are already feeling defensive: the feeling had a head start of a few hundred milliseconds.',
        regions: ['auditory', 'cingulate', 'mpfc'],
        ref: 'kutas1980',
        rating: 'strong',
      },
      {
        at: 900,
        system: 'slow',
        title: 'Appraisal: “about the work, or about me?”',
        text: 'Prefrontal cortex weighs context: who said it, what they meant, what is true about the work. Reappraising it as feedback on the work, not a verdict on you, turns the amygdala down.',
        regions: ['lpfc', 'ofc', 'hippocampus'],
        ref: 'ochsner2005',
        rating: 'strong',
      },
      {
        at: 1600,
        system: 'slow',
        title: 'The response you choose',
        text: 'What reaches the motor cortex first decides what you say. If the slow system has caught up, it can be “Which part isn’t working?” rather than a snap back.',
        regions: ['motor', 'ofc'],
      },
    ],
    takeaway: 'You feel the tone before you understand the words. Taking offense starts as a fast relevance alarm; the slow system arrives later and decides what it means.',
  },
  {
    id: 'change',
    tag: 'Change',
    title: 'Your work switches to a new system',
    trigger: 'Monday’s email: “From next week, all orders go through the new platform.”',
    pulses: [
      p('thalamus', 0, 30, 200, 0.6),
      p('visual', 30, 160, 800, 0.7),
      p('hippocampus', 180, 450, 1600, 0.85),
      p('amygdala', 220, 500, 1900, 0.65),
      p('striatum', 250, 600, 3400, 0.9),
      p('cingulate', 350, 700, 2400, 0.8),
      p('ofc', 400, 900, 2600, 0.7),
      p('lpfc', 500, 1500, 3600, 1),
      p('insula', 450, 900, 2000, 0.45),
      p('hypothalamus', 600, 1200, 3500, 0.35),
    ],
    paths: [
      { path: 'highRoad', at: 30, dur: 450 },
      { path: 'context', at: 200, dur: 300 },
      { path: 'habit', at: 300, dur: 500 },
      { path: 'salience', at: 400, dur: 300 },
      { path: 'regulation', at: 1300, dur: 500 },
    ],
    phases: [
      {
        at: 0,
        system: 'sense',
        title: 'You read the email',
        text: 'Visual cortex decodes the message. Nothing dangerous is happening, but something familiar is about to disappear.',
        regions: ['thalamus', 'visual'],
      },
      {
        at: 200,
        system: 'slow',
        title: 'Novelty detected',
        text: 'The hippocampus flags that this does not match what you know. New situations get extra attention, which is useful but tiring.',
        regions: ['hippocampus'],
        ref: 'schultz1997',
        rating: 'moderate',
      },
      {
        at: 250,
        system: 'fast',
        title: 'Uncertainty feels bad',
        text: 'Unknown odds activate the amygdala and orbitofrontal cortex more than known risks. “I don’t know how this will go” is itself unpleasant.',
        regions: ['amygdala', 'ofc'],
        ref: 'hsu2005',
        rating: 'moderate',
      },
      {
        at: 400,
        system: 'habit',
        title: 'The old way pulls',
        text: 'Your current routine runs in the striatum at almost no effort. Habits are cheap; the brain resists throwing away a cheap, working routine.',
        regions: ['striatum'],
        ref: 'graybiel2008',
        rating: 'strong',
      },
      {
        at: 700,
        system: 'slow',
        title: 'Conflict: old habit vs new rule',
        text: 'The anterior cingulate detects the clash between what you automatically do and what you are now meant to do, and calls for more control.',
        regions: ['cingulate'],
        ref: 'botvinick2001',
        rating: 'strong',
      },
      {
        at: 1300,
        system: 'slow',
        title: 'Learning is expensive',
        text: 'Doing it the new way needs the prefrontal cortex: working memory, attention, effort. That cost is the real resistance, and it fades as the new way becomes a habit of its own.',
        regions: ['lpfc'],
        ref: 'samuelson1988',
        rating: 'moderate',
      },
    ],
    takeaway: 'People rarely “hate change.” They dislike losing a cheap habit, facing uncertainty and paying the effort of learning. Lower those three and resistance drops.',
  },
  {
    id: 'identity',
    tag: 'Identity',
    title: 'A post attacks your side',
    trigger: 'A viral post mocks a view you hold and the people who hold it.',
    pulses: [
      p('thalamus', 0, 30, 200, 0.7),
      p('visual', 30, 150, 700, 0.7),
      p('amygdala', 90, 260, 2200, 1),
      p('insula', 150, 380, 2400, 0.95),
      p('mpfc', 200, 500, 3200, 0.95),
      p('cingulate', 250, 550, 2400, 0.8),
      p('hypothalamus', 300, 900, 4000, 0.55),
      p('lpfc', 450, 1200, 3500, 0.85),
      p('hippocampus', 300, 650, 1500, 0.45),
      p('ofc', 800, 1700, 3400, 0.45),
      p('motor', 1400, 2000, 2800, 0.6),
    ],
    paths: [
      { path: 'lowRoad', at: 20, dur: 70 },
      { path: 'highRoad', at: 30, dur: 450 },
      { path: 'salience', at: 200, dur: 300 },
      { path: 'alarm', at: 300, dur: 400 },
      { path: 'action', at: 1450, dur: 400 },
    ],
    phases: [
      {
        at: 0,
        system: 'sense',
        title: 'You see the post',
        text: 'Faces, mockery and group symbols are processed quickly.',
        regions: ['thalamus', 'visual'],
      },
      {
        at: 100,
        system: 'fast',
        title: 'Threat to the group, threat to me',
        text: 'Challenges to strongly held political beliefs activate amygdala and insula more than challenges to other beliefs.',
        regions: ['amygdala', 'insula'],
        ref: 'kaplan2016',
        rating: 'moderate',
      },
      {
        at: 250,
        system: 'slow',
        title: 'It’s about who I am',
        text: 'Self-related regions light up. A belief tied to identity is defended like part of yourself.',
        regions: ['mpfc', 'cingulate'],
        ref: 'kaplan2016',
        rating: 'moderate',
      },
      {
        at: 600,
        system: 'slow',
        title: 'Reasoning starts… for your side',
        text: 'The prefrontal cortex engages, but often as a lawyer, not a judge: it builds the case for the group. Smarter, more numerate people are not immune; they can be better at it.',
        regions: ['lpfc'],
        ref: 'kahan2017',
        rating: 'moderate',
      },
      {
        at: 1400,
        system: 'slow',
        title: 'Reply or scroll?',
        text: 'With the alarm still high and regulation weak, the fastest available response wins: the angry reply.',
        regions: ['motor'],
      },
    ],
    takeaway: 'Identity turns disagreement into self-defence. Reasoning still happens, but it is recruited to protect the group, not to test the claim.',
  },
  {
    id: 'danger',
    tag: 'Danger',
    title: 'A car swerves toward you',
    trigger: 'You step off the kerb and a car swings round the corner.',
    pulses: [
      p('thalamus', 0, 20, 150, 1),
      p('colliculus', 10, 50, 300, 1),
      p('amygdala', 40, 110, 1200, 1),
      p('brainstem', 60, 200, 2400, 0.95),
      p('hypothalamus', 120, 500, 4000, 0.85),
      p('motor', 180, 450, 1300, 1),
      p('visual', 30, 150, 600, 0.8),
      p('insula', 200, 500, 1800, 0.6),
      p('lpfc', 600, 1300, 3000, 0.6),
      p('ofc', 900, 1700, 3200, 0.5),
    ],
    paths: [
      { path: 'lowRoad', at: 10, dur: 50 },
      { path: 'alarm', at: 80, dur: 250 },
      { path: 'action', at: 150, dur: 250 },
      { path: 'highRoad', at: 20, dur: 450 },
      { path: 'regulation', at: 1200, dur: 500 },
    ],
    phases: [
      {
        at: 0,
        system: 'sense',
        title: 'Movement in the corner of your eye',
        text: 'The superior colliculus snaps your eyes toward it before you know what it is.',
        regions: ['thalamus', 'colliculus'],
      },
      {
        at: 50,
        system: 'fast',
        title: 'Alarm',
        text: 'The amygdala tags it as urgent through the fast route from the thalamus.',
        regions: ['amygdala'],
        ref: 'mendez2016',
        rating: 'moderate',
      },
      {
        at: 150,
        system: 'body',
        title: 'Startle and jump back',
        text: 'Brainstem and motor systems move you. Reaction to a surprise hazard takes around 0.7 to 1.5 s for a full response like braking, but the startle starts much earlier.',
        regions: ['brainstem', 'motor'],
        ref: 'green2000',
        rating: 'strong',
      },
      {
        at: 900,
        system: 'slow',
        title: 'Thinking catches up',
        text: 'Only now does the prefrontal cortex assess: “I’m safe, that was close.” Your heart keeps pounding for minutes.',
        regions: ['lpfc', 'ofc'],
      },
    ],
    takeaway: 'This is what the fast system is for, and here it is right. Trouble starts when it treats words, emails and posts as if they were cars.',
  },
  {
    id: 'learning',
    tag: 'Learning',
    title: 'Trying a new skill',
    trigger: 'Your first attempt at a new technique, and you get it wrong.',
    pulses: [
      p('visual', 0, 120, 700, 0.7),
      p('lpfc', 100, 600, 3600, 1),
      p('hippocampus', 150, 600, 3200, 0.85),
      p('cingulate', 350, 450, 1400, 0.9),
      p('amygdala', 420, 650, 1800, 0.45),
      p('insula', 450, 750, 1800, 0.4),
      p('striatum', 1200, 1900, 3400, 0.7),
      p('motor', 200, 800, 3200, 0.7),
    ],
    paths: [
      { path: 'highRoad', at: 0, dur: 400 },
      { path: 'context', at: 200, dur: 400 },
      { path: 'salience', at: 380, dur: 200 },
      { path: 'habit', at: 1200, dur: 500 },
    ],
    phases: [
      {
        at: 0,
        system: 'slow',
        title: 'Full attention',
        text: 'Everything is deliberate: the prefrontal cortex holds each step in working memory. This is why learning feels tiring.',
        regions: ['lpfc', 'motor'],
      },
      {
        at: 350,
        system: 'slow',
        title: 'The error signal',
        text: 'Within about a tenth of a second of a mistake, the brain produces an error signal from the cingulate, often before you consciously notice.',
        regions: ['cingulate'],
        ref: 'gehring1993',
        rating: 'strong',
      },
      {
        at: 450,
        system: 'fast',
        title: 'A flash of embarrassment',
        text: 'A small alarm: “I look bad.” It is uncomfortable, and it is also what makes people quit early.',
        regions: ['amygdala', 'insula'],
      },
      {
        at: 1200,
        system: 'habit',
        title: 'Learning from the miss',
        text: 'The gap between what you expected and what happened is the teaching signal. With practice the skill moves from effortful prefrontal control to the fast, automatic striatum.',
        regions: ['striatum', 'hippocampus'],
        ref: 'schultz1997',
        rating: 'strong',
      },
    ],
    takeaway: 'Feeling clumsy is what learning feels like from the inside. The error signal is the brain doing its job, not proof that you can’t do it.',
  },
  {
    id: 'evidence',
    tag: 'Disagreement',
    title: 'Good evidence says you’re wrong',
    trigger: 'A friend shows you a solid source that contradicts something you said confidently.',
    pulses: [
      p('visual', 0, 140, 700, 0.7),
      p('cingulate', 250, 600, 2400, 0.95),
      p('insula', 280, 650, 2000, 0.6),
      p('amygdala', 300, 600, 1800, 0.55),
      p('mpfc', 350, 800, 2600, 0.6),
      p('lpfc', 450, 1400, 3600, 0.95),
      p('ofc', 800, 1800, 3600, 0.85),
      p('hippocampus', 400, 1000, 2600, 0.6),
    ],
    paths: [
      { path: 'highRoad', at: 0, dur: 450 },
      { path: 'salience', at: 300, dur: 300 },
      { path: 'context', at: 500, dur: 400 },
      { path: 'regulation', at: 1100, dur: 500 },
    ],
    phases: [
      {
        at: 0,
        system: 'sense',
        title: 'You read the source',
        text: 'Nothing threatening is in front of you; just text.',
        regions: ['visual'],
      },
      {
        at: 250,
        system: 'slow',
        title: 'Dissonance',
        text: 'Two things you hold clash: “I was right” and “this evidence is good.” Cingulate and insula activity during dissonance tracks how much people later change their minds.',
        regions: ['cingulate', 'insula'],
        ref: 'vanveen2009',
        rating: 'moderate',
      },
      {
        at: 350,
        system: 'fast',
        title: 'A small sting of status',
        text: 'Being wrong in front of a friend carries a little social cost, so the alarm stirs, though less than for a real threat.',
        regions: ['amygdala', 'mpfc'],
      },
      {
        at: 1100,
        system: 'slow',
        title: 'Updating, quietly',
        text: 'Most people do move toward the evidence. The famous “backfire effect”, where corrections make beliefs stronger, turned out to be rare. Updating is usually slow and private, not instant and public.',
        regions: ['lpfc', 'ofc'],
        ref: 'woodporter2019',
        rating: 'strong',
      },
    ],
    takeaway: 'Being wrong hurts a little, so people resist in the moment. Give them time and a way to save face and most will update.',
  },
];

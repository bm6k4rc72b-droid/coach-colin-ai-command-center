// The pause trainer: four steps that give the slow system time to catch up.
// Each step sets a target activity level per region; the brain eases toward it.

import type { RegionId } from './regions';

export interface TrainerChoice {
  label: string;
  good: boolean;
  feedback: string;
}

export interface TrainerStep {
  id: string;
  title: string;
  prompt: string;
  how: string;
  ref?: string;
  activity: Partial<Record<RegionId, number>>;
  choices?: TrainerChoice[];
}

export const TRAINER_TRIGGERS = [
  'Someone criticises your work in front of others.',
  'A message from a family member reads as passive-aggressive.',
  'A stranger online calls your opinion stupid.',
  'Your manager changes the plan you spent a week on.',
];

export const TRAINER_STEPS: TrainerStep[] = [
  {
    id: 'trigger',
    title: 'The trigger',
    prompt: 'Picture it happening. Let the first reaction come.',
    how: 'This is the fast system: amygdala, insula and the body alarm fire before any thought.',
    activity: { amygdala: 1, insula: 0.9, hypothalamus: 0.7, brainstem: 0.6, cingulate: 0.5, lpfc: 0.1, ofc: 0.1 },
  },
  {
    id: 'notice',
    title: 'Notice',
    prompt: 'Where do you feel it? Face, jaw, chest, stomach?',
    how: 'Attending to body signals engages the insula and starts to bring the prefrontal cortex online. You are watching the reaction instead of being it.',
    activity: { amygdala: 0.85, insula: 1, hypothalamus: 0.6, brainstem: 0.5, cingulate: 0.6, lpfc: 0.35, ofc: 0.2 },
  },
  {
    id: 'name',
    title: 'Name it',
    prompt: 'Put it in words: “I feel embarrassed”, “I feel dismissed”, “I feel defensive.”',
    how: 'Labelling an emotion reduces amygdala activity and engages ventrolateral prefrontal cortex.',
    ref: 'lieberman2007',
    activity: { amygdala: 0.55, insula: 0.65, hypothalamus: 0.45, brainstem: 0.35, cingulate: 0.5, lpfc: 0.75, ofc: 0.45 },
  },
  {
    id: 'reframe',
    title: 'Reframe',
    prompt: 'Choose the response that changes what the moment means.',
    how: 'Reappraisal changes the meaning, so the alarm has less to respond to. Suppression only hides it.',
    ref: 'ochsner2005',
    activity: { amygdala: 0.3, insula: 0.35, hypothalamus: 0.3, brainstem: 0.25, cingulate: 0.4, lpfc: 0.9, ofc: 0.85, mpfc: 0.5 },
    choices: [
      {
        label: '“They’re commenting on this piece of work, not on me.”',
        good: true,
        feedback: 'Reappraisal. You changed what it means, and the alarm has less to react to.',
      },
      {
        label: '“I’m fine. I’m not bothered at all.” (while seething)',
        good: false,
        feedback: 'Suppression. The feeling stays and your body stays more aroused. Try a reframe that changes the meaning.',
      },
      {
        label: '“They’ve probably had a rough day; it may not be about me.”',
        good: true,
        feedback: 'Reappraisal by context. Considering another explanation lets the prefrontal cortex turn the amygdala down.',
      },
    ],
  },
  {
    id: 'respond',
    title: 'Respond',
    prompt: 'Now choose what to say or do, on purpose.',
    how: 'With the alarm lower, the motor cortex gets its instructions from the slow system instead of the fast one.',
    activity: { amygdala: 0.2, insula: 0.25, hypothalamus: 0.25, brainstem: 0.2, cingulate: 0.3, lpfc: 0.7, ofc: 0.9, mpfc: 0.45, motor: 0.8 },
  },
];

import type { Rating } from './evidence';

export interface Claim {
  claim: string;
  rating: Rating;
  verdict: string;
  ref: string;
}

// Popular claims about emotion, reason and the brain, each with a verdict.
export const CLAIMS: Claim[] = [
  {
    claim: 'Feelings can arrive before you understand what happened.',
    rating: 'moderate',
    verdict: 'The amygdala can respond within about 74 ms, before detailed processing is done. How much of this runs through a true “shortcut” in humans is still debated.',
    ref: 'mendez2016',
  },
  {
    claim: 'Sleep loss makes you more emotionally reactive.',
    rating: 'strong',
    verdict: 'One sleepless night raised amygdala responses by about 60% and weakened prefrontal control. Many later studies agree.',
    ref: 'yoo2007',
  },
  {
    claim: 'Stress makes it harder to think clearly.',
    rating: 'strong',
    verdict: 'Acute stress chemistry impairs prefrontal cortex and shifts control toward habits and fast reactions.',
    ref: 'arnsten2009',
  },
  {
    claim: 'Naming a feeling helps calm it.',
    rating: 'moderate',
    verdict: 'Labelling an emotion reduced amygdala activity in the lab. Real-world effects are smaller but consistent.',
    ref: 'lieberman2007',
  },
  {
    claim: 'Hiding your emotion is as good as changing how you see things.',
    rating: 'weak',
    verdict: 'Suppression leaves the feeling intact and raises physiological arousal; reappraisal actually reduces it.',
    ref: 'gross2002',
  },
  {
    claim: 'People hate change.',
    rating: 'mixed',
    verdict: 'People favour defaults and weigh losses heavily, and uncertainty is aversive. Change that clearly reduces loss and uncertainty is often welcomed.',
    ref: 'samuelson1988',
  },
  {
    claim: 'Correcting someone makes them believe the myth more (the backfire effect).',
    rating: 'weak',
    verdict: 'Large studies found corrections usually work; true backfire is rare.',
    ref: 'woodporter2019',
  },
  {
    claim: 'Smarter people are less biased about politics.',
    rating: 'weak',
    verdict: 'On identity-laden topics, more numerate people often polarise more, using their skill to defend their side.',
    ref: 'kahan2017',
  },
  {
    claim: 'Rejection hurts in exactly the same brain area as physical pain.',
    rating: 'mixed',
    verdict: 'There is overlap in distress-related areas, but finer analysis shows the brain codes social rejection and physical pain differently.',
    ref: 'eisenberger2003',
  },
  {
    claim: 'The amygdala is the brain’s fear centre.',
    rating: 'mixed',
    verdict: 'It responds to fear, but also to novelty, reward and social relevance. “Relevance detector” fits better.',
    ref: 'sander2003',
  },
  {
    claim: 'Emotion is the enemy of good decisions.',
    rating: 'myth',
    verdict: 'People who lose emotional signals through prefrontal damage decide worse. Emotion is part of good judgement; the problem is timing, not its existence.',
    ref: 'bechara1997',
  },
  {
    claim: 'Your “lizard brain” runs your emotions.',
    rating: 'myth',
    verdict: 'Brains did not evolve as a reptile core with layers added on top. Emotional and rational processing are spread across shared networks.',
    ref: 'cesario2020',
  },
  {
    claim: 'Willpower is a tank that runs out as you use it.',
    rating: 'weak',
    verdict: 'A 23-lab replication found almost no ego-depletion effect.',
    ref: 'hagger2016',
  },
  {
    claim: 'People are either left-brained (logical) or right-brained (emotional).',
    rating: 'myth',
    verdict: 'Large scan studies show no such personality-linked hemisphere dominance.',
    ref: 'nielsen2013',
  },
  {
    claim: 'We only use 10% of our brain.',
    rating: 'myth',
    verdict: 'Every region has known functions and shows activity; damage almost anywhere has effects.',
    ref: 'beyerstein1999',
  },
];

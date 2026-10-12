import type { FC } from 'react';
import { HeartPanel, HeartReadouts, HeartScene } from './Heart';
import { AirwaysPanel, AirwaysReadouts, AirwaysScene } from './Airways';
import { NervePanel, NerveReadouts, NerveScene } from './Nerve';
import { HipPanel, HipReadouts, HipScene } from './Hip';
import { HalfLifePanel, HalfLifeReadouts, HalfLifeScene } from './HalfLife';
import { ReactionPanel, ReactionReadouts, ReactionScene } from './Reaction';

export interface Exhibit {
  id: string;
  title: string;
  blurb: string;
  Scene: FC;
  Panel: FC;
  Readouts: FC;
  /** Width of the apparatus in metres, used to frame it on narrow screens. */
  width: number;
  sources: string[];
}

export const EXHIBITS: Exhibit[] = [
  {
    id: 'heart',
    title: 'The Heart Pump',
    blurb:
      'Every beat pushes out a stroke volume of blood. Rate × volume is cardiac output, and output × the resistance of the vessels sets your blood pressure. Change one and watch the others follow.',
    Scene: HeartScene,
    Panel: HeartPanel,
    Readouts: HeartReadouts,
    width: 1.35,
    sources: [
      'Cardiac output = heart rate × stroke volume; mean arterial pressure ≈ cardiac output × systemic vascular resistance + central venous pressure (standard haemodynamics, e.g. Guyton & Hall, Textbook of Medical Physiology).',
      'A mean arterial pressure of at least 65 mmHg is the usual target for keeping organs perfused (Surviving Sepsis Campaign guidelines).',
    ],
  },
  {
    id: 'airways',
    title: 'The Airway Tree',
    blurb:
      'Your windpipe splits in two, then again, about 23 times. Each tube is narrower, but there are so many that the total opening balloons, so air slows from a gust to a crawl just where oxygen has to cross into blood.',
    Scene: AirwaysScene,
    Panel: AirwaysPanel,
    Readouts: AirwaysReadouts,
    width: 0.95,
    sources: [
      'Weibel, E. R. (1963). Morphometry of the Human Lung: 23 generations of dichotomous branching.',
      "Murray, C. D. (1926). The physiological principle of minimum work: child diameter = parent × 2^(−1/3). Real lungs widen even faster in the deepest generations, so air there is slower still.",
    ],
  },
  {
    id: 'nerve',
    title: 'The Nerve Signal',
    blurb:
      'A nerve impulse is not electricity in a wire: it is rebuilt at every point along the fibre. Wrap the fibre in myelin and the signal leaps from gap to gap, up to a hundred times faster.',
    Scene: NerveScene,
    Panel: NervePanel,
    Readouts: NerveReadouts,
    width: 2.3,
    sources: [
      'Hursh, J. B. (1939). Conduction velocity and diameter of nerve fibers: about 6 m/s per µm in myelinated fibres.',
      'Huxley, A. F. & Stämpfli, R. (1949). Evidence for saltatory conduction in peripheral myelinated nerve fibres.',
      'Unmyelinated (C) fibres conduct at roughly 0.5–2 m/s, rising with the square root of diameter (Rushton, 1951).',
    ],
  },
  {
    id: 'hip',
    title: 'The Hip Load',
    blurb:
      'Patients with sensor-fitted hip implants showed that the hip carries far more than body weight: muscles pull hard across the joint to keep you balanced. Pick an activity and feel the load.',
    Scene: HipScene,
    Panel: HipPanel,
    Readouts: HipReadouts,
    width: 1.05,
    sources: [
      'Bergmann, G. et al. (2001). Hip contact forces and gait patterns from routine activities. Journal of Biomechanics 34, 859–871.',
      'Bergmann, G., Graichen, F. & Rohlmann, A. (1993). Hip joint loading during walking and running, measured in two patients. Journal of Biomechanics 26, 969–990.',
    ],
  },
  {
    id: 'halflife',
    title: 'The Half-life Race',
    blurb:
      'Natural GLP-1 lasts about two minutes in the blood. Exenatide, from Gila monster venom, lasts hours. Semaglutide, built to resist enzymes and ride on albumin, lasts a week. Run the clock.',
    Scene: HalfLifeScene,
    Panel: HalfLifePanel,
    Readouts: HalfLifeReadouts,
    width: 1.55,
    sources: [
      'Deacon, C. F. et al. (1995). Degradation of glucagon-like peptide-1 by plasma DPP-IV. Diabetes 44, 1126–1131 (half-life about 2 minutes).',
      'Byetta (exenatide) prescribing information: half-life about 2.4 hours.',
      'Lau, J. et al. (2015). Discovery of the once-weekly GLP-1 analogue semaglutide. J Med Chem 58, 7370–7380 (half-life about 165 hours).',
    ],
  },
  {
    id: 'reaction',
    title: 'Fast and Slow',
    blurb:
      'Your brain flags a threat before you know what you saw, and works out meaning much later. Test your reaction time and see where you land between the alarm system and the thinking system.',
    Scene: ReactionScene,
    Panel: ReactionPanel,
    Readouts: ReactionReadouts,
    width: 1.7,
    sources: [
      'Méndez-Bértolo, C. et al. (2016). A fast pathway for fear in human amygdala. Nature Neuroscience 19, 1041–1049 (about 74 ms).',
      'Kutas, M. & Hillyard, S. A. (1980). Reading senseless sentences: brain potentials reflect semantic incongruity. Science 207, 203–205 (N400).',
      'Simple visual reaction times are typically 200–300 ms (e.g. Woods, D. L. et al., 2015, Frontiers in Human Neuroscience).',
    ],
  },
];

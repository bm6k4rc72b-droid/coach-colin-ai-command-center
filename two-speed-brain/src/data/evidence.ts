// Every claim in the app points at one of these references and carries a rating.
// Ratings describe how well the specific claim holds up, not the paper's quality.

export type Rating = 'strong' | 'moderate' | 'mixed' | 'weak' | 'myth';

export const RATING_STYLE: Record<Rating, { label: string; color: string; note: string }> = {
  strong: { label: 'Strong evidence', color: '#2F7A55', note: 'Replicated across many studies and methods.' },
  moderate: { label: 'Moderate evidence', color: '#5F7F3A', note: 'Good studies, some open questions about size or generality.' },
  mixed: { label: 'Mixed evidence', color: '#A57A1C', note: 'Findings conflict or the popular version overstates them.' },
  weak: { label: 'Weak evidence', color: '#B2552E', note: 'Large replications failed or support is thin.' },
  myth: { label: 'Myth', color: '#9C3B3B', note: 'Contradicted by the evidence.' },
};

export interface Ref {
  key: string;
  cite: string;
  /** What the study found, in plain words. */
  finding: string;
}

export const REFS: Record<string, Ref> = {
  mendez2016: {
    key: 'mendez2016',
    cite: 'Méndez-Bértolo et al. (2016), Nature Neuroscience',
    finding: 'Recordings inside the human amygdala showed a response to fearful faces about 74 ms after they appeared, faster than detailed visual processing.',
  },
  ledoux1996: {
    key: 'ledoux1996',
    cite: 'LeDoux (1996), The Emotional Brain',
    finding: 'Described a fast “low road” from thalamus to amygdala and a slower “high road” through the cortex. Shown clearly in rats; in humans the shortcut is supported but debated.',
  },
  kutas1980: {
    key: 'kutas1980',
    cite: 'Kutas & Hillyard (1980), Science',
    finding: 'The brain’s response to the meaning of a word (the N400) peaks around 400 ms, a few hundred milliseconds after the sound itself is registered.',
  },
  eisenberger2003: {
    key: 'eisenberger2003',
    cite: 'Eisenberger, Lieberman & Williams (2003), Science; Woo et al. (2014), Nature Communications',
    finding: 'Social exclusion activated the anterior cingulate, an area involved in pain distress. Later work found the brain represents social rejection and physical pain differently, so “rejection is pain” is an overstatement.',
  },
  ochsner2005: {
    key: 'ochsner2005',
    cite: 'Ochsner & Gross (2005), Trends in Cognitive Sciences',
    finding: 'Reappraising a situation (changing what it means to you) engages prefrontal cortex and reduces amygdala activity and reported emotion.',
  },
  lieberman2007: {
    key: 'lieberman2007',
    cite: 'Lieberman et al. (2007), Psychological Science',
    finding: 'Putting a feeling into words (“affect labelling”) reduced amygdala response and increased right ventrolateral prefrontal activity.',
  },
  gross2002: {
    key: 'gross2002',
    cite: 'Gross (2002), Psychophysiology',
    finding: 'Suppressing the expression of an emotion did not reduce the feeling and increased physiological arousal; reappraisal did reduce it.',
  },
  yoo2007: {
    key: 'yoo2007',
    cite: 'Yoo, Gujar, Hu, Jolesz & Walker (2007), Current Biology',
    finding: 'After a night without sleep, amygdala responses to negative images were about 60% larger and its connection with medial prefrontal cortex was weaker.',
  },
  arnsten2009: {
    key: 'arnsten2009',
    cite: 'Arnsten (2009), Nature Reviews Neuroscience',
    finding: 'Even mild acute stress impairs prefrontal function through stress chemistry, shifting control toward faster, more habitual and emotional responses.',
  },
  dickerson2004: {
    key: 'dickerson2004',
    cite: 'Dickerson & Kemeny (2004), Psychological Bulletin',
    finding: 'Across 208 studies, cortisol peaked about 21 to 40 minutes after a stressor, and social-evaluative threat produced the largest responses.',
  },
  kaplan2016: {
    key: 'kaplan2016',
    cite: 'Kaplan, Gimbel & Harris (2016), Scientific Reports',
    finding: 'When strongly held political beliefs were challenged, people showed more activity in amygdala, insula and self-related (default mode) regions than for non-political beliefs.',
  },
  kahan2017: {
    key: 'kahan2017',
    cite: 'Kahan (2017), Cultural Cognition Project; Kahan et al. (2012), Nature Climate Change',
    finding: 'People process evidence in ways that protect their standing in groups they identify with. Higher numeracy and science literacy increased polarisation rather than reducing it.',
  },
  woodporter2019: {
    key: 'woodporter2019',
    cite: 'Wood & Porter (2019), Political Behavior; Nyhan & Reifler (2010)',
    finding: 'Across 52 issues and 10,100 people, corrections moved beliefs toward accuracy; the “backfire effect” reported earlier was rare.',
  },
  vanveen2009: {
    key: 'vanveen2009',
    cite: 'van Veen et al. (2009), Nature Neuroscience',
    finding: 'Dorsal anterior cingulate and anterior insula activity during cognitive dissonance predicted how much people then changed their attitudes.',
  },
  hsu2005: {
    key: 'hsu2005',
    cite: 'Hsu et al. (2005), Science',
    finding: 'Choices with unknown odds activated amygdala and orbitofrontal cortex more than choices with known risks: the brain treats uncertainty itself as aversive.',
  },
  samuelson1988: {
    key: 'samuelson1988',
    cite: 'Samuelson & Zeckhauser (1988), Journal of Risk and Uncertainty; Kahneman & Tversky (1979); Gal & Rucker (2018)',
    finding: 'People disproportionately stick with the default option. Losses tend to weigh more than equal gains, though how much more is still debated.',
  },
  graybiel2008: {
    key: 'graybiel2008',
    cite: 'Graybiel (2008), Annual Review of Neuroscience; Yin & Knowlton (2006)',
    finding: 'With practice, control of a behaviour shifts toward the striatum, making it fast and automatic and harder to override.',
  },
  botvinick2001: {
    key: 'botvinick2001',
    cite: 'Botvinick et al. (2001), Psychological Review',
    finding: 'The anterior cingulate monitors for conflict between competing responses and signals the need for more control.',
  },
  gehring1993: {
    key: 'gehring1993',
    cite: 'Gehring et al. (1993), Psychological Science',
    finding: 'The brain produces an error signal (error-related negativity) within about 100 ms of a mistake, often before you are aware of it.',
  },
  schultz1997: {
    key: 'schultz1997',
    cite: 'Schultz, Dayan & Montague (1997), Science',
    finding: 'Dopamine neurons signal reward prediction errors: better than expected, worse than expected. This is a core teaching signal for learning.',
  },
  green2000: {
    key: 'green2000',
    cite: 'Green (2000), Transportation Human Factors',
    finding: 'Drivers’ brake reaction times to an expected hazard are about 0.7 to 0.75 s, and 1.25 s or more when surprised.',
  },
  sander2003: {
    key: 'sander2003',
    cite: 'Sander, Grafman & Zalla (2003), Reviews in the Neurosciences',
    finding: 'The amygdala is better described as a detector of relevance to the person than as a dedicated fear centre.',
  },
  cesario2020: {
    key: 'cesario2020',
    cite: 'Cesario, Johnson & Eisthen (2020), Current Directions in Psychological Science',
    finding: 'The “triune brain” (reptilian core, emotional mammal layer, rational human layer) is not how brains evolved; it is a myth.',
  },
  bechara1997: {
    key: 'bechara1997',
    cite: 'Bechara, Damasio, Tranel & Damasio (1997), Science',
    finding: 'People with ventromedial prefrontal damage, who lacked emotional signals, made worse decisions: emotion is part of good reasoning, not its opposite.',
  },
  hagger2016: {
    key: 'hagger2016',
    cite: 'Hagger et al. (2016), Perspectives on Psychological Science',
    finding: 'A 23-lab replication found close to zero “ego depletion” effect: willpower as a fuel tank that empties is not well supported.',
  },
  nielsen2013: {
    key: 'nielsen2013',
    cite: 'Nielsen et al. (2013), PLOS ONE',
    finding: 'In over 1,000 brain scans there was no evidence that some people are “left-brained” and others “right-brained.”',
  },
  beyerstein1999: {
    key: 'beyerstein1999',
    cite: 'Beyerstein (1999), in Della Sala (ed.), Mind Myths',
    finding: 'Imaging, brain-damage cases and metabolism all show the whole brain is used; there is no silent 90%.',
  },
  kahneman2011: {
    key: 'kahneman2011',
    cite: 'Kahneman (2011), Thinking, Fast and Slow',
    finding: 'A popular framework for fast, automatic (“System 1”) and slow, effortful (“System 2”) thinking. Useful as a description; the systems are not two separate brain parts.',
  },
};

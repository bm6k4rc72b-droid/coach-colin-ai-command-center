// Functional regions used by the simulation, mapped onto BodyParts3D brain meshes.
//
// The mapping is by structure name. Where the atlas has no exact mesh for a
// functional area, the closest anatomical structure stands in and the region
// says so (`approx`), e.g. the whole cingulate gyrus for the anterior cingulate.

export type RegionId =
  | 'thalamus'
  | 'colliculus'
  | 'amygdala'
  | 'insula'
  | 'hypothalamus'
  | 'brainstem'
  | 'cingulate'
  | 'hippocampus'
  | 'striatum'
  | 'visual'
  | 'auditory'
  | 'lpfc'
  | 'mpfc'
  | 'ofc'
  | 'motor';

/** fast = early, automatic appraisal · slow = deliberate control · sense = input · habit = routines · body = alarm to the body */
export type Group = 'fast' | 'slow' | 'sense' | 'habit' | 'body';

export interface Region {
  id: RegionId;
  label: string;
  group: Group;
  /** Mesh base names (side stripped) from BodyParts3D. */
  meshes: string[];
  /** One-line job description. */
  role: string;
  /** Longer explanation for the region card. */
  detail: string;
  /** Present when the mesh is an anatomical stand-in for a functional area. */
  approx?: string;
}

export const GROUP_STYLE: Record<Group, { label: string; color: string; soft: string }> = {
  fast: { label: 'Fast system', color: '#C9472F', soft: 'rgba(201, 71, 47, 0.1)' },
  body: { label: 'Body alarm', color: '#B7791F', soft: 'rgba(183, 121, 31, 0.1)' },
  sense: { label: 'Senses', color: '#9A8C78', soft: 'rgba(154, 140, 120, 0.13)' },
  habit: { label: 'Habit', color: '#7A5AA6', soft: 'rgba(122, 90, 166, 0.1)' },
  slow: { label: 'Slow system', color: '#2F64A8', soft: 'rgba(47, 100, 168, 0.1)' },
};

export const REGIONS: Region[] = [
  {
    id: 'thalamus',
    label: 'Thalamus',
    group: 'sense',
    meshes: ['thalamus', 'lateral geniculate body', 'medial geniculate body'],
    role: 'Relay station for sight and sound.',
    detail:
      'Almost every sense passes through the thalamus on its way to the cortex. It also sends a coarse copy directly to the amygdala, which is why a rough “threat or not?” guess can be made before the cortex has finished working out what it is.',
  },
  {
    id: 'colliculus',
    label: 'Superior colliculus',
    group: 'fast',
    meshes: ['superior colliculus', 'inferior colliculus', 'brachium of superior colliculus', 'brachium of inferior colliculus'],
    role: 'Snaps your eyes and head toward sudden movement.',
    detail:
      'A midbrain hub for reflexive orienting. A flash or a looming object can turn your gaze before you consciously see what it is.',
  },
  {
    id: 'amygdala',
    label: 'Amygdala',
    group: 'fast',
    meshes: ['amygdala'],
    role: 'Fast relevance detector: “does this matter to me, right now?”',
    detail:
      'Often called the fear centre, but better described as a relevance detector. It responds to threat, but also to novelty, status, faces and anything important to your goals. It reacts early and tags the moment as urgent, which is why the feeling shows up before the reasoning.',
  },
  {
    id: 'insula',
    label: 'Insula',
    group: 'fast',
    meshes: ['insula', 'accessory short gyrus'],
    role: 'Turns body signals into feelings: the sting, the flush, the knot.',
    detail:
      'The insula maps the state of your body (heart rate, gut, face) and is active in disgust, unfairness and the physical sense of being offended. “That felt like a slap” is partly insular.',
  },
  {
    id: 'hypothalamus',
    label: 'Hypothalamus',
    group: 'body',
    meshes: ['hypothalamus, nsn', 'mammillary body', 'tuber cinereum'],
    role: 'Starts the stress response: adrenaline now, cortisol later.',
    detail:
      'Drives the sympathetic nervous system (heart rate and adrenaline within seconds) and the hormonal stress axis. Cortisol peaks roughly 20 to 30 minutes after a stressor, so the body keeps reacting long after the moment has passed.',
  },
  {
    id: 'brainstem',
    label: 'Brainstem',
    group: 'body',
    meshes: ['pons', 'medulla oblongata', 'midbrain, nsn', 'peduncle of midbrain'],
    role: 'Heart rate, breathing, startle and freeze.',
    detail:
      'Carries out the body’s side of the alarm: startle, a faster heart, held breath. These are automatic, which is why you can’t simply decide not to blush.',
  },
  {
    id: 'cingulate',
    label: 'Anterior cingulate',
    group: 'slow',
    meshes: ['cingulate gyrus'],
    approx: 'Shown as the whole cingulate gyrus; the anterior part does this job.',
    role: 'Conflict and error alarm: “something doesn’t add up.”',
    detail:
      'Monitors for conflict between what you expected and what happened, and between competing responses. It fires when you make an error and when new information clashes with what you believe. It sits at the hinge between fast feeling and slow control.',
  },
  {
    id: 'hippocampus',
    label: 'Hippocampus',
    group: 'slow',
    meshes: ['hippocampus', 'parahippocampal gyrus', 'fornix of forebrain'],
    role: 'Context and memory: “where have I seen this before?”',
    detail:
      'Supplies context: who this is, what happened last time, whether this situation is new. It is essential for learning new things and for recognising that today is not the same as a bad experience in the past.',
  },
  {
    id: 'striatum',
    label: 'Striatum',
    group: 'habit',
    meshes: ['caudate nucleus', 'putamen', 'globus pallidus'],
    role: 'Habits and reward prediction: the cheap, automatic way.',
    detail:
      'Stores well-practised routines and signals when things turn out better or worse than expected. Habits run here at low effort, which is why the old way feels easy and the new way feels expensive.',
  },
  {
    id: 'visual',
    label: 'Visual cortex',
    group: 'sense',
    meshes: ['occipital lobe'],
    role: 'Works out what you are actually looking at.',
    detail: 'Builds a detailed picture of the scene. Slower than the thalamus-to-amygdala shortcut, but far more accurate.',
  },
  {
    id: 'auditory',
    label: 'Auditory & language cortex',
    group: 'sense',
    meshes: ['anterior part of superior temporal gyrus', 'posterior part of superior temporal gyrus', 'middle temporal gyrus'],
    role: 'Hears tone first, meaning a beat later.',
    detail:
      'The superior temporal gyrus processes sound and speech. Tone of voice is picked up quickly; the meaning of a sentence takes a few hundred milliseconds longer to settle.',
  },
  {
    id: 'lpfc',
    label: 'Lateral prefrontal cortex',
    group: 'slow',
    meshes: ['middle frontal gyrus'],
    approx: 'Shown as the middle frontal gyrus (dorsolateral prefrontal cortex).',
    role: 'Working memory and deliberate control: “wait, think.”',
    detail:
      'Holds information in mind, weighs options and can damp down the fast response, for example by reappraising what a remark meant. It is slower and tires under stress and sleep loss.',
  },
  {
    id: 'mpfc',
    label: 'Medial prefrontal cortex',
    group: 'slow',
    meshes: ['superior frontal gyrus'],
    approx: 'Shown as the superior frontal gyrus, which includes the medial prefrontal surface.',
    role: 'Thinking about yourself and what others think of you.',
    detail:
      'Active when something is about you: your identity, your reputation, your group. That is why an attack on a belief you identify with can feel like an attack on you.',
  },
  {
    id: 'ofc',
    label: 'Orbitofrontal / ventromedial PFC',
    group: 'slow',
    meshes: ['orbital gyri straight gyrus'],
    approx: 'Shown as the orbital and straight gyri on the underside of the frontal lobe.',
    role: 'Puts a value on things and calms the amygdala.',
    detail:
      'Integrates feelings with goals to decide what something is worth. It has strong two-way connections with the amygdala and is a key route by which reappraisal turns the alarm down.',
  },
  {
    id: 'motor',
    label: 'Motor cortex',
    group: 'slow',
    meshes: ['precentral gyrus'],
    role: 'Sends the command to act or speak.',
    detail: 'The final common path to action. What reaches it first, the fast reaction or the considered one, is what you end up doing.',
  },
];

export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, Region>;

/** Region whose mesh list contains this side-stripped structure name. */
export function regionForMesh(baseName: string): RegionId | null {
  for (const r of REGIONS) if (r.meshes.includes(baseName)) return r.id;
  return null;
}

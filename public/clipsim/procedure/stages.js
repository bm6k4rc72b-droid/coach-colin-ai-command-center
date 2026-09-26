// The six procedure stages and their goals.
//
// Each task is either:
//   - state-based: it checks the live state, so it can untick again (e.g. "field dry"
//     goes false if a new bleed starts), or
//   - fact-based: it checks something that happened, recorded by the stage system
//     from tool events with a timestamp (e.g. "Doppler on the PCom").
// A stage completes when all its tasks are true at the same moment. The next
// stage then unlocks.
//
// `progress` (optional) gives a partial 0–1 value for the mentor's percentage.

const IDENTIFY_SECONDS = 1.2;   // hovering a structure this long counts as identifying it

const identified = (s, part) => (s.hover[part] || 0) >= IDENTIFY_SECONDS || !!s.facts['touch:' + part] || !!s.facts['doppler:' + part];
const dry = (c) => c.bleeding.activeSources.length === 0 && c.bleeding.volume < 1;
const cut = (c, layer) => c.anatomy.arachnoid.filter((m) => m.userData.layer === layer && m.userData.cut).length;
const total = (c, layer) => c.anatomy.arachnoid.filter((m) => m.userData.layer === layer).length;
const afterClip = (s, key) => s.facts[key] !== undefined && s.lastClipTime !== null && s.facts[key] > s.lastClipTime;

export const STAGES = [
  {
    // The fissure is opened from superficial to deep, cutting arachnoid sharply
    // on the frontal side of the superficial sylvian vein.
    id: 'fissure',
    camera: { target: [10, 0, -10], distance: 110, tilt: 0.3 },
    tasks: [
      { id: 'cutSuperficial', check: (c) => cut(c, 'superficial') >= Math.ceil(total(c, 'superficial') * 0.8), progress: (c) => cut(c, 'superficial') / Math.ceil(total(c, 'superficial') * 0.8) },
      { id: 'hemostasis', check: (c) => c.bleeding.activeSources.length === 0 },
      { id: 'clearField', check: (c) => c.bleeding.volume < 1 },
    ],
  },
  {
    // Following the fissure deep leads to the MCA. M1 is the landmark that points medially to the ICA.
    id: 'm1',
    camera: { target: [14, 5, -18], distance: 80, tilt: 0.35 },
    tasks: [
      { id: 'locateM1', check: (c, s) => identified(s, 'M1'), progress: (c, s) => (s.hover.M1 || 0) / IDENTIFY_SECONDS },
      { id: 'dopplerM1', check: (c, s) => !!s.facts['doppler:M1'] },
    ],
  },
  {
    // Tracing M1 medially reaches the ICA bifurcation. Opening the carotid
    // cistern shows the ICA and, medial to it, the optic nerve.
    id: 'ica',
    camera: { target: [-3, 0, -26], distance: 80, tilt: 0.4 },
    tasks: [
      { id: 'cutDeep', check: (c) => cut(c, 'deep') >= total(c, 'deep') - 1, progress: (c) => cut(c, 'deep') / (total(c, 'deep') - 1) },
      { id: 'identifyICA', check: (c, s) => identified(s, 'ICA'), progress: (c, s) => (s.hover.ICA || 0) / IDENTIFY_SECONDS },
      { id: 'identifyOptic', check: (c, s) => identified(s, 'optic'), progress: (c, s) => (s.hover.optic || 0) / IDENTIFY_SECONDS },
    ],
  },
  {
    // The PCom leaves the posterior ICA wall at the neck, and the AChA arises
    // just distal to it. Both must be seen before the neck is freed for the clip.
    id: 'neck',
    camera: { target: [-1, -6, -31], distance: 62, tilt: 0.45 },
    tasks: [
      { id: 'dopplerPCom', check: (c, s) => !!s.facts['doppler:PCom'] },
      { id: 'identifyAChA', check: (c, s) => identified(s, 'AChA'), progress: (c, s) => (s.hover.AChA || 0) / IDENTIFY_SECONDS },
      { id: 'dissectNeck', check: (c) => c.anatomy.adhesions.progress >= 1, progress: (c) => c.anatomy.adhesions.progress },
    ],
  },
  {
    // Blades parallel to the ICA, closing the whole neck, with the PCom and
    // AChA left outside the blades. M5 adds the geometric check of the clip.
    id: 'clip',
    camera: { target: [-1, -6, -31], distance: 58, tilt: 0.45 },
    tasks: [
      { id: 'applyClip', check: (c) => (c.state.clips?.length || 0) > 0 },
      { id: 'neckClosed', check: (c) => !c.state.clipEval || c.state.clipEval.neckClosure >= 0.95 },
      { id: 'noArterialBleed', check: (c) => !c.bleeding.activeSources.some((s) => s.kind === 'arterial') },
    ],
  },
  {
    // After clipping, prove the aneurysm is excluded and the branches are patent.
    id: 'patency',
    camera: { target: [-1, -6, -31], distance: 70, tilt: 0.4 },
    tasks: [
      { id: 'icgAfter', check: (c, s) => afterClip(s, 'icg') },
      { id: 'dopplerPComAfter', check: (c, s) => afterClip(s, 'doppler:PCom') },
      { id: 'dopplerAChAAfter', check: (c, s) => afterClip(s, 'doppler:AChA') },
      { id: 'tempReleased', check: (c) => !c.flow.tempClip },
    ],
  },
];

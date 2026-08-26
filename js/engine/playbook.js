/* ============================================================
   PLAYBOOK — coverages, concepts and the read rules that bind them.
   The point is not football trivia. It is building an ORIENTATION
   LIBRARY: Boyd's second phase is where the loop is actually won or
   lost, and orientation is pattern-matching against stored schemas.
   Every rep here is a schema retrieval under a clock.
   ============================================================ */

export const COVERAGES = {
  C0: {
    id:'C0', label:'COVER 0', short:'0', highs:0, man:true, blitz:true,
    tell:'No deep help. Everybody matched, extra rusher coming.',
    answer:'Ball comes out hot. The blitz IS the tell.',
  },
  C1: {
    id:'C1', label:'COVER 1', short:'1', highs:1, man:true, blitz:false,
    tell:'Single high safety, corners in trail technique, a rat in the hole.',
    answer:'Beat the leverage. Free safety takes away the post.',
  },
  C2: {
    id:'C2', label:'COVER 2', short:'2', highs:2, man:false, blitz:false,
    tell:'Two deep halves, corners squat and jam, five underneath.',
    answer:'Hole shot between corner and safety, or the deep middle.',
  },
  C3: {
    id:'C3', label:'COVER 3', short:'3', highs:1, man:false, blitz:false,
    tell:'Corners bail to thirds, strong safety rolls down. Four under.',
    answer:'Seams and the intermediate hole between the hook defenders.',
  },
  C4: {
    id:'C4', label:'QUARTERS', short:'4', highs:2, man:false, blitz:false,
    tell:'Two high, safeties read #2. Corners deep, hard outside leverage.',
    answer:'Underneath is soft. Take the free grass in front of it.',
  },
  C6: {
    id:'C6', label:'COVER 6', short:'6', highs:2, man:false, blitz:false,
    tell:'Quarters to the field, Cover 2 to the boundary. Split-field.',
    answer:'Attack the seam of the split — the two calls have to talk.',
  },
  TAMPA: {
    id:'TAMPA', label:'TAMPA 2', short:'T2', highs:2, man:false, blitz:false,
    tell:'Cover 2 shell, but the Mike carries the deep middle.',
    answer:'The hole between corner and safety. Middle is closed late.',
  },
  M2: {
    id:'M2', label:'2-MAN', short:'2M', highs:2, man:true, blitz:false,
    tell:'Two deep, man under with trail leverage. Everybody has hips.',
    answer:'Rubs, verticals, anything that stresses trail technique.',
  },
};

export const COVERAGE_IDS = Object.keys(COVERAGES);

/* Pre-snap shells a defense can *show*. Disguise is the whole game:
   what you see at 12 seconds on the play clock is not what you get. */
export const SHELLS = {
  ONE_HIGH: { id:'ONE_HIGH', label:'1-HIGH', from:['C0','C1','C3'] },
  TWO_HIGH: { id:'TWO_HIGH', label:'2-HIGH', from:['C2','C4','C6','TAMPA','M2'] },
};

export const FORMATIONS = {
  TRIPS_RT: { id:'TRIPS_RT', label:'GUN TRIPS RT', slots:{ X:-19, Z:16, Y:11, H:6.5, R:-3 } },
  TREY_LT:  { id:'TREY_LT',  label:'GUN TREY LT',  slots:{ X:19, Z:-16, Y:-11, H:-6.5, R:3 } },
  DOUBLES:  { id:'DOUBLES',  label:'GUN DOUBLES',  slots:{ X:-18, Z:18, Y:9, H:-9, R:-3 } },
  ACE:      { id:'ACE',      label:'PISTOL ACE',   slots:{ X:-20, Z:20, Y:7, H:-7, R:0 } },
  EMPTY:    { id:'EMPTY',    label:'EMPTY BUNCH',  slots:{ X:-20, Z:15, Y:12, H:9, R:-14 } },
};

/* A read: which slot, what route, and which coverages it defeats. */
export const CONCEPTS = [
  {
    id:'mills', name:'MILLS', form:['DOUBLES','ACE'], hot:'MIKE',
    blurb:'Post over dig. The dig drags the safety down, the post runs behind him.',
    reads:[
      { slot:'X', route:'POST',  depth:18, beats:['C2','C4','C6','M2'], why:'Dig holds the safety, post crosses his face.' },
      { slot:'Y', route:'DIG',   depth:14, beats:['C1','C3','TAMPA'],   why:'One-high closes the post; the dig sits in the hole.' },
      { slot:'R', route:'CHECK', depth:3,  beats:['C0'],                why:'Zero pressure — get it out to the back now.' },
    ],
  },
  {
    id:'smash', name:'SMASH', form:['TRIPS_RT','DOUBLES'], hot:'NICKEL',
    blurb:'Hitch under, corner over. A high-low on the flat-side corner.',
    reads:[
      { slot:'Y', route:'CORNER', depth:16, beats:['C2','TAMPA','M2','C6'], why:'Corner squats, ball goes over him under the half safety.' },
      { slot:'Z', route:'HITCH',  depth:6,  beats:['C3','C4','C1'],         why:'Corner bails to depth — take the free five yards.' },
      { slot:'R', route:'CHECK',  depth:2,  beats:['C0'],                   why:'Hot. Zero blitz means the back is the answer.' },
    ],
  },
  {
    id:'verts', name:'FOUR VERTS', form:['TRIPS_RT','EMPTY'], hot:'WILL',
    blurb:'Four vertical stems. Every coverage has a seam somewhere.',
    reads:[
      { slot:'H', route:'BENDER', depth:20, beats:['C3','TAMPA'],   why:'Bend the seam into the vacated middle behind the hooks.' },
      { slot:'X', route:'GO',     depth:22, beats:['C0','C1','M2'], why:'Isolation vertical — win outside with no help over top.' },
      { slot:'Y', route:'DIVIDE', depth:12, beats:['C2','C4','C6'], why:'Two high: #3 divides the safeties and sits at 12.' },
    ],
  },
  {
    id:'mesh', name:'MESH', form:['DOUBLES','EMPTY','TREY_LT'], hot:'SAM',
    blurb:'Crossers rub at five yards. Man dies on the mesh point.',
    reads:[
      { slot:'H', route:'RUB',  depth:5,  beats:['C0','C1','M2'],           why:'Man coverage collides on the mesh. Throw the runner open.' },
      { slot:'Y', route:'SIT',  depth:7,  beats:['C2','C3','C4','C6','TAMPA'], why:'Zone: the crosser stops in the window, not through it.' },
      { slot:'Z', route:'WHEEL',depth:13, beats:[],                          why:'Late shot if the flat defender chases the mesh.' },
    ],
  },
  {
    id:'flood', name:'FLOOD', form:['TRIPS_RT','TREY_LT'], hot:'MIKE',
    blurb:'Three levels on one side. Somebody has to be wrong.',
    reads:[
      { slot:'Y', route:'SAIL', depth:13, beats:['C3','TAMPA','C1'], why:'The curl-flat defender cannot cover 5 and 15 at once.' },
      { slot:'H', route:'FLAT', depth:3,  beats:['C2','C4','C6'],    why:'Two-high with a squat corner — the flat is free.' },
      { slot:'Z', route:'GO',   depth:20, beats:['C0','M2'],         why:'Clear route becomes the throw when there is no help.' },
    ],
  },
  {
    id:'stick', name:'STICK', form:['TRIPS_RT','ACE'], hot:'NICKEL',
    blurb:'Quick-game triangle. Snap decision, no hitch in the delivery.',
    reads:[
      { slot:'Y', route:'STICK', depth:6, beats:['C2','C3','C4','C6','TAMPA'], why:'Sit down in the grass behind the flat defender.' },
      { slot:'H', route:'ARROW', depth:2, beats:['C0','C1','M2'],              why:'Man: run away from leverage into the flat.' },
      { slot:'X', route:'FADE',  depth:18,beats:[],                            why:'One-on-one shot if the corner presses with no help.' },
    ],
  },
  {
    id:'dagger', name:'DAGGER', form:['DOUBLES','TREY_LT'], hot:'WILL',
    blurb:'Seam clears the hook, dig runs into the space it made.',
    reads:[
      { slot:'Y', route:'DIG',  depth:15, beats:['C1','C3','TAMPA'], why:'The vertical pulls the hook defender; the dig replaces him.' },
      { slot:'H', route:'SEAM', depth:19, beats:['C0','M2'],         why:'No middle help — the seam is a straight-line win.' },
      { slot:'Z', route:'CURL', depth:11, beats:['C2','C4','C6'],    why:'Two high: work back to the curl before the safety drives.' },
    ],
  },
  {
    id:'slantflat', name:'SLANT-FLAT', form:['DOUBLES','ACE','TREY_LT'], hot:'SAM',
    blurb:'The oldest answer in football. Leverage tells you which one.',
    reads:[
      { slot:'Z', route:'SLANT', depth:6, beats:['C0','C1','M2'],               why:'Outside leverage in man — cut under it.' },
      { slot:'H', route:'FLAT',  depth:3, beats:['C2','C3','C4','C6','TAMPA'],  why:'Zone drop opens the flat before the corner can drive.' },
      { slot:'X', route:'BACK',  depth:8, beats:[],                             why:'Backside answer if the coverage rotates away.' },
    ],
  },
];

/* Resolve the correct read for a live rep. */
export function correctRead(concept, coverageId, blitz){
  if(blitz){
    const hot = concept.reads.find(r => r.beats.includes('C0')) ||
                concept.reads.find(r => r.depth <= 6);
    if(hot) return { read:hot, reason:'PRESSURE — hot throw beats the free rusher.' };
  }
  const hit = concept.reads.find(r => r.beats.includes(coverageId));
  if(hit) return { read:hit, reason:hit.why };
  // no designed beater: shortest route is the responsible answer
  const safe = concept.reads.slice().sort((a,b) => a.depth - b.depth)[0];
  return { read:safe, reason:'No designed answer versus this look — take the safe throw.' };
}

export function shellOf(coverageId){
  return SHELLS.ONE_HIGH.from.includes(coverageId) ? SHELLS.ONE_HIGH : SHELLS.TWO_HIGH;
}

/* Coverages that share a pre-snap shell — the pool a disguise can hide in. */
export function shellSiblings(coverageId){
  return shellOf(coverageId).from.filter(id => id !== coverageId);
}

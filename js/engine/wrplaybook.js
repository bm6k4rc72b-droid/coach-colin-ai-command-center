/* ============================================================
   RECEIVER PLAYBOOK
   A receiver does not read the defensive call. He reads THREE things,
   in this order, in about four tenths of a second:

     1. leverage   — where is the defender's body relative to mine
     2. technique  — press or off, and which way did he open
     3. the top    — is the middle of the field open or closed

   Those three collapse into five "looks", and every option route in
   football is a rule that maps a look onto a conversion. That mapping
   is what this file encodes, and what the drill trains.

   The opponent clock here is not the coverage's pass-off — it is the
   DB's HIP FLIP. You win by declaring your break before he can turn
   and drive. Same Δ-loop, different denominator.
   ============================================================ */
import { pick, rand, clamp, jitter } from '../core/rng.js';
import { buildDefense } from './defense.js';

export const LOOKS = {
  PRESS_IN: {
    id:'PRESS_IN', label:'PRESS · INSIDE', short:'P-IN', family:'man',
    tell:'He is on you at the line with his inside foot up, taking away the slant.',
    answer:'He has given you the sideline. Take what he is not defending.',
    cover:['C1','C0'], depth:1.0, shade:-1,
  },
  PRESS_OUT: {
    id:'PRESS_OUT', label:'PRESS · OUTSIDE', short:'P-OUT', family:'man',
    tell:'Press with outside leverage, funnelling you back to the help inside.',
    answer:'Beat him underneath. Everything inside is a free release.',
    cover:['C1','C0'], depth:1.0, shade:1,
  },
  OFF_MAN: {
    id:'OFF_MAN', label:'OFF MAN', short:'OFF', family:'man',
    tell:'Seven yards off, square, eyes on you and not the quarterback.',
    answer:'He has to honour the vertical. Everything short is uncontested.',
    cover:['C1','M2'], depth:6.8, shade:0,
  },
  ZONE_OPEN: {
    id:'ZONE_OPEN', label:'ZONE · MOF OPEN', short:'Z-OPEN', family:'zone',
    tell:'Two-high. Corner is squatting with his eyes in the backfield.',
    answer:'The middle is split between two safeties. Work the seam of it.',
    cover:['C2','C4','C6'], depth:5.2, shade:1,
  },
  ZONE_CLOSED: {
    id:'ZONE_CLOSED', label:'ZONE · MOF CLOSED', short:'Z-SHUT', family:'zone',
    tell:'Single high. Corner opens and bails to his third at the snap.',
    answer:'Nobody is left in the flat and the hole behind the hooks is live.',
    cover:['C3'], depth:6.6, shade:0,
  },
};

export const LOOK_IDS = Object.keys(LOOKS);

/* Where the receiver himself lines up. This is the camera position —
   the whole rep is rendered from this spot at eye height. */
export const SPOTS = {
  Z_FIELD:  { id:'Z_FIELD',  label:'Z · FIELD RIGHT',   x: 17,  side: 1, db:'CBR', form:'GUN TRIPS RT' },
  X_ISO:    { id:'X_ISO',    label:'X · ISO LEFT',      x:-18,  side:-1, db:'CBL', form:'GUN DOUBLES' },
  SLOT_RT:  { id:'SLOT_RT',  label:'SLOT RIGHT',        x: 9.5, side: 1, db:'NCK', form:'GUN DOUBLES' },
  SLOT_LT:  { id:'SLOT_LT',  label:'SLOT LEFT',         x:-9.5, side:-1, db:'NCK', form:'GUN TREY LT' },
  BUNCH:    { id:'BUNCH',    label:'BUNCH POINT RIGHT', x: 12,  side: 1, db:'CBR', form:'EMPTY BUNCH' },
};
export const SPOT_IDS = Object.keys(SPOTS);

/* Option routes. Every conversion carries the looks it answers, and no
   look appears twice inside one route — there is exactly one right
   answer per picture, which is the only way the timing means anything. */
export const WR_ROUTES = [
  {
    id:'choice', name:'CHOICE', stem:12,
    blurb:'Pure option. Stem to twelve and take whatever his leverage refuses to defend.',
    conversions:[
      { key:'IN',    label:'BREAK IN',   depth:10, dir:'in', beats:['PRESS_OUT','ZONE_OPEN'],  why:'Outside leverage, or two safeties with soft middle — cross his face inside.' },
      { key:'OUT',   label:'BREAK OUT',  depth:12, dir:'out', beats:['PRESS_IN','ZONE_CLOSED'], why:'He is inside you and one-high has nobody left in the flat. Take the sideline.' },
      { key:'SLANT', label:'SLANT NOW',  depth:4,  dir:'in', beats:['OFF_MAN'],                why:'Six yards of cushion is a gift. Do not run to him — take it underneath.' },
    ],
  },
  {
    id:'stopgo', name:'STOP-GO', stem:14,
    blurb:'Double move. Sell the stop with your eyes and hands, then decide whether to take it.',
    conversions:[
      { key:'STOP',  label:'TAKE THE STOP', depth:7,  dir:'stop', beats:['OFF_MAN','ZONE_OPEN'], why:'Cushion or a squatting corner — the stop is free, do not get greedy.' },
      { key:'GO',    label:'RUN THROUGH',   depth:20, dir:'up', beats:['PRESS_IN','PRESS_OUT'],why:'Pressed with no cap over the top. Sell the stop and run past him.' },
      { key:'SLANT', label:'SLANT UNDER',   depth:4,  dir:'in', beats:['ZONE_CLOSED'],         why:'He bails to his third at the snap. Cut it off underneath him.' },
    ],
  },
  {
    id:'seam', name:'SEAM', stem:18,
    blurb:'Vertical stem. Where it finishes depends entirely on the top of the coverage.',
    conversions:[
      { key:'BEND',   label:'BEND IT',   depth:18, dir:'in', beats:['ZONE_CLOSED','OFF_MAN'], why:'One-high or a trailing man — bend it behind him into the vacated middle.' },
      { key:'DIVIDE', label:'DIVIDE',    depth:14, dir:'stop', beats:['ZONE_OPEN','PRESS_IN'],  why:'Two high: split the safeties and sit down at fourteen between them.' },
      { key:'GO',     label:'STRAIGHT',  depth:20, dir:'up', beats:['PRESS_OUT'],             why:'He widened you and there is no cap. Release inside and run the line.' },
    ],
  },
  {
    id:'dig', name:'DIG', stem:14,
    blurb:'In-breaker. The depth you settle at is a function of who is over the top.',
    conversions:[
      { key:'SIT',   label:'SIT AT 14',   depth:14, dir:'stop', beats:['ZONE_CLOSED'],           why:'One-high zone: the hole behind the hook defenders is where this lives.' },
      { key:'CLIMB', label:'KEEP CLIMBING',depth:18,dir:'in', beats:['ZONE_OPEN','PRESS_OUT'], why:'Two safeties are deep and wide. Climb across the face of the near one.' },
      { key:'SPEED', label:'SPEED CUT',   depth:12, dir:'in', beats:['PRESS_IN','OFF_MAN'],    why:'Man coverage: cut it off flat and hard, beat the trail before he recovers.' },
    ],
  },
  {
    id:'comeback', name:'COMEBACK', stem:16,
    blurb:'Push vertical, then come back to the sideline. Only if he has turned and run.',
    conversions:[
      { key:'COMEBACK', label:'COME BACK', depth:16, dir:'out', beats:['OFF_MAN','ZONE_CLOSED'], why:'He has opened and turned. Snap it off at sixteen back to the boundary.' },
      { key:'FADE',     label:'FADE',      depth:20, dir:'up', beats:['PRESS_IN','PRESS_OUT'],  why:'Pressed with no half-safety on your side. Stack him and run the fade.' },
      { key:'HITCH',    label:'HITCH UP',  depth:6,  dir:'stop', beats:['ZONE_OPEN'],             why:'Squat corner with a half over the top — sit down in front of him.' },
    ],
  },
  {
    id:'pivot', name:'PIVOT', stem:6,
    blurb:'Short-area separator. The pivot goes away from whatever he showed you.',
    conversions:[
      { key:'PIVOT_OUT', label:'PIVOT OUT', depth:6, dir:'out', beats:['PRESS_IN','ZONE_CLOSED'], why:'He is inside, or the flat is vacated by the bail. Pivot to daylight outside.' },
      { key:'PIVOT_IN',  label:'PIVOT IN',  depth:5, dir:'in', beats:['PRESS_OUT','OFF_MAN'],    why:'He has outside leverage or depth. Pivot back inside across his body.' },
      { key:'SETTLE',    label:'SETTLE',    depth:7, dir:'stop', beats:['ZONE_OPEN'],               why:'Zone: nobody is chasing you. Stop in the window and show your numbers.' },
    ],
  },
  {
    id:'glance', name:'GLANCE', stem:16,
    blurb:'Inside vertical release. The finish is a post or a glance depending on the top.',
    conversions:[
      { key:'GLANCE', label:'GLANCE',   depth:14, dir:'in', beats:['ZONE_CLOSED','PRESS_IN'], why:'Single high: flatten it under the safety before he can get over the top.' },
      { key:'POST',   label:'POST',     depth:18, dir:'in', beats:['ZONE_OPEN','OFF_MAN'],    why:'Two high: attack the seam between them, or run past the trail technique.' },
      { key:'SLANT',  label:'SLANT',    depth:4,  dir:'in', beats:['PRESS_OUT'],              why:'He gave you the whole inside at the line. Take it now, do not stem.' },
    ],
  },
  {
    id:'spacing', name:'SPACING', stem:6,
    blurb:'Quick game. Nothing about this route survives hesitation.',
    conversions:[
      { key:'HITCH', label:'HITCH',  depth:6,  dir:'stop', beats:['ZONE_OPEN','ZONE_CLOSED'], why:'Zone either way — find the window between the defenders and stop in it.' },
      { key:'FADE',  label:'FADE',   depth:20, dir:'up', beats:['PRESS_IN'],                why:'Pressed inside with no help outside. One-on-one down the boundary.' },
      { key:'OUT',   label:'SPEED OUT',depth:6,dir:'out', beats:['PRESS_OUT','OFF_MAN'],     why:'Man coverage with outside leverage or cushion — break flat to the sideline.' },
    ],
  },
];

/** The right answer for one rep. Pressure overrides to the hot conversion,
 *  exactly as a sight adjustment does on the field. */
export function correctConversion(route, lookId, pressure){
  if(pressure){
    const hot = route.conversions.slice().sort((a,b) => a.depth - b.depth)[0];
    return { conv:hot, reason:'PRESSURE — the ball is coming out now. Sight-adjust to the hot.' };
  }
  const hit = route.conversions.find(c => c.beats.includes(lookId));
  if(hit) return { conv:hit, reason:hit.why };
  const safe = route.conversions.slice().sort((a,b) => a.depth - b.depth)[0];
  return { conv:safe, reason:'No rule for this look — take the shortest, most certain answer.' };
}

/** How long the covering DB needs to flip his hips and drive on the break.
 *  Beat this and you have separation; miss it and he is in your hip pocket. */
export function dbWindowMs(level = 1, stress = 2){
  const base = 2450 - (clamp(level, 1, 10) - 1) * 135;   // 2450 → 1235
  return Math.round(jitter(base - (stress - 2) * 120, 110));
}

/* ------------------------------------------------------------------ */

/**
 * Build the picture for one receiver rep, seen from the receiver's spot.
 * Returns the eleven defenders plus which of them DECLARES the look —
 * the man the athlete's eyes have to find first.
 */
export function buildWrPicture({ look, spot, pressure = false, level = 1 }){
  const L = LOOKS[look];
  const coverage = pick(L.cover);
  const def = buildDefense({
    coverage,
    blitz: pressure || coverage === 'C0',
    strength: spot.side,
  });

  // Re-align the man covering this receiver so the leverage is the tell.
  const cb = def.men.find(m => m.id === spot.db);
  if(cb){
    const shadeX = spot.x + L.shade * spot.side * 1.05;
    cb.show = { x:jitter(shadeX, 0.18), y:jitter(L.depth, 0.14) };
    cb.rot  = { x:shadeX, y:L.depth + (L.family === 'man' ? 0.4 : 1.6) };
    cb.end  = dbEnd(L, spot);
    cb.covering = true;
  }

  // Who gives it away, and therefore where the eyes have to go first.
  let declareId;
  if(L.family === 'man') declareId = spot.db;
  else declareId = pressure ? (def.men.find(m => m.rusher)?.id || 'NCK')
                            : (spot.side > 0 ? 'SS' : 'FS');
  const declare = def.men.find(m => m.id === declareId) || cb || def.men[0];

  return {
    ...def,
    look, lookMeta:L, coverage, pressure,
    spot, declare, covering:cb,
  };
}

function dbEnd(L, spot){
  const s = spot.side;
  switch(L.id){
    case 'PRESS_IN':  return { x:spot.x - s * 2.2, y:12 };   // trails inside, runs with
    case 'PRESS_OUT': return { x:spot.x + s * 2.6, y:12 };   // rides the outside hip
    case 'OFF_MAN':   return { x:spot.x - s * 0.8, y:13 };   // opens and runs
    case 'ZONE_OPEN': return { x:spot.x + s * 3.5, y:4.5 };  // squats and widens
    case 'ZONE_CLOSED':return{ x:spot.x + s * 1.5, y:17 };   // bails to the third
    default:          return { x:spot.x, y:10 };
  }
}

/** Camera preset for a rep: the receiver's own spot on the line, looking
 *  downfield through a wide field of view. It sits a little above a true
 *  eyeline — this is a projection, not a helmet cam, and depth has to stay
 *  legible — but the position and the heading are his, which is what makes
 *  the safety something you have to turn your head to find. */
export function wrCamera(spot){
  return {
    x: spot.x, y: -1.2, h: 4.2,
    focal: 0.44, horizon: 0.30, near: 1.1,
    baseYaw: -spot.side * 8,        // head already cheated slightly in toward the ball
    yawLimit: 82,
    pocket: false,
  };
}

/** Recognition descriptor consumed by the shared flash-recognition drill. */
export const wrRecognition = {
  ids: LOOK_IDS,
  question: 'WHAT DID HE GIVE YOU?',
  meta: id => ({ label:LOOKS[id].label, short:LOOKS[id].short, tell:LOOKS[id].tell }),
  build: (id, level) => {
    const spot = SPOTS[pick(SPOT_IDS)];
    return { picture: buildWrPicture({ look:id, spot, pressure:Math.random() < 0.14, level }), cam:wrCamera(spot) };
  },
};

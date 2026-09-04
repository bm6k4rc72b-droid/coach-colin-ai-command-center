/**
 * The demo player pool.
 *
 * These are invented players on real clubs. Attributing fabricated snap
 * counts, injury designations and prop numbers to actual athletes would make
 * the sample data read as reporting, which it is not — so the seed carries
 * made-up names and the app labels the slate DEMO wherever it is shown. Swap
 * this module for a real provider feed and nothing downstream changes: the
 * shape is what the engines consume.
 *
 * Headshots are deliberately absent. The roster row renders an initials
 * avatar, so there is no image pipeline to point at anyone's likeness.
 *
 * @module exposure/data/players
 */

import { opponentFor } from './games.js';

/**
 * Opponent difficulty by position, 1 = toughest defence in the league,
 * 32 = softest. Ordered `[QB, RB, WR, TE]`.
 *
 * @type {Record<string, number[]>}
 */
export const DEF_VS_POS = {
  KC: [8, 12, 6, 14],
  LAC: [15, 4, 19, 9],
  BUF: [11, 9, 13, 22],
  NYJ: [6, 20, 3, 17],
  PHI: [4, 7, 10, 5],
  DAL: [21, 26, 16, 24],
  DET: [24, 29, 27, 20],
  GB: [13, 18, 12, 11],
  SF: [5, 2, 8, 7],
  SEA: [26, 22, 25, 28],
  BAL: [9, 5, 11, 13],
  CIN: [23, 27, 21, 26],
  MIA: [18, 31, 23, 30],
  HOU: [12, 14, 15, 10],
  MIN: [16, 10, 18, 19],
  TB: [28, 24, 29, 25],
};

/**
 * Raw player seed. Every stat is a per-game demo figure.
 *
 * `opp` fields are not stored — the opponent comes from the slate, so the
 * week picker genuinely changes the matchup.
 *
 * @type {Array<object>}
 */
const SEED = [
  // ---- Quarterbacks -------------------------------------------------------
  {
    id: 'qb-vance', first: 'Dorian', last: 'Vance', pos: 'QB', team: 'KC',
    injury: { status: 'ACTIVE', note: 'Full participant all week.' },
    proj: { ppr: 21.4, half: 21.4, std: 21.4 },
    opportunity: {
      snapShare: 1, dropbacks: 39, passAttempts: 35, rushAttempts: 4.1,
      rzDropbacks: 5.2, rzTouches: 1.1, adot: 8.4, playAction: 0.31,
    },
    receipts: [
      'Empty-set usage climbed to 22% of dropbacks late last season; the opponent blitzes empty at the second-highest rate on the slate.',
      'Under center play-action is his cleanest pocket — watch whether the tackle rotation lets them keep two-back looks in the opener.',
      'The opponent plays two-high on early downs, which historically pushes him to the checkdown and drags his depth of target down a yard.',
      'His scramble rate spikes when the pocket collapses inside; interior pressure, not edge pressure, is the number that moves his rushing floor.',
    ],
    news: [{ tag: 'PRACTICE', text: 'Full participant Wednesday through Friday.' }],
  },
  {
    id: 'qb-ferrell', first: 'Marcus', last: 'Ferrell', pos: 'QB', team: 'BUF',
    injury: { status: 'QUESTIONABLE', note: 'Right thumb; limited Wednesday, full Friday.' },
    proj: { ppr: 19.8, half: 19.8, std: 19.8 },
    opportunity: {
      snapShare: 1, dropbacks: 36, passAttempts: 32, rushAttempts: 6.8,
      rzDropbacks: 4.4, rzTouches: 2.3, adot: 9.1, playAction: 0.24,
    },
    receipts: [
      'Designed quarterback runs inside the ten are the whole reason his ceiling is what it is; the opponent has been gap-sound against them.',
      'A limited Wednesday for a throwing-hand thumb is the one flag worth tracking through Sunday inactives.',
      'He sees more single-high than any starter on this slate, which is why his deep attempts run hot even in bad weather.',
      'The opponent rushes four and drops seven; expect his time to throw to stretch and his sack number to stay low.',
    ],
    news: [{ tag: 'INJURY', text: 'Thumb on the throwing hand; listed questionable.' }],
  },
  {
    id: 'qb-trent', first: 'Elias', last: 'Trent', pos: 'QB', team: 'PHI',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 20.1, half: 20.1, std: 20.1 },
    opportunity: {
      snapShare: 1, dropbacks: 38, passAttempts: 34, rushAttempts: 3.2,
      rzDropbacks: 5.8, rzTouches: 1.6, adot: 7.9, playAction: 0.36,
    },
    receipts: [
      'Highest play-action rate in this game; the opponent is a heavy zone-match team and gets hurt by crossers off run fakes.',
      'Two of his three deep threats run from the slot, so watch the nickel matchup rather than the boundary corner.',
      'Red-zone dropbacks are elite but the club runs it inside the five, which caps the passing touchdown rate.',
    ],
    news: [],
  },
  {
    id: 'qb-rasmussen', first: 'Cole', last: 'Rasmussen', pos: 'QB', team: 'DET',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 22.6, half: 22.6, std: 22.6 },
    opportunity: {
      snapShare: 1, dropbacks: 41, passAttempts: 37, rushAttempts: 2.4,
      rzDropbacks: 6.1, rzTouches: 0.7, adot: 9.6, playAction: 0.28,
    },
    receipts: [
      'The softest secondary on the board and the highest implied total in the window — the environment is doing most of the work here.',
      'His club trails in script more often than the record suggests, and pass rate over expectation is positive in every game state.',
      'Watch the left guard: interior pressure is the one thing that has knocked his completion rate down more than two points.',
    ],
    news: [{ tag: 'NOTE', text: 'Highest implied team total on the demo slate.' }],
  },
  {
    id: 'qb-boothe', first: 'Isaiah', last: 'Boothe', pos: 'QB', team: 'BAL',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 18.9, half: 18.9, std: 18.9 },
    opportunity: {
      snapShare: 1, dropbacks: 33, passAttempts: 29, rushAttempts: 7.4,
      rzDropbacks: 4.0, rzTouches: 2.6, adot: 8.8, playAction: 0.33,
    },
    receipts: [
      'Rushing volume is the floor, and this opponent is bottom-third against quarterback keepers on the goal line.',
      'The club is run-first in neutral script, so his passing ceiling needs a negative game script to arrive.',
      'He throws into the boundary on third down more than anyone here; the opponent leaves its second corner on an island there.',
    ],
    news: [],
  },

  // ---- Running backs ------------------------------------------------------
  {
    id: 'rb-kemp', first: 'Rashad', last: 'Kemp', pos: 'RB', team: 'DET',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 19.7, half: 17.4, std: 15.1 },
    opportunity: {
      snapShare: 0.78, routes: 24, targets: 4.6, targetShare: 0.14,
      rushShare: 0.68, carries: 17.2, rzTouches: 3.9, yardsBeforeContact: 2.1,
    },
    receipts: [
      'He is the passing-down back as well as the early-down back, which is why his floor holds even when the club is ahead.',
      'Three-nine red-zone touches a game is the top of this slate; the opponent has surrendered the second-most rushing scores inside the ten.',
      'Watch the second-half snap split — the change-of-pace back saw more work late in two of the last four demo games.',
      'The offensive line pulls its guards on outside zone; if the opponent sets a hard edge, his yards before contact fall off a cliff.',
    ],
    news: [{ tag: 'USAGE', text: 'Took every third-down snap in the final tune-up.' }],
  },
  {
    id: 'rb-doss', first: 'Amari', last: 'Doss', pos: 'RB', team: 'SF',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 17.9, half: 16.0, std: 14.1 },
    opportunity: {
      snapShare: 0.71, routes: 19, targets: 3.4, targetShare: 0.11,
      rushShare: 0.74, carries: 18.6, rzTouches: 3.2, yardsBeforeContact: 2.6,
    },
    receipts: [
      'Wide-zone scheme with the best yards-before-contact number in the pool; the volume is real even in a bad matchup.',
      'The opponent is the toughest run defence on the board, which is the one argument against him this week.',
      'His club runs a two-back rotation near the goal line, so the touchdown share is less clean than the carry share suggests.',
    ],
    news: [],
  },
  {
    id: 'rb-whitlock', first: 'Bryce', last: 'Whitlock', pos: 'RB', team: 'PHI',
    injury: { status: 'QUESTIONABLE', note: 'Ankle; limited all week.' },
    proj: { ppr: 13.2, half: 11.9, std: 10.6 },
    opportunity: {
      snapShare: 0.55, routes: 14, targets: 2.6, targetShare: 0.08,
      rushShare: 0.52, carries: 12.4, rzTouches: 2.1, yardsBeforeContact: 1.8,
    },
    receipts: [
      'A limited-all-week ankle for a back whose value is contact balance is a real downgrade, not a maintenance day.',
      'If he is short of full, the backup has taken the two-minute snaps in every practice period open to reporters.',
      'The club still leads the slate in red-zone rush rate, so even a reduced role keeps a touchdown path open.',
    ],
    news: [{ tag: 'INJURY', text: 'Ankle; limited Wednesday, Thursday and Friday.' }],
  },
  {
    id: 'rb-ruiz', first: 'Devon', last: 'Ruiz', pos: 'RB', team: 'BUF',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 14.8, half: 13.1, std: 11.4 },
    opportunity: {
      snapShare: 0.62, routes: 21, targets: 4.1, targetShare: 0.13,
      rushShare: 0.58, carries: 13.8, rzTouches: 1.4, yardsBeforeContact: 1.9,
    },
    receipts: [
      'The quarterback takes the goal-line work here, which is what keeps a 58% rush share from turning into touchdowns.',
      'Receiving usage is the reason to start him in a full-point league and the reason to sit him in standard.',
      'The opponent blitzes at a high rate, and his pass-protection grade is the best among the club’s backs — that keeps him on the field.',
    ],
    news: [],
  },
  {
    id: 'rb-okafor', first: 'Tyrell', last: 'Okafor', pos: 'RB', team: 'MIN',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 15.6, half: 14.0, std: 12.4 },
    opportunity: {
      snapShare: 0.68, routes: 17, targets: 3.1, targetShare: 0.10,
      rushShare: 0.71, carries: 16.1, rzTouches: 2.8, yardsBeforeContact: 2.2,
    },
    receipts: [
      'Workhorse carry share against a middling front, in a game with the lowest total in the window.',
      'The club is a heavy 12-personnel team, which keeps a light box in front of him more often than the defence would like.',
      'Two-minute work belongs to the third-down back, capping his ceiling if the game gets away.',
    ],
    news: [],
  },
  {
    id: 'rb-brath', first: 'Jonah', last: 'Brath', pos: 'RB', team: 'MIA',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 16.4, half: 14.6, std: 12.8 },
    opportunity: {
      snapShare: 0.74, routes: 23, targets: 4.4, targetShare: 0.15,
      rushShare: 0.63, carries: 14.9, rzTouches: 2.4, yardsBeforeContact: 2.4,
    },
    receipts: [
      'The softest run matchup on the slate; the opponent has been gashed on outside zone in both directions.',
      'He runs a genuine route tree rather than checkdowns, so his target quality survives a positive game script.',
      'Watch the snap count in the third quarter — the club has rested him early in blowouts.',
    ],
    news: [{ tag: 'MATCHUP', text: 'Opponent ranks 31st against the run in the demo set.' }],
  },
  {
    id: 'rb-sowell', first: 'Malik', last: 'Sowell', pos: 'RB', team: 'CIN',
    injury: { status: 'DOUBTFUL', note: 'Hamstring; did not practise Thursday or Friday.' },
    proj: { ppr: 8.1, half: 7.2, std: 6.3 },
    opportunity: {
      snapShare: 0.34, routes: 9, targets: 1.8, targetShare: 0.06,
      rushShare: 0.31, carries: 7.2, rzTouches: 0.9, yardsBeforeContact: 1.6,
    },
    receipts: [
      'Two missed practices with a hamstring is the profile that turns into a game-day inactive more often than not.',
      'Even at full health the backfield is a committee, and the early-down share has been trending the wrong way.',
      'If he is out, the passing-down back inherits the third-down role rather than the carries.',
    ],
    news: [{ tag: 'INJURY', text: 'Hamstring; two missed practices, listed doubtful.' }],
  },
  {
    id: 'rb-roby', first: 'Quentin', last: 'Roby', pos: 'RB', team: 'LAC',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 12.9, half: 11.4, std: 9.9 },
    opportunity: {
      snapShare: 0.57, routes: 16, targets: 3.0, targetShare: 0.10,
      rushShare: 0.55, carries: 12.8, rzTouches: 1.7, yardsBeforeContact: 1.7,
    },
    receipts: [
      'A committee back in a road game the market expects his club to trail; the carry projection is script-dependent.',
      'He is the club’s best screen back, which is the one usage that survives a negative script.',
      'The opponent is stout on early downs but soft on checkdowns to the flat.',
    ],
    news: [],
  },

  // ---- Wide receivers -----------------------------------------------------
  {
    id: 'wr-lund', first: 'Xavier', last: 'Lund', pos: 'WR', team: 'KC',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 18.6, half: 16.1, std: 13.6 },
    opportunity: {
      snapShare: 0.92, routes: 36, targets: 9.4, targetShare: 0.27,
      rushShare: 0.01, carries: 0.3, rzTouches: 1.6, adot: 11.2, yprr: 2.31,
    },
    receipts: [
      'A 27% target share on 36 routes is the alpha profile in this pool, and it holds in every game state.',
      'The opponent travels its top corner, so the question is how often the club moves him into the slot to avoid it.',
      'His depth of target rises about two yards when the club is trailing, which is where the ceiling games come from.',
      'Watch the first two red-zone snaps: he ran a fade on both in the final tune-up.',
    ],
    news: [{ tag: 'USAGE', text: 'Led the club in routes run in the tune-up.' }],
  },
  {
    id: 'wr-monroe', first: 'Silas', last: 'Monroe', pos: 'WR', team: 'BUF',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 16.9, half: 14.6, std: 12.3 },
    opportunity: {
      snapShare: 0.88, routes: 33, targets: 8.1, targetShare: 0.24,
      rushShare: 0.02, carries: 0.6, rzTouches: 1.3, adot: 12.8, yprr: 2.07,
    },
    receipts: [
      'Deep-shot volume is the profile; the opponent plays the most single-high on the slate, which is the coverage he beats.',
      'His quarterback’s thumb designation matters more to him than to the rest of the pass game — the throws he wins are the long ones.',
      'He is the club’s red-zone jump-ball target but sees fewer than two such looks a game.',
    ],
    news: [],
  },
  {
    id: 'wr-callender', first: 'Dre', last: 'Callender', pos: 'WR', team: 'PHI',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 17.8, half: 15.4, std: 13.0 },
    opportunity: {
      snapShare: 0.90, routes: 35, targets: 8.8, targetShare: 0.26,
      rushShare: 0.03, carries: 0.8, rzTouches: 1.9, adot: 9.4, yprr: 2.18,
    },
    receipts: [
      'He wins from the slot, and the opponent’s nickel is the softest coverage assignment in this game.',
      'Manufactured touches — jet sweeps and screens — add about a point and a half to his floor in a full-point league.',
      'Red-zone target share leads the club, which is the separation from the other high-volume receivers here.',
    ],
    news: [],
  },
  {
    id: 'wr-barrantes', first: 'Nico', last: 'Barrantes', pos: 'WR', team: 'SF',
    injury: { status: 'QUESTIONABLE', note: 'Shoulder; limited Thursday.' },
    proj: { ppr: 14.1, half: 12.3, std: 10.5 },
    opportunity: {
      snapShare: 0.81, routes: 29, targets: 6.9, targetShare: 0.21,
      rushShare: 0.04, carries: 1.1, rzTouches: 1.1, adot: 10.6, yprr: 1.88,
    },
    receipts: [
      'A shoulder for a receiver whose game is contested catches is worth watching through pre-game warmups.',
      'The club’s run rate is the highest here, which caps route volume even when he is healthy.',
      'He is the designed-touch receiver, so a reduced route count does not zero his floor.',
    ],
    news: [{ tag: 'INJURY', text: 'Shoulder; limited Thursday, full Friday.' }],
  },
  {
    id: 'wr-vidal', first: 'Terrance', last: 'Vidal', pos: 'WR', team: 'CIN',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 15.7, half: 13.6, std: 11.5 },
    opportunity: {
      snapShare: 0.86, routes: 32, targets: 7.8, targetShare: 0.23,
      rushShare: 0.01, carries: 0.2, rzTouches: 1.2, adot: 13.4, yprr: 1.96,
    },
    receipts: [
      'Highest depth of target among the volume receivers, which makes him the most variance-heavy start in the pool.',
      'With the lead back doubtful, the club’s neutral pass rate should climb, and he is the beneficiary.',
      'The opponent’s safety help shades his side on early downs; the work comes on third down.',
    ],
    news: [{ tag: 'NOTE', text: 'Route share rises when the backfield is short-handed.' }],
  },
  {
    id: 'wr-oyelaran', first: 'Kai', last: 'Oyelaran', pos: 'WR', team: 'MIA',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 16.2, half: 14.1, std: 12.0 },
    opportunity: {
      snapShare: 0.89, routes: 34, targets: 8.3, targetShare: 0.25,
      rushShare: 0.05, carries: 1.4, rzTouches: 1.4, adot: 11.9, yprr: 2.11,
    },
    receipts: [
      'Motion at the snap on more than half his routes, which is how the club gets him off the line clean against press.',
      'The opponent is a heavy man-coverage team and has been beaten by exactly this usage.',
      'Jet-sweep carries are real and count toward his rushing prop, which is priced low enough to matter.',
    ],
    news: [],
  },
  {
    id: 'wr-petit', first: 'Jamar', last: 'Petit', pos: 'WR', team: 'SEA',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 13.4, half: 11.6, std: 9.8 },
    opportunity: {
      snapShare: 0.83, routes: 30, targets: 6.4, targetShare: 0.20,
      rushShare: 0.02, carries: 0.4, rzTouches: 0.9, adot: 10.1, yprr: 1.74,
    },
    receipts: [
      'Road game against the toughest secondary on the slate; the volume is there but the efficiency has to fight for it.',
      'He runs most of his routes against the opponent’s second corner, which is the softer half of that matchup.',
      'The club leans on him on third and long, so a negative script actually helps his line.',
    ],
    news: [],
  },
  {
    id: 'wr-estes', first: 'Ruben', last: 'Estes', pos: 'WR', team: 'DAL',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 14.9, half: 12.9, std: 10.9 },
    opportunity: {
      snapShare: 0.85, routes: 31, targets: 7.2, targetShare: 0.22,
      rushShare: 0.01, carries: 0.3, rzTouches: 1.5, adot: 10.8, yprr: 1.92,
    },
    receipts: [
      'The club’s red-zone target leader, and the game carries one of the two highest totals in the window.',
      'He sees bracket coverage on early downs; the club answers with stacked releases, which is the tell to watch.',
      'His snap share dips in heavy sets, so a run-script blowout is the way this goes wrong.',
    ],
    news: [],
  },
  {
    id: 'wr-fiedler', first: 'Andre', last: 'Fiedler', pos: 'WR', team: 'TB',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 12.6, half: 10.9, std: 9.2 },
    opportunity: {
      snapShare: 0.79, routes: 28, targets: 6.0, targetShare: 0.19,
      rushShare: 0.01, carries: 0.2, rzTouches: 1.0, adot: 12.2, yprr: 1.68,
    },
    receipts: [
      'A second option on a club with a run-first script and the lowest total on the board.',
      'The opponent gives up catches underneath and takes away the sideline, which is the wrong half of his route tree.',
      'He has the club’s highest air-yards share, so one deep ball rewrites the day.',
    ],
    news: [],
  },
  {
    id: 'wr-nakamura', first: 'Corey', last: 'Nakamura', pos: 'WR', team: 'GB',
    injury: { status: 'OUT', note: 'Knee; ruled out Friday.' },
    proj: { ppr: 0, half: 0, std: 0 },
    opportunity: {
      snapShare: 0, routes: 0, targets: 0, targetShare: 0,
      rushShare: 0, carries: 0, rzTouches: 0, adot: 0, yprr: 0,
    },
    receipts: [
      'Ruled out Friday — the roster row exists so an empty lineup slot is visible rather than silently zero.',
      'His routes redistribute to the slot receiver and the tight end rather than to the second outside receiver.',
      'Expect the club’s neutral pass rate to fall by a few points without him.',
    ],
    news: [{ tag: 'INJURY', text: 'Knee; ruled out for this week.' }],
  },

  // ---- Tight ends ---------------------------------------------------------
  {
    id: 'te-halloran', first: 'Gus', last: 'Halloran', pos: 'TE', team: 'BAL',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 13.8, half: 11.9, std: 10.0 },
    opportunity: {
      snapShare: 0.87, routes: 27, targets: 6.6, targetShare: 0.22,
      rushShare: 0, carries: 0, rzTouches: 1.7, adot: 8.2, yprr: 1.94,
    },
    receipts: [
      'He is the club’s red-zone answer, and the opponent has been worst-in-class against seam routes from a tight end.',
      'A 22% target share from the tight-end position is the largest edge on this board.',
      'The club uses him as a move blocker on early downs, which suppresses his route count in a run script.',
    ],
    news: [],
  },
  {
    id: 'te-pryor', first: 'Weston', last: 'Pryor', pos: 'TE', team: 'DET',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 11.4, half: 9.8, std: 8.2 },
    opportunity: {
      snapShare: 0.80, routes: 25, targets: 5.4, targetShare: 0.17,
      rushShare: 0, carries: 0, rzTouches: 1.3, adot: 7.6, yprr: 1.72,
    },
    receipts: [
      'He plays in the highest-total game on the slate, which lifts a middling target share into a startable range.',
      'The opponent’s linebackers are the slowest cover unit here; his work comes on option routes over the middle.',
      'Two of his three demo touchdowns came on play-action from under centre inside the fifteen.',
    ],
    news: [],
  },
  {
    id: 'te-krantz', first: 'Milo', last: 'Krantz', pos: 'TE', team: 'KC',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 10.2, half: 8.8, std: 7.4 },
    opportunity: {
      snapShare: 0.76, routes: 23, targets: 4.8, targetShare: 0.15,
      rushShare: 0, carries: 0, rzTouches: 1.1, adot: 6.9, yprr: 1.55,
    },
    receipts: [
      'A clear second read behind the club’s alpha receiver, but the red-zone role is stable week to week.',
      'The opponent doubles the outside receiver, which historically has meant one extra look for the tight end per game.',
      'His route count falls in two-minute drills, where the club goes to eleven personnel.',
    ],
    news: [],
  },
  {
    id: 'te-vanterpool', first: 'Nate', last: 'Vanterpool', pos: 'TE', team: 'MIN',
    injury: { status: 'ACTIVE', note: '' },
    proj: { ppr: 9.1, half: 7.8, std: 6.5 },
    opportunity: {
      snapShare: 0.71, routes: 21, targets: 4.1, targetShare: 0.13,
      rushShare: 0, carries: 0, rzTouches: 0.8, adot: 7.1, yprr: 1.41,
    },
    receipts: [
      'A volume-dependent tight end in the lowest-total game here; the path to a useful score is a touchdown, not yards.',
      'He splits snaps with a blocking specialist on early downs, which is why the route count sits near twenty.',
      'The opponent is middling against tight ends and has not surrendered a seam score in the demo set.',
    ],
    news: [],
  },
];

/**
 * Fully hydrated player records, keyed by id.
 *
 * @type {Record<string, object>}
 */
export const PLAYERS = Object.fromEntries(SEED.map((p) => [p.id, {
  ...p,
  name: `${p.first} ${p.last}`,
  initials: `${p.first[0]}${p.last[0]}`,
}]));

/** @returns {object[]} Every player in the pool. */
export function allPlayers() {
  return Object.values(PLAYERS);
}

/**
 * Look a player up.
 *
 * @param {string} id Player id.
 * @returns {object|null} The player, or null.
 */
export function player(id) {
  return PLAYERS[id] || null;
}

/**
 * Difficulty of a player's matchup this week.
 *
 * @param {object} p Player record.
 * @param {number} week Week number.
 * @returns {{opp: string, home: boolean, label: string, rank: number}|null}
 *   Opponent plus that defence's rank against the player's position
 *   (1 = toughest, 32 = softest), or null on a bye.
 */
export function matchupFor(p, week) {
  const opponent = opponentFor(p.team, week);
  if (!opponent) return null;
  const order = { QB: 0, RB: 1, WR: 2, TE: 3 };
  const ranks = DEF_VS_POS[opponent.opp];
  const rank = ranks ? ranks[order[p.pos] ?? 2] : 16;
  return { ...opponent, rank };
}

/**
 * Projected points under a scoring format.
 *
 * @param {object} p Player record.
 * @param {'ppr'|'half'|'std'} scoring Scoring format.
 * @returns {number} Projected points.
 */
export function projFor(p, scoring = 'ppr') {
  return p.proj[scoring] ?? p.proj.ppr;
}

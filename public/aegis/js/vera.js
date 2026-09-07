/**
 * Vera — the receptionist, and what she actually knows.
 *
 * She is a hologram at the front of the console, and it would be easy for her
 * to be decoration: a face that reads out numbers somebody else computed. She
 * is not that here, for one design reason that runs through the whole product.
 *
 * **The response to a fall is a conversation, and she is the one having it.**
 * Half of the people who go down in their own homes get up again unaided; a
 * system that treats every one of them as an incident is a system that gets
 * unplugged. So before anything escalates, somebody has to ask — by name,
 * warmly, and in a way that a frightened person on a floor can answer without
 * finding a button. That question is the single most important output this
 * product has, and Vera is the component that asks it. The escalation ladder
 * decides *when*; this module decides *what*, and the voice module decides how
 * it sounds.
 *
 * Everything here is a pure function over an utterance and a snapshot of the
 * console's state. No DOM, no speech API, no network. That is what lets her
 * whole conversational surface be tested from Node, which matters more than
 * usual: the lines she says at the top of the ladder are the ones nobody will
 * ever hear in testing and everybody will hear on the worst night of the year.
 *
 * She has two registers and the difference between them is deliberate. In
 * ordinary conversation she is a receptionist — precise, a little formal,
 * happy to explain her own limits. In an incident she becomes short, concrete
 * and repetitive, because that is what is comprehensible to somebody who has
 * just hit their head. She never says "I have detected a fall event"; she says
 * "I saw that".
 *
 * @module aegis/vera
 */

import { SCENARIOS, scenario } from './demo.js';
import { CHANNELS, coverageReport } from './fusion.js';

/** Her name, used for the wake word and in her own answers. */
export const NAME = 'Vera';

/**
 * A parsed request.
 *
 * @typedef {object} Request
 * @property {string} intent What was asked for.
 * @property {string|number} [arg] The subject of the request.
 * @property {string} raw What was said.
 */

/**
 * Parse a spoken or typed utterance.
 *
 * Deliberately a short ordered list of patterns rather than anything clever. A
 * grammar that tries to be clever about natural language mostly succeeds at
 * being confidently wrong, and there is always the typed box beside the
 * microphone. The two patterns that matter most are first and can never be
 * shadowed: the ones that mean *I am fine* and *I need help*.
 *
 * @param {string} utterance What was said.
 * @returns {Request} The request.
 */
export function parseRequest(utterance) {
  const raw = String(utterance || '').trim();
  // Typographic apostrophes are folded to plain ones before anything is
  // matched. This is not tidiness: iOS keyboards and every speech recogniser
  // on the platform produce U+2019, so a pattern written with a plain
  // apostrophe silently fails to hear "I’m fine" — the single most important
  // sentence this whole product listens for — from the device most likely to
  // be saying it.
  const text = raw
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[.,!?]+$/, '');
  if (!text) return { intent: 'none', raw };

  // The two answers to the only question that matters, checked before
  // anything else and matched loosely, because somebody who has just fallen
  // is not going to phrase it well.
  if (/\b(help|ambulance|call (someone|somebody|my|for)|i can'?t get up|i'?m hurt|i am hurt|i'?ve hurt|emergency)\b/.test(text)) {
    return { intent: 'help', raw };
  }
  if (/\b(i'?m fine|i am fine|i'?m ok|i'?m okay|i am ok|i am okay|all right|alright|no problem|false alarm|stand down|i'?m all right|nothing'?s wrong|i'?m good)\b/.test(text)) {
    return { intent: 'fine', raw };
  }

  const body = text.replace(/^(hey |ok |okay |hi )?(vera|aegis|assistant)[\s,]*/i, '').trim() || text;

  const rules = [
    [/^(stop|quiet|silence|shush|be quiet|cancel)$/, () => ({ intent: 'stop' })],
    [/\b(mute|unmute)\b/, (m) => ({ intent: 'mute', arg: m[1] })],
    [/\b(run|start|show|play|open|do)\b.*\b(demo|demonstration|scenario|simulation|example)\b|^demo\b/, (m) => ({
      intent: 'demo',
      arg: matchScenario(body),
    })],
    [/\b(guided |full |whole )?(tour|walkthrough|presentation|show me everything)\b/, () => ({ intent: 'tour' })],
    [/\b(next|carry on|continue|go on)\b/, () => ({ intent: 'next' })],
    [/\b(stop|end|leave|exit|quit)\b.*\b(demo|tour|scenario)\b/, () => ({ intent: 'live' })],
    [/\b(go |switch |back )?(to )?(live|real|camera|watching)\b/, () => ({ intent: 'live' })],
    [/\b(what|who) are you\b|\byour name\b|\bintroduce yourself\b/, () => ({ intent: 'identity' })],
    [/\b(what|how) (are you |do you )?(watch|watching|monitor|see|seeing)\b|\bwhat can you see\b|\bstatus\b|\bsitrep\b|\bhow are things\b/, () => ({ intent: 'status' })],
    [/\b(coverage|blind spot|what can'?t you see|bathroom|shower|toilet|stairs)\b/, () => ({ intent: 'coverage' })],
    [/\b(how (do|does) (you|it|this) work|explain|how do you (tell|know|decide))\b/, () => ({ intent: 'explain' })],
    [/\b(privacy|private|record|recording|upload|cloud|stored|watching me|footage)\b/, () => ({ intent: 'privacy' })],
    [/\b(false alarm|false positive|wrong|mistake|accurate|accuracy|reliable)\b/, () => ({ intent: 'accuracy' })],
    [/\b(contacts?|who (do|will|would|should) (you|i) call|emergency contact|call list)\b/, () => ({ intent: 'contacts' })],
    [/\b(test|try)\b.*\b(alarm|alert|system)\b|\btest the alarm\b/, () => ({ intent: 'test' })],
    [/\b(set ?up|setup|configure|calibrat|install|get started|begin)\b/, () => ({ intent: 'setup' })],
    [/\b(zone|furniture|sofa|couch|bed|occluder|mark)\b/, () => ({ intent: 'zones' })],
    [/\b(medical|doctor|diagnos|injur|hurt|treat)\b/, () => ({ intent: 'medical' })],
    [/\b(history|log|ledger|record|what happened|events?)\b/, () => ({ intent: 'history' })],
    [/\b(help|what can you do|options|commands)\b/, () => ({ intent: 'capabilities' })],
    [/\b(thank you|thanks|cheers|good (girl|job))\b/, () => ({ intent: 'thanks' })],
    [/\b(hello|hi|good (morning|afternoon|evening))\b/, () => ({ intent: 'greeting' })],
  ];

  for (const [pattern, build] of rules) {
    const match = body.match(pattern);
    if (match) return { ...build(match), raw };
  }
  return { intent: 'unknown', arg: raw, raw };
}

/**
 * Find a scenario named in an utterance.
 *
 * @param {string} text The utterance, lower case.
 * @returns {string|undefined} A scenario id, or undefined.
 */
function matchScenario(text) {
  const keys = [
    [/\b(behind|occlu|sofa|couch|table|hidden)\b/, 'occluded'],
    [/\b(slump|slide|faint|slow)\b/, 'slump'],
    // Not anchored on word boundaries: "shoelace" is one word, and asking for
    // "the shoelace one" is how anybody actually asks for it.
    [/shoelace|\blace\b|\bshoe\b|\bbend|\bstoop/, 'lace'],
    [/\b(sit|sitting|chair|seat)\b/, 'sit'],
    [/\b(bed|sleep|lie down|lying)\b/, 'bed'],
    [/\b(drop|phone|handset)\b/, 'drop'],
    [/\b(walk|nothing|baseline)\b/, 'walk'],
    [/\b(fall|fell|falling|collapse)\b/, 'fall'],
  ];
  for (const [pattern, id] of keys) if (pattern.test(text)) return id;
  return undefined;
}

/**
 * A reply.
 *
 * @typedef {object} Reply
 * @property {string} text What to say.
 * @property {string} tone One of `warm`, `calm`, `concerned`, `urgent`, `bright`.
 * @property {{kind: string, arg?: *}|null} action Something for the console to do.
 * @property {string} [gesture] A pose for the hologram.
 */

/**
 * Answer a request.
 *
 * @param {Request} request The parsed request.
 * @param {object} [state] A snapshot of the console.
 * @param {string} [state.subject] The person being watched.
 * @param {string} [state.where] Where the camera is pointed.
 * @param {{vision: boolean, inertial: boolean, acoustic: boolean}} [state.live]
 *   Which channels are running.
 * @param {import('./fusion.js').Verdict} [state.verdict] The current verdict.
 * @param {import('./kinematics.js').Kinematics} [state.vision] Camera reading.
 * @param {number} [state.contacts] How many contacts are configured.
 * @param {number} [state.events] How many events are in the ledger.
 * @param {boolean} [state.demo] Whether a scenario is playing.
 * @returns {Reply} The reply.
 */
export function respond(request, state = {}) {
  const live = state.live || { vision: false, inertial: false, acoustic: false };
  const who = state.subject || 'the person you have asked me to watch';
  const report = coverageReport(live);

  switch (request.intent) {
    case 'fine':
      return {
        text: 'Good. I’ll stand down and say no more about it. I’m still here.',
        tone: 'warm',
        gesture: 'reassure',
        action: { kind: 'stand-down' },
      };

    case 'help':
      return {
        text: 'All right. I’m calling for help now. Stay where you are and try not to move — I’m staying right here with you.',
        tone: 'urgent',
        gesture: 'alert',
        action: { kind: 'call-now' },
      };

    case 'greeting':
      return {
        text: `Good to see you. I’m ${NAME}. I keep watch, and if something happens I ask first and escalate second. What would you like to do?`,
        tone: 'warm',
        gesture: 'greet',
        action: null,
      };

    case 'identity':
      return {
        text: `I’m ${NAME}, the receptionist for this console. I’m not a person and I’m not a doctor — I’m a voice on top of three sensors. What I am good for is noticing, asking, and knowing who to call. Everything I do runs in this browser, on this device.`,
        tone: 'calm',
        gesture: 'explain',
        action: null,
      };

    case 'status': {
      const headline = state.verdict?.headline || 'Nothing is running yet.';
      const running = CHANNELS.filter((c) => live[c.id]).map((c) => c.label.toLowerCase());
      const sensors = running.length ? running.join(', ') : 'nothing yet';
      return {
        text: `${headline} I’m watching ${who} on ${sensors}. ${report.summary}`,
        tone: 'calm',
        gesture: 'explain',
        action: null,
      };
    }

    case 'coverage':
      return {
        text: report.gaps.length
          ? `${report.summary} What I cannot do: ${report.gaps.join(' ')}`
          : `${report.summary} All three channels are in service, so there is no gap I know of — though I still only cover the rooms you have put a sensor in.`,
        tone: 'calm',
        gesture: 'explain',
        action: { kind: 'open', arg: 'sensors' },
      };

    case 'explain':
      return {
        text: 'Three sensors that fail differently. The camera measures how tall somebody is against how tall they stand, so I can tell sitting from falling by the speed of the descent and where it stops. A phone in a pocket gives me the impact and, afterwards, whether anything in the stillness is still breathing. The room’s sound gives me the thump. None of them may raise an alarm alone.',
        tone: 'calm',
        gesture: 'explain',
        action: { kind: 'open', arg: 'sensors' },
      };

    case 'privacy':
      return {
        text: 'Nothing leaves this device. The camera is measured frame by frame and each frame is discarded — there is no recording and no upload. The microphone is reduced to four numbers before anything else touches it, so no speech survives it. There is no face recognition anywhere in me, and I could not tell you who somebody is if you asked.',
        tone: 'calm',
        gesture: 'explain',
        action: null,
      };

    case 'accuracy':
      return {
        text: 'I get things wrong, and the design assumes it. That is why I ask before I escalate, why one sensor is never enough, and why I wait to see whether somebody gets up. If I am wrong you say “I’m fine” and I stop. If I am wrong the other way, the phone and the sound are there to catch what the camera cannot see.',
        tone: 'calm',
        gesture: 'explain',
        action: null,
      };

    case 'medical':
      return {
        text: 'I can’t help with that, and I want to be clear about it: I am a movement detector, not a medical device. I cannot tell whether anybody is injured, I do not measure a pulse, and nothing I say should be used to decide whether somebody needs a doctor. If in doubt, call one.',
        tone: 'calm',
        gesture: 'explain',
        action: null,
      };

    case 'contacts':
      return {
        text: state.contacts
          ? `${state.contacts} ${state.contacts === 1 ? 'person is' : 'people are'} on the list. If the ladder reaches the top I put the message and the number in front of whoever is holding this device — a browser cannot dial by itself, and I am not going to pretend otherwise.`
          : 'Nobody is on the list yet, which means at the top of the ladder I can only keep asking. Add somebody in Setup — it takes a name and a number.',
        tone: state.contacts ? 'calm' : 'concerned',
        gesture: 'explain',
        action: { kind: 'open', arg: 'contacts' },
      };

    case 'setup':
      return {
        text: 'Let’s do it properly. Point the camera at the floor you care about, then mark the furniture that hides legs and the places where lying down is normal. After that, a name and a number for whoever should be called.',
        tone: 'bright',
        gesture: 'point',
        action: { kind: 'open', arg: 'setup' },
      };

    case 'zones':
      return {
        text: 'Two kinds of rectangle. Furniture is anything that cuts a body off at the shins — a sofa, a bed, a low table. Rest zones are where lying down is expected, and inside them I stay quiet. Drag them onto the picture.',
        tone: 'calm',
        gesture: 'point',
        action: { kind: 'open', arg: 'zones' },
      };

    case 'demo': {
      const chosen = scenario(request.arg || 'fall');
      return {
        text: `${chosen.title}. ${chosen.claim} Watch the panel on the right — those are the real measurements, not a script.`,
        tone: 'bright',
        gesture: 'point',
        action: { kind: 'demo', arg: chosen.id },
      };
    }

    case 'tour':
      return {
        text: `I’ll take you through all ${SCENARIOS.length}, starting with the ones that look like falls and are not. Those are the interesting half.`,
        tone: 'bright',
        gesture: 'point',
        action: { kind: 'tour' },
      };

    case 'next':
      return { text: 'Next.', tone: 'bright', gesture: 'point', action: { kind: 'next' } };

    case 'live':
      return {
        text: 'Back to the live camera.',
        tone: 'calm',
        gesture: 'greet',
        action: { kind: 'live' },
      };

    case 'test':
      return {
        text: 'I’ll run the whole ladder on you — I ask, then I count down, then I show you exactly the message your contacts would get. Nothing is sent.',
        tone: 'calm',
        gesture: 'point',
        action: { kind: 'rehearse' },
      };

    case 'history':
      return {
        text: state.events
          ? `${state.events} ${state.events === 1 ? 'entry' : 'entries'} in the ledger, kept on this device only. Every one records what was measured and whether I was right.`
          : 'The ledger is empty. Everything I notice goes in it, including the times I was wrong — those are the useful ones.',
        tone: 'calm',
        gesture: 'explain',
        action: { kind: 'open', arg: 'ledger' },
      };

    case 'capabilities':
      return {
        text: 'Four things. Watch — camera, a phone in a pocket, and the room’s sound. Ask — if something looks wrong I speak first and give you a way to wave me off. Escalate — a countdown you can hear, then the contacts, with the measurements attached. And explain — ask me how I decided anything and I will tell you the numbers I decided it on.',
        tone: 'calm',
        gesture: 'explain',
        action: null,
      };

    case 'thanks':
      return { text: 'Any time. I’m not going anywhere.', tone: 'warm', gesture: 'greet', action: null };

    case 'stop':
      return { text: '', tone: 'calm', gesture: 'idle', action: { kind: 'silence' } };

    case 'mute':
      return {
        text: request.arg === 'mute' ? '' : 'Speaking again.',
        tone: 'calm',
        gesture: 'idle',
        action: { kind: 'mute', arg: request.arg === 'mute' },
      };

    case 'none':
      return { text: '', tone: 'calm', gesture: 'idle', action: null };

    default:
      return {
        text: 'I only know a few things, and I would rather say so than guess. Ask me what I’m watching, what I can’t see, how I tell a fall from sitting down, who I’d call, or ask me to run a demonstration.',
        tone: 'calm',
        gesture: 'explain',
        action: null,
      };
  }
}

/**
 * What Vera says when the console's assessment changes.
 *
 * She is quiet by default. A guardian that narrates every posture is one
 * nobody listens to by the second evening, so the only ordinary transitions
 * she remarks on are the ones a person in the room would also remark on.
 *
 * @param {string} from The previous level.
 * @param {string} to The new level.
 * @param {object} [state] Console state.
 * @returns {Reply|null} A line, or null to stay quiet.
 */
export function onLevelChange(from, to, state = {}) {
  if (from === to) return null;
  const name = state.subject ? `${state.subject}` : '';
  if (to === 'watching' && from === 'calm') {
    return {
      text: '',
      tone: 'calm',
      gesture: 'attend',
      action: null,
    };
  }
  if (to === 'calm' && (from === 'watching' || from === 'checking')) {
    return { text: '', tone: 'calm', gesture: 'idle', action: null };
  }
  if (to === 'checking') {
    return {
      text: '',
      tone: 'concerned',
      gesture: 'attend',
      action: null,
    };
  }
  if (to === 'alarm') {
    return {
      text: name ? `${name}.` : '',
      tone: 'urgent',
      gesture: 'alert',
      action: null,
    };
  }
  return null;
}

/**
 * The narration for a guided run through the scenarios.
 *
 * Written so that somebody presenting this can put it on and say nothing. The
 * order is the argument: four things that look like falls and are not, then a
 * sensor deliberately fooled, and only then the falls.
 *
 * @returns {{id: string, title: string, intro: string, verdict: string}[]}
 *   One entry per scenario.
 */
export function tour() {
  return SCENARIOS.map((item) => ({
    id: item.id,
    title: item.title,
    intro: `${item.title}. ${item.claim}`,
    verdict: item.expect,
  }));
}

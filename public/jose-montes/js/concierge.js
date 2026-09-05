/**
 * The concierge's mind.
 *
 * Two pure functions and a grammar: `parseRequest` turns what somebody said
 * into an intent, and `respond` turns that intent into words plus, where the
 * request implies one, an action for the page to take. Nothing here touches
 * the DOM, the microphone or the network, which is why the whole receptionist
 * can be tested from Node and why she still answers with the signal off.
 *
 * She answers from the portfolio and the mortgage maths rather than from a
 * script, so the number she says is the number on the page.
 *
 * @module jose-montes/concierge
 */

import { AGENT, LISTINGS, TRACK_RECORD, matchListing, money, specLine, pricePerSqft } from './listings.js';
import { ownershipCost, affordablePrice } from './finance.js';

/** Sections the visitor can be taken to by name. */
const DESTINATIONS = [
  [/\b(home|top|start|beginning|hero)\b/, 'hero'],
  [/\b(signature|feature[d]?|ocean view|flagship)\b/, 'signature'],
  [/\b(portfolio|listings?|properties|homes|inventory|for sale)\b/, 'portfolio'],
  [/\b(numbers?|payments?|mortgage|afford|calculator|finance|financing)\b/, 'numbers'],
  [/\b(about|jose|who are you|bio|background|record|experience)\b/, 'about'],
  [/\b(market|coast|region|area|neighbou?rhood)\b/, 'market'],
  [/\b(contact|reach|call|email|book|tour|showing|appointment|visit)\b/, 'contact'],
];

/**
 * Parse a spoken or typed request.
 *
 * Kept deliberately shallow: a handful of ordered patterns, most specific
 * first. A grammar that tries to be clever about natural language mostly
 * succeeds at being wrong confidently, and there is always the typed field.
 *
 * @param {string} utterance What the visitor said.
 * @returns {{ intent: string, arg?: string|number, raw: string }} The request.
 */
export function parseRequest(utterance) {
  const raw = String(utterance || '').trim();
  const text = raw.toLowerCase().replace(/[.,!?]+$/, '');
  if (!text) return { intent: 'none', raw };

  // An address or a wake word may lead; strip the wake word only.
  const body = text.replace(/^(hey |ok |okay )?(jose|concierge|assistant)[\s,]*/i, '').trim() || text;

  const rules = [
    [/^(stop|quiet|silence|shut up|cancel|never mind)$/, () => ({ intent: 'stop' })],
    [/\b(mute|unmute|turn (the )?(music|sound|audio) (on|off)|play (the )?music|stop the music)\b/, (m) => ({
      intent: 'audio',
      arg: /\b(unmute|on)\b/.test(m[0]) && !/\boff\b/.test(m[0]) ? 'on' : 'off',
    })],
    [/\b(scroll|go|move|take me) (down|up|back up|further)\b|\b(next|previous) section\b/, (m) => ({
      intent: 'scroll',
      arg: /\b(up|back up|previous)\b/.test(m[0]) ? 'up' : 'down',
    })],
    [/\b(hand|gesture|air|motion|camera) (control|scroll|sensor|mode)\b|\bscroll with my (hand|finger)\b/, () => ({ intent: 'gesture' })],
    [/\b(help|what can you do|options|commands)\b/, () => ({ intent: 'help' })],
    [/\b(who are you|your name)\b/, () => ({ intent: 'identify' })],
    [/\b(hello|hi|hey|good (morning|afternoon|evening))\b/, () => ({ intent: 'greet' })],
    [/\b(book|schedule|arrange|set up)\b.*\b(tour|showing|viewing|visit|walk ?through|appointment|call)\b|\b(can i see it|i want to see)\b/, () => ({ intent: 'tour' })],
    [/\b(contact|reach|call|phone|email|text|get in touch)\b/, () => ({ intent: 'contact' })],
    [/\b(afford|budget|qualify)\b/, () => ({ intent: 'afford' })],
    [/\b(payment|monthly|mortgage|down payment|interest|escrow|closing costs?)\b/, () => ({ intent: 'payment' })],
    [/\b(price|cost|asking|how much)\b/, () => ({ intent: 'price' })],
    [/\b(how many|bedrooms?|bathrooms?|square feet|sqft|size|how big)\b/, () => ({ intent: 'specs' })],
    [/\b(track record|sold|closed|statistics|stats|numbers you|volume|how long have you)\b/, () => ({ intent: 'record' })],
    [/\b(market|prices? (doing|going)|inventory|trend)\b/, () => ({ intent: 'market' })],
    [/\b(cheapest|least expensive|lowest price|entry)\b/, () => ({ intent: 'extreme', arg: 'low' })],
    [/\b(most expensive|priciest|highest|best|top of the market)\b/, () => ({ intent: 'extreme', arg: 'high' })],
    [/\b(what.?s (available|for sale)|show me (everything|the listings?|what you have)|listings?|properties|portfolio)\b/, () => ({ intent: 'browse' })],
  ];

  for (const [pattern, build] of rules) {
    const match = body.match(pattern);
    if (match) return { ...build(match), raw };
  }

  // A named property beats a bare navigation request, so it is tried first.
  if (matchListing(LISTINGS, body)) return { intent: 'listing', arg: body, raw };

  for (const [pattern, id] of DESTINATIONS) {
    if (pattern.test(body)) return { intent: 'navigate', arg: id, raw };
  }
  return { intent: 'unknown', raw };
}

/**
 * The sentence the concierge says, and what the page should do about it.
 *
 * `action` is a small vocabulary the app knows how to act on: `goto` scrolls
 * to a section, `focus` opens a listing, `audio` and `gesture` toggle the
 * corresponding subsystem, `stop` silences her.
 *
 * @param {{ intent: string, arg?: any, raw?: string }} request A parsed request.
 * @param {object} [context] The page's state.
 * @param {object} [context.listing] The listing currently in view.
 * @param {number} [context.rate] The mortgage rate the calculator is set to.
 * @returns {{ say: string, action?: { type: string, value?: any } }} The reply.
 */
export function respond(request, context = {}) {
  const rate = context.rate ?? 0.0625;
  const current = context.listing || LISTINGS[0];
  // "How much is 8 Bluff Trail" is a price question *and* a property
  // reference. Any intent that is about a property looks for one in the
  // sentence before falling back to whatever is on screen.
  const ABOUT_A_PROPERTY = new Set(['listing', 'price', 'specs', 'payment']);
  const named = ABOUT_A_PROPERTY.has(request.intent)
    ? matchListing(LISTINGS, request.arg ?? request.raw)
    : null;
  const subject = named || current;

  switch (request.intent) {
    case 'none':
      return { say: 'I am listening whenever you are ready.' };

    case 'greet':
      return {
        say: `Good to meet you. I am the concierge for ${AGENT.name}, the ${AGENT.title}. Ask me about any property, what it would cost you a month, or say "book a tour".`,
      };

    case 'identify':
      return {
        say: `I am ${AGENT.name}'s concierge. He holds ${AGENT.license} and works the Central Coast from Paso Robles down to Arroyo Grande.`,
      };

    case 'help':
      return {
        say: 'You can say: show me the listings, what is the payment on the Pismo house, what can I afford at eight thousand a month, book a tour, scroll down, or turn the music off.',
      };

    case 'stop':
      return { say: '', action: { type: 'stop' } };

    case 'audio':
      return {
        say: request.arg === 'on' ? 'Bringing the music back up.' : 'Music off.',
        action: { type: 'audio', value: request.arg },
      };

    case 'gesture':
      return {
        say: 'Opening the camera so you can scroll with your hand. Hold a hand up and move it up or down — nothing leaves this device.',
        action: { type: 'gesture' },
      };

    case 'scroll':
      return { say: '', action: { type: 'scroll', value: request.arg } };

    case 'navigate':
      return { say: '', action: { type: 'goto', value: request.arg } };

    case 'browse':
      return {
        say: `There are ${LISTINGS.filter((l) => l.status === 'active').length} active listings right now, from ${money(Math.min(...LISTINGS.map((l) => l.price)))} up to ${money(Math.max(...LISTINGS.map((l) => l.price)))}. Taking you to the portfolio.`,
        action: { type: 'goto', value: 'portfolio' },
      };

    case 'extreme': {
      const sorted = LISTINGS.slice().sort((a, b) => a.price - b.price);
      const pick = request.arg === 'low' ? sorted[0] : sorted[sorted.length - 1];
      return {
        say: `That would be ${pick.address} in ${pick.city}, at ${money(pick.price)}. ${specLine(pick)}.`,
        action: { type: 'focus', value: pick.id },
      };
    }

    case 'listing':
      return {
        say: `${subject.address}, ${subject.city}. ${money(subject.price)} — ${specLine(subject)}, about ${money(pricePerSqft(subject), true)} a square foot. ${subject.blurb}`,
        action: { type: 'focus', value: subject.id },
      };

    case 'price':
      return {
        say: `${subject.address} is ${money(subject.price)}, which works out to ${money(pricePerSqft(subject), true)} a square foot.`,
        action: named ? { type: 'focus', value: subject.id } : undefined,
      };

    case 'specs':
      return {
        say: `${subject.address} is ${specLine(subject)}, built in ${subject.year} on ${subject.lot} of an acre.`,
        action: named ? { type: 'focus', value: subject.id } : undefined,
      };

    case 'payment': {
      const cost = ownershipCost({ price: subject.price, downPct: 0.2, rate });
      return {
        say: `On ${subject.address} at ${money(subject.price)}, twenty percent down is ${money(cost.down)}. At ${(rate * 100).toFixed(2)} percent over thirty years that is about ${money(cost.total, true)} a month all in — ${money(cost.principalInterest, true)} of loan, ${money(cost.tax, true)} of county tax, and the rest insurance. Not a quote, but it is the right shape.`,
        action: named ? { type: 'focus', value: subject.id } : { type: 'goto', value: 'numbers' },
      };
    }

    case 'afford': {
      const budget = extractMoney(request.raw) || 8000;
      const price = affordablePrice({ budget, downPct: 0.2, rate });
      const matches = LISTINGS.filter((l) => l.price <= price && l.status === 'active').length;
      return {
        say: `At ${money(budget, true)} a month with twenty percent down, you are looking at about ${money(price)} — and ${matches} of the current listings sit under that.`,
        action: { type: 'goto', value: 'numbers' },
      };
    }

    case 'record':
      return {
        say: `${TRACK_RECORD.closed} closings over ${TRACK_RECORD.years} years, ${money(TRACK_RECORD.volume)} in volume. Listings sell at ${(TRACK_RECORD.listToSale * 100 - 100).toFixed(1)} percent over ask on a median of ${TRACK_RECORD.medianDays} days, and ${Math.round(TRACK_RECORD.repeat * 100)} percent of the business is repeat or referral.`,
        action: { type: 'goto', value: 'about' },
      };

    case 'market':
      return {
        say: `The Central Coast is tight rather than hot: inventory is short, well-prepared homes still clear in under two weeks, and anything with a real ocean view trades on its own terms. ${AGENT.name} works ${AGENT.service.slice(0, 4).join(', ')} and Paso Robles.`,
        action: { type: 'goto', value: 'market' },
      };

    case 'tour':
      return {
        say: `Happy to set that up. ${AGENT.name} shows privately, usually inside forty-eight hours. Leave a number on the form and he will call you himself.`,
        action: { type: 'goto', value: 'contact' },
      };

    case 'contact':
      return {
        say: `${AGENT.name} is on ${AGENT.phone}, or ${AGENT.email}. Taking you to the form.`,
        action: { type: 'goto', value: 'contact' },
      };

    default:
      return {
        say: 'I did not catch a property or a question in that. Try asking about a listing by street, the monthly payment, or say "help".',
      };
  }
}

/**
 * Pull a dollar figure out of a sentence.
 *
 * Handles "$8,000", "8000", "eight thousand" and "1.2 million", because
 * people say all four and a budget question is useless without the number.
 *
 * @param {string} text The sentence.
 * @returns {number} The amount, or 0 when none was found.
 */
export function extractMoney(text) {
  const lower = String(text || '').toLowerCase();
  const digits = lower.replace(/[$,]/g, '').match(/\b(\d+(?:\.\d+)?)\s*(k|thousand|m|million)?\b/);
  if (digits) {
    const value = parseFloat(digits[1]);
    const scale = { k: 1000, thousand: 1000, m: 1000000, million: 1000000 }[digits[2]] || 1;
    const amount = value * scale;
    if (amount >= 100) return amount;
  }
  const words = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
    nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  };
  const spoken = lower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\s+(thousand|million)\b/);
  if (spoken) return words[spoken[1]] * (spoken[2] === 'million' ? 1000000 : 1000);
  return 0;
}

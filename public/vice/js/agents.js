/**
 * The swarm.
 *
 * Ten agents that do outreach and channel automation, and the arithmetic that
 * decides whether a given selection of them is a plan or a fantasy.
 *
 * The arithmetic matters more than the roster. Anyone can list "AI agent for
 * Instagram". The question that decides whether the operation survives contact
 * with reality is: at the volumes you just selected, how many touches a week is
 * that, how many minutes of *your* time does reviewing them cost, and does any
 * channel land above the limit at which the platform starts treating you as
 * spam. So {@link deploymentPlan} answers all three and refuses to return a
 * clean plan when the answer is bad.
 *
 * Per-channel ceilings are the conservative numbers experienced operators use
 * — a warmed mailbox, an aged social account, sending like a person rather
 * than a script. They are not quoted from a published API limit, because the
 * platforms do not publish the ones that get accounts restricted. Treat them
 * as a caution line, not a permission slip.
 *
 * @module vice/agents
 */

import { clamp } from './mathkit.js';

/**
 * The channels the swarm can work, and how hard each can be pushed per day
 * from a single warmed account before it starts looking automated.
 */
export const CHANNELS = Object.freeze([
  { id: 'email', label: 'Email', safeDaily: 120, needs: 'A warmed sending domain, SPF/DKIM/DMARC passing' },
  { id: 'instagram', label: 'Instagram', safeDaily: 40, needs: 'A business account with DM access' },
  { id: 'facebook', label: 'Facebook', safeDaily: 40, needs: 'A page with messaging enabled' },
  { id: 'tiktok', label: 'TikTok', safeDaily: 25, needs: 'A business account' },
  { id: 'youtube', label: 'YouTube', safeDaily: 20, needs: 'A channel with Shorts enabled' },
  { id: 'linkedin', label: 'LinkedIn', safeDaily: 25, needs: 'A personal profile — pages get far less reach' },
  { id: 'x', label: 'X', safeDaily: 50, needs: 'An account with API posting access' },
  { id: 'sms', label: 'SMS', safeDaily: 60, needs: 'A registered 10DLC number — unregistered traffic is dropped' },
  { id: 'phone', label: 'Phone', safeDaily: 40, needs: 'A dialer and a number that is not already flagged' },
  { id: 'reviews', label: 'Reviews', safeDaily: 15, needs: 'Verified Google Business and Yelp listings' },
]);

/**
 * The roster.
 *
 * `perDay` is what one instance can produce; `reviewSeconds` is the human time
 * each produced item needs before it goes out, which is the number that
 * actually limits how big a swarm one person can run.
 */
export const AGENTS = Object.freeze([
  {
    id: 'prospector', kind: 'outreach', name: 'PROSPECTOR', codename: 'Lead acquisition',
    role: 'Builds and enriches the target list — brokerages, event planners, property managers, fire and EMS departments — and drops verified contacts into the queue with a reason each one was chosen.',
    channels: ['email'], perDay: 180, reviewSeconds: 8, autonomy: 'drafts',
    guardrail: 'Never contacts a name it could not verify at a company it could not verify.',
  },
  {
    id: 'opener', kind: 'outreach', name: 'OPENER', codename: 'First touch',
    role: 'Writes and sends the first email — one specific observation about the target, one line on the service, one question. No paragraph of adjectives.',
    channels: ['email'], perDay: 90, reviewSeconds: 20, autonomy: 'drafts',
    guardrail: 'One mailbox, one domain, one send window. Stops the sequence the moment a human replies.',
  },
  {
    id: 'closer', kind: 'outreach', name: 'CLOSER', codename: 'Follow-up cadence',
    role: 'Runs the four-touch follow-up across email, LinkedIn and phone, tracks who opened what, and hands warm threads to you with the context already summarised.',
    channels: ['email', 'linkedin', 'phone'], perDay: 120, reviewSeconds: 15, autonomy: 'drafts',
    guardrail: 'Four touches, then out of the sequence. No fifth email.',
  },
  {
    id: 'dm', kind: 'outreach', name: 'SLIDER', codename: 'Social DM',
    role: 'Works Instagram, Facebook and X inboxes — replies to people who engaged with a reel, answers the pricing question, books the call.',
    channels: ['instagram', 'facebook', 'x'], perDay: 60, reviewSeconds: 25, autonomy: 'drafts',
    guardrail: 'Only messages accounts that engaged first. Cold DM volume is what gets accounts restricted.',
  },
  {
    id: 'booker', kind: 'outreach', name: 'BOOKER', codename: 'Calendar',
    role: 'Owns the back-and-forth to a confirmed time — proposes slots, confirms, reminds by SMS the morning of, reschedules no-shows once.',
    channels: ['email', 'sms'], perDay: 40, reviewSeconds: 10, autonomy: 'acts',
    guardrail: 'Books only into hours you marked open. Never double-books an on-site detail.',
  },
  {
    id: 'cutter', kind: 'automation', name: 'CUTTER', codename: 'Reel production',
    role: 'Turns a job, a scan or an incident write-up into vertical reels through Carrier — script, animated panels, captions, citations — ready to post.',
    channels: ['tiktok', 'instagram', 'youtube'], perDay: 6, reviewSeconds: 90, autonomy: 'drafts',
    guardrail: 'Never shows a client property, face or address without written release.',
  },
  {
    id: 'poster', kind: 'automation', name: 'POSTER', codename: 'Distribution',
    role: 'Publishes the calendar across every channel at the hour each one actually performs, reformats per platform, and never posts the same caption twice.',
    channels: ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'x'], perDay: 12, reviewSeconds: 20, autonomy: 'acts',
    guardrail: 'Holds the queue when an incident is live. Nobody wants a promo post over a working scene.',
  },
  {
    id: 'concierge', kind: 'automation', name: 'CONCIERGE', codename: 'Inbox triage',
    role: 'Reads every inbound email and DM, sorts booking / quote / support / noise, answers the answerable, and escalates anything with a date, a dollar figure or a liability question.',
    channels: ['email', 'instagram', 'facebook', 'linkedin'], perDay: 200, reviewSeconds: 6, autonomy: 'acts',
    guardrail: 'Never quotes a price or accepts a job. Those come to you.',
  },
  {
    id: 'reputation', kind: 'automation', name: 'REPUTATION', codename: 'Reviews',
    role: 'Asks for the review at the right moment after a completed detail, drafts a reply to every one that lands, and flags a bad one to you within the hour.',
    channels: ['reviews', 'email', 'sms'], perDay: 15, reviewSeconds: 30, autonomy: 'drafts',
    guardrail: 'Asks once. Never incentivises a rating — that is against every platform’s terms.',
  },
  {
    id: 'analyst', kind: 'automation', name: 'ANALYST', codename: 'Weekly numbers',
    role: 'One page every Monday: touches sent, reply rate by channel, calls booked, jobs closed, cost per booked call — and which agent to turn down.',
    channels: ['email'], perDay: 1, reviewSeconds: 300, autonomy: 'reports',
    guardrail: 'Reports what happened. Does not round a reply rate up.',
  },
]);

/** Working days assumed per week when converting daily capacity to weekly. */
export const WORKING_DAYS = 5;

/**
 * Look up an agent.
 *
 * @param {string} id Agent id.
 * @param {object[]} [roster] Roster to search.
 * @returns {object|null} The agent, or null.
 */
export function agentById(id, roster = AGENTS) {
  return roster.find((agent) => agent.id === id) || null;
}

/**
 * The agents of one kind.
 *
 * @param {'outreach'|'automation'} kind Which half of the swarm.
 * @param {object[]} [roster] Roster.
 * @returns {object[]} Matching agents.
 */
export function byKind(kind, roster = AGENTS) {
  return roster.filter((agent) => agent.kind === kind);
}

/**
 * Daily touches for one agent at a given throttle.
 *
 * @param {object} agent An agent record.
 * @param {number} [throttle] 0–1, where 1 is the agent flat out.
 * @returns {number} Touches per working day, rounded.
 */
export function dailyTouches(agent, throttle = 1) {
  if (!agent) return 0;
  return Math.round(agent.perDay * clamp(throttle, 0, 1));
}

/**
 * Build a deployment plan and check whether it is survivable.
 *
 * Two things get a plan into trouble. The first is channel volume: several
 * agents each look reasonable and their combined daily traffic on one channel
 * lands above what an account tolerates. The second is review load: agents that
 * draft rather than act need a person to approve their work, and it is very
 * easy to select a swarm whose approval queue is a second full-time job.
 *
 * Both are returned as explicit warnings rather than folded silently into the
 * totals, because the useful output here is "turn this one down", not a number.
 *
 * @param {string[]} selected Agent ids to deploy.
 * @param {object} [options] Plan options.
 * @param {number} [options.throttle] 0–1 global throttle.
 * @param {number} [options.reviewHoursPerWeek] Human hours available to approve drafts.
 * @param {object[]} [options.roster] Roster to plan against.
 * @param {object[]} [options.channels] Channel definitions.
 * @returns {object} Totals, per-channel load, and warnings.
 */
export function deploymentPlan(selected, options = {}) {
  const {
    throttle = 1,
    reviewHoursPerWeek = 5,
    roster = AGENTS,
    channels = CHANNELS,
  } = options;

  const agents = selected.map((id) => agentById(id, roster)).filter(Boolean);
  const load = new Map(channels.map((channel) => [channel.id, 0]));

  let weeklyTouches = 0;
  let reviewSecondsPerWeek = 0;

  for (const agent of agents) {
    const perDay = dailyTouches(agent, throttle);
    const share = agent.channels.length ? perDay / agent.channels.length : 0;
    for (const channel of agent.channels) {
      if (load.has(channel)) load.set(channel, load.get(channel) + share);
    }
    weeklyTouches += perDay * WORKING_DAYS;
    if (agent.autonomy !== 'acts') {
      reviewSecondsPerWeek += perDay * WORKING_DAYS * agent.reviewSeconds;
    }
  }

  const perChannel = channels
    .map((channel) => {
      const daily = Math.round(load.get(channel.id) || 0);
      return {
        id: channel.id,
        label: channel.label,
        daily,
        safeDaily: channel.safeDaily,
        needs: channel.needs,
        pressure: channel.safeDaily > 0 ? daily / channel.safeDaily : 0,
        over: daily > channel.safeDaily,
      };
    })
    .filter((channel) => channel.daily > 0);

  const reviewHours = reviewSecondsPerWeek / 3600;
  const warnings = [];

  for (const channel of perChannel) {
    if (channel.over) {
      warnings.push(
        `${channel.label} is scheduled for ${channel.daily} touches a day against a caution line of ${channel.safeDaily}. Throttle it or add a second warmed account.`,
      );
    }
  }
  if (reviewHours > reviewHoursPerWeek) {
    warnings.push(
      `Approving this swarm's drafts takes about ${reviewHours.toFixed(1)} hours a week and you set aside ${reviewHoursPerWeek}. Either free the time or move an agent to send-on-its-own.`,
    );
  }
  if (!agents.length) warnings.push('Nothing selected — the swarm is idle.');

  return {
    agents,
    weeklyTouches: Math.round(weeklyTouches),
    dailyTouches: Math.round(weeklyTouches / WORKING_DAYS),
    reviewHours: Number(reviewHours.toFixed(2)),
    reviewHoursBudget: reviewHoursPerWeek,
    perChannel,
    warnings,
    /** A plan is clean when nothing is over a line. It is still your call. */
    clean: warnings.length === 0,
  };
}

/**
 * The throttle at which a selection stops tripping any warning.
 *
 * Answers the practical question — "fine, so how far down do I turn it?" —
 * by bisecting the throttle rather than making the reader guess.
 *
 * @param {string[]} selected Agent ids.
 * @param {object} [options] Same options as {@link deploymentPlan}.
 * @returns {number} A throttle 0–1, or 0 when no throttle is clean.
 */
export function safeThrottle(selected, options = {}) {
  if (!selected.length) return 0;
  let low = 0;
  let high = 1;
  if (deploymentPlan(selected, { ...options, throttle: 1 }).clean) return 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2;
    if (deploymentPlan(selected, { ...options, throttle: mid }).clean) low = mid;
    else high = mid;
  }
  return Number(low.toFixed(3));
}

/**
 * What happens after the system thinks somebody has fallen.
 *
 * Most of the literature on fall detection stops at the detection, which is
 * the easy half. The hard half is the response, and getting it wrong is worse
 * than not having the system: an alarm that goes straight to a phone call
 * summons a daughter across a city because her mother knelt down to find a
 * saucepan, and after the second one the household unplugs the camera.
 *
 * So the response is a ladder, and every rung is designed around the fact that
 * **the person on the floor is usually conscious**. Roughly half of falls in
 * the home are followed by the faller getting themselves up within a minute.
 * A system that skips past them to telephone somebody else has treated an
 * adult as an incident. This one asks first, out loud, by name, and gives them
 * a generous and clearly stated way to wave it off — which is also, not
 * coincidentally, the fastest way to find out whether they are all right,
 * because somebody who cannot answer has told you a great deal.
 *
 * The rungs:
 *
 * - **Attentive.** Belief has risen. Nothing is said. The interface changes.
 * - **Asking.** By name, once, warmly, with two ways to answer — speak, or
 *   move where the camera can see. Twenty seconds.
 * - **Confirming.** Nobody answered. Now it says what it is about to do and
 *   counts down, out loud, repeating how to stop it. Forty-five seconds. This
 *   rung exists so that nobody is ever surprised by the alert that follows.
 * - **Alerting.** The contacts are raised, with the measurements attached.
 *
 * Two shortcuts cut across the ladder in both directions, and both matter more
 * than the rungs. Saying **"help"** at any point goes straight to alerting —
 * a conscious person who knows they need an ambulance must never be made to
 * wait out a countdown designed to protect them from a false positive. And
 * **getting back up** stands the whole thing down from any rung, silently,
 * with a note in the ledger, because the fall still happened and somebody's
 * doctor may want to know it did even though nobody was hurt.
 *
 * Time is passed in. No timers, no clock, no DOM — the entire ladder is
 * replayed in tests at a thousand times real speed.
 *
 * @module aegis/escalation
 */

import { CHECK, WATCH } from './fusion.js';

/** How long the subject has to answer the first question. */
export const ASK_MS = 20000;

/** How long the countdown before contacts are raised runs. */
export const CONFIRM_MS = 45000;

/** How long a stand-down suppresses the ladder before it may rise again. */
export const STAND_DOWN_MS = 120000;

/** The rungs, in order. */
export const STAGES = Object.freeze(['calm', 'attentive', 'asking', 'confirming', 'alerting', 'stood-down']);

/**
 * A line for the receptionist to say, and how to say it.
 *
 * @typedef {object} Line
 * @property {string} text The words.
 * @property {string} tone One of `warm`, `concerned`, `urgent`, `calm`.
 * @property {boolean} interrupt Whether to cut off whatever is being said.
 */

/**
 * The escalation ladder for one watched person.
 */
export class Ladder {
  /**
   * @param {object} [options] Options.
   * @param {string} [options.name] What the receptionist calls the subject.
   * @param {number} [options.askMs] Seconds to answer the first question.
   * @param {number} [options.confirmMs] Length of the countdown.
   */
  constructor(options = {}) {
    this.name = options.name || '';
    this.askMs = options.askMs ?? ASK_MS;
    this.confirmMs = options.confirmMs ?? CONFIRM_MS;
    this.reset(0);
  }

  /**
   * Return to calm.
   *
   * @param {number} timeMs Now.
   */
  reset(timeMs) {
    this.stage = 'calm';
    this.enteredAtMs = timeMs;
    this.deadlineMs = 0;
    this.suppressUntilMs = 0;
    this.spokenAt = new Set();
    this.pending = [];
    this.peakBelief = 0;
    this.eventStartMs = 0;
    this.answered = null;
  }

  /**
   * Move to a rung, queueing whatever it says.
   *
   * @param {string} stage The rung.
   * @param {number} timeMs Now.
   * @param {Line|null} [line] What to say on arrival.
   */
  enter(stage, timeMs, line = null) {
    if (this.stage === stage) return;
    this.stage = stage;
    this.enteredAtMs = timeMs;
    this.spokenAt = new Set();
    if (line) this.pending.push(line);
  }

  /** @returns {string} The subject's name, or a form of address that works without one. */
  get address() {
    return this.name || 'Hello';
  }

  /**
   * Advance the ladder.
   *
   * @param {object} input The current situation.
   * @param {number} input.timeMs Now.
   * @param {number} input.belief Fused belief, 0–1.
   * @param {boolean} [input.recovered] Whether the subject is back on their feet.
   * @param {boolean} [input.contactable] Whether any contacts are configured.
   * @returns {{stage: string, sinceMs: number, remainingMs: number, lines: Line[], cancellable: boolean}}
   *   Where the ladder is, and anything the receptionist should say now.
   */
  update(input) {
    const { timeMs, belief, recovered = false, contactable = true } = input;
    this.peakBelief = Math.max(this.peakBelief, belief);

    if (recovered && this.stage !== 'calm' && this.stage !== 'alerting') {
      this.standDown(timeMs, 'got back up');
      return this.report(timeMs);
    }

    if (timeMs < this.suppressUntilMs) {
      // Standing down means standing down. A ladder that re-climbs three
      // seconds after somebody said they were fine is a ladder that gets
      // switched off.
      if (this.stage !== 'stood-down') this.enter('stood-down', timeMs);
      return this.report(timeMs);
    }

    switch (this.stage) {
      case 'stood-down':
        this.enter('calm', timeMs);
        this.peakBelief = belief;
        break;

      case 'calm':
        if (belief >= CHECK) this.ask(timeMs);
        else if (belief >= WATCH) this.enter('attentive', timeMs);
        break;

      case 'attentive':
        if (belief >= CHECK) this.ask(timeMs);
        else if (belief < WATCH * 0.7) this.enter('calm', timeMs);
        break;

      case 'asking': {
        if (belief < WATCH) { this.standDown(timeMs, 'resolved itself'); break; }
        const waited = timeMs - this.enteredAtMs;
        if (waited > this.askMs * 0.5 && !this.spokenAt.has('again')) {
          this.spokenAt.add('again');
          this.pending.push({
            text: `${this.name ? `${this.name}, ` : ''}I still can’t tell whether you’re all right. Say “I’m fine”, or lift a hand where I can see it.`,
            tone: 'concerned',
            interrupt: false,
          });
        }
        // Confidence does not shorten the asking. It is tempting to skip
        // straight to the countdown when the belief is high, and it is exactly
        // backwards: a high belief means somebody really is on the floor, and
        // somebody on the floor is the person most likely to be able to answer
        // and most entitled to the chance. The window is the window.
        if (waited >= this.askMs) this.confirm(timeMs, contactable);
        break;
      }

      case 'confirming': {
        const left = this.deadlineMs - timeMs;
        for (const mark of [30, 15, 5]) {
          const key = `t${mark}`;
          if (left <= mark * 1000 && left > (mark - 5) * 1000 && !this.spokenAt.has(key)) {
            this.spokenAt.add(key);
            this.pending.push({
              text: mark >= 15
                ? `${mark} seconds. Say “I’m fine” and I’ll stop.`
                : 'Five seconds.',
              tone: 'urgent',
              interrupt: false,
            });
          }
        }
        if (left <= 0) this.alert(timeMs, contactable);
        break;
      }

      case 'alerting':
      default:
        break;
    }

    return this.report(timeMs);
  }

  /**
   * Rise to the asking rung.
   *
   * @param {number} timeMs Now.
   */
  ask(timeMs) {
    if (!this.eventStartMs) this.eventStartMs = timeMs;
    this.enter('asking', timeMs, {
      text: `${this.name ? `${this.name}. ` : ''}I saw that, and I want to make sure you’re all right. Say “I’m fine”, or just lift a hand where I can see it.`,
      tone: 'concerned',
      interrupt: true,
    });
  }

  /**
   * Rise to the countdown.
   *
   * @param {number} timeMs Now.
   * @param {boolean} contactable Whether there is anybody to call.
   */
  confirm(timeMs, contactable) {
    this.deadlineMs = timeMs + this.confirmMs;
    this.enter('confirming', timeMs, {
      text: contactable
        ? `I haven’t heard from you, so in ${Math.round(this.confirmMs / 1000)} seconds I’m going to call for help. If you’re all right, say “I’m fine” now and I’ll stop.`
        : `I haven’t heard from you. Nobody is set up for me to call, so I’m going to keep asking. If you’re all right, say “I’m fine”.`,
      tone: 'urgent',
      interrupt: true,
    });
  }

  /**
   * Raise the contacts.
   *
   * @param {number} timeMs Now.
   * @param {boolean} contactable Whether there is anybody to call.
   */
  alert(timeMs, contactable) {
    this.enter('alerting', timeMs, {
      text: contactable
        ? 'I’m calling for help now. Stay where you are — help is on the way, and I’m staying right here with you.'
        : 'I can’t reach anybody for you, because no contacts are set up. Stay where you are. I’m staying right here with you.',
      tone: 'urgent',
      interrupt: true,
    });
  }

  /**
   * The subject, or an operator, said everything is fine.
   *
   * @param {number} timeMs Now.
   * @param {string} [why] What happened, for the ledger.
   * @returns {string} The reason recorded.
   */
  standDown(timeMs, why = 'stood down') {
    const wasStage = this.stage;
    this.answered = why;
    this.suppressUntilMs = timeMs + STAND_DOWN_MS;
    this.enter('stood-down', timeMs, wasStage === 'calm' || wasStage === 'attentive' ? null : {
      text: why === 'got back up'
        ? 'Good — you’re up. I’ll make a note of it and say no more about it.'
        : 'Understood. I’ll stand down. I’m still here if you need me.',
      tone: 'warm',
      interrupt: true,
    });
    return why;
  }

  /**
   * The subject asked for help outright.
   *
   * @param {number} timeMs Now.
   * @param {boolean} [contactable] Whether there is anybody to call.
   */
  callNow(timeMs, contactable = true) {
    if (!this.eventStartMs) this.eventStartMs = timeMs;
    this.stage = 'confirming';
    this.deadlineMs = timeMs;
    this.alert(timeMs, contactable);
  }

  /**
   * Take everything queued to be said, clearing the queue.
   *
   * @returns {Line[]} The lines, in order.
   */
  drain() {
    const lines = this.pending;
    this.pending = [];
    return lines;
  }

  /**
   * Package the current rung.
   *
   * @param {number} timeMs Now.
   * @returns {{stage: string, sinceMs: number, remainingMs: number, lines: Line[], cancellable: boolean}}
   *   The report.
   */
  report(timeMs) {
    return {
      stage: this.stage,
      sinceMs: timeMs - this.enteredAtMs,
      remainingMs: this.stage === 'confirming' ? Math.max(0, this.deadlineMs - timeMs) : 0,
      lines: this.drain(),
      cancellable: this.stage === 'asking' || this.stage === 'confirming',
    };
  }
}

/**
 * Somebody to raise when the ladder reaches the top.
 *
 * @typedef {object} Contact
 * @property {string} name Their name.
 * @property {string} relation How they know the subject.
 * @property {string} phone A number, or empty.
 */

/**
 * Compose the message the contacts receive.
 *
 * The message leads with what to do, then what was measured, then what was
 * *not* measured. That last part is not modesty — somebody driving across town
 * needs to know whether the system watched a fall or merely found somebody
 * lying down, because those call for different amounts of hurry and different
 * first questions on arrival.
 *
 * @param {object} event The event.
 * @param {string} [event.name] The subject's name.
 * @param {string} [event.where] Where the camera is pointed.
 * @param {import('./fusion.js').Verdict} event.verdict The fused verdict.
 * @param {import('./kinematics.js').Kinematics} [event.vision] Camera detail.
 * @param {number} [event.downForMs] How long they have been down.
 * @returns {string} The message, ready to send.
 */
export function composeAlert(event) {
  const who = event.name || 'The person Aegis is watching';
  const where = event.where ? ` in the ${event.where}` : '';
  const lines = [];
  const watched = event.vision?.transitObserved;
  lines.push(watched
    ? `${who} appears to have fallen${where} and has not got up. Please check on them now.`
    : `${who} is on the floor${where} and has not got up. Please check on them now.`);
  lines.push('');
  if (event.downForMs) lines.push(`On the floor for ${Math.round(event.downForMs / 1000)} seconds.`);
  lines.push(`Confidence ${Math.round((event.verdict?.belief ?? 0) * 100)}%, from ${(event.verdict?.agreeing || []).join(' and ') || 'one sensor'}.`);
  for (const reason of (event.verdict?.reasons || []).slice(0, 3)) lines.push(`• ${reason}`);
  lines.push('');
  lines.push(watched
    ? 'Aegis watched the fall itself.'
    : 'Aegis did NOT see the fall — it found them already down, so it cannot say how long ago or how hard.');
  lines.push('Aegis is a movement detector, not a medical device. It cannot tell whether anybody is injured.');
  return lines.join('\n');
}

/**
 * Build the one-tap links for raising a contact.
 *
 * A web page cannot place a telephone call by itself, and any product that
 * implies otherwise is lying to somebody about their mother's safety. What it
 * can do is hand the operator a link that opens the dialler with the number in
 * it and a message already written, which is one tap, and say plainly that the
 * tap is required.
 *
 * @param {Contact} contact The contact.
 * @param {string} message The composed message.
 * @returns {{call: string|null, text: string|null, mail: string}} The links.
 */
export function alertLinks(contact, message) {
  const number = (contact?.phone || '').replace(/[^\d+]/g, '');
  return {
    call: number ? `tel:${number}` : null,
    text: number ? `sms:${number}?&body=${encodeURIComponent(message)}` : null,
    mail: `mailto:?subject=${encodeURIComponent('Aegis alert')}&body=${encodeURIComponent(message)}`,
  };
}

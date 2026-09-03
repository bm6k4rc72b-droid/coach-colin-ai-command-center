/**
 * Lab — Phishing triage.
 *
 * Six messages, some hostile, some merely alarming, some genuine. The learner
 * calls each one and tags the indicators that justify the call. Grading is
 * asymmetric on purpose: waving through a real phish costs more than a false
 * alarm, because that is how the loss falls in reality.
 *
 * @module nexus/labs/phishing
 */

import { el, fill } from '../dom.js';
import { PHISH_INDICATORS, gradePhishing } from '../security.js';

/** The sample inbox. Fictional senders, realistic structure. */
const SAMPLES = [
  {
    id: 'ms-quota',
    from: 'Microsoft 365 <no-reply@m365-security-alert.com>',
    replyTo: 'support@m365-alerts-desk.info',
    subject: 'Action required: your mailbox will be deactivated in 24 hours',
    body: 'Your mailbox has exceeded its storage quota and will be deactivated within 24 hours.\n\nTo keep your account active, re-validate your credentials now:\n\nhttps://login.microsoftonline.com.session-verify.m365-security-alert.com/auth\n\nFailure to act will result in permanent loss of email.\n\nMicrosoft 365 Security Team',
    phish: true,
    indicators: ['domain', 'urgency', 'credential', 'authority', 'reply-to'],
    debrief: 'The real domain is m365-security-alert.com — everything before it, "login.microsoftonline.com.session-verify", is subdomain decoration. Reply-To points somewhere else again, and the 24-hour deadline exists to stop you checking.',
  },
  {
    id: 'ceo-wire',
    from: 'Dana Whitfield <d.whitfield@yourcompany-cfo.com>',
    replyTo: 'd.whitfield@yourcompany-cfo.com',
    subject: 'Confidential — supplier bank details updated',
    body: 'Hi,\n\nI am in back-to-back meetings so email only please. Northwood Ltd have changed banking; the payment due today needs to go to the new account.\n\nSort 04-29-11, account 88213340. £46,900. Please confirm once sent — do not discuss this with the team until the acquisition is announced.\n\nDana',
    phish: true,
    indicators: ['domain', 'urgency', 'payment', 'authority'],
    debrief: 'Business email compromise. No link, no attachment, nothing for a filter to catch — just a payment-details change, an instruction not to discuss it, and a lookalike domain. The control is out-of-band verification on a known number, every time.',
  },
  {
    id: 'github-pr',
    from: 'GitHub <notifications@github.com>',
    replyTo: 'notifications@github.com',
    subject: '[org/service] Pull request #4821: bump dependency to 3.2.1',
    body: 'kmitchell opened a pull request.\n\nbump serialiser 3.1.9 → 3.2.1, closes the deserialisation advisory.\n\nView it on GitHub: https://github.com/org/service/pull/4821\n\nYou are receiving this because you are watching this repository.',
    phish: false,
    indicators: [],
    debrief: 'Genuine. The sending domain matches, the link goes to the real host, nothing is urgent and nothing is requested. Note that calling this one hostile is not free either — teams that cry wolf stop being listened to.',
  },
  {
    id: 'dhl',
    from: 'DHL Express <tracking@dhl-parcel-redelivery.top>',
    replyTo: 'tracking@dhl-parcel-redelivery.top',
    subject: 'Your parcel is held — £2.99 customs fee outstanding',
    body: 'Parcel GB8837402193 could not be delivered. A customs charge of £2.99 remains unpaid.\n\nPay now to release your parcel: http://dhl-parcel-redelivery.top/pay?ref=GB8837402193\n\nUnclaimed parcels are returned to sender after 48 hours.',
    phish: true,
    indicators: ['domain', 'urgency', 'generic'],
    debrief: 'The tiny fee is the point: £2.99 feels too small to be fraud, and the card details it harvests are worth far more. Plain HTTP, a .top domain, no name, and a deadline.',
  },
  {
    id: 'it-mfa',
    from: 'IT Service Desk <servicedesk@yourcompany.com>',
    replyTo: 'servicedesk@yourcompany.com',
    subject: 'Approving your MFA reset — we will never ask for your code',
    body: 'We are migrating multi-factor authentication to passkeys between the 8th and 12th.\n\nYou will be asked to register a passkey when you next sign in from a company device. We will never phone you, and we will never ask you to read out a one-time code.\n\nIf anyone asks you for a code, hang up and report it: report@yourcompany.com',
    phish: false,
    indicators: [],
    debrief: 'Genuine, and a good example of what a real security communication looks like: it tells you what will happen, states what it will never ask for, and gives a reporting route.',
  },
  {
    id: 'invoice-html',
    from: 'Accounts <billing@northwood-supplies.com>',
    replyTo: 'accounts.recovery@mail.ru',
    subject: 'RE: RE: Outstanding invoice 20418 — final notice',
    body: 'Dear customer,\n\nPlease find attached the outstanding invoice. Payment is 62 days overdue and the account will be referred for collection today.\n\nAttachment: Invoice_20418.html (43 KB)\n\nRegards,\nAccounts Receivable',
    phish: true,
    indicators: ['attachment', 'urgency', 'reply-to', 'generic'],
    debrief: 'An .html attachment is a credential-harvesting page that opens from your own disk, which is how it dodges link scanning. The Reply-To on a different continent from the sender domain settles it.',
  },
];

/**
 * Mount the phishing lab.
 *
 * @param {HTMLElement} root Container.
 * @param {object} ctx Console services: progress, speak, toast.
 * @returns {{ destroy: () => void }} Lab handle.
 */
export function mount(root, ctx) {
  let index = 0;
  let score = 0;
  let misses = 0;
  const selected = new Set();

  /** Render the current sample. */
  const render = () => {
    const sample = SAMPLES[index];
    selected.clear();
    const indicatorRow = el('div.chips', {}, PHISH_INDICATORS.map((indicator) => {
      const chip = el('button.chip', {
        type: 'button',
        title: indicator.hint,
        onclick: () => {
          if (selected.has(indicator.id)) selected.delete(indicator.id);
          else selected.add(indicator.id);
          chip.classList.toggle('on', selected.has(indicator.id));
        },
      }, [indicator.label]);
      return chip;
    }));

    const verdictBox = el('div.verdict');

    /**
     * Grade the learner's call and reveal the debrief.
     *
     * @param {boolean} isPhish The learner's verdict.
     */
    const answer = (isPhish) => {
      const result = gradePhishing(sample, { phish: isPhish, indicators: [...selected] });
      score += result.points;
      if (!result.correct && sample.phish) misses += 1;
      const lines = [
        el('h4', { text: result.correct ? 'Correct call' : sample.phish ? 'Missed — this one was hostile' : 'False alarm — this one was genuine' }),
        el('p', { text: sample.debrief }),
      ];
      if (result.missed.length) {
        lines.push(el('p.dim', {
          text: `Indicators you did not flag: ${result.missed.map((id) => PHISH_INDICATORS.find((i) => i.id === id)?.label).join(', ')}.`,
        }));
      }
      if (result.wrong.length) {
        lines.push(el('p.dim', {
          text: `Not present here: ${result.wrong.map((id) => PHISH_INDICATORS.find((i) => i.id === id)?.label).join(', ')}.`,
        }));
      }
      lines.push(el('p.score', { text: `${result.points >= 0 ? '+' : ''}${result.points} points · running total ${score}` }));
      lines.push(el('button.btn.primary', {
        type: 'button',
        onclick: () => {
          index += 1;
          if (index >= SAMPLES.length) finish();
          else render();
        },
      }, [index + 1 >= SAMPLES.length ? 'See results' : 'Next message']));
      fill(verdictBox, lines);
      verdictBox.classList.add('shown');
      ctx.speak?.(result.correct ? 'Correct.' : sample.phish ? 'That one was hostile.' : 'That one was genuine — a false alarm has a cost too.', { interrupt: true });
    };

    fill(root, [
      el('div.lab-head', {}, [
        el('h3', { text: 'Phishing triage' }),
        el('span.pill', { text: `${index + 1} / ${SAMPLES.length}` }),
      ]),
      el('p.dim', { text: 'Call each message, and tag the indicators that justify the call. Missing a real phish costs more than a false alarm — as it does in a real inbox.' }),
      el('div.mail', {}, [
        el('div.mail-head', {}, [
          el('div', {}, [el('span.k', { text: 'From' }), el('span.v', { text: sample.from })]),
          el('div', {}, [el('span.k', { text: 'Reply-To' }), el('span.v', { text: sample.replyTo })]),
          el('div', {}, [el('span.k', { text: 'Subject' }), el('span.v', { text: sample.subject })]),
        ]),
        el('pre.mail-body', { text: sample.body }),
      ]),
      el('p.label', { text: 'Indicators present' }),
      indicatorRow,
      el('div.row', {}, [
        el('button.btn.danger', { type: 'button', onclick: () => answer(true) }, ['Hostile — phishing']),
        el('button.btn.safe', { type: 'button', onclick: () => answer(false) }, ['Genuine — deliver it']),
      ]),
      verdictBox,
    ]);
  };

  /** Show the final result and bank the score. */
  const finish = () => {
    ctx.progress?.recordLab('phishing', Math.max(0, score));
    if (misses === 0) ctx.progress?.unlock('phish-hunter');
    fill(root, [
      el('div.lab-head', {}, [el('h3', { text: 'Triage complete' })]),
      el('p.big', { text: `${score} points` }),
      el('p', {
        text: misses === 0
          ? 'Nothing hostile got through. That is the number that matters — a false alarm is recoverable, a missed phish is an incident.'
          : `${misses} hostile message${misses === 1 ? '' : 's'} would have reached a user. In a real inbox that is where the incident starts.`,
      }),
      el('p.dim', { text: 'The four questions that catch most of it: does the registrable domain belong to who this claims to be, does Reply-To match From, is the urgency manufactured, and is it asking for a credential, a code or a payment change?' }),
      el('button.btn.primary', {
        type: 'button',
        onclick: () => { index = 0; score = 0; misses = 0; render(); },
      }, ['Run it again']),
    ]);
    ctx.speak?.(misses === 0 ? 'Clean sweep. Nothing hostile got through.' : `${misses} hostile messages would have reached a user.`);
  };

  render();
  return { destroy: () => fill(root, []) };
}

/**
 * Lab registry.
 *
 * Each lab is a module exporting `mount(root, ctx)`. Keeping them behind a
 * registry means the shell, the voice grammar and the lessons can all refer
 * to a lab by one id.
 *
 * @module nexus/labs
 */

import * as agentloop from './agentloop.js';
import * as crypto from './crypto.js';
import * as injection from './injection.js';
import * as passwords from './passwords.js';
import * as phishing from './phishing.js';
import * as scanner from './scanner.js';

/** @type {Array<{ id: string, name: string, blurb: string, track: string, mount: Function }>} */
export const LABS = [
  {
    id: 'phishing',
    name: 'Phishing Triage',
    blurb: 'Six messages. Call each one, tag the indicators, and find out what a miss costs.',
    track: 'cyber',
    mount: phishing.mount,
  },
  {
    id: 'passwords',
    name: 'The Password Forge',
    blurb: 'Watch a password’s strength collapse under human patterns, then forge one that holds.',
    track: 'cyber',
    mount: passwords.mount,
  },
  {
    id: 'crypto',
    name: 'The Crypto Bench',
    blurb: 'Hashing, encryption and encoding on the same string, with real Web Crypto.',
    track: 'cyber',
    mount: crypto.mount,
  },
  {
    id: 'injection',
    name: 'The Injection Range',
    blurb: 'Write a payload. Serve it to an undefended agent and a defended one. Watch the difference.',
    track: 'agents',
    mount: injection.mount,
  },
  {
    id: 'agentloop',
    name: 'The Agent Loop Builder',
    blurb: 'Assemble a loop and run it against three tasks of increasing consequence.',
    track: 'agents',
    mount: agentloop.mount,
  },
  {
    id: 'scanner',
    name: 'The Field Scanner',
    blurb: 'Point the phone camera at a QR code and pull the destination apart before you follow it.',
    track: 'cyber',
    mount: scanner.mount,
  },
];

/**
 * Look up a lab.
 *
 * @param {string} id Lab id.
 * @returns {object|undefined} The lab.
 */
export function findLab(id) {
  return LABS.find((lab) => lab.id === id);
}

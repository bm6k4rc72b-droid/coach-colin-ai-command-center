/* Haptics. iOS Safari ignores navigator.vibrate, so we ALSO fire a
   sub-audible thump through the audio core — on a phone held in the hand
   the speaker itself is a haptic device. Belt and suspenders. */
import { state } from './state.js';
import { audio } from './audio.js';

const can = typeof navigator !== 'undefined' && 'vibrate' in navigator;

const PATTERNS = {
  tap:    [8],
  hit:    [18],
  snap:   [12, 26, 12],
  good:   [10, 40, 22],
  bad:    [50, 30, 50],
  kill:   [30, 20, 30, 20, 60],
  jackpot:[14, 30, 14, 30, 14, 30, 90],
};

export const haptics = {
  fire(name = 'tap'){
    if(!state.s.settings.haptics) return;
    const p = PATTERNS[name] || PATTERNS.tap;
    if(can){ try{ navigator.vibrate(p); }catch(_){} }
    // audio-thump fallback for iOS
    if(name === 'bad' || name === 'kill') audio.tone(55, 0.07, 'sine', 0.22, 40);
    else if(name === 'jackpot') audio.tone(70, 0.12, 'sine', 0.2, 45);
    else audio.tone(62, 0.035, 'sine', 0.14, 48);
  },
  stop(){ if(can){ try{ navigator.vibrate(0); }catch(_){} } }
};

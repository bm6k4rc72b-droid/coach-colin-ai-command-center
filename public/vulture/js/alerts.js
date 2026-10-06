/**
 * Alert rules and delivery: in-app feed with a frame snapshot, toast, sound,
 * system notification, and an outbound webhook (JSON or plain text — plain
 * text suits ntfy.sh topics, which push straight to a phone).
 *
 * @module vulture/alerts
 */

export const DEFAULT_RULES = [
  { id: 'lot-full', label: 'Lot occupancy at or above', enabled: true, params: { pct: 90 }, unit: '%', cooldownS: 300 },
  { id: 'dwell', label: 'Vehicle parked longer than', enabled: true, params: { minutes: 120 }, unit: 'min', cooldownS: 900 },
  { id: 'restricted', label: 'Person enters a restricted zone', enabled: true, params: {}, cooldownS: 20 },
  { id: 'line-cross', label: 'Every gate crossing', enabled: false, params: {}, cooldownS: 0 },
  { id: 'fatigue', label: 'Athlete fatigue at or above', enabled: true, params: { pct: 30 }, unit: '%', cooldownS: 60 },
  { id: 'impact', label: 'Impact at or above', enabled: true, params: { g: 4 }, unit: 'G', cooldownS: 20 },
  { id: 'form', label: 'Form-risk cue (valgus, trunk lean)', enabled: true, params: {}, cooldownS: 15 },
  { id: 'route-risk', label: 'Route risk ahead at or above', enabled: true, params: { score: 70 }, unit: '/100', cooldownS: 120 },
  { id: 'camera-offline', label: 'Camera goes offline', enabled: true, params: {}, cooldownS: 60 },
];

const lastFired = new Map();

/**
 * Whether a rule may fire now (enabled and out of cooldown for this key).
 *
 * @param {object} rule Rule.
 * @param {string} key Dedup key (rule + subject).
 * @param {number} now ms.
 * @returns {boolean} May fire.
 */
export function mayFire(rule, key, now) {
  if (!rule?.enabled) return false;
  const last = lastFired.get(key) ?? -Infinity;
  if (now - last < rule.cooldownS * 1000) return false;
  lastFired.set(key, now);
  return true;
}

let audio = null;
export function beep(level = 'warn') {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator(); const g = audio.createGain();
    o.frequency.value = level === 'high' ? 880 : 660;
    g.gain.setValueAtTime(0.0001, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, audio.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.35);
    o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.4);
  } catch { /* audio blocked until a user gesture */ }
}

/**
 * Deliver an alert through the configured side channels.
 *
 * @param {object} alert { title, detail, level, camera, t }.
 * @param {object} settings App settings.
 */
export async function deliver(alert, settings) {
  if (settings.sound) beep(alert.level);
  if (settings.notify && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification(`VultureSystemV1 · ${alert.title}`, { body: alert.detail, tag: alert.rule }); } catch { /* ignore */ }
  }
  if (settings.webhookUrl && /^https?:\/\//.test(settings.webhookUrl)) {
    const text = `[${alert.level.toUpperCase()}] ${alert.title} — ${alert.detail}${alert.camera ? ` (${alert.camera})` : ''}`;
    const json = JSON.stringify({ source: 'VultureSystemV1', rule: alert.rule, level: alert.level, title: alert.title, detail: alert.detail, camera: alert.camera, time: new Date(alert.t).toISOString() });
    try {
      await fetch(settings.webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: settings.webhookFormat === 'text' ? text : json,
      });
    } catch { /* offline or blocked — the in-app feed still has it */ }
  }
}

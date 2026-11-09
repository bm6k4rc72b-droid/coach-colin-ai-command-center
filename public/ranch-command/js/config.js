/**
 * RANCH COMMAND — settings, kept on this device.
 *
 * @module ranch-command/config
 */

const KEY = 'ranch-command.v1';

export const DEFAULTS = {
  edgeUrl: '',
  mqttUrl: '',
  mqttUser: '',
  mqttPass: '',
  mavlinkUrl: '',
  orthophotoUrl: '',
  home: { lat: 34.6391, lon: -120.4579 },
  cameras: [],
  // Tripwires and zones drawn on each camera, in fractions of its frame.
  analytics: {},
  notify: false,
  gesture: { enabled: false, mode: 'hand', invert: false, thresholds: null, quality: null, camera: 'user' },
  voice: { enabled: true, mode: 'bilingual', narrate: true },
};

/**
 * Load settings.
 *
 * @returns {object} Settings.
 */
export function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw) return structuredClone(DEFAULTS);
    return { ...structuredClone(DEFAULTS), ...raw, gesture: { ...DEFAULTS.gesture, ...raw.gesture }, voice: { ...DEFAULTS.voice, ...raw.voice } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

/**
 * Save settings.
 *
 * @param {object} settings Settings.
 */
export function save(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private browsing: settings last for this visit only.
  }
}

/**
 * Cameras this console can actually open, including the ones you already own.
 *
 * The useful fact behind the DJI request: an Osmo Pocket or an Action in USB
 * webcam mode presents itself as a standard UVC device, and a standard UVC
 * device is just another entry in `enumerateDevices`. No SDK, no vendor app, no
 * integration to build — plug it in, pick it from the list, and the whole
 * detection chain runs on it. Same for any USB capture card, which is how a
 * thermal camera or an HDMI feed gets in.
 *
 * What does *not* work that way is a drone. A Mavic sends its video to the
 * controller, and the controller can push RTMP — which no browser plays. That
 * needs something on the network turning RTMP into HLS or WebRTC, and then the
 * result is a stream URL like any other. The distinction is worth drawing
 * clearly, because "DJI support" means two completely different amounts of work
 * depending on which DJI is meant.
 *
 * @module black-optic-6/devices
 */

/**
 * A known camera family and how it reaches this console.
 *
 * @typedef {object} Family
 * @property {string} id Identifier.
 * @property {RegExp} match Pattern tested against the device label.
 * @property {string} name What to call it.
 * @property {string} route How the video gets here.
 * @property {string} note What the operator needs to know.
 */

/** Camera families worth naming when one turns up in the device list. */
export const FAMILIES = Object.freeze([
  {
    id: 'dji-pocket',
    match: /osmo|pocket|dji|action\s?\d/i,
    name: 'DJI camera (UVC mode)',
    route: 'USB · standard webcam',
    note: 'Put the camera in USB webcam mode when you plug it in — on a Pocket 3 that is the prompt on the touchscreen. It then behaves as an ordinary camera and the full detection chain runs on it, gimbal stabilisation included.',
  },
  {
    id: 'gopro',
    match: /gopro|hero/i,
    name: 'GoPro (webcam mode)',
    route: 'USB · standard webcam',
    note: 'Needs webcam mode enabled on the camera. Some models require the desktop utility once to unlock it.',
  },
  {
    id: 'capture',
    match: /capture|hdmi|cam ?link|elgato|usb ?video/i,
    name: 'Capture card',
    route: 'USB · standard webcam',
    note: 'Anything with an HDMI output reaches this console through one of these — a thermal camera, a drone controller, a DVR.',
  },
  {
    id: 'continuity',
    match: /iphone|continuity/i,
    name: 'iPhone as a camera',
    route: 'Continuity · wireless or USB',
    note: 'Better glass and better low light than most webcams. It is still a visible-light camera; it sees nothing in true darkness.',
  },
  {
    id: 'builtin',
    match: /facetime|integrated|built-?in|front|back|user|environment/i,
    name: 'Built-in camera',
    route: 'On this device',
    note: 'The default. Fine for a doorway, poor for a fence line a hundred metres out.',
  },
]);

/**
 * Routes that are not a device in the list, and what each one needs.
 *
 * Kept as data so the console can show the full picture rather than only what
 * happens to be plugged in.
 */
export const ROUTES = Object.freeze([
  {
    id: 'dji-drone',
    name: 'DJI drone (Mavic, Air, Mini)',
    state: 'LINK',
    route: 'RTMP → bridge → HLS or WebRTC',
    note: 'The controller can push RTMP, which no browser plays. A small relay on the ranch network (nginx-rtmp, MediaMTX, OBS) turns it into a URL this console can open. Once it is a URL, it is just another camera source.',
  },
  {
    id: 'ip-camera',
    name: 'Fixed IP camera',
    state: 'LINK',
    route: 'RTSP → bridge → HLS, or native WebRTC',
    note: 'Cameras that publish WebRTC or HLS work directly. RTSP-only cameras — which is most of them — need the same relay.',
  },
  {
    id: 'thermal',
    name: 'Thermal camera',
    state: 'LINK',
    route: 'HDMI → capture card, or an IP thermal camera',
    note: 'Clip-on units talk only to their own phone app and cannot feed this console. A fixed thermal camera with a stream, or any thermal with an HDMI out plus a capture card, both work.',
  },
  {
    id: 'cloud-only',
    name: 'Cloud-only consumer cameras',
    state: 'BLOCKED',
    route: 'None',
    note: 'Ring, Nest and similar send video to the vendor and hand you an app. There is no local stream to open, so this console cannot see them at all.',
  },
]);

/**
 * Recognise a device from its label.
 *
 * @param {string} label The device label from `enumerateDevices`.
 * @returns {Family|null} The family, or null if unrecognised.
 */
export function identify(label) {
  return FAMILIES.find((family) => family.match.test(label ?? '')) ?? null;
}

/**
 * Every video input this browser will admit to.
 *
 * Labels are empty until camera permission has been granted once — that is a
 * privacy feature of the platform, not a bug, and it means the picker is worth
 * refreshing after the first `getUserMedia` call rather than before.
 *
 * @returns {Promise<Array<{deviceId: string, label: string, family: Family|null}>>}
 *   Cameras, in the order the browser lists them.
 */
export async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === 'videoinput')
    .map((device, i) => ({
      deviceId: device.deviceId,
      label: device.label || `Camera ${i + 1} — grant camera access to see its name`,
      family: identify(device.label),
    }));
}

/**
 * Open a specific camera.
 *
 * @param {string|null} deviceId The device to open, or null for the default.
 * @param {object} [options] Constraints.
 * @param {string} [options.facing='environment'] Preferred facing when no device is named.
 * @param {number} [options.width=1280] Ideal capture width.
 * @returns {Promise<MediaStream>} The stream.
 */
export function openCamera(deviceId, options = {}) {
  const video = deviceId
    ? { deviceId: { exact: deviceId }, width: { ideal: options.width ?? 1280 } }
    : { facingMode: options.facing ?? 'environment', width: { ideal: options.width ?? 1280 } };
  return navigator.mediaDevices.getUserMedia({ video, audio: false });
}

/**
 * What a stream is actually delivering, as opposed to what was asked for.
 *
 * A camera asked for 1280 wide may hand back 640, and a detection chain tuned on
 * one and fed the other quietly loses range. Worth showing.
 *
 * @param {MediaStream} stream An open stream.
 * @returns {{width: number, height: number, frameRate: number, label: string}|null}
 *   The settings actually in force.
 */
export function streamSettings(stream) {
  const track = stream?.getVideoTracks?.()[0];
  if (!track) return null;
  const settings = track.getSettings?.() ?? {};
  return {
    width: settings.width ?? 0,
    height: settings.height ?? 0,
    frameRate: Math.round(settings.frameRate ?? 0),
    label: track.label ?? '',
  };
}

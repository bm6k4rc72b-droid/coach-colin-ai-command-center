/**
 * RANCH COMMAND — camera feeds.
 *
 * Four kinds of source, because ranch video arrives four ways:
 *
 * - **device** — anything the browser can open as a camera: the iPhone's own
 *   lenses, a USB webcam, or a USB/HDMI capture card. That last one is how a
 *   DJI remote controller with HDMI out becomes a live feed on a laptop with
 *   no SDK at all.
 * - **webrtc** — low-latency streams from go2rtc (built into Frigate) or from
 *   MediaMTX's WHEP endpoint. This is the path for RTSP surveillance cameras
 *   and for a DJI drone streaming RTMP into MediaMTX.
 * - **hls** — the same MediaMTX or go2rtc stream as HLS, which iPhone Safari
 *   plays natively. Higher latency, fewest moving parts.
 * - **mjpeg** — snapshot-style feeds from older IP cameras.
 *
 * A browser cannot open `rtsp://` itself, which is why the edge box exists.
 *
 * @module ranch-command/streams
 */

/** Known camera kinds, for the add-camera form. */
export const SOURCE_KINDS = [
  { id: 'device', label: 'This device / USB / capture card', hint: 'iPhone cameras, webcams, or a DJI controller via an HDMI capture card.' },
  { id: 'webrtc', label: 'WebRTC (go2rtc / Frigate / MediaMTX WHEP)', hint: 'e.g. https://edge.example.ts.net/api/webrtc?src=gate_cam or https://edge…:8889/dji/whep' },
  { id: 'hls', label: 'HLS (.m3u8)', hint: 'e.g. https://edge…:8888/dji/index.m3u8 — plays natively on iPhone.' },
  { id: 'mjpeg', label: 'MJPEG / snapshot URL', hint: 'Older IP cameras. Refreshes as an image.' },
];

/**
 * Warn about a URL a secure page cannot load.
 *
 * @param {string} url The URL.
 * @param {string} [pageProtocol] The page's protocol.
 * @returns {string|null} The problem, if any.
 */
export function urlProblem(url, pageProtocol = globalThis.location?.protocol) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return 'That is not a full URL.';
  }
  if (parsed.protocol === 'rtsp:' || parsed.protocol === 'rtmp:') {
    return 'Browsers cannot open RTSP or RTMP directly. Point the camera at go2rtc or MediaMTX on the edge box and use its WebRTC or HLS URL here.';
  }
  if (pageProtocol === 'https:' && (parsed.protocol === 'http:' || parsed.protocol === 'ws:')) {
    const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(parsed.hostname);
    return local
      ? 'This page is HTTPS, so it cannot load a plain-HTTP address on your network. Serve the edge box over HTTPS (Tailscale Serve or a Cloudflare tunnel both do it in one command) or open this dashboard from the edge box itself.'
      : 'This page is HTTPS, so the stream must be HTTPS (or WSS) too.';
  }
  return null;
}

/**
 * List the cameras this device exposes.
 *
 * Labels are only filled in once camera permission has been granted, so the
 * first call may return "Camera 1", "Camera 2".
 *
 * @returns {Promise<Array<{ deviceId: string, label: string }>>} Devices.
 */
export async function listDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'videoinput').map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}

/**
 * Open a device camera.
 *
 * @param {{ deviceId?: string, facing?: 'environment'|'user', width?: number }} [options] Which camera.
 * @returns {Promise<MediaStream>} The stream.
 */
export async function openDevice({ deviceId, facing = 'environment', width = 1280 } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no camera access (it needs HTTPS).');
  const video = deviceId ? { deviceId: { exact: deviceId }, width: { ideal: width } } : { facingMode: facing, width: { ideal: width } };
  return navigator.mediaDevices.getUserMedia({ video, audio: false });
}

/**
 * Wait for ICE gathering, bounded, so a single slow candidate cannot stall
 * the offer.
 *
 * @param {RTCPeerConnection} pc The connection.
 * @param {number} [ms] Timeout.
 * @returns {Promise<void>} Resolves when gathered or timed out.
 */
function iceGathered(pc, ms = 1500) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { pc.removeEventListener('icegatheringstatechange', check); resolve(); };
    const check = () => pc.iceGatheringState === 'complete' && done();
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(done, ms);
  });
}

/**
 * Play a WebRTC stream from a WHEP endpoint or go2rtc's `/api/webrtc`.
 *
 * Both accept an SDP offer POSTed as `application/sdp` and answer with SDP,
 * so one client serves both.
 *
 * @param {HTMLVideoElement} video Where to play it.
 * @param {string} url The endpoint.
 * @returns {Promise<() => void>} A function that closes the stream.
 */
export async function playWebRTC(video, url) {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.ontrack = (event) => {
    if (video.srcObject !== event.streams[0]) video.srcObject = event.streams[0];
  };
  await pc.setLocalDescription(await pc.createOffer());
  await iceGathered(pc);
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: pc.localDescription.sdp });
  if (!response.ok) {
    pc.close();
    throw new Error(`The stream server answered ${response.status}.`);
  }
  let answer = await response.text();
  // go2rtc answers JSON when asked in JSON; tolerate either.
  if (answer.trim().startsWith('{')) answer = JSON.parse(answer).sdp;
  await pc.setRemoteDescription({ type: 'answer', sdp: answer });
  return () => pc.close();
}

/**
 * Play an HLS stream where the browser supports it natively (Safari, iOS).
 *
 * @param {HTMLVideoElement} video Where to play it.
 * @param {string} url The playlist.
 * @returns {() => void} Close.
 */
export function playHLS(video, url) {
  if (!video.canPlayType('application/vnd.apple.mpegurl')) {
    throw new Error('This browser does not play HLS natively. Use the WebRTC URL instead, or open the dashboard in Safari.');
  }
  video.src = url;
  return () => { video.removeAttribute('src'); video.load(); };
}

/**
 * Show an MJPEG or snapshot feed, refreshing snapshots once a second.
 *
 * @param {HTMLImageElement} img Where to show it.
 * @param {string} url The feed.
 * @returns {() => void} Close.
 */
export function playMJPEG(img, url) {
  img.crossOrigin = 'anonymous';
  const isSnapshot = /\.(jpe?g|png)(\?|$)/i.test(url) || /snapshot|latest/i.test(url);
  const bust = () => { img.src = `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`; };
  bust();
  const timer = isSnapshot ? setInterval(bust, 1000) : 0;
  return () => { clearInterval(timer); img.removeAttribute('src'); };
}

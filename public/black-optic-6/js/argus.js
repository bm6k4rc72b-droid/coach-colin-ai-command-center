/**
 * Reolink Argus and the rest of the Reolink range, reached from a browser.
 *
 * The Argus line is the obvious camera for a property with no cable in the
 * ground — battery, solar, wire-free, and it goes up on a post in ten minutes.
 * Getting its pictures into *this* console is where it becomes interesting,
 * because two separate walls stand in the way and they need different answers.
 *
 * **The first wall is the camera.** Reolink's battery-powered models — Argus 2,
 * 3, Eco, PT, the Go series — do not serve RTSP, ONVIF or RTMP. That is not an
 * oversight: keeping a stream open would flatten the battery in a day, so they
 * sleep and talk to Reolink's own app instead. Their wired cameras, the RLC
 * series, serve RTSP happily. A Home Hub changes the answer again for some
 * battery models. So the first thing this module does is say which camera you
 * have and what it will actually give you.
 *
 * **The second wall is the browser, and it is the subtle one.** A Reolink
 * snapshot URL loads perfectly well in an `<img>` tag — you will see the
 * picture. But the camera sends no cross-origin headers, so the moment that
 * image is drawn to a canvas the canvas is *tainted* and `getImageData` throws.
 * Every measurement in this console — motion, tracking, thermal palettes,
 * vegetation indices — reads pixels back off a canvas. So a snapshot that looks
 * like it is working will silently support none of it, and {@link analysable} is
 * the function that refuses to pretend otherwise.
 *
 * Both walls have the same door: a small relay on the ranch network that speaks
 * to the camera and re-publishes on an origin this console is allowed to read.
 * That is one program on a machine that is already on, and it is the difference
 * between a picture and a measurement.
 *
 * @module black-optic-6/argus
 */

/** Reolink's default RTSP port. */
export const RTSP_PORT = 554;

/** Reolink's default ONVIF port, which is not the usual 80. */
export const ONVIF_PORT = 8000;

/**
 * A camera family and what it will actually serve.
 *
 * @typedef {object} Family
 * @property {string} id Identifier.
 * @property {RegExp} match Pattern tested against a model name.
 * @property {string} name What to call it.
 * @property {boolean} battery Whether it is battery powered.
 * @property {string[]} serves Protocols it will serve directly.
 * @property {string} note What the owner needs to know.
 */

/** The Reolink families worth telling apart. */
export const FAMILIES = Object.freeze([
  {
    id: 'argus-battery',
    match: /argus|reolink\s?go|lumus|keen/i,
    name: 'Reolink Argus (battery)',
    battery: true,
    serves: ['snapshot'],
    note: 'Battery models do not serve RTSP, ONVIF or RTMP — holding a stream open would flatten the battery, so they sleep and talk to Reolink\'s app. Snapshots over HTTP work, and a relay is what turns those into something this console can measure.',
  },
  {
    id: 'reolink-hub',
    match: /home\s?hub|reolink\s?hub/i,
    name: 'Reolink Home Hub',
    battery: false,
    serves: ['rtsp', 'snapshot'],
    note: 'The hub is mains powered and stays awake, so on recent firmware it can re-serve its paired battery cameras over RTSP. This is the cheapest route to a real stream from an Argus.',
  },
  {
    id: 'reolink-wired',
    match: /rlc|rlk|reolink\s?(e1|duo|trackmix|cx\d)/i,
    name: 'Reolink wired / PoE',
    battery: false,
    serves: ['rtsp', 'onvif', 'rtmp', 'snapshot'],
    note: 'Serves RTSP continuously. Enable RTSP in Settings → Network → Advanced, and make a separate viewer account rather than handing the console your admin password.',
  },
  {
    id: 'onvif-generic',
    match: /onvif|hikvision|dahua|amcrest|axis|tapo|annke/i,
    name: 'Generic ONVIF camera',
    battery: false,
    serves: ['rtsp', 'onvif', 'snapshot'],
    note: 'Any ONVIF camera reaches this console the same way a wired Reolink does: RTSP into a relay, relay out to the browser.',
  },
]);

/**
 * Identify a camera from its model name.
 *
 * @param {string} model The model name as written on the camera or in the app.
 * @returns {Family|null} The family, or null if unrecognised.
 */
export function identifyModel(model) {
  const name = String(model ?? '');
  if (!name.trim()) return null;
  return FAMILIES.find((family) => family.match.test(name)) ?? null;
}

/**
 * Build a Reolink RTSP URL.
 *
 * The path shape is Reolink's own: stream name, two-digit channel, then main or
 * sub. The sub stream is worth preferring for a detection chain — it is smaller,
 * arrives sooner, and this console processes at 320 pixels wide regardless.
 *
 * @param {object} camera Connection details.
 * @param {string} camera.host Address or hostname.
 * @param {number} [camera.port=RTSP_PORT] RTSP port.
 * @param {string} [camera.user] Username.
 * @param {string} [camera.password] Password.
 * @param {number} [camera.channel=0] Channel, for an NVR.
 * @param {'main'|'sub'} [camera.stream='sub'] Which stream.
 * @param {'h264'|'h265'} [camera.codec='h264'] Stream codec.
 * @returns {string} An RTSP URL.
 */
export function rtspUrl(camera) {
  const {
    host, port = RTSP_PORT, user = '', password = '',
    channel = 0, stream = 'sub', codec = 'h264',
  } = camera ?? {};
  const credentials = user ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@` : '';
  const channelPart = String(channel + 1).padStart(2, '0');
  return `rtsp://${credentials}${host}:${port}/${codec}Preview_${channelPart}_${stream}`;
}

/**
 * Build a Reolink snapshot URL.
 *
 * `rs` is a cache-buster Reolink's own web interface sends; without it a proxy
 * or the browser will happily hand back the same frame for minutes.
 *
 * @param {object} camera Connection details.
 * @param {string} camera.host Address or hostname.
 * @param {string} [camera.user] Username.
 * @param {string} [camera.password] Password.
 * @param {number} [camera.channel=0] Channel.
 * @param {boolean} [camera.https=false] Whether the camera is on HTTPS.
 * @param {string} [camera.nonce] Cache-buster; generated when absent.
 * @returns {string} A snapshot URL.
 */
export function snapshotUrl(camera) {
  const { host, user = '', password = '', channel = 0, https = false, nonce } = camera ?? {};
  const scheme = https ? 'https' : 'http';
  const rs = nonce ?? Math.random().toString(36).slice(2, 10);
  const auth = user
    ? `&user=${encodeURIComponent(user)}&password=${encodeURIComponent(password)}`
    : '';
  return `${scheme}://${host}/cgi-bin/api.cgi?cmd=Snap&channel=${channel}&rs=${rs}${auth}`;
}

/**
 * The relays that turn a camera stream into something a browser can read.
 *
 * All three run on any machine already on the property — a NAS, a mini PC, a
 * Raspberry Pi. The point of listing them with their URL shapes is that "put a
 * relay in" is otherwise a sentence people bounce off.
 */
export const RELAYS = Object.freeze([
  {
    id: 'go2rtc',
    name: 'go2rtc',
    url: (base, name) => `${trimSlash(base)}/api/stream.m3u8?src=${encodeURIComponent(name)}`,
    webrtc: (base, name) => `${trimSlash(base)}/api/ws?src=${encodeURIComponent(name)}`,
    note: 'The one to reach for with Reolink. It speaks their own protocol as well as RTSP, so it can pull from battery Argus cameras that serve no RTSP at all, and it publishes WebRTC with sub-second latency.',
    solves: ['battery cameras with no RTSP', 'cross-origin reads', 'latency'],
  },
  {
    id: 'mediamtx',
    name: 'MediaMTX',
    url: (base, name) => `${trimSlash(base)}/${encodeURIComponent(name)}/index.m3u8`,
    webrtc: (base, name) => `${trimSlash(base)}/${encodeURIComponent(name)}/whep`,
    note: 'A plain, reliable RTSP-to-everything relay. Ideal for wired Reolink and any ONVIF camera; it cannot help a battery Argus, which has no RTSP for it to pull.',
    solves: ['cross-origin reads', 'RTSP in a browser'],
  },
  {
    id: 'frigate',
    name: 'Frigate',
    url: (base, name) => `${trimSlash(base)}/api/${encodeURIComponent(name)}/latest.jpg`,
    webrtc: (base, name) => `${trimSlash(base)}/live/webrtc/api/ws?src=${encodeURIComponent(name)}`,
    note: 'A whole recording system with go2rtc inside it. Worth it if you want recording and retention anyway; heavier than this console needs on its own.',
    solves: ['cross-origin reads', 'recording', 'battery cameras with no RTSP'],
  },
]);

/**
 * Strip a trailing slash from a base URL.
 *
 * @param {string} base The base URL.
 * @returns {string} Without its trailing slash.
 */
function trimSlash(base) {
  return String(base ?? '').replace(/\/+$/, '');
}

/**
 * Build the URL for a relay stream.
 *
 * @param {string} relayId Which relay.
 * @param {string} base The relay's base URL.
 * @param {string} name The stream name configured in the relay.
 * @returns {{hls: string, webrtc: string}|null} Both URLs, or null for an unknown relay.
 */
export function relayUrls(relayId, base, name) {
  const relay = RELAYS.find((entry) => entry.id === relayId);
  if (!relay || !base || !name) return null;
  return { hls: relay.url(base, name), webrtc: relay.webrtc(base, name) };
}

/**
 * Whether frames from a route can enter the detection chain.
 *
 * This is the function the whole module exists for. A picture that appears on
 * screen and a picture this console can measure are different things: reading
 * pixels back off a canvas requires the source to have been fetched with
 * cross-origin permission, and a camera on the local network sends no such
 * header. Same-origin — which in practice means through a relay — is what makes
 * the frames readable.
 *
 * @param {object} route The route being used.
 * @param {string} route.kind `snapshot`, `hls`, `webrtc` or `device`.
 * @param {string} [route.url] The URL in use.
 * @param {string} [route.pageOrigin] The origin the console is served from.
 * @param {boolean} [route.cors] Whether the source is known to send permissive headers.
 * @returns {{analysable: boolean, display: boolean, reason: string}} What the route supports.
 */
export function analysable(route) {
  const { kind, url = '', pageOrigin = '', cors = false } = route ?? {};

  if (kind === 'device') {
    return { analysable: true, display: true, reason: 'A camera attached to this device. Frames are readable.' };
  }

  let sameOrigin = false;
  try {
    sameOrigin = Boolean(pageOrigin) && new URL(url, pageOrigin).origin === new URL(pageOrigin).origin;
  } catch {
    sameOrigin = false;
  }

  if (kind === 'snapshot' && !sameOrigin && !cors) {
    return {
      analysable: false,
      display: true,
      reason: 'The snapshot will appear on screen and nothing can be measured from it: drawing a cross-origin image taints the canvas, and every measurement in this console reads pixels back off one. A relay on the ranch network fixes it.',
    };
  }

  if (!sameOrigin && !cors) {
    return {
      analysable: false,
      display: true,
      reason: 'The stream plays but its frames cannot be read back. Serve it from the same origin as this console, or set permissive cross-origin headers on the relay.',
    };
  }

  return {
    analysable: true,
    display: true,
    reason: sameOrigin
      ? 'Same origin as the console — frames are readable and every deck works on them.'
      : 'The relay sends cross-origin permission, so frames are readable.',
  };
}

/** How a connection attempt ended, and what to do about each. */
export const OUTCOMES = Object.freeze({
  ok: {
    id: 'ok',
    headline: 'Reachable.',
    detail: 'The camera answered and returned a picture.',
  },
  timeout: {
    id: 'timeout',
    headline: 'No answer.',
    detail: 'Nothing responded before the timeout. Wrong address, a different subnet, or — on a battery Argus — the camera is asleep and only wakes for its own app.',
  },
  refused: {
    id: 'refused',
    headline: 'Refused.',
    detail: 'Something is at that address and it closed the connection. The port is usually wrong, or RTSP has not been switched on in the camera\'s settings.',
  },
  auth: {
    id: 'auth',
    headline: 'Rejected the credentials.',
    detail: 'The camera answered and did not accept the username or password. Reolink treats these as case sensitive, and a viewer account has to be created before it can be used.',
  },
  mixed: {
    id: 'mixed',
    headline: 'Blocked as insecure.',
    detail: 'This console is on HTTPS and the camera is on plain HTTP, so the browser blocks the request outright. Reach the console over HTTP on the local network, or put the relay behind HTTPS.',
  },
  cors: {
    id: 'cors',
    headline: 'Reachable, but unreadable.',
    detail: 'The camera answered and the browser will not let this page read the response. It can be displayed; it cannot be measured. This is the wall a relay exists to remove.',
  },
});

/**
 * Turn the shape of a failure into a diagnosis.
 *
 * Browsers deliberately hide the difference between a refused connection and a
 * blocked one, so this reads the surrounding facts — scheme mismatch, how long
 * it took, whether an image loaded where a fetch did not — rather than trusting
 * an error message that is the same for three different causes.
 *
 * @param {object} evidence What was observed.
 * @param {boolean} [evidence.imageLoaded] Whether an `<img>` load succeeded.
 * @param {boolean} [evidence.fetchSucceeded] Whether a `fetch` returned a readable response.
 * @param {number} [evidence.status] HTTP status, where one was seen.
 * @param {number} [evidence.elapsedMs] How long the attempt took.
 * @param {number} [evidence.timeoutMs] The timeout used.
 * @param {string} [evidence.pageScheme] `http:` or `https:`.
 * @param {string} [evidence.targetScheme] `http:` or `https:`.
 * @returns {{outcome: object, next: string[]}} The diagnosis and what to try.
 */
export function diagnose(evidence = {}) {
  const {
    imageLoaded = false, fetchSucceeded = false, status = 0,
    elapsedMs = 0, timeoutMs = 4000, pageScheme = '', targetScheme = '',
  } = evidence;

  if (pageScheme === 'https:' && targetScheme === 'http:') {
    return {
      outcome: OUTCOMES.mixed,
      next: [
        'Open this console over http:// while on the ranch network.',
        'Or put the relay behind HTTPS and point the console at the relay instead of the camera.',
      ],
    };
  }

  if (status === 401 || status === 403) {
    return {
      outcome: OUTCOMES.auth,
      next: [
        'Check the username and password, which Reolink treats as case sensitive.',
        'Create a dedicated viewer account rather than giving the console the admin login.',
      ],
    };
  }

  if (fetchSucceeded) {
    return { outcome: OUTCOMES.ok, next: ['Frames are readable. Add it as a source and every deck will work on it.'] };
  }

  // The telling combination: the picture loads, the read does not. That is
  // cross-origin, and nothing about the camera will change it.
  if (imageLoaded) {
    return {
      outcome: OUTCOMES.cors,
      next: [
        'Put go2rtc or MediaMTX on a machine that is already on, and point the console at the relay.',
        'The camera is fine. The browser is refusing to let this page read its pixels.',
      ],
    };
  }

  if (elapsedMs >= timeoutMs * 0.9) {
    return {
      outcome: OUTCOMES.timeout,
      next: [
        'Confirm the address from the Reolink app, under device settings.',
        'Confirm this device is on the same network — a phone on mobile data cannot see the camera.',
        'On a battery Argus, expect this: it sleeps, and it only wakes for Reolink\'s own app. A relay that speaks their protocol is the way in.',
      ],
    };
  }

  return {
    outcome: OUTCOMES.refused,
    next: [
      'Switch RTSP on, in Settings, Network, Advanced.',
      'Check the port — 554 for RTSP, 8000 for ONVIF, 80 or 443 for snapshots.',
      'If this is a battery model, none of those ports are open and a relay is the only route.',
    ],
  };
}

/**
 * What to do, given a camera and what it will serve.
 *
 * @param {Family|null} family The identified family.
 * @returns {{route: string, headline: string, steps: string[]}} The recommended path.
 */
export function recommend(family) {
  if (!family) {
    return {
      route: 'unknown',
      headline: 'Unrecognised model — try it and see.',
      steps: [
        'Test the snapshot address first; almost every IP camera serves one.',
        'If that answers, a relay makes it measurable.',
      ],
    };
  }

  if (family.battery) {
    return {
      route: 'relay',
      headline: 'A battery Argus needs a relay. There is no way round it.',
      steps: [
        'Run go2rtc on a machine that stays on — it speaks Reolink\'s own protocol, which is what a battery camera answers.',
        'Add the camera to go2rtc with its Reolink credentials.',
        'Point this console at the relay\'s stream URL. Frames become readable and every deck works on them.',
        'A Reolink Home Hub is the other route: it stays awake and re-serves its paired cameras over RTSP.',
      ],
    };
  }

  return {
    route: 'rtsp-relay',
    headline: 'This one serves RTSP. It still needs a relay, because browsers do not play RTSP.',
    steps: [
      'Switch RTSP on in the camera: Settings, Network, Advanced.',
      'Make a viewer account rather than using the admin login.',
      'Point go2rtc or MediaMTX at the RTSP URL below.',
      'Point this console at the relay. Prefer the sub stream — this console processes at 320 pixels wide either way.',
    ],
  };
}

/**
 * The path the console's own dev server proxies to a relay.
 *
 * Serving the relay from this origin is what removes both walls at once: no
 * cross-origin read to be refused, no tainted canvas, and no mixed-content block
 * when the console is opened over plain HTTP on the ranch network. It is also
 * free — the proxy is three lines of the dev server's own configuration.
 */
export const LOCAL_RELAY_PATH = '/relay';

/**
 * Same-origin URLs for a stream, through the console's relay proxy.
 *
 * @param {string} name The stream name configured in the relay.
 * @param {string} [relayId='go2rtc'] Which relay is behind the proxy.
 * @returns {{hls: string, webrtc: string}|null} Both URLs.
 */
export function localRelayUrls(name, relayId = 'go2rtc') {
  if (!name) return null;
  return relayUrls(relayId, LOCAL_RELAY_PATH, name);
}

/**
 * Whether this page can use the same-origin relay proxy.
 *
 * The proxy exists in the console's own dev server. A copy served from a static
 * host has no server to proxy with, so the answer there is to run the console
 * locally — on the same machine as the relay, which most people already have on.
 *
 * @param {string} origin The page's origin.
 * @returns {{available: boolean, reason: string}} Whether the proxy is there.
 */
export function localRelayAvailable(origin) {
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[^/]+\.local)(:\d+)?$/i.test(String(origin ?? ''));
  return local
    ? {
      available: true,
      reason: 'Running from the console\'s own server, so the relay is proxied at /relay — same origin, fully measurable.',
    }
    : {
      available: false,
      reason: 'This copy is served from a static host, which has no server to proxy through. Run ./start.sh on the machine beside the relay and open the console there; everything below then works with no CORS and no mixed-content block.',
    };
}

/**
 * A ready-to-paste go2rtc configuration for a camera.
 *
 * go2rtc is free and open source, a single binary of about twenty megabytes,
 * and it runs on anything already switched on — a NAS, a mini PC, a Raspberry
 * Pi. This writes the file so the setup is a copy and a paste rather than an
 * afternoon of reading.
 *
 * For a wired camera the RTSP source is the whole answer. For a battery Argus
 * there is no RTSP to point at, so both plausible routes are written out and
 * labelled: Reolink's HTTP-FLV endpoint, which some battery models answer, and
 * the Home Hub, which is mains-powered, stays awake, and re-serves its paired
 * cameras over RTSP. Try the first; the second is the one that always works.
 *
 * @param {object} camera Connection details.
 * @param {string} camera.name Stream name to use in the relay.
 * @param {string} camera.host Camera address.
 * @param {string} [camera.user] Username.
 * @param {string} [camera.password] Password.
 * @param {Family|null} [camera.family] The identified family.
 * @param {string} [camera.hubHost] Address of a Reolink Home Hub, when there is one.
 * @returns {string} A go2rtc YAML configuration.
 */
export function go2rtcConfig(camera) {
  const { name = 'argus', host = '192.168.1.42', user = 'viewer', password = 'PASSWORD', family = null, hubHost = '' } = camera ?? {};
  const safeName = String(name).replace(/[^a-z0-9_-]/gi, '-').toLowerCase() || 'argus';
  const lines = [
    '# go2rtc.yaml — free and open source: github.com/AlexxIT/go2rtc',
    '#',
    '# Put this beside the go2rtc binary and start it. The console then reads the',
    '# stream through its own /relay path, which keeps it same-origin and',
    '# therefore measurable rather than merely visible.',
    '',
    'api:',
    '  listen: ":1984"',
    '',
    'streams:',
  ];

  if (family?.battery) {
    lines.push(
      `  # ${family.name}. There is no RTSP on this camera to point at, so try these in order.`,
      '  #',
      '  # 1. Reolink HTTP-FLV. Some battery models answer this; it costs nothing to try.',
      `  ${safeName}: "http://${host}/flv?port=1935&app=bcs&stream=channel0_main.bcs&user=${user}&password=${password}"`,
      '',
      '  # 2. Through a Reolink Home Hub, which is mains powered, stays awake, and',
      '  #    re-serves its paired battery cameras over RTSP. This is the route that',
      '  #    always works. Uncomment it and set the hub address.',
      `  # ${safeName}_hub: rtsp://${user}:${password}@${hubHost || 'HUB-ADDRESS'}:554/h264Preview_01_sub`,
    );
  } else {
    lines.push(
      `  # ${family ? family.name : 'IP camera'}. Sub stream: smaller, sooner, and this`,
      '  # console processes at 320 pixels wide either way.',
      `  ${safeName}: ${rtspUrl({ host, user, password, stream: 'sub' })}`,
      '',
      '  # The main stream, if you want the recording to be full resolution.',
      `  # ${safeName}_main: ${rtspUrl({ host, user, password, stream: 'main' })}`,
    );
  }

  lines.push(
    '',
    '# Then, on the machine running this:',
    '#   ./start.sh',
    `#   open http://localhost:4173/black-optic-6/  and add  /relay/api/stream.m3u8?src=${safeName}`,
  );
  return lines.join('\n');
}

/**
 * What the whole setup costs, itemised.
 *
 * Worth stating plainly, because "it needs a relay" reads like a paywall and is
 * not one: every part of this is free, and the only requirement is a computer
 * that is already switched on.
 */
export const COST = Object.freeze([
  { item: 'go2rtc', cost: 'Free', note: 'Open source, MIT licensed. One binary, about 20 MB.' },
  { item: 'This console', cost: 'Free', note: 'Runs from the repository. No account, no key, no backend.' },
  { item: 'Reolink subscription', cost: 'Not needed', note: 'None of this touches Reolink\'s cloud. The camera is read on your own network.' },
  { item: 'Hardware', cost: 'Whatever is already on', note: 'A NAS, a mini PC, a Raspberry Pi. It idles at a few percent of one core.' },
  { item: 'Reolink Home Hub', cost: 'Optional, about £70', note: 'Only if the HTTP-FLV route does not answer on your battery model. It is the route that always works.' },
]);

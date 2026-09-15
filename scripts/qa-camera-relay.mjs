/**
 * Proof that the camera relay reaches the console on its own origin.
 *
 * This is the check behind the only claim in the Argus setup that matters: that
 * a camera stream can be made *measurable* rather than merely visible, for
 * nothing, on hardware already switched on.
 *
 * The chain it exercises is the real one. A stand-in relay listens on go2rtc's
 * own port. The console's actual dev server starts with its actual
 * configuration. The stream is then requested through `/relay` — the same path
 * the Argus panel writes into the camera sources — and the response has to come
 * back from the console's origin with the stream intact. Same origin is what
 * stops the browser tainting the canvas, and a tainted canvas is what silently
 * turns every deck in this console into decoration.
 *
 * A stand-in stands in for go2rtc and nothing else: the proxy, the path, the
 * rewrite and the dev server are all the shipped ones.
 *
 * Usage:
 *   node scripts/qa-camera-relay.mjs
 *
 * @module scripts/qa-camera-relay
 */

import http from 'node:http';

/** The port go2rtc listens on by default, and the one the proxy targets. */
const RELAY_PORT = 1984;

/** A port for the dev server that will not collide with a real one. */
const CONSOLE_PORT = 4199;

/** What the stand-in relay answers with. */
const PLAYLIST = '#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:2.0,\nseg0.ts\n';

/**
 * Start a stand-in for go2rtc.
 *
 * @returns {Promise<{server: http.Server, hits: string[]}>} The relay and what it was asked for.
 */
function standInRelay() {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    if (req.url.startsWith('/api/stream.m3u8')) {
      res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
      res.end(PLAYLIST);
      return;
    }
    if (req.url.startsWith('/api/frame.jpeg')) {
      res.writeHead(200, { 'content-type': 'image/jpeg' });
      res.end(Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00]));
      return;
    }
    res.writeHead(404).end('not found');
  });
  return new Promise((resolve) => {
    server.listen(RELAY_PORT, '127.0.0.1', () => resolve({ server, hits }));
  });
}

/**
 * Run the check.
 *
 * @returns {Promise<void>} Resolves once the report is printed.
 */
async function main() {
  const failures = [];
  /**
   * Record an assertion result.
   *
   * @param {boolean} condition Assertion outcome.
   * @param {string} message What was being asserted.
   * @returns {void}
   */
  const check = (condition, message) => {
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`);
    if (!condition) failures.push(message);
  };

  const { createServer } = await import('vite');
  const { server: relay, hits } = await standInRelay();
  const devServer = await createServer({
    configFile: 'vite.config.js',
    server: { port: CONSOLE_PORT, host: '127.0.0.1' },
    logLevel: 'error',
    // The proxy is middleware and needs no bundle behind it. Skipping dependency
    // discovery keeps this check to a couple of seconds and stops the globe's
    // own entry point scanning Cesium on the way past.
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await devServer.listen();

  try {
    const origin = `http://127.0.0.1:${CONSOLE_PORT}`;

    const playlist = await fetch(`${origin}/relay/api/stream.m3u8?src=argus-gate`);
    const body = await playlist.text();
    check(playlist.status === 200, `the relay answers through the console (${playlist.status})`);
    check(body.startsWith('#EXTM3U'), 'and the stream arrives intact');
    check(
      playlist.headers.get('content-type')?.includes('mpegurl'),
      `the content type survives the proxy (${playlist.headers.get('content-type')})`,
    );

    check(
      hits.some((url) => url === '/api/stream.m3u8?src=argus-gate'),
      `the /relay prefix is stripped before the relay sees it (${hits[0]})`,
    );

    const frame = await fetch(`${origin}/relay/api/frame.jpeg?src=argus-gate`);
    const bytes = new Uint8Array(await frame.arrayBuffer());
    check(frame.status === 200 && bytes[0] === 0xff && bytes[1] === 0xd8, 'binary frames pass through unmangled');

    // The point of the whole exercise: the response comes from the console's own
    // origin, so a canvas drawn from it is not tainted and every deck can read it.
    check(
      new URL(playlist.url).origin === origin,
      `the stream is served from the console's own origin (${new URL(playlist.url).origin})`,
    );

    const missing = await fetch(`${origin}/relay/api/nothing-here`);
    check(missing.status === 404, 'an unknown relay path is passed through rather than swallowed');
  } finally {
    await devServer.close();
    relay.close();
  }

  console.log(failures.length ? `\n${failures.length} failed` : '\nall checks passed');
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

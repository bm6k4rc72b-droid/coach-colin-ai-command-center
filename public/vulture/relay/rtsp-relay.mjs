#!/usr/bin/env node
/**
 * VultureSystemV1 RTSP relay.
 *
 * Browsers cannot open rtsp:// streams. This relay runs on your own machine
 * (laptop, NUC, Raspberry Pi, Jetson), pulls the camera's RTSP feed with
 * ffmpeg and serves it as MJPEG over HTTP with CORS, which the VultureSystemV1
 * web app reads and analyses on-device. Nothing goes to the internet.
 *
 *   node rtsp-relay.mjs                 # http://127.0.0.1:8787
 *   HOST=0.0.0.0 PORT=8787 node rtsp-relay.mjs     # reachable from a phone on your LAN
 *   TOKEN=secret node rtsp-relay.mjs    # require ?token=secret on every request
 *
 * GET /health                              → {"ok":true,...}
 * GET /mjpeg?src=<rtsp-url>&fps=12&w=960   → multipart/x-mixed-replace MJPEG
 *
 * Requires Node 18+ and ffmpeg on PATH (FFMPEG=/path/to/ffmpeg to override).
 */

import http from 'node:http';
import { spawn } from 'node:child_process';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 8787);
const TOKEN = process.env.TOKEN ?? '';
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const MAX_STREAMS = Number(process.env.MAX_STREAMS ?? 8);
const ALLOWED = /^(rtsps?|rtmp|https?|srt|udp):\/\//i;

let active = 0;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  // Lets an HTTPS page reach this relay on a private address (Chrome Private Network Access).
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function clampInt(v, lo, hi, dflt) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  if (TOKEN && url.searchParams.get('token') !== TOKEN) { res.writeHead(401); res.end('bad token'); return; }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, active, max: MAX_STREAMS }));
    return;
  }

  if (url.pathname !== '/mjpeg') { res.writeHead(404); res.end('not found'); return; }
  const src = url.searchParams.get('src') ?? '';
  if (!ALLOWED.test(src)) { res.writeHead(400); res.end('src must be an rtsp://, rtsps://, rtmp://, srt://, udp:// or http(s):// URL'); return; }
  if (active >= MAX_STREAMS) { res.writeHead(503); res.end('too many streams'); return; }
  const fps = clampInt(url.searchParams.get('fps'), 1, 30, 12);
  const w = clampInt(url.searchParams.get('w'), 160, 1920, 960);

  // Low-latency input flags only for live protocols; on files/HTTP MP4 "nobuffer" drops every frame.
  const input = /^rtsps?:/i.test(src) ? ['-rtsp_transport', 'tcp', '-fflags', 'nobuffer', '-flags', 'low_delay'] : [];
  const args = [
    '-hide_banner', '-loglevel', 'error',
    ...input, '-i', src,
    '-an', '-vf', `fps=${fps},scale=${w}:-2`, '-q:v', '6',
    '-f', 'mpjpeg', '-boundary_tag', 'vulture', 'pipe:1',
  ];
  // Arguments go straight to execve (no shell), so the URL cannot inject commands.
  const ff = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  active++;
  let started = false;
  let errText = '';
  ff.stderr.on('data', (d) => { errText = (errText + d).slice(-2000); });
  ff.stdout.once('data', () => {
    started = true;
    console.log(`[relay] streaming ${src.replace(/\/\/[^@/]*@/, '//***@')} @ ${fps} fps, ${w}px`);
  });
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=vulture',
    'Cache-Control': 'no-cache, no-store',
    Connection: 'close',
  });
  ff.stdout.pipe(res);
  const stop = () => { if (!ff.killed) ff.kill('SIGKILL'); };
  res.on('close', stop); // client went away (req 'close' fires as soon as a GET body is read)
  ff.on('error', (e) => { console.error(`[relay] cannot run ffmpeg: ${e.message}`); res.end(); });
  ff.on('close', (code) => {
    active--;
    if (!started && code) console.error(`[relay] ffmpeg exited ${code}: ${errText.trim()}`);
    res.end();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`VultureSystemV1 RTSP relay on http://${HOST}:${PORT}`);
  console.log('In the app: Cameras & Devices → IP / RTSP camera → paste the rtsp:// URL.');
});

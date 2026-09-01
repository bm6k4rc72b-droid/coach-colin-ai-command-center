/* Minimal CDP driver: renders a local HTML file to PDF with headless Chromium.
   Usage: node print.mjs <input.html> <output.pdf> <options.json>            */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const [input, output, optFile] = process.argv.slice(2);
const opts = JSON.parse(readFileSync(optFile, 'utf8'));

const profile = mkdtempSync(join(tmpdir(), 'cc-print-'));
const child = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--hide-scrollbars', '--no-first-run', '--disable-extensions',
  '--force-color-profile=srgb', '--font-render-hinting=none',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
child.stderr.on('data', () => {});

const portFile = join(profile, 'DevToolsActivePort');
let port = null;
for (let i = 0; i < 200 && !port; i++) {
  await sleep(100);
  if (existsSync(portFile)) {
    const l = readFileSync(portFile, 'utf8').split('\n');
    if (l[0]) port = l[0].trim();
  }
}
if (!port) { child.kill(); throw new Error('chromium did not start'); }

const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
const events = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  } else if (msg.method) events.push(msg);
};
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const m = { id: ++id, method, params };
    if (sessionId) m.sessionId = sessionId;
    pending.set(m.id, { res, rej });
    ws.send(JSON.stringify(m));
  });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
// route session-scoped replies
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
};

await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Emulation.setEmulatedMedia', { media: 'print' }, sessionId);

const url = 'file://' + input;
await send('Page.navigate', { url }, sessionId);

// wait for document ready + custom render signal
for (let i = 0; i < 900; i++) {
  await sleep(100);
  const r = await send('Runtime.evaluate', {
    expression: 'document.readyState === "complete" && !!window.__BOOK_READY__',
    returnByValue: true,
  }, sessionId);
  if (r.result.value) break;
}
await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>1)', awaitPromise: true }, sessionId);
await sleep(500);

const stats = await send('Runtime.evaluate', {
  expression: 'JSON.stringify({math: window.__MATH_COUNT__ ?? -1, err: window.__MATH_ERRORS__ ?? []})',
  returnByValue: true,
}, sessionId);
console.error('render:', stats.result.value);

const pdf = await send('Page.printToPDF', {
  printBackground: true,
  preferCSSPageSize: !!opts.preferCSSPageSize,
  paperWidth: opts.paperWidth,
  paperHeight: opts.paperHeight,
  ...(opts.marginTop === undefined ? {} : {
    marginTop: opts.marginTop, marginBottom: opts.marginBottom,
    marginLeft: opts.marginLeft, marginRight: opts.marginRight }),
  displayHeaderFooter: !!opts.displayHeaderFooter,
  headerTemplate: opts.headerTemplate ?? '<span></span>',
  footerTemplate: opts.footerTemplate ?? '<span></span>',
  scale: 1,
  // Returning a multi-megabyte PDF as one base64 blob stalls the DevTools
  // WebSocket: past roughly 160 pages the reply never arrives. Stream it.
  transferMode: 'ReturnAsStream',
}, sessionId);

const chunks = [];
for (;;) {
  const r = await send('IO.read', { handle: pdf.stream, size: 1 << 20 }, sessionId);
  if (r.data) chunks.push(Buffer.from(r.data, r.base64Encoded ? 'base64' : 'utf8'));
  if (r.eof) break;
}
await send('IO.close', { handle: pdf.stream }, sessionId);
writeFileSync(output, Buffer.concat(chunks));
ws.close(); child.kill('SIGKILL');
try { rmSync(profile, { recursive: true, force: true }); } catch {}
console.error('wrote', output);
process.exit(0);

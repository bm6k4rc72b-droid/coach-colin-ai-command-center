#!/usr/bin/env node
/**
 * Coach Colin's Video Machine: script or topic in, finished vertical video out, via MoneyPrinterTurbo.
 *
 *   node money-printer/make-video.mjs --script reel-props.json --lane glp       # a COLIN OS script
 *   node money-printer/make-video.mjs --topic "3 mistakes on a GLP-1" --lane glp # MPT writes it (needs ANTHROPIC key in its config)
 *   node money-printer/make-video.mjs --batch topics.txt --lane athlete          # one video per line
 *   node money-printer/make-video.mjs --script s.json --voicestudio              # your cloned voice (VoiceStudio), via MPT's CLI
 *   add --dry-run to print the job without sending it
 *
 * Env: MPT_URL (default http://127.0.0.1:8080), MPT_API_KEY (if you set app.api_key),
 *      VOICESTUDIO_URL / VOICESTUDIO_VOICE (see reel-studio/README.md).
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildMptParams, narration, readTask } from '../public/colin-os/js/videomachine.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MPT_DIR = path.join(HERE, 'MoneyPrinterTurbo');
const OUT = path.join(HERE, 'out');
const API = (process.env.MPT_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const headers = { 'Content-Type': 'application/json', ...(process.env.MPT_API_KEY && { 'x-api-key': process.env.MPT_API_KEY }) };

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = (k) => args.includes(`--${k}`);
const lane = opt('lane') || 'general';

async function jobs() {
  if (opt('script')) return [JSON.parse(await readFile(opt('script'), 'utf8'))];
  if (opt('topic')) return [{ topic: opt('topic') }];
  if (opt('batch')) return (await readFile(opt('batch'), 'utf8')).split('\n').map((s) => s.trim()).filter(Boolean).map((topic) => ({ topic }));
  console.error('Give --script file.json, --topic "..." or --batch topics.txt'); process.exit(1);
}

async function viaApi(params) {
  const res = await fetch(`${API}/api/v1/videos`, { method: 'POST', headers, body: JSON.stringify(params) })
    .catch((e) => { throw new Error(`MoneyPrinterTurbo is not reachable at ${API}. Start it with ./money-printer/run.sh (${e.message})`); });
  const body = await res.json();
  if (!res.ok) throw new Error(`MoneyPrinterTurbo ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
  const id = body.data?.task_id;
  process.stdout.write(`task ${id} `);
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const t = readTask(await (await fetch(`${API}/api/v1/tasks/${id}`, { headers })).json());
    process.stdout.write(`${t.progress}% `);
    if (!t.done) continue;
    if (!t.ok) throw new Error(t.error);
    await mkdir(OUT, { recursive: true });
    const saved = [];
    for (const url of t.videos) {
      const file = path.join(OUT, `${id}-${path.basename(new URL(url, API).pathname)}`);
      await writeFile(file, Buffer.from(await (await fetch(new URL(url, API), { headers })).arrayBuffer()));
      saved.push(file);
    }
    console.log(`\n✓ ${saved.join(', ')}`);
    return saved;
  }
}

/** VoiceStudio narration (Colin's cloned voice), then MoneyPrinterTurbo's CLI with --custom-audio-file. */
async function viaVoiceStudio(params) {
  const vs = (process.env.VOICESTUDIO_URL || 'http://localhost:3900').replace(/\/$/, '');
  const res = await fetch(`${vs}/v1/audio/speech`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'tts-1', input: params.video_script, voice: process.env.VOICESTUDIO_VOICE || 'default', response_format: 'mp3' }) })
    .catch((e) => { throw new Error(`VoiceStudio is not reachable at ${vs} (${e.message})`); });
  if (!res.ok) throw new Error(`VoiceStudio ${res.status}: ${(await res.text()).slice(0, 300)}`);
  await mkdir(OUT, { recursive: true });
  const audio = path.join(OUT, `voice-${Date.now()}.mp3`);
  await writeFile(audio, Buffer.from(await res.arrayBuffer()));
  const cliArgs = ['cli.py', '--custom-audio-file', audio];
  const skip = new Set(['custom_system_prompt']);
  for (const [k, v] of Object.entries(params)) {
    if (skip.has(k) || v === '' || v == null) continue;
    const f = `--${k.replace(/_/g, '-')}`;
    if (typeof v === 'boolean') { if (k === 'subtitle_enabled') cliArgs.push(f, String(v)); continue; }
    cliArgs.push(f, Array.isArray(v) ? v.join(',') : String(v));
  }
  const py = process.env.MPT_PYTHON || 'uv';
  const argv = py === 'uv' ? ['run', 'python', ...cliArgs] : cliArgs;
  console.log(`Running MoneyPrinterTurbo CLI with your VoiceStudio voice-over (${audio})`);
  await new Promise((ok, fail) => spawn(py, argv, { cwd: MPT_DIR, stdio: 'inherit' }).on('exit', (c) => (c ? fail(new Error(`cli.py exited ${c}`)) : ok())));
}

for (const job of await jobs()) {
  const params = buildMptParams(job, { lane, force: flag('force') });
  if (flag('dry-run')) { console.log(JSON.stringify(params, null, 2)); continue; }
  if (flag('voicestudio')) {
    if (!params.video_script) throw new Error('--voicestudio needs a written script (--script), not a bare topic');
    await viaVoiceStudio(params);
  } else {
    console.log(`▶ ${params.video_subject}${params.video_script ? `: "${narration(job).slice(0, 70)}…"` : ' (MoneyPrinterTurbo writes the script)'}`);
    await viaApi(params);
  }
}

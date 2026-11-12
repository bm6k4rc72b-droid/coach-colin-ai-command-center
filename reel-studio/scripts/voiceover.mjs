#!/usr/bin/env node
/**
 * Voices every line of props.json with VoiceStudio (https://github.com/debpalash/VoiceStudio), running
 * on this machine, then writes the audio paths and lengths back into props.json so each scene lasts
 * exactly as long as its line.
 *
 * VoiceStudio exposes an OpenAI-compatible endpoint; loopback needs no key.
 *   VOICESTUDIO_URL   default http://localhost:3900
 *   VOICESTUDIO_VOICE the voice profile name you cloned (e.g. "Colin"); default "default"
 *   VOICESTUDIO_KEY   only if you reach VoiceStudio over the network with OMNIVOICE_API_KEY set
 *
 * Usage: npm run voiceover [-- props.json]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { segments, wavSeconds } from '../src/timeline.js';

const BASE = (process.env.VOICESTUDIO_URL || 'http://localhost:3900').replace(/\/$/, '');
const VOICE = process.env.VOICESTUDIO_VOICE || 'default';
const file = process.argv[2] || 'props.json';
const props = JSON.parse(await readFile(file, 'utf8'));
delete props.audio;

await mkdir('public/vo', { recursive: true });
const audio = [];
for (const seg of segments(props)) {
  const res = await fetch(`${BASE}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(process.env.VOICESTUDIO_KEY && { Authorization: `Bearer ${process.env.VOICESTUDIO_KEY}` }) },
    body: JSON.stringify({ model: 'tts-1', input: seg.text, voice: VOICE, response_format: 'wav' }),
  }).catch((e) => { throw new Error(`Cannot reach VoiceStudio at ${BASE}. Start the VoiceStudio app (or its backend) first. (${e.message})`); });
  if (!res.ok) throw new Error(`VoiceStudio ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const src = `vo/seg-${seg.index}.wav`;
  await writeFile(`public/${src}`, buf);
  const seconds = Math.round(wavSeconds(buf) * 100) / 100;
  audio.push({ src, seconds });
  console.log(`✓ ${seg.kind.padEnd(4)} ${seconds.toFixed(2)}s  ${seg.text}`);
}
props.audio = audio;
await writeFile(file, `${JSON.stringify(props, null, 2)}\n`);
console.log(`Voiced ${audio.length} lines with voice "${VOICE}". Now: npm run render`);

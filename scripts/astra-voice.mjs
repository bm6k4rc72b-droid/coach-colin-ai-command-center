#!/usr/bin/env node
/**
 * Record ASTRA's scripted lines in the owner's ElevenLabs voice.
 *
 * Every English line in voicebank.js plus the courtroom's fixed sentences (court
 * openings, rulings, objections, exhibits A–L, sentences, verdict tags) is sent to
 * ElevenLabs text-to-speech and saved as public/astra/assets/voice/el/<hash>.mp3;
 * voicebank-el.js is rewritten to list them. Lines already recorded are skipped,
 * so re-running only records what changed.
 *
 *   ELEVENLABS_API_KEY=sk_... npm run astra:voice                # finds the voice named "Colin"
 *   npm run astra:voice -- --voice <voice_id> [--model eleven_multilingual_v2] [--only court]
 *
 * The key is read from ELEVENLABS_API_KEY and sent only to api.elevenlabs.io.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINES } from '../public/astra/showcase/voicebank.js';
import { T } from '../public/astra/showcase/i18n.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/astra/assets/voice/el');
const BANK = path.join(ROOT, 'public/astra/showcase/voicebank-el.js');
const API = 'https://api.elevenlabs.io';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const KEY = process.env.ELEVENLABS_API_KEY || '';
const headers = { 'xi-api-key': KEY, 'content-type': 'application/json' };

/** The courtroom's fixed sentences: what studioParts() can match sentence by sentence. */
export function courtLines(en = T.en) {
  const out = new Set();
  const sentences = (text) => (String(text).match(/[^.!?…]+[.!?…]+["”’)]*|[^.!?…]+$/g) || []).map((s) => s.trim()).filter(Boolean);
  const add = (text) => sentences(text).forEach((s) => out.add(s));
  add(en.courtOrder); add(en.courtCross);
  add(en.courtOpen('X', 'X', 'X').split('.').slice(1, 3).join('.') + '.');
  add('Keep it evidential.');
  for (const label of Object.values(en.courtObjections)) { add(`Objection: ${label}.`); }
  add('Sustained.'); add('Overruled. Do sit down.'); add('Do sit down.'); add('Overruled.');
  for (const s of Object.values(en.courtSentence)) add(s);
  add('No majority.'); add('A draw.'); add('How terribly British.');
  for (const letter of 'ABCDEFGHIJKL') add(en.courtWitness(letter));
  for (const name of ['Defence', 'Prosecution']) add(sentences(en.courtVerdict(name, 7, 5)).pop());
  return [...out];
}

async function findVoice() {
  const wanted = opt('voice');
  if (wanted) return wanted;
  const r = await fetch(`${API}/v2/voices?page_size=100&search=colin`, { headers });
  if (!r.ok) throw new Error(`voices: ${r.status} ${await r.text()}`);
  const { voices } = await r.json();
  const v = voices.find((x) => /colin/i.test(x.name));
  if (!v) throw new Error(`No voice named Colin in this ElevenLabs account (found: ${voices.map((x) => x.name).join(', ') || 'none'}). Pass --voice <id>.`);
  console.log(`voice: ${v.name} (${v.voice_id})`);
  return v.voice_id;
}

const fileFor = (voice, model, text) => `${crypto.createHash('sha1').update(`${voice}|${model}|${text}`).digest('hex').slice(0, 16)}.mp3`;

async function main() {
  if (!/^sk_/.test(KEY) && KEY !== 'proxy-injected') throw new Error('Set ELEVENLABS_API_KEY (ElevenLabs keys start with sk_).');
  const voice = await findVoice();
  const model = opt('model', 'eleven_multilingual_v2');
  const only = opt('only');
  const texts = [...new Set([...(only === 'court' ? [] : LINES.map(([t]) => t)), ...courtLines()])];
  fs.mkdirSync(OUT, { recursive: true });
  const rows = [];
  for (const [i, text] of texts.entries()) {
    const file = fileFor(voice, model, text);
    const dest = path.join(OUT, file);
    if (!fs.existsSync(dest)) {
      const r = await fetch(`${API}/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
        method: 'POST', headers,
        body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.45, similarity_boost: 0.85, style: 0.35, use_speaker_boost: true } }),
      });
      if (!r.ok) throw new Error(`tts "${text.slice(0, 40)}…": ${r.status} ${await r.text()}`);
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      console.log(`[${i + 1}/${texts.length}] ${text.slice(0, 70)}`);
    }
    rows.push([text, file]);
  }
  const body = rows.map(([t, f]) => `  [${JSON.stringify(t)}, '${f}'],`).join('\n');
  const head = fs.readFileSync(BANK, 'utf8').split('/** The ElevenLabs voice')[0];
  fs.writeFileSync(BANK, `${head}/** The ElevenLabs voice the lines were recorded in (empty until the first recording run). */\nexport const EL_VOICE = '${voice}';\n\n/** [line, file] pairs. */\nexport const EL_LINES = [\n${body}\n];\n`);
  console.log(`${rows.length} lines in ${path.relative(ROOT, BANK)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });

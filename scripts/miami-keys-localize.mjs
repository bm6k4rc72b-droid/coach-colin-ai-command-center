#!/usr/bin/env node
/**
 * Bring the Neon Keys media home.
 *
 * The page ships pointing at Higgsfield's CDN. This downloads every still and
 * clip into public/miami-keys/media/, re-encodes the clips for scrubbing
 * (a keyframe every 4 frames, no audio, 1600px wide, faststart) and rewrites
 * media.js to the local paths. Stills become WebP.
 *
 * Needs network access to the CDN, ffmpeg on PATH, and sharp (a devDependency).
 *
 *   node scripts/miami-keys-localize.mjs
 *
 * @module scripts/miami-keys-localize
 */

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.join(here, '..', 'public', 'miami-keys');
const outDir = path.join(site, 'media');
const manifestPath = path.join(site, 'js', 'media.js');

const { MEDIA } = await import(path.join(site, 'js', 'media.js'));
await mkdir(outDir, { recursive: true });

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

let source = await readFile(manifestPath, 'utf8');
const swaps = [];

for (const [name, entry] of Object.entries(MEDIA)) {
  const posterOut = `media/${name}.webp`;
  const png = await download(entry.poster);
  await sharp(png).webp({ quality: 82 }).toFile(path.join(site, posterOut));
  swaps.push([entry.poster, posterOut]);
  console.log(`still  ${name}`);

  if (entry.video) {
    const raw = path.join(outDir, `${name}.src.mp4`);
    const videoOut = `media/${name}.mp4`;
    await writeFile(raw, await download(entry.video));
    execFileSync('ffmpeg', [
      '-loglevel', 'error', '-y', '-i', raw,
      '-an', '-vf', 'scale=1600:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23',
      '-pix_fmt', 'yuv420p', '-x264-params', 'keyint=4:min-keyint=1:scenecut=0',
      '-movflags', '+faststart', path.join(site, videoOut),
    ]);
    execFileSync('rm', [raw]);
    swaps.push([entry.video, videoOut]);
    console.log(`clip   ${name}`);
  }
}

// the manifest builds URLs as `${CDN}file`, so swap whole template literals
for (const [url, local] of swaps) {
  const file = url.split('/').pop();
  source = source.replace(`\`\${CDN}${file}\``, `'${local}'`);
}
await writeFile(manifestPath, source);
console.log(`\nRewrote ${path.relative(process.cwd(), manifestPath)} — ${swaps.length} files now local.`);

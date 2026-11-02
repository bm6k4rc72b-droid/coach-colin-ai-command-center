#!/usr/bin/env node
/**
 * Bring the VIGIL media home: downloads every still (→ WebP) and the film into
 * public/vigil/media/ and rewrites js/media.js to the local paths.
 * Needs network access to Higgsfield's CDN and sharp (a devDependency).
 *
 *   npm run media:vigil
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'vigil');
const manifest = path.join(site, 'js', 'media.js');
const { MEDIA } = await import(manifest);
await mkdir(path.join(site, 'media'), { recursive: true });
let src = await readFile(manifest, 'utf8');

for (const [name, url] of Object.entries(MEDIA)) {
  if (!url || !url.startsWith('http')) continue;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const local = url.endsWith('.mp4') ? `media/${name}.mp4` : `media/${name}.webp`;
  if (local.endsWith('.webp')) await sharp(buf).webp({ quality: 84 }).toFile(path.join(site, local));
  else await writeFile(path.join(site, local), buf);
  const file = url.split('/').pop();
  src = src.replace(`\`\${CDN}${file}\``, `new URL('../${local}', import.meta.url).href`);
  console.log(`${name.padEnd(10)} → ${local}`);
}
await writeFile(manifest, src);

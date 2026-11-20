// Builds index.html: concatenates src/*.js into one module and inlines the Blender dragon GLB.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const src = readdirSync(join(here, 'src')).filter((f) => f.endsWith('.js')).sort().map((f) => `// ---- ${f} ----\n` + readFileSync(join(here, 'src', f), 'utf8')).join('\n');
const code = src;
const html = readFileSync(join(here, 'template.html'), 'utf8').replace('/*__GAME__*/', () => code);
writeFileSync(join(here, 'index.html'), html);
writeFileSync(join(here, 'gilded-circuit.html'), '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>\n' + html + '\n</body></html>\n');
console.log('index.html', (html.length / 1024).toFixed(0), 'KB');

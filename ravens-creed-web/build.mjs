// Builds index.html (artifact fragment) and ravens-creed.html (standalone page): concatenates src/*.js into one module
// and inlines the Drowned Oath dialogue graphs from the Unreal package, so the browser game runs the same JSON.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const dlgDir = join(here, '..', 'ravens-creed', 'Content', 'Data', 'Dialogue');
const dlg = {};
for (const f of readdirSync(dlgDir).filter((f) => f.endsWith('.json'))) { const g = JSON.parse(readFileSync(join(dlgDir, f), 'utf8')); dlg[g.Id] = g; }
const code = readdirSync(join(here, 'src')).filter((f) => f.endsWith('.js')).sort().map((f) => `// ---- ${f} ----\n` + readFileSync(join(here, 'src', f), 'utf8')).join('\n')
  .replace('/*__DLG__*/ {}', () => JSON.stringify(dlg));
const html = readFileSync(join(here, 'template.html'), 'utf8').replace('/*__GAME__*/', () => code);
writeFileSync(join(here, 'index.html'), html);
writeFileSync(join(here, 'ravens-creed.html'), '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>\n' + html + '\n</body></html>\n');
console.log('index.html', (html.length / 1024).toFixed(0), 'KB;', Object.keys(dlg).length, 'dialogue graphs');

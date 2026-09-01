/* Bundle LOOPBREAK into one self-contained HTML file.
   Used for embedding the app somewhere that can only take a single
   document. The multi-file version in the repo root is the real one —
   this is a build artifact, so run it rather than editing its output.

   Requires esbuild:  npx esbuild ...  (no local install needed)
     node tools/build-single.mjs [outdir]      default: dist/
*/
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out  = process.argv[2] || join(root, 'dist');
mkdirSync(out, { recursive: true });

const bundlePath = join(out, 'bundle.js');
execFileSync('npx', ['--yes', 'esbuild', join(root, 'js/main.js'),
  '--bundle', '--format=esm', '--target=es2020', `--outfile=${bundlePath}`],
  { stdio: 'inherit' });

const read = p => readFileSync(join(root, p), 'utf8');
const html = read('index.html');

// Body only: the module tag and the noscript fallback are replaced inline.
let body = html.split('<body>')[1].split('</body>')[0];
body = body.replace(/<script type="module"[\s\S]*?<\/script>/, '')
           .replace(/<noscript>[\s\S]*?<\/noscript>/, '')
           .trim();

const page = [
  '<title>LOOPBREAK Command Deck</title>',
  '<link rel="preconnect" href="https://fonts.googleapis.com" />',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
  '<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet" />',
  `<style>\n${read('css/holo.css')}\n${read('css/screens.css')}\n</style>`,
  body,
  `<script type="module">\n${readFileSync(bundlePath, 'utf8')}\n</script>`,
].join('\n\n');

// Fragment: no doctype/html/head/body, for hosts that supply their own shell.
writeFileSync(join(out, 'loopbreak.html'), page);

// Standalone: the same page wrapped in a minimal document you can open directly.
writeFileSync(join(out, 'loopbreak-standalone.html'),
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">' +
  '<meta name="theme-color" content="#04070f"></head><body style="margin:0">\n' +
  page + '\n</body></html>');

console.log(`\nloopbreak.html            ${(page.length / 1024).toFixed(0)} KB  (fragment)`);
console.log(`loopbreak-standalone.html ${(page.length / 1024).toFixed(0)} KB  (openable document)`);
console.log('\nNote: sensors need HTTPS and a top-level page. A single file opened');
console.log('from file:// or embedded in a sandboxed frame runs in thumb mode.');

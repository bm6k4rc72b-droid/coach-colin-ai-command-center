#!/usr/bin/env node
/**
 * Bundle PULSE into one self-contained HTML file.
 *
 * `public/pulse/` is a multi-file app (module, styles, worker, manifest,
 * icons). Some hosts only take a single page — a Claude Artifact, a pasted
 * file, an intranet share — so this inlines the styles and concatenates the
 * two modules into one inline `<script type="module">`.
 *
 * Two shapes, because the destinations differ:
 *   --artifact  page content only, no doctype/html/head/body — the host wraps
 *               it in its own skeleton, so emitting those tags would nest a
 *               second document inside the body.
 *   (default)   a complete standalone document you can host anywhere.
 *
 * What the single-file build gives up: the service worker and the web
 * manifest, which have to be separately addressable files. Everything else —
 * the whole capture and estimation pipeline — is identical, because it is the
 * same source text.
 *
 * Usage:
 *   node scripts/build-pulse-standalone.mjs [--artifact] [outfile]
 *
 * @module scripts/build-pulse-standalone
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', 'public', 'pulse');

const args = process.argv.slice(2);
const artifactShape = args.includes('--artifact');
const outFile = path.resolve(
  args.find((arg) => !arg.startsWith('--')) ??
    path.join(HERE, '..', 'dist-pulse', artifactShape ? 'pulse-artifact.html' : 'pulse-standalone.html'),
);

const read = (file) => readFileSync(path.join(SRC, file), 'utf8');

/** Strip ESM syntax so two modules can share one inline script scope. */
function inlineModules() {
  const core = read('vitals-core.js')
    .replace(/^export\s+(?=(const|function|class|let)\b)/gm, '');
  const app = read('app.js')
    // The core is concatenated above, so its import statement has no target.
    .replace(/^import\s*\{[\s\S]*?\}\s*from\s*'\.\/vitals-core\.js';\s*$/m, '')
    // A service worker must be its own file at its own URL; there isn't one here.
    .replace(/^\s*registerServiceWorker\(\);\s*$/m, '  // Service worker omitted: the single-file build has no separate worker URL.');
  return `${core}\n\n/* ------------------------------------------------------------------ */\n\n${app}`;
}

/** Lift the markup out of the page body, dropping the file-based head links. */
function inlineMarkup() {
  const html = read('index.html');
  const body = html.slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>'));
  return body
    // The module is concatenated into the page instead of being fetched.
    .replace(/\s*<script type="module" src="\.\/app\.js"><\/script>/, '')
    .trim();
}

const title = 'PULSE — Contactless Vitals';
const styles = read('pulse.css');
const markup = inlineMarkup();
const script = inlineModules();

const head = artifactShape
  ? `<title>${title}</title>`
  : `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>${title}</title>
<meta name="description" content="Contactless pulse-rate monitoring from any camera. Runs entirely on your device." />
<meta name="theme-color" content="#03060b" />
<meta name="color-scheme" content="dark" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="PULSE" />`;

const open = artifactShape ? '' : '\n</head>\n<body>';
const close = artifactShape ? '' : '\n</body>\n</html>';

const page = `${head}
<style>
${styles}
</style>${open}

${markup}

<script type="module">
${script}
</script>${close}
`;

mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, page);
process.stdout.write(`wrote ${path.relative(process.cwd(), outFile)} (${(page.length / 1024).toFixed(1)} kB)\n`);

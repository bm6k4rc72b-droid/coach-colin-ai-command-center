#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════
   PRISM · bundle — flatten the app into one self-contained file

   Produces dist/prism.html: every stylesheet and script inlined,
   the favicon embedded as a data URI, and the document wrapper
   stripped so the same file can be published as an Artifact
   (which supplies its own doctype/head/body).

   Usage: node tools/bundle.js
   ══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const html = read('index.html');

/* Pull the ordered asset lists straight out of index.html so the
   bundle can never drift from what the real page loads. */
const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);

if (!styles.length || !scripts.length) {
  console.error('bundle: found no local assets in index.html — has the markup changed?');
  process.exit(1);
}

const body = html
  .slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>'))
  // Drop the tags we are about to inline.
  .replace(/<script src="[^"]+"><\/script>\s*/g, '')
  .trim();

const favicon = read('assets/favicon.svg');
const faviconURI = 'data:image/svg+xml;base64,' + Buffer.from(favicon).toString('base64');

const css = styles.map(f => '/* ── ' + f + ' ── */\n' + read(f)).join('\n\n');
const js = scripts.map(f => '/* ── ' + f + ' ── */\n' + read(f)).join('\n\n');

const out = `<title>PRISM Command Deck</title>
<meta name="description" content="A holographic command deck of ten specialist AI agents. Split your intent into a spectrum.">
<meta name="color-scheme" content="dark">
<link rel="icon" href="${faviconURI}" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
${css}
</style>

${body}

<script>
${js}
</script>
`;

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/prism.html'), out);

const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
console.log('dist/prism.html — ' + kb + ' KB (' + styles.length + ' stylesheets, ' + scripts.length + ' scripts inlined)');

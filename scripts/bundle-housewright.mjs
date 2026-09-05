/**
 * Flatten HOUSEWRIGHT into one self-contained HTML file.
 *
 * The app is authored as ten ES modules because that is how it stays
 * readable and testable. But a single file is what you can email, drop on any
 * host, open from a USB stick, or embed in a page that will not serve a
 * directory — so this produces one, without a bundler dependency.
 *
 * The transform is deliberately dumb, and safe only because the source obeys
 * two rules that are checked here rather than assumed: every module imports
 * only its siblings by relative path, and no two modules declare the same
 * top-level name. Given that, stripping the import lines and concatenating in
 * dependency order produces one scope that behaves identically, with a small
 * namespace object emitted per module so `plan.buildRoom(...)` still resolves.
 *
 * Usage:
 *   node scripts/bundle-housewright.mjs [--out <file.html>] [--body-only]
 *
 * `--body-only` omits the <!doctype>, <html>, <head> and <body> wrappers, for
 * hosts that supply their own document shell.
 *
 * @module scripts/bundle-housewright
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'public', 'housewright');

/** Modules in dependency order: every module precedes the ones importing it. */
const ORDER = [
  'mathkit.js',
  'pose.js',
  'hand.js',
  'plan.js',
  'massing.js',
  'finish.js',
  'report.js',
  'ledger.js',
  'camera.js',
  'demo.js',
  'app.js',
];

/** Module namespaces `app.js` reaches through, as `import * as x`. */
const NAMESPACES = {
  'pose.js': 'pose',
  'hand.js': 'hand',
  'plan.js': 'plan',
  'massing.js': 'massing',
  'finish.js': 'finish',
  'report.js': 'report',
  'ledger.js': 'ledger',
};

/**
 * Names a module exports at its top level.
 *
 * @param {string} source Module text.
 * @returns {string[]} Exported binding names, in source order.
 */
export function exportedNames(source) {
  const names = [];
  const declaration = /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
  for (const match of source.matchAll(declaration)) names.push(match[1]);
  return names;
}

/**
 * Strip a module's import and export syntax, leaving plain declarations.
 *
 * @param {string} source Module text.
 * @returns {string} The same code as top-level statements.
 */
export function flatten(source) {
  return source
    // Relative imports only; anything else would mean an external dependency
    // this bundler cannot honestly inline, and `assertBundlable` rejects it.
    .replace(/^import\s+[^;]*?from\s+'\.\/[^']+';\s*$/gm, '')
    .replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/gm, '')
    .replace(/^export\s*\{[^}]*\};\s*$/gm, '');
}

/**
 * Refuse to bundle sources that would not survive being flattened.
 *
 * @param {Map<string, string>} sources Module text by filename.
 * @throws {Error} When a module has a non-relative import or a name collision.
 */
export function assertBundlable(sources) {
  const seen = new Map();
  for (const [name, source] of sources) {
    for (const line of source.split('\n')) {
      if (/^\s*import\s/.test(line) && !/from\s+'\.\//.test(line)) {
        throw new Error(`${name}: non-relative import cannot be inlined — ${line.trim()}`);
      }
    }
    const declaration = /^(?:export\s+)?(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
    for (const match of source.matchAll(declaration)) {
      const identifier = match[1];
      if (seen.has(identifier)) {
        throw new Error(`name collision: '${identifier}' declared in both ${seen.get(identifier)} and ${name}`);
      }
      seen.set(identifier, name);
    }
  }
}

/**
 * Build the single-file app.
 *
 * @param {object} [options] Build options.
 * @param {boolean} [options.bodyOnly=false] Omit the document wrapper.
 * @returns {Promise<string>} The complete HTML.
 */
export async function bundle(options = {}) {
  const { bodyOnly = false } = options;
  const html = await fsp.readFile(path.join(APP, 'index.html'), 'utf8');
  const css = await fsp.readFile(path.join(APP, 'styles.css'), 'utf8');

  const sources = new Map();
  for (const name of ORDER) {
    sources.set(name, await fsp.readFile(path.join(APP, 'js', name), 'utf8'));
  }
  assertBundlable(sources);

  // A single file has no sibling `sw.js` to register, and asking for one
  // yields a console error on every load. The registration is already
  // guarded against failure; dropping it keeps the console clean.
  sources.set('app.js', sources.get('app.js').replace(
    /\n\s*if \('serviceWorker' in navigator\) \{[\s\S]*?\n\s*\}\n/,
    '\n',
  ));

  const parts = [];
  for (const name of ORDER) {
    const source = sources.get(name);
    parts.push(`/* ---- ${name} ${'-'.repeat(Math.max(64 - name.length, 0))} */`);
    parts.push(flatten(source).trim());
    const namespace = NAMESPACES[name];
    if (namespace) {
      const names = exportedNames(source);
      parts.push(`const ${namespace} = { ${names.join(', ')} };`);
    }
  }
  const script = parts.join('\n\n');

  // The service worker and the manifest are separate files by definition, so
  // a single-file build simply has neither. The registration is already
  // guarded, but dropping it avoids a pointless 404 in the console.
  const body = html
    .slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>'))
    .replace(/<script type="module" src="\.\/js\/app\.js"><\/script>/, '');

  const head = [
    '<title>HOUSEWRIGHT — Survey, Plan &amp; Improvement Analysis</title>',
    `<style>\n${css}\n</style>`,
  ].join('\n');

  const inline = `<script type="module">\n${script}\n</script>`;

  if (bodyOnly) return `${head}\n${body}\n${inline}\n`;
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
    '<meta name="theme-color" content="#080d12" />',
    head,
    '</head>',
    '<body>',
    body,
    inline,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const out = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : path.join(ROOT, 'dist-housewright.html');
  const text = await bundle({ bodyOnly: args.includes('--body-only') });
  await fsp.writeFile(out, text);
  console.log(`${out} — ${(text.length / 1024).toFixed(0)} KB`);
}

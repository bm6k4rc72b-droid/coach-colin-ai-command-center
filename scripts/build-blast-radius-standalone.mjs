/**
 * Build Blast Radius as one self-contained HTML file.
 *
 * The app is deliberately written as plain ES modules with no build step, which
 * is right for the repository and wrong for handing somebody a link: a file://
 * open or a single-file host cannot resolve `./js/iam.js`. So this flattens the
 * modules into one inline script, inlines the stylesheet, and writes a single
 * page that runs anywhere — a shared file, an email attachment, a static host
 * with no directory support.
 *
 * It is a concatenator rather than a bundler, which is all the app needs: no
 * dependencies, no circular imports, and a dependency order that is short
 * enough to state. Import and export keywords are stripped, namespace imports
 * are rebuilt as plain objects from the module's own export list, and the
 * duplicate time constants that two modules declare independently are
 * deduplicated so the concatenated scope stays legal.
 *
 * Two shapes come out of it. The default is a complete document that opens
 * from disk. `--artifact` emits the same page as a fragment — title, styles and
 * body content with no document wrapper — for hosts that supply their own
 * `<head>`.
 *
 * Usage:
 *   node scripts/build-blast-radius-standalone.mjs [--out <file.html>] [--artifact]
 *
 * @module scripts/build-blast-radius-standalone
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'public', 'blast-radius');

/**
 * Modules in dependency order.
 *
 * Hoisting makes function order irrelevant, but top-level `const` does not
 * hoist, so a module whose constants another module reads at load time has to
 * come first. Only `estate.js` and `scenarios.js` are read at load time, and
 * both are leaves.
 */
const MODULES = [
  'iam.js',
  'fair.js',
  'graph.js',
  'estate.js',
  'injection.js',
  'telemetry.js',
  'detect.js',
  'aisec.js',
  'scenarios.js',
  'portfolio.js',
  'charts.js',
  'views.js',
  'app.js',
];

/** Modules other files import as a namespace, which needs rebuilding by hand. */
const NAMESPACES = ['charts.js', 'views.js'];

/**
 * Strip import statements, including the multi-line form.
 *
 * @param {string} source Module source.
 * @returns {string} Source with its imports removed.
 */
function stripImports(source) {
  return source.replace(/^import\s[\s\S]*?from\s+'[^']+';\s*$/gm, '');
}

/**
 * List a module's exported binding names.
 *
 * @param {string} source Module source.
 * @returns {string[]} Exported names, in declaration order.
 */
function exportedNames(source) {
  return [...source.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)]
    .map((match) => match[1]);
}

/**
 * Remove `export` keywords, leaving the declarations behind.
 *
 * @param {string} source Module source.
 * @returns {string} Source with declarations made local.
 */
function stripExports(source) {
  return source.replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/gm, '');
}

/**
 * Drop a repeated top-level constant that an earlier module already declared.
 *
 * `telemetry.js` and `detect.js` each define their own `MINUTE`, as separate
 * modules properly should. Concatenated into one scope that is a syntax error,
 * and the honest fix is to drop the later copy rather than to couple the two
 * files for the benefit of a build script.
 *
 * @param {string} source Module source.
 * @param {Set<string>} declared Names already in scope.
 * @returns {string} Source with duplicate declarations removed.
 */
function dedupeConstants(source, declared) {
  return source.replace(/^const\s+([A-Z][A-Z0-9_]*)\s*=\s*[^;]+;\s*$/gm, (line, name) => {
    if (declared.has(name)) return `// ${name} already declared by an earlier module`;
    declared.add(name);
    return line;
  });
}

/**
 * Build the standalone page.
 *
 * @param {boolean} [fragment] Emit title, styles and body without a document
 *   wrapper, for a host that provides its own `<head>`.
 * @returns {string} The page.
 */
function build(fragment = false) {
  const declared = new Set();
  const chunks = [];

  for (const file of MODULES) {
    const source = fs.readFileSync(path.join(APP, 'js', file), 'utf8');
    const names = exportedNames(source);
    let body = dedupeConstants(stripExports(stripImports(source)), declared);

    if (file === 'app.js') {
      // No sibling sw.js exists next to a single file, so drop the registration
      // rather than leaving a request that can only ever 404.
      body = body.replace(/if \('serviceWorker' in navigator[\s\S]*?\n}\n?$/, '');
    }

    chunks.push(`/* ===== ${file} ===== */\n${body.trim()}`);
    if (NAMESPACES.includes(file)) {
      const alias = path.basename(file, '.js');
      chunks.push(`const ${alias} = { ${names.join(', ')} };`);
    }
  }

  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'styles.css'), 'utf8');
  const icon = fs.readFileSync(path.join(APP, 'icon.svg'), 'utf8');

  const body = html
    .replace(/[\s\S]*?<body>/, '')
    .replace(/<\/body>[\s\S]*/, '')
    .replace(/<script type="module" src="\.\/js\/app\.js"><\/script>/, '');

  if (fragment) {
    return `<title>Blast Radius</title>
<style>
${css}
</style>
${body.trim()}
<script type="module">
${chunks.join('\n\n')}
</script>
`;
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#03060b" />
<meta name="description" content="Blast Radius — cloud identity architecture and AI system security in one console. Runs entirely in the browser." />
<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}" />
<title>Blast Radius — cloud identity and AI security</title>
<style>
${css}
</style>
</head>
<body>
${body.trim()}
<script type="module">
${chunks.join('\n\n')}
</script>
</body>
</html>
`;
}

const outIndex = process.argv.indexOf('--out');
const fragment = process.argv.includes('--artifact');
const outFile = outIndex >= 0 ? process.argv[outIndex + 1] : path.join(ROOT, 'qa-shots', 'blast-radius.html');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, build(fragment));
process.stdout.write(`Wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} kB)\n`);

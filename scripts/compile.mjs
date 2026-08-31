/**
 * Compile a subset of src to a temp directory for node-side verification.
 *
 * Passing file names on the tsc command line makes it ignore tsconfig.json and
 * emit a diagnostic about it, and the flag to silence that varies between
 * TypeScript versions. Writing a real tsconfig into the temp directory sidesteps
 * the whole area and behaves the same on any 5.x.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export function compile(files) {
  const out = mkdtempSync(join(tmpdir(), 'qbv-'));

  writeFileSync(
    join(out, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'es2022',
        module: 'esnext',
        moduleResolution: 'bundler',
        rewriteRelativeImportExtensions: true,
        skipLibCheck: true,
        strict: true,
        outDir: out,
        rootDir: resolve('src'),
      },
      files: files.map((f) => resolve(f)),
    }),
  );

  execFileSync('npx', ['tsc', '-p', join(out, 'tsconfig.json')], { stdio: 'inherit' });
  // Marks the emitted JS as ESM so node imports it without an extension fight.
  writeFileSync(join(out, 'package.json'), '{"type":"module"}');

  return out;
}

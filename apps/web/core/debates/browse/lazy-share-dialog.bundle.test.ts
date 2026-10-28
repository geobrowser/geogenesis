import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, it } from 'vitest';

it('keeps the X parser behind the share-dialog bundle boundary', () => {
  const directory = mkdtempSync(join(tmpdir(), 'geo-share-bundle-'));
  try {
    // Compile the real share sources. Unrelated UI imports are external so the assertion
    // measures this feature's loading boundary rather than the full route's dependencies.
    execFileSync(
      'bun',
      [
        '--eval',
        `
      const result = await Bun.build({
        entrypoints: ['core/debates/browse/lazy-share-dialog.tsx'],
        target: 'browser', splitting: true, minify: true,
        outdir: ${JSON.stringify(directory)},
        external: ['react', 'react/jsx-runtime', 'next/dynamic', '@radix-ui/react-dialog'],
        plugins: [{ name: 'external-dialog-ui', setup(build) {
          build.onResolve({ filter: /^~\\/|^\\.\\.\\// }, args => {
            if (args.importer.endsWith('/share-dialog.tsx')) return { path: args.path, external: true };
          });
        }}],
      });
      if (!result.success) throw new AggregateError(result.logs, 'Share bundle failed');
    `,
      ],
      { stdio: 'pipe' }
    );
    const entry = readFileSync(join(directory, 'lazy-share-dialog.js'), 'utf8');
    const deferred = readdirSync(directory)
      .filter(file => file.endsWith('.js') && file !== 'lazy-share-dialog.js')
      .map(file => readFileSync(join(directory, file), 'utf8'))
      .join('\n');
    expect(deferred).toContain('validRangeEnd');
    expect(entry).toMatch(/import\(/);
    expect(entry).not.toContain('validRangeEnd');
    expect(gzipSync(entry).length).toBeLessThan(2048);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

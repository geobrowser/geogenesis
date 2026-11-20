import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Server identity comes only from the verified `walletSession` (GEO-3107). This keeps a new reader
 * from going back to the forgeable `walletAddress` cookie or parsing the session by hand.
 */

const ROOT = join(__dirname, '..', '..', '..');
const DIRS = ['app', 'core', 'partials'];

function sourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap(entry => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === 'node_modules' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

/** Root-level modules such as `proxy.ts` and `instrumentation.ts`. */
const rootFiles = readdirSync(ROOT)
  .filter(entry => /\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts'))
  .map(entry => join(ROOT, entry));

const files = [...rootFiles, ...DIRS.flatMap(dir => sourceFiles(join(ROOT, dir)))].map(path => ({
  path: relative(ROOT, path),
  text: readFileSync(path, 'utf8'),
}));

describe('wallet session readers', () => {
  it('scans root modules', () => {
    expect(files.map(f => f.path)).toEqual(expect.arrayContaining(['proxy.ts', 'instrumentation.ts']));
  });

  it('only the session module and its route touch the legacy cookie', () => {
    const touching = files
      .filter(f => f.text.includes('LEGACY_WALLET_ADDRESS') || /['"]walletAddress['"]\s*\)/.test(f.text))
      .map(f => f.path)
      .sort();
    expect(touching).toEqual(['app/api/wallet-session/route.ts', 'core/auth/server/wallet-session.ts']);
  });

  it('only the session module and its route read the session cookie directly', () => {
    const reading = files
      .filter(f => /\bWALLET_SESSION\b/.test(f.text) || /['"]walletSession['"]/.test(f.text))
      .map(f => f.path)
      .sort();
    expect(reading).toEqual(['app/api/wallet-session/route.ts', 'core/auth/server/wallet-session.ts']);
  });
});

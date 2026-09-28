import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The analytics bundle ships as a hash-named file in `public/`, committed by hand
 * whenever it is rebuilt (#2421, #2432, …). Each update added the new hash and left
 * the previous one behind, so seven had accumulated and six of them were dead —
 * 799,448 bytes that nothing could ever request, because the loader names exactly
 * one file and that name is a literal.
 *
 * Nothing catches that on its own: a superseded bundle is not imported, not linked
 * and not broken, it is just there. Hence a filesystem check, in the same spirit as
 * `space-url.test.ts` — the next person to bump the bundle gets a failure here
 * rather than leaving another 130KB behind.
 */

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const MANIFEST = path.join(PUBLIC_DIR, 'geo-analytics-manifest.json');

function manifest(): { shortHash: string } {
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
}

function bundlesOnDisk(): string[] {
  return fs
    .readdirSync(PUBLIC_DIR)
    .filter(name => /^geo-analytics-.*\.js$/.test(name))
    .sort();
}

describe('the analytics bundle in public/', () => {
  it('is the only one, and is the one the manifest names', () => {
    expect(bundlesOnDisk()).toEqual([`geo-analytics-${manifest().shortHash}.js`]);
  });

  // The loader hardcodes the filename, so a manifest bump that forgets to update
  // `analytics.ts` would 404 the script and silently end all analytics — the sort of
  // failure that looks like "traffic is down" weeks later.
  it('is the bundle the loader actually asks for', () => {
    const loader = fs.readFileSync(path.join(process.cwd(), 'core', 'analytics.ts'), 'utf8');
    const referenced = loader.match(/['"]\/(geo-analytics-[^'"]+\.js)['"]/)?.[1];

    expect(referenced).toBe(`geo-analytics-${manifest().shortHash}.js`);
  });

  it('exists on disk, so the loader is not pointing at nothing', () => {
    expect(fs.existsSync(path.join(PUBLIC_DIR, `geo-analytics-${manifest().shortHash}.js`))).toBe(true);
  });
});

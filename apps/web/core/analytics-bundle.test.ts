import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { AnalyticsEventName, capture } from './analytics';

/**
 * The analytics bundle ships as a hash-named file in `public/`. Manual updates
 * (#2421, #2432, …) added the new hash and left
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

function manifest(): { shortHash: string; localPatch?: string; upstreamSourceHash?: string } {
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
}

function bundlesOnDisk(): string[] {
  return fs
    .readdirSync(PUBLIC_DIR)
    .filter(name => /^geo-analytics-.*\.js$/.test(name))
    .sort();
}

describe('the analytics bundle in public/', () => {
  it('has no Genesis registry patch', () => {
    expect(manifest().localPatch).toBeUndefined();
    expect(manifest().upstreamSourceHash).toBeUndefined();
  });

  it('types capture and its forwarding helpers against exactly the shipped Genesis event names', () => {
    expectTypeOf<typeof capture>().parameter(0).toEqualTypeOf<AnalyticsEventName>();
    const bundle = fs.readFileSync(path.join(PUBLIC_DIR, `geo-analytics-${manifest().shortHash}.js`), 'utf8');
    const match = bundle.match(/var registry=(\{.*?\});/);
    expect(match, 'Upstream registry format changed; update the vendor script and this check').not.toBeNull();
    const registry = JSON.parse(match![1]) as { events: Record<string, { apps: string[] }> };
    const expected = Object.keys(registry.events)
      .filter(name => registry.events[name].apps.includes('genesis'))
      .sort();
    const file = path.join(process.cwd(), 'core/analytics-events.ts');
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const declaration = source.statements.find(
      (node): node is ts.TypeAliasDeclaration =>
        ts.isTypeAliasDeclaration(node) && node.name.text === 'AnalyticsEventName'
    );
    expect(declaration).toBeDefined();
    expect(ts.isUnionTypeNode(declaration!.type)).toBe(true);
    const members = (declaration!.type as ts.UnionTypeNode).types.map(node =>
      ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal) ? node.literal.text : '<unrestricted type>'
    );
    expect(members).toEqual(expected);
  });

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

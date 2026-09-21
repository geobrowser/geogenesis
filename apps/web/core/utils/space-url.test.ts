import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  SPACE_METADATA_SEGMENTS,
  SPACE_ROOT_SEGMENTS,
  SPACE_TAB_SEGMENTS,
  isPossibleSpacePath,
  isValidId,
} from './space-url';

const APP_SPACE_DIR = path.join(process.cwd(), 'app', 'space');

/** Route-group dirs `(x)` are URL-invisible; `[x]` are params. Neither is a literal segment. */
function literalDirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('(') && !entry.name.startsWith('['))
    .map(entry => entry.name)
    .sort();
}

/** Literal dirs directly beneath the `[id]` param, looking through route groups. */
function spaceTabDirs(): string[] {
  const idDir = path.join(APP_SPACE_DIR, '[id]');
  const groups = fs.existsSync(idDir)
    ? fs
        .readdirSync(idDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name.startsWith('('))
        .map(e => path.join(idDir, e.name))
    : [];
  return [...new Set([...literalDirs(idDir), ...groups.flatMap(literalDirs)])].sort();
}

/**
 * Next's metadata routes that are files rather than directories. Closed set,
 * from Next's file conventions — the ones that can sensibly sit under a space.
 * `sitemap`/`robots`/`manifest` are root-only and deliberately absent.
 */
const METADATA_ROUTE_NAMES = ['opengraph-image', 'twitter-image', 'icon', 'apple-icon'];

/** Route-producing metadata *files* directly beneath `[id]`, extension stripped. */
function spaceMetadataRouteFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return (
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => entry.name.replace(/\.[^.]+$/, ''))
      // Exact, or Next's numbered multi-image form (`opengraph-image1`). Not a
      // loose prefix: a colocated `icons-helper.ts` is not a route.
      .filter(name => METADATA_ROUTE_NAMES.some(route => name === route || new RegExp(`^${route}\\d+$`).test(name)))
      .sort()
  );
}

/** As `spaceTabDirs`, but for the file-convention metadata routes. */
function spaceMetadataFiles(): string[] {
  const idDir = path.join(APP_SPACE_DIR, '[id]');
  const groups = fs.existsSync(idDir)
    ? fs
        .readdirSync(idDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name.startsWith('('))
        .map(e => path.join(idDir, e.name))
    : [];
  return [...new Set([...spaceMetadataRouteFiles(idDir), ...groups.flatMap(spaceMetadataRouteFiles)])].sort();
}

describe('isValidId', () => {
  // The middleware cannot import the SDK (it is bundled for the edge), so the
  // local regex is a copy. This is the guard that stops the copy drifting: if
  // the SDK's notion of a valid id ever changes, this fails rather than the
  // middleware silently 404ing real pages.
  it.each([
    'c9f267dcb0d270718c2a3c45a64afd32',
    'C9F267DCB0D270718C2A3C45A64AFD32',
    '12a21058-4706-4d9c-b8c8-813732ef63b2',
    'BDuZwkjCg3nPWMDshoYtpS',
    '0xc46618C200f02EF1EEA28923FC3828301e63C4Bd',
    'totally-made-up-nonsense-id',
    'governance',
    'pending',
    '',
    'c9f267dcb0d270718c2a3c45a64afd3',
    'c9f267dcb0d270718c2a3c45a64afd322',
    'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
  ])('agrees with IdUtils.isValid for %j', segment => {
    expect(isValidId(segment)).toBe(IdUtils.isValid(segment));
  });
});

describe('route literals stay in sync with the filesystem', () => {
  // Without these, adding a route would 404 it in production. Failing here
  // instead is the whole point.
  it('SPACE_ROOT_SEGMENTS matches the literal dirs under app/space', () => {
    expect([...SPACE_ROOT_SEGMENTS].sort()).toEqual(literalDirs(APP_SPACE_DIR));
  });

  it('SPACE_TAB_SEGMENTS matches the literal dirs under app/space/[id]', () => {
    expect([...SPACE_TAB_SEGMENTS].sort()).toEqual(spaceTabDirs());
  });

  // The dir checks above looked like they covered this and did not: a metadata
  // route is a FILE, so `opengraph-image.tsx` was invisible to them and its URL
  // 404'd in production for months. Adding `twitter-image.tsx` or `icon.tsx`
  // without listing it now fails here instead.
  it('SPACE_METADATA_SEGMENTS matches the metadata files under app/space/[id]', () => {
    expect([...SPACE_METADATA_SEGMENTS].sort()).toEqual(spaceMetadataFiles());
  });
});

describe('isPossibleSpacePath', () => {
  it.each([
    '/space/c9f267dcb0d270718c2a3c45a64afd32',
    '/space/c9f267dcb0d270718c2a3c45a64afd32/governance',
    '/space/c9f267dcb0d270718c2a3c45a64afd32/community',
    '/space/c9f267dcb0d270718c2a3c45a64afd32/3970e24854164ed5a4792d3e418088ef',
    '/space/c9f267dcb0d270718c2a3c45a64afd32/3970e24854164ed5a4792d3e418088ef/activity',
    '/space/1310f810454cd482e35ce81cb86ca383/de318eede32a47b2a34a442afe86cef1/opengraph-image-7wh9xe',
    // The space's own OG image. Every space page puts this URL in `og:image`.
    '/space/c9f267dcb0d270718c2a3c45a64afd32/opengraph-image',
    '/space/c9f267dcb0d270718c2a3c45a64afd32/opengraph-image-7wh9xe',
    '/space/12a21058-4706-4d9c-b8c8-813732ef63b2',
    '/space/pending/some-topic-id',
    '/space',
    '/home',
    '/root',
  ])('allows %s', pathname => {
    expect(isPossibleSpacePath(pathname)).toBe(true);
  });

  // Every one of these was observed in production returning 200 with a full
  // server-rendered body. They are pre-migration id formats and pure garbage.
  it.each([
    '/space/BDuZwkjCg3nPWMDshoYtpS/BZCkGYotMmRsNBW7xu6uFD',
    '/space/0xc46618C200f02EF1EEA28923FC3828301e63C4Bd/12a21058-4706-4d9c-b8c8-813732ef63b2',
    '/space/totally-made-up-nonsense-id/also-fake-entity',
    '/space/zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
    '/space/c9f267dcb0d270718c2a3c45a64afd32/not-a-tab-or-an-id',
    // The metadata match is prefix-based for Next's hash suffix; it must not
    // widen into anything that merely starts with a route name.
    '/space/c9f267dcb0d270718c2a3c45a64afd32/opengraph-imagery',
    '/space/c9f267dcb0d270718c2a3c45a64afd32/twitter-image',
  ])('rejects %s', pathname => {
    expect(isPossibleSpacePath(pathname)).toBe(false);
  });

  it('rejects a malformed space id even when the tab is real', () => {
    expect(isPossibleSpacePath('/space/BDuZwkjCg3nPWMDshoYtpS/governance')).toBe(false);
  });
});

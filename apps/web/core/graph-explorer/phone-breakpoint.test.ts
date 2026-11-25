// @vitest-environment node
import tailwind from '@tailwindcss/postcss';

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type AcceptedPlugin } from 'postcss';
import { describe, expect, it } from 'vitest';

import { GRAPH_PAGE_FRAME } from '~/partials/graph-explorer/graph-explorer-shell';

import { GRAPH_PHONE_QUERY } from './phone-breakpoint';

const WEB = join(__dirname, '..', '..');
const STYLES = readFileSync(join(WEB, 'styles', 'styles.css'), 'utf8');
// The plugin ships its own postcss types, a different patch version from ours.
const TAILWIND = tailwind({ base: WEB }) as unknown as AcceptedPlugin;
const VARIANTS = STYLES.split('\n').filter(line => /^@custom-variant graph-(phone|wide) /.test(line));

/** The CSS Tailwind generates for these classes, whitespace collapsed. */
async function compile(classes: string): Promise<string> {
  const input = [
    // source(none): no scan of the app; the inline source is all the assertions need.
    "@import 'tailwindcss/utilities' source(none);",
    ...VARIANTS,
    `@source inline('${classes}');`,
  ].join('\n');
  const { css } = await postcss([TAILWIND]).process(input, { from: join(WEB, 'styles', 'x.css') });
  return css.replace(/\s+/g, ' ');
}

/** Every non-test source file in the graph explorer's UI. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('graph explorer phone breakpoint', () => {
  // The map decides "phone" in JS with GRAPH_PHONE_QUERY; the panel header and skeleton decide it in
  // CSS. Two spellings of the same width drifted twice (599 vs 600), so both now come from one query.
  it('defines graph-phone as the JS query and graph-wide as its exact complement', () => {
    expect(VARIANTS).toEqual([
      `@custom-variant graph-phone (@media ${GRAPH_PHONE_QUERY});`,
      `@custom-variant graph-wide (@media not all and ${GRAPH_PHONE_QUERY});`,
    ]);
  });

  it('compiles the variants to those exact media queries', async () => {
    const flat = await compile('graph-phone:hidden graph-wide:hidden');
    expect(flat).toContain(`@media ${GRAPH_PHONE_QUERY} { display: none; }`);
    expect(flat).toContain(`@media not all and ${GRAPH_PHONE_QUERY} { display: none; }`);
  });

  // The phone map only fills the frame, so a frame with no height (a browser without dvh, where
  // md:h-auto would win) leaves no map at all.
  it('gives the phone frame a 100vh height before 100dvh, for browsers without dvh', async () => {
    const flat = await compile(GRAPH_PAGE_FRAME);
    const fallback = flat.indexOf(`@media ${GRAPH_PHONE_QUERY} { height: 100vh; }`);
    const dvh = flat.indexOf(`@media ${GRAPH_PHONE_QUERY} { @supports (height:100dvh) { height: 100dvh; } }`);
    expect(fallback).toBeGreaterThan(-1);
    expect(dvh).toBeGreaterThan(fallback);
  });

  // The legend and zoom sit 52px above the pill's bottom edge (its 40px plus a 12px gap), both
  // clear of the home indicator. An offset Tailwind can't parse is dropped and lands them on the pill.
  it('compiles the phone offsets above the pill, with the safe-area inset', async () => {
    const read = (file: string) => readFileSync(join(WEB, 'partials', 'graph-explorer', file), 'utf8');
    const pill = read('phone-panel-sheet.tsx').match(/ (bottom-\[[^\]]+\]) /)?.[1];
    const above = ['connections/connections-view.tsx', 'connections/connections-canvas.tsx'].map(
      file => read(file).match(/graph-phone:bottom-\[[^\]]+\]/)?.[0]
    );
    expect(pill).toBe('bottom-[max(16px,env(safe-area-inset-bottom))]');
    expect(new Set(above).size).toBe(1);
    const flat = await compile(`${pill} ${above[0]}`);
    expect(flat).toContain('{ bottom: max(16px, env(safe-area-inset-bottom)); }');
    expect(flat).toContain(
      `@media ${GRAPH_PHONE_QUERY} { bottom: calc(max(16px, env(safe-area-inset-bottom)) + 52px); }`
    );
  });

  it('leaves no ad-hoc width variant in the graph explorer UI', () => {
    const offenders = sources(join(WEB, 'partials', 'graph-explorer')).filter(file =>
      /\b(max|min)-\[\d+(\.\d+)?px\]:/.test(readFileSync(file, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });
});

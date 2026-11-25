// @vitest-environment node
import tailwind from '@tailwindcss/postcss';

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type AcceptedPlugin } from 'postcss';
import { describe, expect, it } from 'vitest';

import { GRAPH_PAGE_FRAME } from '~/partials/graph-explorer/graph-explorer-shell';

import { GRAPH_PHONE_QUERY, isPhonePin, pinMarkerScale, pinShift } from './phone-breakpoint';

const WEB = join(__dirname, '..', '..');
const STYLES = readFileSync(join(WEB, 'styles', 'styles.css'), 'utf8');
// The plugin ships its own postcss types, a different patch version from ours.
const TAILWIND = tailwind({ base: WEB }) as unknown as AcceptedPlugin;
const VARIANTS = STYLES.split('\n').filter(line => /^@custom-variant graph-(phone|wide) /.test(line));
// md: is compiled too, in the stylesheet's order: graph-phone: overrides it under 600px only by
// sorting after it, which follows from where styles.css declares each.
const COMPILED_VARIANTS = STYLES.split('\n').filter(line => /^@custom-variant (md|graph-phone|graph-wide) /.test(line));

/** The CSS Tailwind generates for these classes, whitespace collapsed. */
async function compile(classes: string): Promise<string> {
  const input = [
    // source(none): no scan of the app; the inline source is all the assertions need.
    "@import 'tailwindcss/utilities' source(none);",
    ...COMPILED_VARIANTS,
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
    const tablet = flat.indexOf('@media (max-width: 767px) { height: auto; }');
    expect(tablet).toBeGreaterThan(-1);
    // Equal specificity, so the later rule wins: md:h-auto, then 100vh, then 100dvh where supported.
    expect(fallback).toBeGreaterThan(tablet);
    expect(dvh).toBeGreaterThan(fallback);
  });

  // The zoom stack (with the phone's color key) sits 52px above the pill's bottom edge (its 40px plus
  // a 12px gap), clear of the home indicator. An offset Tailwind can't parse is dropped and lands it on the pill.
  it('compiles the phone offsets above the pill, with the safe-area inset', async () => {
    const read = (file: string) => readFileSync(join(WEB, 'partials', 'graph-explorer', file), 'utf8');
    const pill = read('phone-panel-sheet.tsx').match(/ (bottom-\[[^\]]+\]) /)?.[1];
    const above = read('connections/connections-canvas.tsx').match(/graph-phone:bottom-\[[^\]]+\]/)?.[0];
    expect(pill).toBe('bottom-[max(16px,env(safe-area-inset-bottom))]');
    const flat = await compile(`${pill} ${above}`);
    expect(flat).toContain('{ bottom: max(16px, env(safe-area-inset-bottom)); }');
    expect(flat).toContain(
      `@media ${GRAPH_PHONE_QUERY} { bottom: calc(max(16px, env(safe-area-inset-bottom)) + 52px); }`
    );
  });

  // The legend gives way to the key on a phone, and nothing else sits at the map's foot beside the pill.
  it('hides the legend on a phone in CSS too, before the map reads the query', async () => {
    const view = readFileSync(join(WEB, 'partials', 'graph-explorer', 'connections', 'connections-view.tsx'), 'utf8');
    expect(view).not.toMatch(/graph-phone:bottom-/);
    expect(await compile('graph-phone:hidden')).toContain(`@media ${GRAPH_PHONE_QUERY} { display: none; }`);
  });

  it('leaves no ad-hoc width variant in the graph explorer UI', () => {
    const offenders = sources(join(WEB, 'partials', 'graph-explorer')).filter(file =>
      /\b(max|min)-\[\d+(\.\d+)?px\]:/.test(readFileSync(file, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });
});

describe('phone pins (GEO-3864)', () => {
  it('makes a pin of hop 1 on a phone only, never the centre or hop 2', () => {
    expect(isPhonePin(true, 1, false)).toBe(true);
    expect(isPhonePin(true, 1, true)).toBe(false);
    expect(isPhonePin(true, 2, false)).toBe(false);
    expect(isPhonePin(true, 0, true)).toBe(false);
    expect(isPhonePin(false, 1, false)).toBe(false);
  });

  it('scales a marker with depth, raised and bounded', () => {
    expect(pinMarkerScale(0.6)).toBeCloseTo(0.84);
    expect(pinMarkerScale(0.6)).toBeGreaterThan(pinMarkerScale(0.4));
    expect(pinMarkerScale(0.05)).toBe(0.45);
    expect(pinMarkerScale(3)).toBe(1.5);
  });

  it('slides a name in from either edge, no further than keeps it over its marker', () => {
    expect(pinShift(195, 50, 390)).toBe(0);
    expect(pinShift(30, 50, 390)).toBe(26);
    expect(pinShift(360, 50, 390)).toBe(-26);
    expect(pinShift(-100, 50, 390)).toBe(42);
    expect(pinShift(500, 50, 390)).toBe(-42);
  });
});

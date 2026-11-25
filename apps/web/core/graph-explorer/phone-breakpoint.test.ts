// @vitest-environment node
import tailwind from '@tailwindcss/postcss';

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type AcceptedPlugin } from 'postcss';
import { describe, expect, it } from 'vitest';

import { GRAPH_PHONE_QUERY } from './phone-breakpoint';

const WEB = join(__dirname, '..', '..');
const STYLES = readFileSync(join(WEB, 'styles', 'styles.css'), 'utf8');
// The plugin ships its own postcss types, a different patch version from ours.
const TAILWIND = tailwind({ base: WEB }) as unknown as AcceptedPlugin;
const VARIANTS = STYLES.split('\n').filter(line => /^@custom-variant graph-(phone|wide) /.test(line));

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
    const input = [
      "@import 'tailwindcss/utilities';",
      ...VARIANTS,
      "@source inline('graph-phone:hidden graph-wide:hidden');",
    ].join('\n');
    const { css } = await postcss([TAILWIND]).process(input, { from: join(WEB, 'styles', 'x.css') });
    const flat = css.replace(/\s+/g, ' ');
    expect(flat).toContain(`@media ${GRAPH_PHONE_QUERY} { display: none; }`);
    expect(flat).toContain(`@media not all and ${GRAPH_PHONE_QUERY} { display: none; }`);
  });

  it('leaves no ad-hoc width variant in the graph explorer UI', () => {
    const offenders = sources(join(WEB, 'partials', 'graph-explorer')).filter(file =>
      /\b(max|min)-\[\d+(\.\d+)?px\]:/.test(readFileSync(file, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });
});

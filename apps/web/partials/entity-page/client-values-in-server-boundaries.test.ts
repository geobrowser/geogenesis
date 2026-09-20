// This walks the source tree with `fs` and never touches the DOM.
// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every export of a `'use client'` module is a *client reference* on the server, not the value it
 * looks like. A Server Component that reads one gets an opaque placeholder: React writes it into
 * the flight payload as `"$56"`, and the real value only appears once the client resolves the
 * reference during hydration.
 *
 * Nothing fails. That is the whole problem. A profile branch had the space layout write
 * `id={SPACE_TABS_ANCHOR}` with the constant living in `space-tabs.tsx`, and the deployed server
 * HTML came back as `["$","div",null,{"id":"$56","className":"scroll-mt-14"}]` — an element with
 * no id until hydration, and a fragment link with nothing to scroll to. In the browser it looked
 * perfect, and every test passed (GEO-2974).
 *
 * The sibling of this test guards the other direction — async components rendered from client
 * files. Same failure mode: correct-looking UI, wrong boundary.
 *
 * What this cannot see: whether the value is ever *read* while rendering on the server. A client
 * hook imported next to a server-safe constant and only ever called from a client component is
 * inert. So the allowlist below is not a list of things that are fine — it is a list of things
 * checked by hand, each with what was found.
 *
 * Nor does it follow `import()` or a bare `import './x'`. Neither reaches a source module from the
 * server graph today — checked, not assumed: the 85 files calling `import()` are client modules
 * reaching for `next/dynamic`, and every bare import in the graph resolves to CSS or a package.
 * Worth adding the day either stops being true.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_DIRS = ['app', 'core', 'partials', 'design-system'];

/** The files Next renders on the server by definition. Everything they reach is the server graph. */
const SERVER_ENTRY = /\/(layout|page|template|default|loading|error|not-found|route|opengraph-image)\.tsx?$/;

/**
 * Every way one module reaches another *at runtime*, because a traversal that follows only one of
 * them walks a smaller graph than the server actually renders and quietly stops guarding the rest
 * of it. The tree uses all of these: ~9800 named imports, ~340 default, ~870 namespace, 53
 * re-exports.
 *
 * `import type` is excluded, and it matters: the only route into `core/blocks/data/filters.ts` is a
 * type import from `core/chat/edit-types.ts`, so counting it walks into the sync store and reports
 * three modules that TypeScript erases before anything runs.
 */
const MODULE_EDGE = /^(?:import|export)\s+(?!type\s)[\s\S]*?from\s+['"]([^'"]+)['"]/gm;

/** `import { a, b as c } from '…'`, with or without a default binding in front. */
const NAMED_IMPORT_BLOCK = /^import\s+(?!type\s)(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/gm;

/** `import Local from '…'`, ignoring the `import type` and `import * as` forms. */
const DEFAULT_IMPORT = /^import\s+(?!type\s)([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s+from\s+['"]([^'"]+)['"]/gm;

/** `import * as Local from '…'`, where every property read is a client reference. */
const NAMESPACE_IMPORT = /^import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/gm;

/** `export { a } from '…'` and `export * from '…'`, which hand a client reference straight on. */
const NAMED_REEXPORT = /^export\s+(?!type\s)\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/gm;

/**
 * `export * from '…'` and `export * as Name from '…'`.
 *
 * The named form is the common one here — 11 files against 4 — so a matcher that only knew the
 * bare `export *` was blind to most of the barrels in the tree.
 */
const STAR_REEXPORT = /^export\s+\*\s+(?:as\s+([A-Za-z_$][\w$]*)\s+)?from\s+['"]([^'"]+)['"]/gm;

/**
 * What the tree holds today, each one read before being listed rather than swept up by the walk.
 *
 * This list is not "these are fine". It is the debt this guard found on the day it was written,
 * ordered by how much it matters, and the fix for every one of them is the same shape: move the
 * value into a module with no `'use client'` on it and import it from both sides.
 *
 * - `bounty-board-skeleton` is the live one. `app/bounties/loading.tsx` is server-rendered and puts
 *   `BOARD_GRID_CLASS` straight into a `className`, so the grid has no grid during the loading
 *   flash. Left here rather than fixed because `BOARD_CARD_HEIGHT_PX` derives from
 *   `AVAILABLE_CARD_HEIGHT_PX` in a second client module, so the fix relocates layout constants
 *   across two features and wants someone who can look at the bounties board while doing it.
 * - `read-block-media-dimensions` would return a client reference in place of its empty-dimensions
 *   object. Nothing calls it outside its own test today, so it is a landmine rather than a fault.
 * - `entity-response` calls `getChecked` while deriving a response kind. A server caller would
 *   throw rather than render something wrong, which is the better failure of the two.
 * - `bounties/config` is inert: `useFeatureFlag` is only ever called from `useBountiesEnabled`,
 *   which is a client hook. The module is in the server graph for `bountiesEnabledForNetwork`.
 *   Untangling it moves a hook out of `config.ts` and repoints nine files, for no behaviour change.
 */
const KNOWN = new Set([
  'partials/bounties/bounty-board-skeleton.tsx -> BOARD_CARD_HEIGHT_PX',
  'partials/bounties/bounty-board-skeleton.tsx -> BOARD_GRID_CLASS',
  'core/blocks/data/read-block-media-dimensions.ts -> NO_BLOCK_MEDIA_DIMENSIONS',
  'core/responses/entity-response.ts -> getChecked',
  'core/bounties/config.ts -> useFeatureFlag',
]);

function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(rel);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        found.push(rel);
      }
    }
  };
  for (const dir of SOURCE_DIRS) walk(dir);
  return found;
}

function isClientFile(contents: string): boolean {
  return /^\s*['"]use client['"]/.test(contents);
}

function resolveImport(specifier: string, importingFile: string): string | null {
  let absolute: string;

  if (specifier.startsWith('~/')) {
    absolute = path.join(ROOT, specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    absolute = path.resolve(ROOT, path.dirname(importingFile), specifier);
  } else {
    return null;
  }

  const relative = path.relative(ROOT, absolute);
  for (const candidate of [
    `${relative}.tsx`,
    `${relative}.ts`,
    path.join(relative, 'index.tsx'),
    path.join(relative, 'index.ts'),
  ]) {
    if (!SOURCE_DIRS.some(dir => candidate.startsWith(`${dir}${path.sep}`))) continue;
    if (existsSync(path.join(ROOT, candidate))) return candidate;
  }
  return null;
}

/**
 * `A` or `A as B` inside a named import block, skipping inline `type` specifiers.
 *
 * The exported name is what identifies the export, so `foo as bar` is judged as `foo`. `default as
 * Bar` is the exception: `default` says nothing about what it is, so the local name is the only
 * signal there — the same reasoning as a default import.
 */
function parseNamedBindings(block: string): string[] {
  return block
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0 && !entry.startsWith('type '))
    .map(entry => {
      const [exported, local] = entry.split(/\s+as\s+/).map(part => part.trim());
      return exported === 'default' && local ? local : exported;
    })
    .filter(Boolean);
}

/**
 * Components are the one export a Server Component may take from a client module — that is what the
 * boundary is for. PascalCase stands in for "component", with SCREAMING_CASE excluded, since
 * `BOARD_GRID_CLASS` passes a naive capital-letter test while being a string.
 */
function looksLikeComponent(name: string): boolean {
  return /^[A-Z]/.test(name) && name !== name.toUpperCase();
}

describe('server components take only components from client modules', () => {
  const files = sourceFiles();
  const contentsByFile = new Map(files.map(file => [file, readFileSync(path.join(ROOT, file), 'utf8')]));
  const clientFiles = new Set([...contentsByFile].filter(([, c]) => isClientFile(c)).map(([f]) => f));

  it('walks a source tree that actually has files in it', () => {
    // Guards against a silently empty run if the layout moves.
    expect(files.length).toBeGreaterThan(50);
    expect(clientFiles.size).toBeGreaterThan(50);
  });

  /** Every non-client module reachable from a server entry point, which is where this can bite. */
  const serverGraph = new Set<string>();
  const queue = files.filter(file => SERVER_ENTRY.test(file.split(path.sep).join('/')) && !clientFiles.has(file));

  // The seeds are the layouts, pages and loading states. If this is empty the walk above drifted.
  expect(queue.length).toBeGreaterThan(20);

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (serverGraph.has(file) || clientFiles.has(file)) continue;
    serverGraph.add(file);

    for (const match of (contentsByFile.get(file) ?? '').matchAll(MODULE_EDGE)) {
      const target = resolveImport(match[1], file);
      if (target && !clientFiles.has(target) && !serverGraph.has(target)) queue.push(target);
    }
  }

  it('reaches a server graph worth checking', () => {
    expect(serverGraph.size).toBeGreaterThan(100);
  });

  /**
   * Every value a server-graph module takes from a client module, in any of the shapes it can
   * arrive in, as `[offence, source]` pairs. A default binding is judged by its local name — the
   * only signal a default import carries — and a namespace binding is reported whole, since every
   * property read off it is a client reference.
   */
  function* clientValuesInServerGraph(): Generator<[string, string]> {
    for (const file of serverGraph) {
      const contents = contentsByFile.get(file)!;
      const from = file.split(path.sep).join('/');

      const fromClientModule = (specifier: string) => {
        const target = resolveImport(specifier, file);
        return target && clientFiles.has(target) ? target.split(path.sep).join('/') : null;
      };

      for (const [, block, specifier] of contents.matchAll(NAMED_IMPORT_BLOCK)) {
        const target = fromClientModule(specifier);
        if (!target) continue;
        for (const name of parseNamedBindings(block)) {
          if (!looksLikeComponent(name)) yield [`${from} -> ${name}`, target];
        }
      }

      for (const [, local, specifier] of contents.matchAll(DEFAULT_IMPORT)) {
        const target = fromClientModule(specifier);
        if (target && !looksLikeComponent(local)) yield [`${from} -> default as ${local}`, target];
      }

      for (const [, local, specifier] of contents.matchAll(NAMESPACE_IMPORT)) {
        const target = fromClientModule(specifier);
        if (target) yield [`${from} -> * as ${local}`, target];
      }

      for (const [, block, specifier] of contents.matchAll(NAMED_REEXPORT)) {
        const target = fromClientModule(specifier);
        if (!target) continue;
        for (const name of parseNamedBindings(block)) {
          if (!looksLikeComponent(name)) yield [`${from} -> re-exports ${name}`, target];
        }
      }

      for (const [, namespace, specifier] of contents.matchAll(STAR_REEXPORT)) {
        const target = fromClientModule(specifier);
        if (target) yield [`${from} -> re-exports ${namespace ? `* as ${namespace}` : '*'}`, target];
      }
    }
  }

  it('finds no non-component value taken from a "use client" module', () => {
    const offences = [...clientValuesInServerGraph()]
      .filter(([offence]) => !KNOWN.has(offence))
      .map(([offence, target]) => `${offence}  (from ${target})`);

    expect(offences).toEqual([]);
  });

  it('keeps the known list honest', () => {
    // An entry that no longer matches anything has been fixed, and leaving it here would quietly
    // re-permit the same import later.
    const live = new Set([...clientValuesInServerGraph()].map(([offence]) => offence));

    expect([...KNOWN].filter(entry => !live.has(entry))).toEqual([]);
  });
});

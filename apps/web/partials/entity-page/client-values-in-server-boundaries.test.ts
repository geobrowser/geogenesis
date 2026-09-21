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
 * Two things it deliberately cannot see, both of which make the allowlist a list of things checked
 * by hand rather than a list of things that are fine:
 *
 *  1. Whether the value is ever *read* while rendering on the server. A client hook sitting next to
 *     a server-safe constant and only ever called from a client component is inert.
 *  2. What a dynamically imported module's bindings are. The edge is followed, so everything beyond
 *     it is still guarded, but `const { x } = await import('./client')` is not destructured here.
 *     No server-graph module does that today.
 */

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Every top-level directory holding application source.
 *
 * `atoms` was missing — six jotai modules — and a missing root fails twice over: the walk never
 * loads the files, and `resolveImport` answers null for every `~/atoms/…` specifier, so an import
 * from there was invisible rather than merely unchecked.
 *
 * Two are left out on purpose, both checked rather than assumed: `scripts` is build tooling that
 * nothing under `app/` imports, and `styles` holds one test file and its CSS. The per-root
 * assertion below is what caught `styles` being added here by mistake.
 */
const SOURCE_DIRS = ['app', 'atoms', 'core', 'design-system', 'partials'];

/** The files Next renders on the server by definition. Everything they reach is the server graph. */
const SERVER_ENTRY = /\/(layout|page|template|default|loading|error|not-found|route|opengraph-image)\.tsx?$/;

/**
 * One matcher per declaration shape, rather than one loose pattern for all of them.
 *
 * The loose version was `^(?:import|export)\s+(?!type\s)[\s\S]*?from\s+['"](…)['"]`, and `[\s\S]*?`
 * does not stop at the end of a declaration. In `app/layout.tsx` it started on a bare
 * `import 'katex/dist/katex.min.css';`, walked past two more statements and captured the specifier
 * of a later one — so edges were attributed to declarations that do not have them, and any
 * statement in between was skipped because the match had already consumed it. It would equally
 * start on an `export const` and run until it found a `from` dozens of lines away.
 *
 * Each of these is bounded to its own shape: a `{…}` block cannot contain a `}`, and nothing else
 * crosses a declaration boundary. Between them they cover what the tree actually uses — ~9800 named
 * imports, ~340 default, ~870 namespace, 53 re-exports, 136 bare, 85 dynamic.
 *
 * `import type` and `export type` are excluded, and that exclusion is load-bearing: the only route
 * into `core/blocks/data/filters.ts` is a type import from `core/chat/edit-types.ts`, and counting
 * it walks on into the sync store and reports three modules TypeScript erases before anything runs.
 */
const IMPORT_NAMED = /^import\s+(?!type\s)(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/gm;
const IMPORT_DEFAULT =
  /^import\s+(?!type\s)([A-Za-z_$][\w$]*)\s*(?:,\s*(?:\{[^}]*\}|\*\s+as\s+[A-Za-z_$][\w$]*))?\s+from\s+['"]([^'"]+)['"]/gm;
const IMPORT_NAMESPACE =
  /^import\s+(?!type\s)(?:[A-Za-z_$][\w$]*\s*,\s*)?\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/gm;
const REEXPORT_NAMED = /^export\s+(?!type\s)\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/gm;
const REEXPORT_STAR = /^export\s+\*\s+(?:as\s+([A-Za-z_$][\w$]*)\s+)?from\s+['"]([^'"]+)['"]/gm;
const IMPORT_BARE = /^import\s+['"]([^'"]+)['"]/gm;
const IMPORT_DYNAMIC = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Every specifier a module pulls in at runtime, whatever shape the declaration took. */
function runtimeSpecifiers(contents: string): string[] {
  const found: string[] = [];

  for (const [, , specifier] of contents.matchAll(IMPORT_NAMED)) found.push(specifier);
  for (const [, , specifier] of contents.matchAll(IMPORT_DEFAULT)) found.push(specifier);
  for (const [, , specifier] of contents.matchAll(IMPORT_NAMESPACE)) found.push(specifier);
  for (const [, , specifier] of contents.matchAll(REEXPORT_NAMED)) found.push(specifier);
  for (const [, , specifier] of contents.matchAll(REEXPORT_STAR)) found.push(specifier);
  for (const [, specifier] of contents.matchAll(IMPORT_BARE)) found.push(specifier);
  for (const [, specifier] of contents.matchAll(IMPORT_DYNAMIC)) found.push(specifier);

  return found;
}

/**
 * What the tree holds today, each one read before being listed rather than swept up by the walk.
 *
 * This list is not "these are fine". It is the debt this guard found on the day it was written,
 * ordered by how much it matters, and the fix for every one of them is the same shape: move the
 * value into a module with no `'use client'` on it and import it from both sides.
 *
 * The client module is part of the key, not decoration. Keyed on importer and name alone, an
 * existing entry would go on authorising the same name after someone repointed the import at a
 * *different* client module — debt quietly licensing a new fault.
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
  'partials/bounties/bounty-board-skeleton.tsx -> BOARD_CARD_HEIGHT_PX (from partials/bounties/board-bounty-card.tsx)',
  'partials/bounties/bounty-board-skeleton.tsx -> BOARD_GRID_CLASS (from partials/bounties/board-bounty-card.tsx)',
  'core/blocks/data/read-block-media-dimensions.ts -> NO_BLOCK_MEDIA_DIMENSIONS (from core/hooks/use-block-media-dimensions.ts)',
  'core/responses/entity-response.ts -> getChecked (from design-system/checkbox.tsx)',
  'core/bounties/config.ts -> useFeatureFlag (from core/state/feature-flags.ts)',
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
 * `A` or `A as B` inside a named block, skipping inline `type` specifiers.
 *
 * Both names are kept because they answer different questions. The export is known by its exported
 * name, which is what the source module declares; it is referred to here by its local one, which is
 * what a reader of this file sees and what belongs in a failure message.
 */
function parseNamedBindings(block: string): { exported: string; local: string }[] {
  return block
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0 && !entry.startsWith('type '))
    .map(entry => {
      const [exported, local] = entry.split(/\s+as\s+/).map(part => part.trim());
      return { exported, local: local ?? exported };
    })
    .filter(({ exported, local }) => Boolean(exported) && Boolean(local));
}

/** Only a capitalised name can be a component. `useFeatureFlag` is a function and still a value. */
function isCapitalised(name: string): boolean {
  return /^[A-Z]/.test(name) && name !== name.toUpperCase();
}

/**
 * What the client module declares this export to be, read from the source rather than guessed from
 * how it is used.
 *
 * The first version of this asked the use site — rendered as `<Name>`, or handed on as
 * `render={Name}`. That let `config={DefaultConfig}` through, since any prop looked like proof, and
 * it had nothing to say about a re-export, which has no use site at all. The declaration answers
 * both and is the same evidence a reader would use.
 *
 * Measured against the tree before being trusted: of 163 capitalised imports from client modules in
 * the server graph, 144 are `export function`, 17 are an arrow or `memo`/`forwardRef`, and 2 are
 * `export type` imported without the `type` keyword — `Tabs` from `editor-provider` and `Feature`
 * from `use-place-search`. Nothing is unclassifiable, so `unknown` is a real signal rather than the
 * common case, and it is reported rather than waved through.
 */
type ExportKind = 'component' | 'erased' | 'value' | 'unknown';

function classifyExport(exported: string, source: string): ExportKind {
  const name = exported.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  if (new RegExp(`^export\\s+(?:type|interface)\\s+${name}\\b`, 'm').test(source)) return 'erased';

  if (exported === 'default') {
    if (/^export\s+default\s+(?:async\s+)?(?:function|class)\b/m.test(source)) return 'component';
    if (/^export\s+default\s+(?:\{|\[|['"`]|\d)/m.test(source)) return 'value';
    return 'unknown';
  }

  if (new RegExp(`^export\\s+(?:async\\s+)?function\\s+${name}\\b`, 'm').test(source)) return 'component';
  if (new RegExp(`^export\\s+class\\s+${name}\\b`, 'm').test(source)) return 'component';

  const declaration = new RegExp(`^export\\s+const\\s+${name}\\s*(?::[^=]+)?=\\s*(.{0,40})`, 'm').exec(source);
  if (declaration) {
    const initialiser = declaration[1].trimStart();
    // A component, however it is wrapped.
    if (
      /^(?:\(|async\s*\(|[A-Za-z_$][\w$]*\s*=>|React\.(?:memo|forwardRef)|memo\(|forwardRef\(|styled\.|cva\()/.test(
        initialiser
      )
    ) {
      return 'component';
    }
    // An object, array, string, number or boolean is a value whatever its name suggests.
    if (/^(?:\{|\[|['"`]|\d|true\b|false\b|new\s)/.test(initialiser)) return 'value';
    return 'unknown';
  }

  return 'unknown';
}

describe('server components take only components from client modules', () => {
  const files = sourceFiles();
  const contentsByFile = new Map(files.map(file => [file, readFileSync(path.join(ROOT, file), 'utf8')]));
  const clientFiles = new Set([...contentsByFile].filter(([, c]) => isClientFile(c)).map(([f]) => f));

  it('walks a source tree that actually has files in it', () => {
    // Guards against a silently empty run if the layout moves.
    expect(files.length).toBeGreaterThan(50);
    expect(clientFiles.size).toBeGreaterThan(50);
    // Every declared root must hold something, or a typo in the list reads as a clean run.
    for (const dir of SOURCE_DIRS) {
      expect(files.filter(file => file.startsWith(`${dir}${path.sep}`)).length).toBeGreaterThan(0);
    }
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

    for (const specifier of runtimeSpecifiers(contentsByFile.get(file) ?? '')) {
      const target = resolveImport(specifier, file);
      if (target && !clientFiles.has(target) && !serverGraph.has(target)) queue.push(target);
    }
  }

  it('reaches a server graph worth checking', () => {
    expect(serverGraph.size).toBeGreaterThan(100);
  });

  /**
   * Every value a server-graph module takes from a client module, in any of the shapes it can
   * arrive in. A namespace binding is reported whole, since every property read off it is a client
   * reference and there is no one export to classify.
   */
  function* clientValuesInServerGraph(): Generator<string> {
    for (const file of serverGraph) {
      const contents = contentsByFile.get(file)!;
      const from = file.split(path.sep).join('/');

      const clientSource = (specifier: string) => {
        const target = resolveImport(specifier, file);
        if (!target || !clientFiles.has(target)) return null;
        return { path: target.split(path.sep).join('/'), contents: contentsByFile.get(target) ?? '' };
      };

      /** The offence, or nothing if this binding is a component or erased before it runs. */
      const offence = (exported: string, local: string, source: { path: string; contents: string }) => {
        if (!isCapitalised(exported === 'default' ? local : exported)) {
          return `${from} -> ${local} (from ${source.path})`;
        }

        const kind = classifyExport(exported, source.contents);
        if (kind === 'component' || kind === 'erased') return null;

        const label = kind === 'unknown' ? `${local} (unclassifiable` : `${local} (`;
        return `${from} -> ${label}from ${source.path})`;
      };

      for (const [, block, specifier] of contents.matchAll(IMPORT_NAMED)) {
        const source = clientSource(specifier);
        if (!source) continue;
        for (const { exported, local } of parseNamedBindings(block)) {
          const found = offence(exported, local, source);
          if (found) yield found;
        }
      }

      for (const [, local, specifier] of contents.matchAll(IMPORT_DEFAULT)) {
        const source = clientSource(specifier);
        if (!source) continue;
        const found = offence('default', local, source);
        if (found) yield found;
      }

      for (const [, local, specifier] of contents.matchAll(IMPORT_NAMESPACE)) {
        const source = clientSource(specifier);
        if (source) yield `${from} -> * as ${local} (from ${source.path})`;
      }

      for (const [, block, specifier] of contents.matchAll(REEXPORT_NAMED)) {
        const source = clientSource(specifier);
        if (!source) continue;
        for (const { exported, local } of parseNamedBindings(block)) {
          const found = offence(exported, local, source);
          if (found) yield `${found} re-exported`;
        }
      }

      for (const [, namespace, specifier] of contents.matchAll(REEXPORT_STAR)) {
        const source = clientSource(specifier);
        if (source) yield `${from} -> re-exports ${namespace ? `* as ${namespace}` : '*'} (from ${source.path})`;
      }
    }
  }

  it('finds no non-component value taken from a "use client" module', () => {
    const offences = [...clientValuesInServerGraph()].filter(offence => !KNOWN.has(offence));

    expect(
      offences,
      'A server component is reading a value out of a client module, which is a client reference ' +
        'on the server rather than the value. Move the value into a module with no `use client` ' +
        'and import it from both sides — see the doc block in this file.'
    ).toEqual([]);
  });

  it('keeps the known list honest', () => {
    // An entry that no longer matches anything has been fixed, and leaving it here would quietly
    // re-permit the same import later.
    const live = new Set(clientValuesInServerGraph());

    expect([...KNOWN].filter(entry => !live.has(entry))).toEqual([]);
  });
});

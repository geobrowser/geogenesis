// This walks the source tree with `fs` and never touches the DOM.
// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * An async component rendered from a `'use client'` file is not a Server Component. React re-invokes
 * the function on every render, so whatever it awaits is refetched every render, and a `Suspense`
 * wrapper hides it completely — the UI looks right while the network loops.
 *
 * That is how `BacklinksServerContainer` came to send `EntityBacklinksPage` 54 times and `Spaces`
 * 53 times on a single entity page load, all with identical variables (GEO-2666). Nothing failed,
 * so nothing surfaced it.
 *
 * This walks the same path by hand rather than trusting a convention: find the async components,
 * find where each is rendered, and fail if any render site is a client file.
 *
 * Two things this has already got wrong, both of which made it pass while the bug was present:
 *
 * 1. The named-export pattern required a type annotation on the const, so it silently matched
 *    nothing for the very component this test exists for.
 * 2. It only looked at *named* exports. There are 37 `export default async function` components in
 *    the tree, including `DefaultEntityPage` and `PostEntityPage` — reusable ones that a client file
 *    could plausibly render. Matching a default export by name is not enough either, since the
 *    importing file may bind it to any local name, so default exports are tracked by resolving the
 *    import specifier back to the file that declared them.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_DIRS = ['app', 'core', 'partials'];

/** `export async function Name(` and `export const Name = async (`, type annotation optional. */
const NAMED_ASYNC_COMPONENT =
  /^export\s+(?:async\s+function\s+([A-Z]\w*)\s*[(<]|const\s+([A-Z]\w*)\s*(?::[^=]+)?=\s*async\s*[(<])/gm;

/** `export default async function Name(` and the anonymous `export default async (`. */
const DEFAULT_ASYNC_COMPONENT = /^export\s+default\s+async\s+(?:function\s*([A-Z]\w*)?\s*[(<]|[(<])/m;

/** A default import: `import Local from '<specifier>'`, ignoring `import type`. */
const DEFAULT_IMPORT = /^import\s+(?!type\s)([A-Z]\w*)\s*(?:,\s*\{[^}]*\})?\s+from\s+['"]([^'"]+)['"]/gm;

/** Route handlers and metadata exports share the shape but are never rendered as JSX. */
const NOT_COMPONENTS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(rel);
      } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
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

/**
 * Resolve an import specifier to a repo-relative `.tsx` path, or null for anything outside the
 * source tree (packages, node_modules, `.ts` modules — none of which can hold a JSX component we
 * care about here).
 */
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
  for (const candidate of [`${relative}.tsx`, path.join(relative, 'index.tsx')]) {
    if (SOURCE_DIRS.some(dir => candidate.startsWith(`${dir}${path.sep}`))) return candidate;
  }
  return null;
}

describe('async components are never rendered from a client boundary', () => {
  const files = sourceFiles();
  const contentsByFile = new Map(files.map(file => [file, readFileSync(path.join(ROOT, file), 'utf8')]));

  it('walks a source tree that actually has files in it', () => {
    // Guards against a silently empty run if the layout moves.
    expect(files.length).toBeGreaterThan(50);
  });

  it('finds no *named* async component rendered inside a "use client" file', () => {
    const asyncComponents = new Set<string>();
    for (const contents of contentsByFile.values()) {
      for (const match of contents.matchAll(NAMED_ASYNC_COMPONENT)) {
        const name = match[1] ?? match[2];
        if (name && !NOT_COMPONENTS.has(name)) asyncComponents.add(name);
      }
    }
    expect(asyncComponents.size).toBeGreaterThan(0);

    const offences: string[] = [];
    for (const [file, contents] of contentsByFile) {
      if (!isClientFile(contents)) continue;
      for (const name of asyncComponents) {
        if (new RegExp(`<${name}[\\s/>]`).test(contents)) offences.push(`<${name}> rendered in ${file}`);
      }
    }

    expect(offences).toEqual([]);
  });

  it('finds no *default-exported* async component rendered inside a "use client" file', () => {
    const declaredBy = new Set<string>();
    for (const [file, contents] of contentsByFile) {
      if (DEFAULT_ASYNC_COMPONENT.test(contents)) declaredBy.add(file);
    }
    // `app/` alone has dozens; if this hits zero the pattern has drifted and the test is vacuous.
    expect(declaredBy.size).toBeGreaterThan(10);

    const offences: string[] = [];
    for (const [file, contents] of contentsByFile) {
      if (!isClientFile(contents)) continue;

      for (const match of contents.matchAll(DEFAULT_IMPORT)) {
        const [, localName, specifier] = match;
        const target = resolveImport(specifier, file);
        if (!target || !declaredBy.has(target)) continue;

        if (new RegExp(`<${localName}[\\s/>]`).test(contents)) {
          offences.push(`<${localName}> (default export of ${target}) rendered in ${file}`);
        }
      }
    }

    expect(offences).toEqual([]);
  });
});

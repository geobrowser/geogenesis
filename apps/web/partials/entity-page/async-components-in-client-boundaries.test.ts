import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * An async component rendered from a `'use client'` file is not a Server Component. React re-invokes
 * the function on every render, so whatever it awaits is refetched every render, and a `Suspense`
 * wrapper hides it completely — the UI looks right while the network loops.
 *
 * That is how `BacklinksServerContainer` came to send `EntityBacklinksPage` 82 times and `Spaces`
 * 64 times on a single entity page load, all with identical variables (GEO-2666). Nothing failed,
 * so nothing surfaced it.
 *
 * This walks the same path by hand rather than trusting a convention: find the async components,
 * find where each is rendered, and fail if any render site is a client file.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_DIRS = ['app', 'core', 'partials'];

/**
 * `export async function Name(` and `export const Name = async (`, with or without a type
 * annotation on the const. The annotation is optional and easy to get wrong: requiring it silently
 * matched nothing for the very component this test exists for.
 */
const ASYNC_COMPONENT =
  /^export\s+(?:async\s+function\s+([A-Z]\w*)\s*[(<]|const\s+([A-Z]\w*)\s*(?::[^=]+)?=\s*async\s*[(<])/gm;

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

describe('async components are never rendered from a client boundary', () => {
  it('finds no async component rendered inside a "use client" file', () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(50);

    const contentsByFile = new Map(files.map(file => [file, readFileSync(path.join(ROOT, file), 'utf8')]));

    const asyncComponents = new Set<string>();
    for (const contents of contentsByFile.values()) {
      for (const match of contents.matchAll(ASYNC_COMPONENT)) {
        const name = match[1] ?? match[2];
        // Route handlers share the shape but are never rendered as JSX.
        if (name && !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(name)) asyncComponents.add(name);
      }
    }
    expect(asyncComponents.size).toBeGreaterThan(0);

    const offences: string[] = [];
    for (const [file, contents] of contentsByFile) {
      if (!isClientFile(contents)) continue;
      for (const name of asyncComponents) {
        if (new RegExp(`<${name}[\\s/>]`).test(contents)) {
          offences.push(`<${name}> rendered in ${file}`);
        }
      }
    }

    expect(offences).toEqual([]);
  });
});

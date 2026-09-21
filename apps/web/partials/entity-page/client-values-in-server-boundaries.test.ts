// This walks the source tree with `fs` and never touches the DOM.
// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
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
 * ## Why this parses instead of matching
 *
 * It used to match patterns near declarations rather than read them, and review found ten ways that
 * was wrong. An unbounded matcher began on a bare CSS import and captured a later statement's
 * specifier. `import Default, * as Namespace` matched neither of two patterns. `'use client'` was
 * recognised only as the very first token, so a licence header would hide an entire client module —
 * and an unrecognised client module is worse than an unchecked one, because it joins the server
 * graph and everything it exports stops being an offence anywhere. `export default
 * SuggestedFormats`, a component declared above and exported by name, came out unclassifiable.
 * `export class GeoChatRequestError extends Error` was accepted as a component for being
 * capitalised. `export const DefaultConfig = ({ enabled: true })` was accepted for opening with a
 * bracket.
 *
 * Every one of those is a question about syntax, and the compiler answers questions about syntax.
 * Parsing 1,600 files costs ~600ms, which is less than the patterns cost in review rounds.
 *
 * Two things it still cannot see, which is what keeps the allowlist a list of things checked by
 * hand rather than a list of things that are fine:
 *
 *  1. Whether the value is ever *read* while rendering on the server. A client hook sitting next to
 *     a server-safe constant and only ever called from a client component is inert.
 *  2. What a dynamically imported module's bindings are. The edge is followed, so everything beyond
 *     it stays guarded, but `const { x } = await import('./client')` is not destructured. No
 *     server-graph module does that today.
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
 * `import('…')` with a literal specifier — the one thing still read from the text.
 *
 * Finding these in the tree means walking every node of every file rather than its top-level
 * statements, and a dynamic import with a computed specifier resolves to no file anyway.
 * Declarations, where every mistake has been, are parsed.
 */
const DYNAMIC_IMPORT = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

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

function parse(file: string, contents: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    contents,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

/**
 * Whether the module opts into the client, read from its directive prologue.
 *
 * A directive is a leading statement whose expression is a plain string, and comments are trivia
 * rather than statements — so a licence header or a `'use strict';` in front of `'use client'` no
 * longer hides the module, which matching the first token of the file did.
 */
function isClientModule(sourceFile: ts.SourceFile): boolean {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteralLike(statement.expression)) return false;
    if (statement.expression.text === 'use client') return true;
  }
  return false;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []).some(modifier => modifier.kind === kind);
}

const isExported = (node: ts.Node) => hasModifier(node, ts.SyntaxKind.ExportKeyword);
const isDefault = (node: ts.Node) => hasModifier(node, ts.SyntaxKind.DefaultKeyword);

/** What a client module's export turns out to be, once its declaration is read. */
type ExportKind = 'component' | 'erased' | 'value' | 'unknown';

/** `memo(X)` and `forwardRef(X)`, plain or `React.`-qualified, produce components. Nothing else does. */
const COMPONENT_WRAPPERS = new Set(['memo', 'forwardRef']);

function isComponentWrapper(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) return COMPONENT_WRAPPERS.has(expression.text);
  if (ts.isPropertyAccessExpression(expression)) return COMPONENT_WRAPPERS.has(expression.name.text);
  return false;
}

/**
 * A class is a component only if it extends React's.
 *
 * `export class GeoChatRequestError extends Error` lives in a `'use client'` module and a capital
 * letter alone let it through. An Error subclass read on the server is a client reference like any
 * other value.
 */
function classifyClass(node: ts.ClassLikeDeclaration): ExportKind {
  const extended = (node.heritageClauses ?? [])
    .filter(clause => clause.token === ts.SyntaxKind.ExtendsKeyword)
    .flatMap(clause => clause.types.map(type => type.expression.getText()));

  return extended.some(name => /(^|\.)(Pure)?Component$/.test(name)) ? 'component' : 'value';
}

describe('server components take only components from client modules', () => {
  const files = sourceFiles();
  const contentsByFile = new Map(files.map(file => [file, readFileSync(path.join(ROOT, file), 'utf8')]));
  const astByFile = new Map([...contentsByFile].map(([file, contents]) => [file, parse(file, contents)]));
  const clientFiles = new Set([...astByFile].filter(([, ast]) => isClientModule(ast)).map(([file]) => file));

  const exportKinds = new Map<string, Map<string, ExportKind>>();

  /**
   * What each of a module's exports is, by exported name, with `default` keyed as `default`.
   *
   * An initialiser is followed where following it answers the question: through parentheses, `as`
   * and `satisfies`, and through a local identifier — which is how `export default SuggestedFormats`
   * reaches the arrow function declared above it instead of giving up and reporting a real
   * component.
   */
  function kindsFor(file: string): Map<string, ExportKind> {
    const cached = exportKinds.get(file);
    if (cached) return cached;

    const sourceFile = astByFile.get(file)!;
    const kinds = new Map<string, ExportKind>();
    /** Local declarations, so an export by identifier has something to resolve against. */
    const locals = new Map<string, ts.Node>();

    for (const statement of sourceFile.statements) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && declaration.initializer) {
            locals.set(declaration.name.text, declaration.initializer);
          }
        }
      } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
        locals.set(statement.name.text, statement);
      }
    }

    const classify = (node: ts.Node, seen = new Set<ts.Node>()): ExportKind => {
      if (seen.has(node)) return 'unknown';
      seen.add(node);

      if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        return 'component';
      }
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return classifyClass(node);
      // `styled.div\`…\`` and friends.
      if (ts.isTaggedTemplateExpression(node)) return 'component';
      if (ts.isCallExpression(node)) return isComponentWrapper(node.expression) ? 'component' : 'value';
      if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
        return classify(node.expression, seen);
      }
      if (ts.isIdentifier(node)) {
        const local = locals.get(node.text);
        return local ? classify(local, seen) : 'unknown';
      }
      if (
        ts.isObjectLiteralExpression(node) ||
        ts.isArrayLiteralExpression(node) ||
        ts.isStringLiteralLike(node) ||
        ts.isNumericLiteral(node) ||
        ts.isNewExpression(node) ||
        node.kind === ts.SyntaxKind.TrueKeyword ||
        node.kind === ts.SyntaxKind.FalseKeyword
      ) {
        return 'value';
      }
      return 'unknown';
    };

    for (const statement of sourceFile.statements) {
      if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
        if (isExported(statement)) kinds.set(statement.name.text, 'erased');
        continue;
      }

      // An enum is an object at runtime, whatever it looks like in the types.
      if (ts.isEnumDeclaration(statement) && isExported(statement)) {
        kinds.set(statement.name.text, 'value');
        continue;
      }

      if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
        if (!isExported(statement)) continue;
        kinds.set(isDefault(statement) ? 'default' : (statement.name?.text ?? 'default'), classify(statement));
        continue;
      }

      if (ts.isVariableStatement(statement) && isExported(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name)) continue;
          kinds.set(declaration.name.text, declaration.initializer ? classify(declaration.initializer) : 'unknown');
        }
        continue;
      }

      // `export default <expression>`, a bare identifier included.
      if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
        kinds.set('default', classify(statement.expression));
        continue;
      }

      // `export { a }` and `export { a } from '…'`: resolvable only when declared here.
      if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (statement.isTypeOnly || element.isTypeOnly) {
            kinds.set(element.name.text, 'erased');
            continue;
          }
          const local = locals.get((element.propertyName ?? element.name).text);
          kinds.set(element.name.text, local ? classify(local) : 'unknown');
        }
      }
    }

    exportKinds.set(file, kinds);
    return kinds;
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
      if (contentsByFile.has(candidate)) return candidate;
    }
    return null;
  }

  /** One binding taken from another module: a named export, a default, or a whole namespace. */
  type Reference = {
    specifier: string;
    exported?: string;
    local: string;
    namespace?: boolean;
    reexported?: boolean;
  };

  const referencesByFile = new Map<string, Reference[]>();

  /**
   * Every module a file pulls in at runtime, with the bindings it takes from each.
   *
   * Type-only imports and exports are skipped, whole-statement and per-element alike. That
   * exclusion is load-bearing rather than tidy: the only route into `core/blocks/data/filters.ts`
   * is a type import from `core/chat/edit-types.ts`, and following it walks on into the sync store
   * and reports three modules TypeScript erases before anything runs.
   */
  function references(file: string): Reference[] {
    const cached = referencesByFile.get(file);
    if (cached) return cached;

    const sourceFile = astByFile.get(file)!;
    const found: Reference[] = [];

    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement) && ts.isStringLiteralLike(statement.moduleSpecifier)) {
        const specifier = statement.moduleSpecifier.text;
        const clause = statement.importClause;

        // A bare `import './x'` takes no bindings but still loads the module.
        if (!clause) {
          found.push({ specifier, local: '' });
          continue;
        }
        if (clause.isTypeOnly) continue;

        if (clause.name) found.push({ specifier, exported: 'default', local: clause.name.text });

        if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
          found.push({ specifier, local: `* as ${clause.namedBindings.name.text}`, namespace: true });
        } else if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            if (element.isTypeOnly) continue;
            found.push({
              specifier,
              exported: (element.propertyName ?? element.name).text,
              local: element.name.text,
            });
          }
        }
        continue;
      }

      if (
        ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier &&
        ts.isStringLiteralLike(statement.moduleSpecifier)
      ) {
        if (statement.isTypeOnly) continue;
        const specifier = statement.moduleSpecifier.text;

        if (!statement.exportClause) {
          found.push({ specifier, local: 're-exports *', namespace: true, reexported: true });
        } else if (ts.isNamespaceExport(statement.exportClause)) {
          found.push({
            specifier,
            local: `re-exports * as ${statement.exportClause.name.text}`,
            namespace: true,
            reexported: true,
          });
        } else {
          for (const element of statement.exportClause.elements) {
            if (element.isTypeOnly) continue;
            found.push({
              specifier,
              exported: (element.propertyName ?? element.name).text,
              local: element.name.text,
              reexported: true,
            });
          }
        }
      }
    }

    for (const [, specifier] of (contentsByFile.get(file) ?? '').matchAll(DYNAMIC_IMPORT)) {
      found.push({ specifier, local: '' });
    }

    referencesByFile.set(file, found);
    return found;
  }

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

    for (const { specifier } of references(file)) {
      const target = resolveImport(specifier, file);
      if (target && !clientFiles.has(target) && !serverGraph.has(target)) queue.push(target);
    }
  }

  it('reaches a server graph worth checking', () => {
    expect(serverGraph.size).toBeGreaterThan(100);
  });

  /** Only a capitalised name can be a component. `useFeatureFlag` is a function and still a value. */
  function isCapitalised(name: string): boolean {
    return /^[A-Z]/.test(name) && name !== name.toUpperCase();
  }

  /**
   * Every binding a server-graph module takes from a client module, with what the source says it
   * is. A name that is not capitalised cannot be a component whatever its declaration says, so it
   * is reported without asking.
   */
  function* clientBindings(): Generator<{ offence: string; kind: ExportKind; capitalised: boolean }> {
    for (const file of serverGraph) {
      const from = file.split(path.sep).join('/');

      for (const reference of references(file)) {
        const target = resolveImport(reference.specifier, file);
        if (!target || !clientFiles.has(target)) continue;

        const source = target.split(path.sep).join('/');
        const suffix = reference.reexported && !reference.namespace ? ' re-exported' : '';

        // A namespace has no one export to read, and every property taken off it is a reference.
        if (reference.namespace) {
          yield { offence: `${from} -> ${reference.local} (from ${source})`, kind: 'value', capitalised: false };
          continue;
        }
        if (!reference.exported) continue;

        const named = reference.exported === 'default' ? reference.local : reference.exported;
        if (!isCapitalised(named)) {
          yield {
            offence: `${from} -> ${reference.local} (from ${source})${suffix}`,
            kind: 'value',
            capitalised: false,
          };
          continue;
        }

        const kind = kindsFor(target).get(reference.exported) ?? 'unknown';
        const label = kind === 'unknown' ? `${reference.local} (unclassifiable` : `${reference.local} (`;
        yield { offence: `${from} -> ${label}from ${source})${suffix}`, kind, capitalised: true };
      }
    }
  }

  function* clientValuesInServerGraph(): Generator<string> {
    for (const { offence, kind } of clientBindings()) {
      if (kind === 'component' || kind === 'erased') continue;
      yield offence;
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

  /**
   * The classifier, measured against the tree rather than against invented examples.
   *
   * The guard above is green, so every capitalised export it lets through has to be a component or
   * erased — meaning a change to `classify` that started calling components values, or values
   * components, would move these counts. Pinning the shape is what makes that visible rather than
   * silent, and it is the assertion that would have caught `export class … extends Error` being
   * waved through for its capital letter.
   */
  it('classifies every capitalised client export the server graph takes', () => {
    const kinds: Record<ExportKind, number> = { component: 0, erased: 0, value: 0, unknown: 0 };
    for (const { kind, capitalised } of clientBindings()) if (capitalised) kinds[kind] += 1;

    // Components, and the two `export type`s imported without the `type` keyword — `Tabs` from
    // `editor-provider` and `Feature` from `use-place-search`.
    expect(kinds.component).toBeGreaterThan(100);
    expect(kinds.erased).toBe(2);
    // Nothing capitalised is a value or unreadable. A classifier that started calling components
    // values would move this off zero before the offence list above grew past its allowlist.
    expect(kinds.value).toBe(0);
    expect(kinds.unknown).toBe(0);
  });
});

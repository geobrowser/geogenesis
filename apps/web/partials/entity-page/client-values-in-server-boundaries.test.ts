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
 * It used to match patterns near declarations rather than read them, and review found a dozen ways that
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
 * Parsing 1,600 files costs ~600ms and walking every node of them another 86ms, which is less than
 * the patterns cost in review rounds. Nothing here is read from the source text any more.
 *
 * Three things it still cannot see, which is what keeps the allowlist a list of things checked by
 * hand rather than a list of things that are fine:
 *
 *  1. Whether the value is ever *read* while rendering on the server. A client hook sitting next to
 *     a server-safe constant and only ever called from a client component is inert.
 *  2. What a dynamically imported module's bindings are. The edge is followed, so everything beyond
 *     it stays guarded, but `const { x } = await import('./client')` is not destructured. No
 *     server-graph module does that today.
 *  3. Whether a capitalised function returning a non-literal value is a component. It is assumed to
 *     be one — see `classifyFunction` for why that default is the safe one here.
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

/**
 * The files Next runs on the server by definition. Everything they reach is the server graph.
 *
 * The metadata routes belong here as much as the pages do — they are modules Next executes — and
 * `app/robots.ts` is already in this tree, so a client value reachable only through it was outside
 * the walk entirely.
 */
const SERVER_ENTRY =
  /^app\/(?:.*\/)?(layout|page|template|default|loading|error|not-found|route|opengraph-image|robots|sitemap|manifest|icon|apple-icon|twitter-image)\.tsx?$/;

/**
 * What a module pulls in through a call rather than a declaration: `import('…')` and `require('…')`.
 *
 * Both are read from the tree rather than the text, so a spelling inside a comment or a string is
 * not an edge and `type T = import('./types').T` — an `ImportTypeNode`, which TypeScript erases —
 * is not one either. A computed specifier resolves to no file and is skipped.
 *
 * `require` also carries bindings, which a plain edge loses. The tree has one — `markdown-adapter`
 * reaches the tiptap extensions as `require('…').tiptapExtensions` — and recorded as an edge alone
 * that property read was invisible to the check even while the module was traversed.
 */
function callReferences(sourceFile: ts.SourceFile): CallReference[] {
  const found: CallReference[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const [specifier] = node.arguments;

      if ((isDynamicImport || isRequire) && specifier && ts.isStringLiteralLike(specifier)) {
        // `const { x } = await import('…')` is not destructured — see the file's doc block — so a
        // dynamic import stays an edge and only `require` contributes bindings.
        found.push(...(isRequire ? requireBindings(node, specifier.text) : [{ specifier: specifier.text, local: '' }]));
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);

  return found;
}

/** What a `require()` call's surroundings say is being taken from it. */
type CallReference = { specifier: string; exported?: string; local: string; namespace?: boolean };

/** `require('x').thing` and `require('x')['thing']` name the same export two ways. */
function accessedName(access: ts.PropertyAccessExpression | ts.ElementAccessExpression): string | null {
  if (ts.isPropertyAccessExpression(access)) return access.name.text;

  const argument = access.argumentExpression;
  // A computed key names nothing this can resolve; a literal one names an export.
  return ts.isStringLiteralLike(argument) ? argument.text : null;
}

function requireBindings(call: ts.CallExpression, specifier: string): CallReference[] {
  const parent = call.parent;

  // `require('./x').thing`, `require('./x')['thing']`, and either assigned to a name:
  // `const Widget = require('./x').widget` is a component under a capital, and losing that name is
  // how the both-names gate came to reject it.
  if (
    parent &&
    (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
    parent.expression === call
  ) {
    const exported = accessedName(parent);
    if (!exported) return [{ specifier, local: '' }];

    const assignedTo = parent.parent;
    const local =
      assignedTo && ts.isVariableDeclaration(assignedTo) && ts.isIdentifier(assignedTo.name)
        ? assignedTo.name.text
        : exported;

    return [{ specifier, exported, local }];
  }

  if (parent && ts.isVariableDeclaration(parent) && parent.initializer === call) {
    // `const { A, B } = require('./x')`, including the `{ 'A': a }` spelling.
    if (ts.isObjectBindingPattern(parent.name)) {
      const bindings: CallReference[] = [];

      for (const element of parent.name.elements) {
        const key = element.propertyName ?? element.name;
        const exported = ts.isIdentifier(key) || ts.isStringLiteralLike(key) ? key.text : null;
        const local = ts.isIdentifier(element.name) ? element.name.text : exported;
        if (exported && local) bindings.push({ specifier, exported, local });
      }

      return bindings;
    }

    // `const ns = require('./x')` keeps the whole module object.
    if (ts.isIdentifier(parent.name)) {
      return [{ specifier, local: `* as ${parent.name.text}`, namespace: true }];
    }
  }

  // Anything else — a bare call for its side effects — loads the module and takes nothing.
  return [{ specifier, local: '' }];
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
    // `ts.isStringLiteral`, not `isStringLiteralLike`: that also accepts a no-substitution template
    // literal, and `` `use client` `` is not a directive — treating it as one would move a server
    // module into `clientFiles` and stop the walk at it.
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false;
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

/**
 * A tagged template is a value here.
 *
 * `gql`, `css` and `sql` produce data, and `styled.div\`…\`` — the one tag that would produce a
 * component — is not used anywhere in this repo (its only mention was this comment). Classifying
 * every tagged template as a component to accommodate a library nobody imports is a hole in
 * exchange for nothing. If styled-components ever arrives, the guard fires and someone adds the
 * tag, which is a visible failure rather than a silent one.
 */

/**
 * The React calls that produce a component: `memo`, `forwardRef` and `lazy`, plain or
 * `React.`-qualified. Every other call is a value.
 *
 * `lazy` arrived later than the other two and this comment did not, which is the small version of
 * the mistake the rest of the file keeps making — a list extended in one place and described in
 * another.
 */
const COMPONENT_WRAPPERS = new Set(['memo', 'forwardRef', 'lazy']);

/** The local names in one module that actually refer to React's wrappers and base classes. */
type ReactBindings = { wrappers: Set<string>; bases: Set<string>; namespaces: Set<string> };

/** The base classes a React class component may extend. */
const COMPONENT_BASES = new Set(['Component', 'PureComponent']);

/**
 * Which spellings of `memo` and `forwardRef` this file has earned.
 *
 * Matching the callee's name alone would take `helpers.memo(config)` or a locally declared
 * `forwardRef` for React's, and hand a component exemption to an ordinary value. Neither spelling
 * exists in this tree — all nine call sites are React's — so this is prevention, and cheap because
 * the imports are already parsed.
 */
function reactBindingsOf(sourceFile: ts.SourceFile): ReactBindings {
  const wrappers = new Set<string>();
  const bases = new Set<string>();
  const namespaces = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== 'react') continue;

    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;

    if (clause.name) namespaces.add(clause.name.text);

    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      namespaces.add(clause.namedBindings.name.text);
    } else if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        if (element.isTypeOnly) continue;
        const exported = (element.propertyName ?? element.name).text;
        // `import { default as React } from 'react'` is a default import in named clothing, so the
        // binding it makes is a namespace like any other default React import.
        if (exported === 'default') namespaces.add(element.name.text);
        if (COMPONENT_WRAPPERS.has(exported)) wrappers.add(element.name.text);
        if (COMPONENT_BASES.has(exported)) bases.add(element.name.text);
      }
    }
  }

  return { wrappers, bases, namespaces };
}

function isComponentWrapper(expression: ts.Expression, react: ReactBindings): boolean {
  if (ts.isIdentifier(expression)) return react.wrappers.has(expression.text);
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    return react.namespaces.has(expression.expression.text) && COMPONENT_WRAPPERS.has(expression.name.text);
  }
  return false;
}

/**
 * A capitalised function is a component unless it is caught returning something else.
 *
 * Review asked for the opposite default — evidence that a function is renderable, or `unknown` when
 * there is none — and measuring says that would fail the build on `master` today. Of the 520
 * capitalised functions client modules export, 505 contain JSX and 15 do not, and all 15 are real
 * components that render nothing and only run effects: `DeepLinkHandler`, `SentryUserIdentifier`,
 * `PendingActionsRunner` and so on. Six of those 15 are imported by the server graph right now, so
 * demanding JSX would accuse `SpaceRedirect`, `PersonalProfileSuggestedTaskSync` and
 * `PersonalProfileBioStarterMerge` of being values. A guard that accuses real components is one
 * somebody deletes.
 *
 * So the evidence runs the other way: a function whose every `return` hands back an object, array,
 * string or number is a value — which is `function BuildOptions() { return {}; }`, the case review
 * named — and anything else is left as a component. A concise arrow body counts as a return, or
 * `() => ({})` slips through the same door the block form was just closed on, and a literal is
 * recognised through parentheses, `as`, `satisfies` and `!`.
 *
 * Deciding from the returns alone also drops the separate JSX scan this used to run, which could
 * override a definite literal return — a function handing back `{ label: <span /> }` returns an
 * object, whatever it renders on the way. That leaves a residue, a function returning a value
 * through a variable rather than a literal, and it is the right residue to have: silent where it is
 * unsure, loud only where it is certain.
 */
function classifyFunction(node: ts.SignatureDeclaration): ExportKind {
  const returned: ts.Expression[] = [];

  // `() => ({})` has no return statement at all, which is how the first version of this accepted
  // the very example it was written to catch — in the other half of the syntax.
  if (ts.isArrowFunction(node) && node.body && !ts.isBlock(node.body)) returned.push(node.body);

  const visit = (child: ts.Node) => {
    // Anything with its own body owns its own returns. `isFunctionLike` rather than the three
    // function kinds by hand: a method or an accessor on a nested class is a scope too, and
    // listing kinds is how the earlier version of this file kept being wrong.
    if (child !== node && ts.isFunctionLike(child)) return;
    if (ts.isReturnStatement(child) && child.expression) returned.push(child.expression);
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);

  // Returning nothing is what an effect-only component does.
  if (returned.length === 0) return 'component';

  return returned.every(returnsAValue) ? 'value' : 'component';
}

/**
 * Wrappers that say nothing about what is inside them.
 *
 * Kept in one place because both classifiers have to see through the same set, and the list has
 * been short by one four separate times — `!` in one half but not the other, and the angle-bracket
 * `<T>x` assertion in neither. A `.ts` module can still write that form.
 */
function isTransparent(
  expression: ts.Expression
): expression is
  ts.ParenthesizedExpression | ts.AsExpression | ts.SatisfiesExpression | ts.NonNullExpression | ts.TypeAssertion {
  return (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  );
}

/**
 * A return React could not render, through whatever is wrapped around it.
 *
 * Narrower than "a literal", and deliberately so. `function Badge() { return 'New'; }` is a real
 * component, and so is one returning a number or an array of elements; React renders all three, and
 * renders nothing at all for a boolean. Calling those values would accuse real components — the
 * failure this guard cannot afford. What React genuinely cannot render is a plain object, a regular
 * expression, or anything from `new`, and those stay.
 *
 * This reverses the `return -1` half of an earlier round, which asked for signed numerics to count
 * as values. They are renderable, so they do not.
 *
 * Note this is only about what a function *returns*. `export const Subject = 'x'` is still a string
 * rather than a component — a different question, answered by the initialiser classifier.
 */
function returnsAValue(expression: ts.Expression): boolean {
  if (isTransparent(expression)) return returnsAValue(expression.expression);

  // Every branch, or it is not definite. `return enabled ? {} : {}` hands back an object either
  // way; `cond ? {} : <div />` does not, and stays a component.
  if (ts.isConditionalExpression(expression)) {
    return returnsAValue(expression.whenTrue) && returnsAValue(expression.whenFalse);
  }

  // `a ?? {}` and `a || {}` are the same question with two operands.
  if (
    ts.isBinaryExpression(expression) &&
    [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(
      expression.operatorToken.kind
    )
  ) {
    return returnsAValue(expression.left) && returnsAValue(expression.right);
  }

  return (
    ts.isObjectLiteralExpression(expression) ||
    ts.isRegularExpressionLiteral(expression) ||
    ts.isNewExpression(expression) ||
    // A function is not renderable either. `function BuildOptions() { return () => {}; }` is a
    // factory, and so is anything handing back a class.
    ts.isArrowFunction(expression) ||
    ts.isFunctionExpression(expression) ||
    ts.isClassExpression(expression)
  );
}

/**
 * A class is a component only if it extends React's, by binding rather than by spelling.
 *
 * `export class GeoChatRequestError extends Error` lives in a `'use client'` module and a capital
 * letter alone let it through; an Error subclass read on the server is a client reference like any
 * other value. Matching the *name* `Component` was the next version of the same mistake — it takes
 * an unrelated local `Component` for React's, and rejects React's own base imported under an alias.
 * This is the wrapper check's twin and should have been fixed in the same commit as it.
 */
function classifyClass(node: ts.ClassLikeDeclaration, react: ReactBindings): ExportKind {
  const extended = (node.heritageClauses ?? [])
    .filter(clause => clause.token === ts.SyntaxKind.ExtendsKeyword)
    .flatMap(clause => clause.types.map(type => type.expression));

  const isReactBase = (expression: ts.Expression) => {
    if (ts.isIdentifier(expression)) return react.bases.has(expression.text);
    if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
      return react.namespaces.has(expression.expression.text) && COMPONENT_BASES.has(expression.name.text);
    }
    return false;
  };

  return extended.some(isReactBase) ? 'component' : 'value';
}

/**
 * What each of a module's exports is, by exported name, with `default` keyed as `default`.
 *
 * Top-level rather than closed over the file map so it can be handed a source string and checked
 * directly — see the fixtures at the bottom of this file. Review's point was that counting the
 * current tree exercises only the *accepting* half of this function: every binding on the allowlist
 * is lowercase or all-uppercase, so it never reaches here, and a regression that started calling an
 * `Error` subclass a component would leave every count unchanged.
 *
 * `resolveOrigin` answers what a re-export's target exports, or null where there is nothing to
 * follow.
 *
 * An initialiser is followed where following it answers the question: through parentheses, `as` and
 * `satisfies`, and through a local identifier — which is how `export default SuggestedFormats`
 * reaches the arrow function declared above it instead of giving up and reporting a real component.
 */
function exportKindsOf(
  sourceFile: ts.SourceFile,
  resolveOrigin: (specifier: string) => Map<string, ExportKind> | null
): Map<string, ExportKind> {
  const kinds = new Map<string, ExportKind>();
  const react = reactBindingsOf(sourceFile);
  /** Local declarations, so an export by identifier has something to resolve against. */
  const locals = new Map<string, ts.Node>();
  /**
   * Imported names, so an identifier that is not declared here still resolves.
   *
   * `import { Button } from './button'; export { Button };` is a barrel that declares nothing, and
   * calling its component unclassifiable reports it. One module in this tree is written that way.
   */
  const imported = new Map<string, { specifier: string; exported: string }>();

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          locals.set(declaration.name.text, declaration.initializer);
        }
      }
    } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
      locals.set(statement.name.text, statement);
    } else if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly) continue;
      const specifier = statement.moduleSpecifier.text;

      if (clause.name) imported.set(clause.name.text, { specifier, exported: 'default' });
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          if (element.isTypeOnly) continue;
          imported.set(element.name.text, { specifier, exported: (element.propertyName ?? element.name).text });
        }
      }
    }
  }

  const classify = (node: ts.Node, seen = new Set<ts.Node>()): ExportKind => {
    if (seen.has(node)) return 'unknown';
    seen.add(node);

    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      // A client component is neither of these: an async function hands back a promise and a
      // generator hands back an iterator. Only a Server Component may be async, and a module that
      // says `use client` has opted out of being one.
      const isAsync = (ts.getModifiers(node) ?? []).some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword);
      const isGenerator = !ts.isArrowFunction(node) && Boolean(node.asteriskToken);
      if (isAsync || isGenerator) return 'value';

      return classifyFunction(node);
    }
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return classifyClass(node, react);
    if (ts.isTaggedTemplateExpression(node)) return 'value';
    if (ts.isCallExpression(node)) return isComponentWrapper(node.expression, react) ? 'component' : 'value';
    if (ts.isExpression(node) && isTransparent(node)) return classify(node.expression, seen);
    if (ts.isIdentifier(node)) {
      const local = locals.get(node.text);
      if (local) return classify(local, seen);

      const source = imported.get(node.text);
      if (!source) return 'unknown';
      return resolveOrigin(source.specifier)?.get(source.exported) ?? 'unknown';
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
      // `export default interface Foo {}` is looked up as `default`, the way the function and class
      // branches already key theirs.
      if (isExported(statement)) kinds.set(isDefault(statement) ? 'default' : statement.name.text, 'erased');
      continue;
    }

    /*
     * `declare` means the declaration describes something that already exists rather than building
     * it, so nothing of it survives compilation — a class, a const, a function and a namespace
     * alike. This was written for `export declare namespace` alone last round and left the other
     * three classified as runtime exports, which reported a type-only import as a client value.
     */
    if (isExported(statement) && hasModifier(statement, ts.SyntaxKind.DeclareKeyword)) {
      const declared: (ts.Node | undefined)[] = ts.isVariableStatement(statement)
        ? statement.declarationList.declarations.map(declaration => declaration.name)
        : [(statement as ts.DeclarationStatement).name];

      for (const name of declared) {
        if (name && ts.isIdentifier(name)) kinds.set(name.text, 'erased');
      }
      continue;
    }

    // `export namespace Foo {}` builds an object at runtime, so it is a value.
    if (ts.isModuleDeclaration(statement) && isExported(statement) && ts.isIdentifier(statement.name)) {
      kinds.set(statement.name.text, 'value');
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

    /*
     * `export * from './x'` hands on every named export of `./x` — but never its default, which is
     * the one binding `export *` does not carry. Without this a client barrel written that way had
     * no exports at all as far as this was concerned, so everything taken from it came back
     * unclassifiable.
     */
    if (ts.isExportDeclaration(statement) && !statement.exportClause && statement.moduleSpecifier) {
      if (statement.isTypeOnly || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const origin = resolveOrigin(statement.moduleSpecifier.text);

      /*
       * An unresolved target is not an empty one. Dropping it left the map with no bindings at all,
       * so a server barrel star-re-exporting this one checked nothing and passed in silence — the
       * worst shape of answer this guard can give. `*` is recorded instead, which reads as
       * `re-exports *` and is reported.
       */
      if (!origin) {
        kinds.set('*', 'unknown');
        continue;
      }

      for (const [name, kind] of origin) {
        if (name !== 'default') kinds.set(name, kind);
      }
      continue;
    }

    // `export * as Ns from './other'` is a namespace object. Recorded as a value, because every
    // property read off one belonging to a client module is a client reference — and recorded at all,
    // because a barrel over this barrel would otherwise lose the binding entirely.
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamespaceExport(statement.exportClause)) {
      if (!statement.isTypeOnly) kinds.set(statement.exportClause.name.text, 'value');
      continue;
    }

    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      /*
       * `export { a }` is declared here. `export { a } from './b'` is declared in `./b`, and a
       * client barrel doing exactly that is a real shape in this tree — `table-block.tsx`
       * re-exports `TableBlockLoadingPlaceholder`, `community-filter-pill.tsx` re-exports
       * `FilterPillTrigger`. Calling those unclassifiable accuses real components, so the chain
       * is followed to wherever the thing is actually declared.
       *
       * `visiting` is the cycle guard: barrels re-export each other, and a loop here would be an
       * infinite one rather than a wrong answer.
       */
      const origin =
        statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
          ? resolveOrigin(statement.moduleSpecifier.text)
          : null;

      for (const element of statement.exportClause.elements) {
        if (statement.isTypeOnly || element.isTypeOnly) {
          kinds.set(element.name.text, 'erased');
          continue;
        }

        const sourceName = (element.propertyName ?? element.name).text;

        if (!origin) {
          const local = locals.get(sourceName);
          if (local) {
            kinds.set(element.name.text, classify(local));
            continue;
          }

          // Declared in neither this statement nor this file: `import { Button } from './button';
          // export { Button };` is a barrel whose export is somebody else's declaration.
          const fromImport = imported.get(sourceName);
          kinds.set(
            element.name.text,
            fromImport ? (resolveOrigin(fromImport.specifier)?.get(fromImport.exported) ?? 'unknown') : 'unknown'
          );
          continue;
        }

        kinds.set(element.name.text, origin.get(sourceName) ?? 'unknown');
      }
    }
  }

  return kinds;
}

describe('server components take only components from client modules', () => {
  const files = sourceFiles();
  const contentsByFile = new Map(files.map(file => [file, readFileSync(path.join(ROOT, file), 'utf8')]));
  const astByFile = new Map([...contentsByFile].map(([file, contents]) => [file, parse(file, contents)]));
  const clientFiles = new Set([...astByFile].filter(([, ast]) => isClientModule(ast)).map(([file]) => file));

  const exportKinds = new Map<string, Map<string, ExportKind>>();

  /**
   * {@link exportKindsOf} for a file in the tree, memoised, following re-exports across modules.
   *
   * `visiting` is the cycle guard: barrels re-export each other, and a loop there would be an
   * infinite one rather than a wrong answer. Only a complete answer is cached, so a run that gave
   * up on a cycle cannot become the answer every later caller gets.
   */
  function kindsFor(file: string, visiting: Set<string> = new Set()): Map<string, ExportKind> {
    const cached = exportKinds.get(file);
    if (cached) return cached;

    const kinds = exportKindsOf(astByFile.get(file)!, specifier => {
      const origin = resolveImport(specifier, file);
      if (!origin || visiting.has(origin)) return null;
      return kindsFor(origin, new Set([...visiting, file]));
    });

    if (visiting.size === 0) exportKinds.set(file, kinds);
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
    /** `import * as X` / `export * as X`: an object whose every property is a client reference. */
    namespace?: boolean;
    /** `export * from`: the target's named bindings, each classified on its own. */
    starReexport?: boolean;
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
      if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
        const specifier = statement.moduleSpecifier.text;
        const clause = statement.importClause;

        // A bare `import './x'` takes no bindings but still loads the module.
        if (!clause) {
          found.push({ specifier, local: '' });
          continue;
        }
        if (clause.isTypeOnly) continue;

        // `import {} from './x'` has a clause with nothing in it and still loads the module. Review
        // also asked for the all-type-specifier form; that is declined in the reply, because this
        // repo does not set `verbatimModuleSyntax` and TypeScript elides it.
        if (
          !clause.name &&
          clause.namedBindings &&
          ts.isNamedImports(clause.namedBindings) &&
          clause.namedBindings.elements.length === 0
        ) {
          found.push({ specifier, local: '' });
          continue;
        }

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
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        if (statement.isTypeOnly) continue;
        const specifier = statement.moduleSpecifier.text;

        if (!statement.exportClause) {
          // Not a namespace value: this hands on the target's named bindings one by one, so a
          // barrel star-re-exporting nothing but components is not an offence. `export * as Ns` is
          // a namespace object and stays one, below.
          found.push({ specifier, local: 're-exports *', starReexport: true, reexported: true });
        } else if (ts.isNamespaceExport(statement.exportClause)) {
          found.push({
            specifier,
            local: `re-exports * as ${statement.exportClause.name.text}`,
            namespace: true,
            reexported: true,
          });
        } else {
          // An empty list still evaluates the target, the same way `import {}` does. This is that
          // check's other half, and it should have gone in with it.
          if (statement.exportClause.elements.length === 0) {
            found.push({ specifier, local: '' });
            continue;
          }

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

    found.push(...callReferences(sourceFile));

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

  /**
   * Every binding a server-graph module takes from a client module, with what the source says it
   * is. A name that is not capitalised cannot be a component whatever its declaration says, so it
   * is reported without asking.
   */
  function* clientBindings(): Generator<{ offence: string | null; kind: ExportKind; capitalised: boolean }> {
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

        // `export * from` is every named binding the target has, so each is judged on its own.
        if (reference.starReexport) {
          for (const [exported, kind] of kindsFor(target)) {
            // `export *` does not carry the default export, so reading one here invents an offence.
            if (exported === 'default') continue;

            // One name here: a re-export has no local binding in this file to read.
            const verdict = verdictFor([exported], kind);

            yield {
              offence: verdict ? `${from} -> re-exports ${exported} (${verdict.label}from ${source})` : null,
              kind,
              capitalised: verdict?.capitalised ?? isCapitalised(exported),
            };
          }
          continue;
        }

        if (!reference.exported) continue;

        const kind = kindsFor(target).get(reference.exported) ?? 'unknown';
        /*
         * Judged by the exported name, which is the declaration being classified. For a default
         * that is the word `default`, which `verdictFor` exempts from the capitalisation question
         * because nobody chose it — the local alias is a fact about this file, not about the export.
         *
         * Passing the alias here instead rejected a default client component imported under a
         * lowercase name, before its kind was ever considered. No fixture covers this line: it
         * needs a real module graph, and the `verdictFor` tests below only prove that `default` is
         * exempt once it gets there. Verified by planting `import suggestedFormats from
         * '~/design-system/suggested-formats-window'` in the space layout — reported before, silent
         * after.
         */
        const verdict = verdictFor([reference.exported, reference.local], kind);

        yield {
          offence: verdict ? `${from} -> ${reference.local} (${verdict.label}from ${source})${suffix}` : null,
          kind,
          capitalised: verdict?.capitalised ?? isCapitalised(reference.exported),
        };
      }
    }
  }

  function* clientValuesInServerGraph(): Generator<string> {
    for (const { offence } of clientBindings()) {
      if (offence) yield offence;
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

    // The allowlist is excluded rather than the bound loosened. Three of its entries are
    // all-uppercase and reach the classifier now that the capitalisation gate no longer pretends
    // to do its job — they are values, correctly, which is why they are listed.
    for (const { kind, capitalised, offence } of clientBindings()) {
      if (!capitalised) continue;
      if (offence && KNOWN.has(offence)) continue;
      kinds[kind] += 1;
    }

    // Components, and the two `export type`s imported without the `type` keyword — `Tabs` from
    // `editor-provider` and `Feature` from `use-place-search`.
    expect(kinds.component).toBeGreaterThan(100);
    expect(kinds.erased).toBe(2);
    // Nothing else capitalised is a value or unreadable. A classifier that started calling
    // components values would move this off zero before the offence list above grew.
    expect(kinds.value).toBe(0);
    expect(kinds.unknown).toBe(0);
  });
});

/**
 * The classifier against written-down cases, not only against the tree.
 *
 * Review's objection to the corpus count was exact: every binding on the allowlist is lowercase or
 * all-uppercase, so it never reaches `exportKindsOf`, and the count therefore exercised only the
 * accepting half. A regression that started calling an `Error` subclass or an object-returning
 * function a component would have left all four of those assertions unmoved.
 *
 * Each case below is one this guard got wrong at some point, which is why the list reads like a
 * changelog. They were verified by hand at the time, by planting them in the tree and watching the
 * previous version disagree; written down here, they stay verified.
 */
/**
 * The verdict rule, which decides whether a binding may cross the boundary.
 *
 * Its own describe because it had two callers that disagreed: one exempted components before
 * asking about capitalisation, the other asked about capitalisation before resolving the kind. The
 * cases below are the disagreement, written down.
 */
/**
 * Only a capitalised name can be a component: React reads a lowercase tag as an HTML element, so
 * `useFeatureFlag` is a function and still a value.
 *
 * All-uppercase names used to be excluded here as well, on the grounds that `BOARD_GRID_CLASS` is
 * obviously a constant — which also rejected `FAQ` and `A`, both of which are perfectly good
 * component names. The exclusion was standing in for classification, and there is real
 * classification now: those three constants reach `verdictFor` and are reported for being values,
 * which is both true and the reason they were on the allowlist to begin with.
 */
function isCapitalised(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/**
 * Whether this binding is an offence, and how to describe it — or nothing, if it may cross.
 *
 * Written once because the two callers had drifted. The star-re-export path exempted anything
 * classified as a component *before* asking about capitalisation, so a lowercase export slipped
 * through a barrel while the same name imported directly was rejected; and the direct path asked
 * about capitalisation *before* resolving the kind, so a lowercase erased type was reported as a
 * runtime value. One order, three questions: erased crosses, lowercase never does, a component
 * crosses.
 *
 * `default` is exempt from the capitalisation question because it is not a name anyone chose.
 */
function verdictFor(names: string[], kind: ExportKind): { label: string; capitalised: boolean } | null {
  if (kind === 'erased') return null;

  /*
   * Every name the binding has, because an alias can supply the one that matters and the two
   * directions want opposite rules. `import { widget as Widget }` renders as `<Widget />`, so the
   * local name is what makes it a component; `import { Button as button }` is React's component
   * under a name this file cannot render as a tag, but it is still a client component reference and
   * passing one across the boundary is what the boundary is for. Reading either name accepts both.
   *
   * The cost is `{ useThing as Thing }` — a hook wearing a component's alias — which nothing here
   * does, and which no classifier can catch, because a hook is a function like any other.
   *
   * `default` is not a name anyone chose, so its presence exempts the binding outright.
   */
  if (!names.some(name => name === 'default' || isCapitalised(name))) {
    return { label: '', capitalised: false };
  }
  if (kind === 'component') return null;

  return { label: kind === 'unknown' ? 'unclassifiable ' : '', capitalised: true };
}

/**
 * Which files seed the walk.
 *
 * Tested directly on the pattern, because the tree holds no entry-shaped basename outside `app/`
 * today — so restricting it changes nothing observable, and a fix with nothing to fail is a fix
 * nobody can trust. A future `core/error.ts` or `partials/loading.tsx` would otherwise be walked as
 * a route nothing imports, and offences found through it would be against code the server never
 * renders.
 */
describe('SERVER_ENTRY', () => {
  it.each([
    'app/layout.tsx',
    'app/space/[id]/(space)/layout.tsx',
    'app/bounties/loading.tsx',
    'app/robots.ts',
    'app/api/chat/route.ts',
  ])('seeds %s', file => {
    expect(SERVER_ENTRY.test(file)).toBe(true);
  });

  it.each(['core/error.ts', 'partials/loading.tsx', 'design-system/page.tsx', 'atoms/route.ts'])(
    'does not seed %s',
    file => {
      expect(SERVER_ENTRY.test(file)).toBe(false);
    }
  );
});

describe('verdictFor', () => {
  const offends = (names: string[], kind: ExportKind) => verdictFor(names, kind) !== null;

  it('lets an erased export cross whatever it is called', () => {
    // `export interface options {}` is gone before anything runs, so its lowercase name is not a
    // reason to report it. This order was the other way round, and reported it.
    expect(offends(['options'], 'erased')).toBe(false);
    expect(offends(['Options'], 'erased')).toBe(false);
  });

  it('rejects a lowercase name even when the source calls it a component', () => {
    // React cannot render `<buildOptions />`, so a lowercase export is a value however it is
    // declared — and it has to be rejected through a barrel as surely as it is directly. The star
    // path exempted it, because it asked about the kind first.
    expect(offends(['buildOptions'], 'component')).toBe(true);
    expect(offends(['BuildOptions'], 'component')).toBe(false);
  });

  it('rejects a value and an unclassifiable export', () => {
    expect(offends(['Thing'], 'value')).toBe(true);
    expect(offends(['Thing'], 'unknown')).toBe(true);
    expect(verdictFor(['Thing'], 'unknown')?.label).toBe('unclassifiable ');
  });

  it('asks nothing about the capitalisation of `default`', () => {
    expect(offends(['default'], 'component')).toBe(false);
    expect(offends(['default'], 'value')).toBe(true);
    // A default import under a lowercase alias is still a default: the local name is a fact about
    // the importing file, not about the export. Judging by the alias rejected real components, and
    // this is the assertion that was missing when that happened.
    expect(offends(['default', 'suggestedFormats'], 'component')).toBe(false);
  });

  it('lets an acronym through and still reports a constant', () => {
    // These two used to be answered by the same rule — an all-uppercase name was not capitalised,
    // so `FAQ` was reported alongside `BOARD_GRID_CLASS`. The kind separates them now.
    expect(offends(['FAQ'], 'component')).toBe(false);
    expect(offends(['A'], 'component')).toBe(false);
    expect(offends(['BOARD_GRID_CLASS'], 'value')).toBe(true);
  });

  it('reads either name when an alias supplies the capital', () => {
    // `import { widget as Widget }` renders as `<Widget />`, and `import { Button as button }` is
    // still a component reference. Both directions pass; a hook under either spelling does not.
    expect(offends(['widget', 'Widget'], 'component')).toBe(false);
    expect(offends(['Button', 'button'], 'component')).toBe(false);
    expect(offends(['useThing', 'useThing'], 'component')).toBe(true);
    // And an alias cannot launder a value.
    expect(offends(['widget', 'Widget'], 'value')).toBe(true);
  });
});

describe('exportKindsOf', () => {
  const kindOf = (source: string, exported = 'Subject') =>
    exportKindsOf(parse('fixture.tsx', source), () => null).get(exported);

  it.each([
    ['a function declaration', 'export function Subject() { return <div />; }'],
    ['a function that renders nothing but runs effects', 'export function Subject() { return null; }'],
    ['a function with no return at all', 'export function Subject() { useThing(); }'],
    ['an arrow', 'export const Subject = () => <div />;'],
    ['memo imported from react', "import { memo } from 'react';\nexport const Subject = memo(() => <div />);"],
    ['React.forwardRef', "import * as React from 'react';\nexport const Subject = React.forwardRef(() => <div />);"],
    [
      'a class extending React.Component',
      "import * as React from 'react';\nexport class Subject extends React.Component {}",
    ],
    [
      'a class extending an aliased React base',
      "import { Component as Base } from 'react';\nexport class Subject extends Base {}",
    ],
    // `lazy` produces a component as surely as `memo` does.
    ['lazy', "import { lazy } from 'react';\nexport const Subject = lazy(() => import('./panel'));"],
    [
      'a wrapper reached through a default-as-named React import',
      "import { default as React } from 'react';\nexport const Subject = React.memo(() => <div />);",
    ],
    ['a non-null asserted arrow', 'export const Subject = (() => <div />)!;'],
    // One branch renders, so nothing is definite.
    ['a function returning an element from one branch', 'export function Subject() { return on ? <div /> : {}; }'],
    // `cached` could be anything, including something renderable, so this is not definite either.
    ['a function returning an object after an unknown left side', 'export function Subject() { return cached ?? {}; }'],
    ['an identifier default', 'const Inner = () => <div />;\nexport default Inner;'],
    ['a parenthesised arrow', 'export const Subject = ((props) => <div />);'],
    ['an arrow returning a component call', 'export const Subject = () => renderThing();'],
    // React renders all of these, so a function returning one is a component.
    ['a function returning a string', "export function Subject() { return 'New'; }"],
    ['a function returning a negative number', 'export function Subject() { return -1; }'],
    ['a function returning an array', 'export function Subject() { return [<A key=\"a\" />]; }'],
    ['a function returning false', 'export function Subject() { return false; }'],
  ])('accepts %s', (_label, source) => {
    expect(kindOf(source, source.includes('export default') ? 'default' : 'Subject')).toBe('component');
  });

  it.each([
    ['an object', 'export const Subject = { a: 1 };'],
    ['a parenthesised object', 'export const Subject = ({ a: 1 });'],
    ['an array', 'export const Subject = [1, 2];'],
    ['a string', "export const Subject = 'x';"],
    ['a call that is not memo or forwardRef', "export const Subject = cva('x');"],
    ['a tagged template', 'export const Subject = gql`query { x }`;'],
    ['a class extending Error', 'export class Subject extends Error {}'],
    ['an enum', 'export enum Subject { A }'],
    ['a function returning an object', 'export function Subject() { return {}; }'],
    ['a concise arrow returning an object', 'export const Subject = () => ({});'],
    ['a concise arrow returning an asserted object', 'export const Subject = () => ({}) as Thing;'],
    ['a function returning a constructed object', 'export function Subject() { return new Date(); }'],
    ['a function returning a regular expression', 'export function Subject() { return /x/; }'],
    // A returned function is as unrenderable as a returned object.
    ['a function returning a function', 'export function Subject() { return () => {}; }'],
    ['a function returning a class', 'export function Subject() { return class {}; }'],
    // Every branch, or it is not definite.
    ['a function returning an object from both branches', 'export function Subject() { return on ? {} : {}; }'],
    ['a function returning an object from both sides of ??', 'export function Subject() { return {} ?? {}; }'],
    ['an exported namespace', 'export namespace Subject { export const a = 1; }'],
    [
      "a wrapper call that is not React's",
      "import { memo } from 'other';\nexport const Subject = memo(() => <div />);",
    ],
    [
      'a class extending an unrelated Component',
      "import { Component } from './ui';\nexport class Subject extends Component {}",
    ],
    // A client component can be neither: one hands back a promise, the other an iterator.
    ['an async function', 'export async function Subject() { return fetchThing(); }'],
    ['an async arrow', 'export const Subject = async () => <div />;'],
    ['a generator function', 'export function* Subject() { yield item; }'],
    ['a default object', 'export default { a: 1 };'],
  ])('rejects %s', (_label, source) => {
    expect(kindOf(source, source.includes('export default') ? 'default' : 'Subject')).toBe('value');
  });

  it('tells a returned string from an exported one', () => {
    // `export const Subject = 'x'` is a string. `function Subject() { return 'x' }` is a component
    // that renders one. The same literal, two different questions.
    expect(kindOf("export const Subject = 'x';")).toBe('value');
    expect(kindOf("export function Subject() { return 'x'; }")).toBe('component');
  });

  it('resolves an identifier that was imported rather than declared', () => {
    // A barrel that declares nothing: `import { Button } from './button'; export { Button };`
    const origin = new Map<string, ExportKind>([['Button', 'component']]);
    const kinds = exportKindsOf(
      parse('barrel.tsx', "import { Button } from './button';\nexport { Button };"),
      () => origin
    );

    expect(kinds.get('Button')).toBe('component');
  });

  it("carries a star re-export's named exports but not its default", () => {
    const origin = new Map<string, ExportKind>([
      ['Button', 'component'],
      ['BUTTON_CLASS', 'value'],
      ['default', 'value'],
    ]);
    const kinds = exportKindsOf(parse('barrel.tsx', "export * from './button';"), () => origin);

    expect(kinds.get('Button')).toBe('component');
    expect(kinds.get('BUTTON_CLASS')).toBe('value');
    // `export *` does not carry a default, so claiming one here would invent an offence.
    expect(kinds.has('default')).toBe(false);
  });

  it('sees through an angle-bracket type assertion', () => {
    // `.ts`, because `<T>x` is not valid in `.tsx` — which is why nothing caught this until now.
    const kindOfTs = (source: string) => exportKindsOf(parse('fixture.ts', source), () => null).get('Subject');

    expect(kindOfTs('export function Subject() { return <Record<string, string>>{}; }')).toBe('value');
    expect(kindOfTs('export const Subject = <() => null>(() => null);')).toBe('component');
  });

  it('erases every ambient declaration, not just a namespace', () => {
    // `declare` describes something that exists rather than building it, so none of these survive
    // compilation. Only the namespace form was handled, and the other three were called runtime.
    expect(kindOf('export declare class Subject {}')).toBe('erased');
    expect(kindOf('export declare const Subject: object;')).toBe('erased');
    expect(kindOf('export declare function Subject(): void;')).toBe('erased');
    expect(kindOf('export declare enum Subject { A }')).toBe('erased');
  });

  it('keeps an unresolved wildcard rather than reporting nothing', () => {
    // `export * from './missing'` used to leave an empty map, so a barrel over this barrel checked
    // no bindings and passed in silence. `*` is recorded and reported instead.
    const kinds = exportKindsOf(parse('barrel.tsx', "export * from './missing';"), () => null);

    expect(kinds.get('*')).toBe('unknown');
  });

  it('erases an ambient namespace and keeps a real one', () => {
    // `export namespace` builds an object at runtime; `declare` does not build anything.
    expect(kindOf('export declare namespace Subject { const a: number; }')).toBe('erased');
  });

  it('treats a type as erased, however it is written', () => {
    expect(kindOf('export type Subject = { a: 1 };')).toBe('erased');
    expect(kindOf('export interface Subject { a: 1 }')).toBe('erased');
    expect(kindOf("export type { Subject } from './x';")).toBe('erased');
    // Keyed as `default`, which is what a default import looks it up as.
    expect(kindOf('export default interface Subject { a: 1 }', 'default')).toBe('erased');
  });

  it("does not take an unrelated lazy for React's", () => {
    expect(kindOf("import { lazy } from 'other';\nexport const Subject = lazy(() => 1);")).toBe('value');
  });

  it('records a namespace export, so a barrel over it keeps the binding', () => {
    // Nothing to classify in `* as Ns` itself — every property read off one belonging to a client
    // module is a client reference — but leaving it out of the map loses it for anything that
    // re-exports this module.
    const kinds = exportKindsOf(parse('barrel.tsx', "export * as Ns from './other';"), () => null);

    expect(kinds.get('Ns')).toBe('value');
  });

  it('follows a re-export to whatever the origin says it is', () => {
    const origin = new Map<string, ExportKind>([
      ['Button', 'component'],
      ['BUTTON_CLASS', 'value'],
    ]);
    const kinds = exportKindsOf(parse('barrel.tsx', "export { Button, BUTTON_CLASS } from './button';"), () => origin);

    expect(kinds.get('Button')).toBe('component');
    expect(kinds.get('BUTTON_CLASS')).toBe('value');
  });

  it('gives up rather than guessing when the origin cannot be read', () => {
    // What a cycle guard hands back, and what an unresolvable specifier does. Reported, not waved
    // through: `unknown` is an offence, so the failure is visible.
    expect(kindOf("export { Subject } from './somewhere-unreadable';")).toBe('unknown');
  });

  it("does not attribute a nested scope's return to the component containing it", () => {
    // A method on a nested class is a scope of its own; its `return {}` is not the component's.
    expect(
      kindOf(
        'export function Subject() {\n  class Helper {\n    build() {\n      return {};\n    }\n  }\n  void new Helper();\n}'
      )
    ).toBe('component');
  });
});

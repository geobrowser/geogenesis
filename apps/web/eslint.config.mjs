import nextTs from 'eslint-config-next/typescript';
import a11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';

const eslintConfig = defineConfig([
  ...nextTs,
  globalIgnores([
    '.next/**',
    '.vercel/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Pre-built analytics bundles served as static assets — ~133KB of minified vendor code each.
    // Linting them produced 377 of the 536 warnings this config reported, all of them unactionable,
    // and buried the 159 that are about code anyone here writes.
    'public/**',
    // graphql-codegen output (see `codegen.ts`, which generates into this directory). It carries
    // its own `/* eslint-disable */` header, which the linter then reports as an unused directive —
    // and there is no point editing a file that `bun codegen` rewrites.
    'core/gql/**',
  ]),
  {
    // `eslint-config-next/typescript` is the TypeScript subset and carries no react-hooks rules, so
    // nothing was checking them — in an app whose bug history is largely this class: a resume that
    // wrote through a stale closure (GEO-2783), an effect that discarded good URLs on re-activation
    // (GEO-2895), a fetch that claimed a key it never released (GEO-2950).
    //
    // `rules-of-hooks` is an error: it found two components calling a hook after an early return,
    // both fixed here, and there is no such thing as an acceptable one.
    //
    // `exhaustive-deps` is a warning, not an error, and deliberately. There are 93 existing
    // violations across 53 files; making it an error would either block every PR or force a
    // 93-item sweep by someone with no context on any of them. As a warning it stops the count
    // growing in code being written now, and `eslint .` has no `--max-warnings`, so CI is unaffected.
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // No jsx-a11y rules were active either. The recommended set reports 146 things across 79 files
    // and most are judgement calls — 35 static elements carrying click handlers, 30 deliberate
    // autoFocus. These three are not judgement calls. Each one means an assistive technology is
    // handed something it cannot use, and each is now at zero:
    //
    //   alt-text                  a missing alt makes a screen reader read the file name aloud
    //   heading-has-content       an empty heading is announced and leads nowhere
    //   role-supports-aria-props  an unsupported aria-* is dropped, so the state is never conveyed
    //
    // The rest stay off rather than warn. A 146-line warning list is one nobody reads, and these
    // want doing by area with someone looking at the surface as they go.
    files: ['**/*.tsx'],
    plugins: { 'jsx-a11y': a11y },
    rules: {
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
    },
  },
  {
    // These render through Satori to a PNG. There is no DOM and no assistive technology on the
    // other side, so `alt` would be a prop nothing ever reads.
    files: ['**/opengraph.tsx', '**/*-og-image.tsx', '**/api/ranking-og/**', '**/api/debate-og/**'],
    rules: { 'jsx-a11y/alt-text': 'off' },
  },
  {
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@next/next/no-img-element': 'off',
      'react/no-unescaped-entities': 'off',
      'react/prop-types': 'off',
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
]);

export default eslintConfig;

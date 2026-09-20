import nextTs from 'eslint-config-next/typescript';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';

const eslintConfig = defineConfig([
  ...nextTs,
  globalIgnores(['.next/**', '.vercel/**', 'out/**', 'build/**', 'next-env.d.ts']),
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

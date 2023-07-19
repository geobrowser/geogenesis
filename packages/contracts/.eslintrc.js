module.exports = {
  env: {
    browser: false,
    es2021: true,
    mocha: true,
    node: true,
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'standard',
    'plugin:prettier/recommended',
    'plugin:node/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
  rules: {
    'prettier/prettier': 'error',
    'node/no-unsupported-features/es-syntax': [
      'error',
      { ignores: ['modules'] },
    ],
    '@typescript-eslint/no-non-null-assertion': 0,
    '@typescript-eslint/no-unused-vars': 1,
    '@typescript-eslint/no-empty-interface': 0,
    'no-undef': 1,
    'no-unused-vars': 1,
    'node/no-missing-import': 0,
    camelcase: 'off',
  },
  // index relies on build artifacts that may not exist during linting
  ignorePatterns: [
    'index.js',
    'dist/',
    'node_modules/',
    'build/',
    'addresses/',
    '.turbo/',
  ],
}

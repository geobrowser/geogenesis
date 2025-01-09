/** @type {import('prettier').Config} */
export default {
  singleQuote: true,
  trailingComma: 'es5',
  arrowParens: 'avoid',
  printWidth: 120,
  semi: true,
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  importOrder: [
    '^@geogenesis$',
    // External dependencies
    '^w',
    // Every import starting with ./ or ~/
    '^[./|~/]',
  ],
  plugins: ['@trivago/prettier-plugin-sort-imports'],
};

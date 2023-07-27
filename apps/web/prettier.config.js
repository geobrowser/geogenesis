/** @type {import('prettier').Config} */
module.exports = {
  singleQuote: true,
  trailingComma: 'es5',
  arrowParens: 'avoid',
  printWidth: 120,
  semi: true,
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  importOrder: [
    // Place framework imports at the top
    '^react$',
    '^next$',
    '^@legendapp$',
    '^@geogenesis$',
    // External dependencies
    '^w',
    // This project's own aliases
    '^(~/core)(/.*|$)',
    '^(~/design-system)(/.*|$)',
    '^(~/partials)(/.*|$)',
    // Every import starting with ./ or ~/
    '^[./|~/]',
  ],
  tailwindConfig: './tailwind.config.js',
  plugins: [require('prettier-plugin-tailwindcss'), require('@trivago/prettier-plugin-sort-imports')],
};

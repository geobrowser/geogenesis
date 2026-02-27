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
    '^@geoprotocol$',
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
  tailwindStylesheet: './styles/styles.css',
  tailwindFunctions: ['cx', 'cva'],
  plugins: ['@trivago/prettier-plugin-sort-imports', 'prettier-plugin-tailwindcss'],
};

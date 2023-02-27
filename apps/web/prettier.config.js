/** @type {import('prettier').Config} */
module.exports = {
  singleQuote: true,
  trailingComma: 'es5',
  arrowParens: 'avoid',
  printWidth: 120,
  semi: true,
  tailwindConfig: './tailwind.config.js',
  plugins: [require('prettier-plugin-tailwindcss')],
};

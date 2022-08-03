/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './modules/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    fontFamily: {
      mono: [
        'Menlo',
        'Monaco',
        'Consolas',
        '"Liberation Mono"',
        '"Courier New"',
        'monospace',
      ],
      sans: ["'Apercu'"],
    },
    extend: {
      typography: {
        DEFAULT: {
          css: {
            h1: {
              fontWeight: 700,
            },
          },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}

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
      colors: {
        'geo-blue-100': 'rgba(10, 132, 255, 1)',
        'geo-green-100': '`rgba(46, 202, 127, 1)`',
      },
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

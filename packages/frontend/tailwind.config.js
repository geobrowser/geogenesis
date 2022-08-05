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
        'geo-green-100': 'rgba(46, 202, 127, 1)',
        'geo-red-100': 'rgba(234, 68, 88, 1)',
        'geo-grey-4': 'rgba(28, 28, 28, 0.04)',
        'geo-grey-70': 'rgba(28, 28, 28, 0.7)',
        'geo-grey-100': 'rgba(28, 28, 28, 1)',
        'geo-white-100': 'rgba(255, 255, 255, 1)',
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

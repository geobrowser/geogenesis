/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './pages/**/*.{js,ts,jsx,tsx}', './modules/**/*.{js,ts,jsx,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      white: '#FFFFFF',
      text: '#202020',
      ctaPrimary: '#3963FE',
      ctaHover: '#002FD9',
      ctaTertiary: '#F0F3FF',
      purple: '#6833FF',
      pink: '#FE31C5',
      bg: '#FBFBFB',
      'grey-01': '#F6F6F6',
      'grey-02': '#DBDBDB',
      'grey-03': '#B6B6B6',
      'grey-04': '#606060',
      divider: '#F0F0F0',
      orange: '#FFA134',
      green: '#2ACE9D',
      'red-01': '#FF523A',
      'red-02': '#FFEEEB',
    },
    borderRadius: {
      none: '0',
      DEFAULT: '6px',
    },
    boxShadow: {
      none: 'none',
      inner: 'inset 0 0 0 1px',
      'inner-lg': 'inset 0 0 0 2px',
    },
    extend: {
      fontSize: {
        mainPage: [
          '2.75rem',
          {
            lineHeight: '2.875rem',
            letterSpacing: '0.37px',
            fontWeight: '600',
          },
        ],
        input: [
          '1.0625rem',
          {
            lineHeight: '1.125rem',
            fontWeight: '400',
          },
        ],
        body: [
          '1.1875rem',
          {
            lineHeight: '1.8125rem',
            fontWeight: '400',
          },
        ],
        tableCell: [
          '1.1875rem',
          {
            lineHeight: '1.3125rem',
            fontWeight: '400',
          },
        ],
        button: [
          '1.0625rem',
          {
            lineHeight: '1.1875rem',
            letterSpacing: '-0.17px',
            fontWeight: '500',
          },
        ],
      },
    },
  },
  plugins: [],
};

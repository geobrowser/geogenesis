/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './pages/**/*.{js,ts,jsx,tsx}', './modules/**/*.{js,ts,jsx,tsx}'],
  theme: {
    colors: {
      current: 'currentColor',
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
      full: '100%',
      DEFAULT: '6px',
    },
    boxShadow: {
      none: 'none',
      inner: 'inset 0 0 0 1px',
      'inner-lg': 'inset 0 0 0 2px',
      lg: '0 8px 25px rgba(0, 0, 0, 0.09)',
    },
    screens: {
      '2xl': { max: '1535px' },
      // => @media (max-width: 1535px) { ... }

      xl: { max: '1279px' },
      // => @media (max-width: 1279px) { ... }

      lg: { max: '1023px' },
      // => @media (max-width: 1023px) { ... }

      md: { max: '767px' },
      // => @media (max-width: 767px) { ... }

      sm: { max: '639px' },
      // => @media (max-width: 639px) { ... }
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
        largeTitle: [
          '2rem',
          {
            lineHeight: '2.5rem',
            letterSpacing: '0.25px',
            fontWeight: '600',
          },
        ],
        mediumTitle: [
          '1.5rem',
          {
            lineHeight: '1.8125rem',
            fontWeight: '600',
          },
        ],
        cardEntityTitle: [
          '1.3125rem',
          {
            lineHeight: '1.75rem',
            fontWeight: '500',
          },
        ],
        smallTitle: [
          '1.1875rem',
          {
            lineHeight: '1.3125rem',
            fontWeight: '600',
          },
        ],
        body: [
          '1.1875rem',
          {
            lineHeight: '1.8125rem',
            fontWeight: '400',
          },
        ],
        bodySemibold: [
          '1.1875rem',
          {
            lineHeight: '1.8125rem',
            fontWeight: '600',
          },
        ],
        tableCell: [
          '1.1875rem',
          {
            lineHeight: '1.3125rem',
            fontWeight: '400',
          },
        ],
        textLink: [
          '1.1875rem',
          {
            lineHeight: '1.8125rem',
            textDecoration: 'underline',
            fontWeight: '400',
          },
        ],
        textLinkSemibold: [
          '1.1875rem',
          {
            lineHeight: '1.8125rem',
            textDecoration: 'underline',
            fontWeight: '600',
          },
        ],
        quote: [
          '0.9375rem',
          {
            lineHeight: '1.375rem',
            fontWeight: '700',
          },
        ],
        quoteMedium: [
          '0.9375rem',
          {
            lineHeight: '1.375rem',
            fontWeight: '500',
          },
        ],
        listItem: [
          '1.125rem',
          {
            lineHeight: '1.8125rem',
            fontWeight: '400',
          },
        ],
        listSemibold: [
          '1.125rem',
          {
            lineHeight: '1.8125rem',
            fontWeight: '600',
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
        smallButton: [
          '0.75rem',
          {
            lineHeight: '0.75rem',
            fontWeight: '500',
          },
        ],
        tag: [
          '0.6875rem',
          {
            lineHeight: '0.8125rem',
            fontWeight: '500',
          },
        ],
        input: [
          '1.0625rem',
          {
            lineHeight: '1.125rem',
            fontWeight: '400',
          },
        ],
        inputMedium: [
          '1.0625rem',
          {
            lineHeight: '1.125rem',
            fontWeight: '500',
          },
        ],
        metadata: [
          '1rem',
          {
            lineHeight: '0.9375rem',
            fontWeight: '400',
          },
        ],
        metadataMedium: [
          '1rem',
          {
            lineHeight: '0.9375rem',
            fontWeight: '500',
          },
        ],
        breadcrumb: [
          '0.875rem',
          {
            lineHeight: '0.9375rem',
            fontWeight: '500',
          },
        ],
        footnote: [
          '0.678rem',
          {
            lineHeight: '0.8125rem',
            fontWeight: '400',
          },
        ],
        footnoteMedium: [
          '0.678rem',
          {
            lineHeight: '0.8125rem',
            fontWeight: '500',
          },
        ],
        navlink: [
          '0.678rem',
          {
            lineHeight: '0.75rem',
            fontWeight: '500',
          },
        ],
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './partials/**/*.{ts,tsx}', './design-system/**/*.{ts,tsx}', './core/**/*.{ts,tsx}'],
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
      black: '#000000',
      pink: '#FE31C5',
      bg: '#FBFBFB',
      'grey-01': '#F6F6F6',
      'grey-02': '#DBDBDB',
      'grey-03': '#B6B6B6',
      'grey-04': '#606060',
      'grey-05': '#35363A',
      link: '#8B8B8B',
      divider: '#F0F0F0',
      orange: '#FFA134',
      green: '#2ACE9D',
      successTertiary: '#D4F5EB',
      errorTertiary: '#FFE1DC',
      'red-01': '#FF523A',
      'red-02': '#FFEEEB',
      'red-03': '#FFDAD4',
    },
    borderRadius: {
      none: '0',
      xs: '2px',
      sm: '4px',
      DEFAULT: '6px',
      md: '8px',
      lg: '12px',
      full: '9999px',
    },
    boxShadow: {
      none: 'none',
      onboarding: '0px 0px 71.36363220214844px 0px',
      dropdown: '0px 6px 8px #60606033',
      button: '0px 1px 2px #F0F0F0',
      card: '0px 26px 45px rgba(0, 0, 0, 0.09)',
      light: '0px 1px 2px #F0F0F0',
      big: '0 1px 21px #DBDBDB',
      lg: '0 8px 25px rgba(0, 0, 0, 0.09)',
      inner: 'inset 0 0 0 1px',
      'inner-transparent': 'inset 0 0 0 1px transparent',
      'inner-grey-02': 'inset 0 0 0 1px #DBDBDB',
      'inner-ctaHover': 'inset 0 0 0 1px #002FD9',
      'inner-text': 'inset 0 0 0 1px #202020',
      'inner-green': 'inset 0 0 0 1px #2ACE9D',
      'inner-lg': 'inset 0 0 0 2px',
      'inner-lg-transparent': 'inset 0 0 0 2px transparent',
      'inner-lg-grey-02': 'inset 0 0 0 2px #DBDBDB',
      'inner-lg-ctaHover': 'inset 0 0 0 2px #002FD9',
      'inner-lg-text': 'inset 0 0 0 2px #202020',
      'inner-lg-green': 'inset 0 0 0 2px #2ACE9D',
    },
    screens: {
      '3xl': { max: '1920px' },
      // => @media (max-width: 1920px) { ... }

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
      animation: {
        'fade-in': 'fadeIn 0.15s ease-in-out',
        'pulse-strong': 'pulseStrong 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-down': 'slideDown 300ms ease-in-out',
        'slide-up': 'slideUp 300ms ease-in-out',
      },
      backgroundImage: {
        'cover-default': "url('/images/placeholders/Cover_Default.svg')",
        'cover-hover': "url('/images/placeholders/Cover_Hover.svg')",
        'avatar-default': "url('/images/placeholders/Avatar_Default.svg')",
        'avatar-hover': "url('/images/placeholders/Avatar_Hover.svg')",
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseStrong: {
          '0%': {
            opacity: '1',
          },
          '50%': {
            opacity: '0.25',
          },
          '100%': {
            opacity: '1',
          },
        },
        shimmer: {
          '100%': {
            transform: 'translateX(100%)',
          },
        },
        slideDown: {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        slideUp: {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
      },
      fontSize: {
        mainPage: [
          '3.25rem',
          {
            lineHeight: '3.5rem',
            letterSpacing: '-0.5px',
            fontWeight: '600',
          },
        ],
        largeTitle: [
          '2rem',
          {
            lineHeight: '2.5rem',
            letterSpacing: '-.5px',
            fontWeight: '600',
          },
        ],
        mediumTitle: [
          '1.4rem',
          {
            lineHeight: '1.6rem',
            fontWeight: '500',
            letterSpacing: '-.25px',
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
            letterSpacing: '-0.25px',
          },
        ],
        body: [
          '1.25rem',
          {
            lineHeight: '1.8125rem',
            letterSpacing: '-0.08px',
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
        tableProperty: [
          '1rem',
          {
            lineHeight: '1rem',
            fontWeight: '400',
            letterSpacing: '-0.25px',
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
          '1.0625rem',
          {
            lineHeight: '1.375rem',
            fontWeight: '400',
          },
        ],
        quoteMedium: [
          '1.0625rem',
          {
            lineHeight: '1.375rem',
            fontWeight: '600',
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
          '0.875rem',
          {
            lineHeight: '0.875rem',
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
            lineHeight: '1.25rem',
            fontWeight: '400',
            letterSpacing: '-0.25px',
          },
        ],
        metadataMedium: [
          '1rem',
          {
            lineHeight: '1.25rem',
            fontWeight: '500',
            letterSpacing: '-0.25px',
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
          '0.6875rem',
          {
            lineHeight: '0.8125rem',
            fontWeight: '400',
          },
        ],
        footnoteMedium: [
          '0.6875rem',
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
        errorMessage: [
          '0.875rem',
          {
            lineHeight: '1rem',
            fontWeight: '500',
          },
        ],
        resultTitle: [
          '1rem',
          {
            lineHeight: '1rem',
            fontWeight: '500',
            letterSpacing: '-0.25px',
          },
        ],
        resultLink: [
          '1rem',
          {
            lineHeight: '1rem',
            fontWeight: '400',
            letterSpacing: '-0.25px',
          },
        ],
      },
      zIndex: {
        60: '60',
        70: '70',
        80: '80',
        90: '90',
        100: '100',
      },
    },
  },
};

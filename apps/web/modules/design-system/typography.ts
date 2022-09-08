import { colors } from './colors';

const baseTypography = {
  mainPage: {
    color: colors.text,
    fontSize: '2.5rem',
    lineHeight: '3.25rem',
    fontWeight: 700,
  },
  largeTitle: {
    color: colors.text,
    fontSize: '1.875rem',
    lineHeight: '2.5rem',
    fontWeight: 700,
  },
  mediumTitle: {
    color: colors.text,
    fontSize: '1.375rem',
    lineHeight: '1.8125rem',
    fontWeight: 700,
  },
  smallTitle: {
    color: colors.text,
    fontSize: '1rem',
    lineHeight: '1.3125rem',
    fontWeight: 700,
  },
  body: {
    color: colors.text,
    fontSize: '1rem',
    lineHeight: '1.8125rem',
    fontWeight: 400,
    fontFamily: 'IBM Plex Serif',
  },
  tableCell: {
    color: colors.text,
    fontSize: '1rem',
    lineHeight: '1.3125rem',
    fontWeight: 400,
    fontFamily: 'IBM Plex Serif',
  },
  textLink: {
    color: colors.text,
    fontSize: '1rem',
    lineHeight: '1.8125rem',
    fontWeight: 400,
    textDecoration: 'underline',
    fontFamily: 'IBM Plex Serif',
  },
  quote: {
    color: colors.text,
    fontSize: '0.9375rem',
    lineHeight: '1.375rem',
    fontWeight: 400,
  },
  listItem: {
    color: colors.text,
    fontSize: '0.9375rem',
    lineHeight: '1.8125rem',
    fontWeight: 400,
  },
  button: {
    color: colors.text,
    fontSize: '0.875rem',
    lineHeight: '1.125rem',
    fontWeight: 600,
  },
  input: {
    color: colors.text,
    fontSize: '0.875rem',
    lineHeight: '1.125rem',
    fontWeight: 400,
  },
  metadata: {
    color: colors.text,
    fontSize: '0.75rem',
    lineHeight: '0.9375rem',
    fontWeight: 400,
  },
  footnote: {
    color: colors.text,
    fontSize: '0.625rem',
    lineHeight: '0.8125rem',
    fontWeight: 400,
  },
  navlink: {
    color: colors.text,
    fontSize: '0.5625rem',
    lineHeight: '0.75rem',
    fontWeight: 400,
  },
};

export const typography = {
  ...baseTypography,
  bodyBold: {
    ...baseTypography.body,
    fontWeight: 700,
  },
  textLinkBold: {
    ...baseTypography.textLink,
    fontWeight: 700,
  },
  listBold: {
    ...baseTypography.listItem,
    fontWeight: 700,
  },
  quoteMedium: {
    ...baseTypography.quote,
    fontWeight: 600,
  },
  inputMedium: {
    ...baseTypography.input,
    fontWeight: 600,
  },
  metadataMedium: {
    ...baseTypography.metadata,
    fontWeight: 600,
  },
  footnoteMedium: {
    ...baseTypography.footnote,
    fontWeight: 600,
  },
};

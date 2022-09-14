import { colors } from './colors';

export type TypographyScale = typeof typography;
export type Typography = keyof TypographyScale;
export type TypographyValue = TypographyScale[Typography];

const baseTypography = {
  mainPage: {
    color: colors.light.text,
    fontSize: '2.5rem',
    lineHeight: '3.25rem',
    letterSpacing: '0.37px',
    fontWeight: 600,
  },
  largeTitle: {
    color: colors.light.text,
    fontSize: '1.875rem',
    lineHeight: '2.5rem',
    letterSpacing: '0.25px',
    fontWeight: 600,
  },
  mediumTitle: {
    color: colors.light.text,
    fontSize: '1.375rem',
    lineHeight: '1.8125rem',
    fontWeight: 600,
  },
  smallTitle: {
    color: colors.light.text,
    fontSize: '1rem',
    lineHeight: '1.3125rem',
    fontWeight: 600,
  },
  body: {
    color: colors.light.text,
    fontSize: '1rem',
    lineHeight: '1.8125rem',
    fontWeight: 400,
  },
  tableCell: {
    color: colors.light.text,
    fontSize: '1rem',
    lineHeight: '1.3125rem',
    fontWeight: 400,
  },
  textLink: {
    color: colors.light.text,
    fontSize: '1rem',
    lineHeight: '1.8125rem',
    fontWeight: 400,
    textDecoration: 'underline',
  },
  quote: {
    color: colors.light.text,
    fontSize: '0.9375rem',
    lineHeight: '1.375rem',
    fontWeight: 700,
  },
  listItem: {
    color: colors.light.text,
    fontSize: '0.9375rem',
    lineHeight: '1.8125rem',
    fontWeight: 400,
  },
  button: {
    color: colors.light.text,
    fontSize: '1.0625rem',
    lineHeight: '1.1875rem',
    letterSpacing: '-0.17px',
    fontWeight: 500,
  },
  input: {
    color: colors.light.text,
    fontSize: '0.875rem',
    lineHeight: '1.125rem',
    fontWeight: 400,
  },
  metadata: {
    color: colors.light.text,
    fontSize: '0.75rem',
    lineHeight: '0.9375rem',
    fontWeight: 400,
  },
  footnote: {
    color: colors.light.text,
    fontSize: '0.625rem',
    lineHeight: '0.8125rem',
    fontWeight: 400,
  },
  navlink: {
    color: colors.light.text,
    fontSize: '0.5625rem',
    lineHeight: '0.75rem',
    fontWeight: 400,
  },
};

export const typography = {
  ...baseTypography,
  bodySemibold: {
    ...baseTypography.body,
    fontWeight: 600,
  },
  textLinkSemibold: {
    ...baseTypography.textLink,
    fontWeight: 600,
  },
  listSemibold: {
    ...baseTypography.listItem,
    fontWeight: 600,
  },
  quoteMedium: {
    ...baseTypography.quote,
    fontWeight: 500,
  },
  inputMedium: {
    ...baseTypography.input,
    fontWeight: 500,
  },
  metadataMedium: {
    ...baseTypography.metadata,
    fontWeight: 500,
  },
  footnoteMedium: {
    ...baseTypography.footnote,
    fontWeight: 500,
  },
};

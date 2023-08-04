import { colors } from './colors';

export type TypographyScale = typeof typography;
export type TypographyTheme = keyof TypographyScale;
export type TypographyThemeValue = TypographyScale[TypographyTheme];
export type TypographyName = keyof TypographyScale[TypographyTheme];
export type TypographyValue = TypographyThemeValue[TypographyName];

const WEIGHTS = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

const baseTypography = {
  light: {
    mainPage: {
      color: colors.light.text,
      fontSize: '2.75rem',
      lineHeight: '2.875rem',
      letterSpacing: '0.37px',
      fontWeight: WEIGHTS.semibold,
    },
    largeTitle: {
      color: colors.light.text,
      fontSize: '2rem',
      lineHeight: '2.5rem',
      letterSpacing: '0.25px',
      fontWeight: WEIGHTS.semibold,
    },
    mediumTitle: {
      color: colors.light.text,
      fontSize: '1.5rem',
      lineHeight: '1.8125rem',
      fontWeight: WEIGHTS.semibold,
    },
    cardEntityTitle: {
      color: colors.light.text,
      fontSize: '1.3125rem',
      lineHeight: '1.75rem',
      fontWeight: WEIGHTS.medium,
    },
    smallTitle: {
      color: colors.light.text,
      fontSize: '1.1875rem',
      lineHeight: '1.3125rem',
      fontWeight: WEIGHTS.semibold,
    },
    body: {
      color: colors.light.text,
      fontSize: '1.1875rem',
      lineHeight: '1.8125rem',
      fontWeight: WEIGHTS.regular,
    },
    tableCell: {
      color: colors.light.text,
      fontSize: '1.1875rem',
      lineHeight: '1.3125rem',
      fontWeight: WEIGHTS.regular,
    },
    textLink: {
      color: colors.light.text,
      fontSize: '1.1875rem',
      lineHeight: '1.8125rem',
      fontWeight: WEIGHTS.regular,
      textDecoration: 'underline',
    },
    quote: {
      color: colors.light.text,
      fontSize: '1.0625rem',
      lineHeight: '1.375rem',
      fontWeight: WEIGHTS.bold,
    },
    listItem: {
      color: colors.light.text,
      fontSize: '1.125rem',
      lineHeight: '1.8125rem',
      fontWeight: WEIGHTS.regular,
    },
    button: {
      color: colors.light.text,
      fontSize: '1.0625rem',
      lineHeight: '1.1875rem',
      letterSpacing: '-0.17px',
      fontWeight: WEIGHTS.medium,
    },
    smallButton: {
      color: colors.light.text,
      fontSize: '0.75rem',
      lineHeight: '0.75rem',
      fontWeight: WEIGHTS.medium,
    },
    tag: {
      color: colors.light.text,
      fontSize: '0.6875rem',
      lineHeight: '0.8125rem',
      fontWeight: WEIGHTS.medium,
    },
    input: {
      color: colors.light.text,
      fontSize: '1.0625rem',
      lineHeight: '1.125rem',
      fontWeight: WEIGHTS.regular,
    },
    metadata: {
      color: colors.light.text,
      fontSize: '1rem',
      lineHeight: '0.9375rem',
      fontWeight: WEIGHTS.regular,
    },
    breadcrumb: {
      color: colors.light.text,
      fontSize: '0.875rem',
      lineHeight: '0.9375rem',
      fontWeight: WEIGHTS.medium,
    },
    footnote: {
      color: colors.light.text,
      fontSize: '0.678rem',
      lineHeight: '0.8125rem',
      fontWeight: WEIGHTS.regular,
    },
    navlink: {
      color: colors.light.text,
      fontSize: '0.678rem',
      lineHeight: '0.75rem',
      fontWeight: WEIGHTS.medium,
    },
  },
};

export const typography = {
  light: {
    ...baseTypography.light,
    bodySemibold: {
      ...baseTypography.light.body,
      fontWeight: WEIGHTS.semibold,
    },
    textLinkSemibold: {
      ...baseTypography.light.textLink,
      fontWeight: WEIGHTS.semibold,
    },
    listSemibold: {
      ...baseTypography.light.listItem,
      fontWeight: WEIGHTS.semibold,
    },
    quoteMedium: {
      ...baseTypography.light.quote,
      fontWeight: WEIGHTS.medium,
    },
    inputMedium: {
      ...baseTypography.light.input,
      fontWeight: WEIGHTS.medium,
    },
    metadataMedium: {
      ...baseTypography.light.metadata,
      fontWeight: WEIGHTS.medium,
    },
    footnoteMedium: {
      ...baseTypography.light.footnote,
      fontWeight: WEIGHTS.medium,
    },
  },
};

export const textStyles: Record<TypographyName, string> = {
  mainPage: 'text-mainPage',
  largeTitle: 'text-largeTitle',
  mediumTitle: 'text-mediumTitle',
  cardEntityTitle: 'text-cardEntityTitle',
  smallTitle: 'text-smallTitle',
  body: 'text-body',
  tableCell: 'text-tableCell',
  textLink: 'text-textLink',
  quote: 'text-quote',
  listItem: 'text-listItem',
  button: 'text-button',
  smallButton: 'text-smallButton',
  tag: 'text-tag',
  input: 'text-input',
  metadata: 'text-metadata',
  breadcrumb: 'text-breadcrumb',
  navlink: 'text-navLink',
  footnote: 'text-footnote',
  bodySemibold: 'text-bodySemibold',
  textLinkSemibold: 'text-textLinkSemibold',
  listSemibold: 'text-listSemibold',
  quoteMedium: 'text-quoteMedium',
  inputMedium: 'text-inputMedium',
  metadataMedium: 'text-metadataMedium',
  footnoteMedium: 'text-footnoteMedium',
};

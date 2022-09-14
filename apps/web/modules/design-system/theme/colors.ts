export type ColorScale = typeof colors;
type Theme = keyof ColorScale;
export type ThemeValue = ColorScale[Theme];
export type Color = keyof ColorScale[Theme];
export type ColorValue = ThemeValue[Color];

export const colors = {
  light: {
    white: '#FFFFFF',
    text: '#202020',
    ctaPrimary: '#3963FE',
    ctaHover: '#002FD9',
    ctaTertiary: '#F0F3FF',
    purple: '#6833FF',
    pink: '#FE31C5',
    bg: '#FBFBFB',
    'grey-01': '#E6E6E6',
    'grey-02': '#DBDBDB',
    'grey-03': '#B6B6B6',
    'grey-04': '#606060',
    divider: '#F6F6F6',
    orange: '#FFA134',
    green: '#14D28E',
    red: '#FF523A',
  },
} as const;

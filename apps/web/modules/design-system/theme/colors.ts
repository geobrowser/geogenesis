export type ColorScale = typeof colors;
export type ColorTheme = keyof ColorScale;
export type ColorThemeValue = ColorScale[ColorTheme];
export type ColorName = keyof ColorScale[ColorTheme];
export type ColorValue = ColorThemeValue[ColorName];

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
} as const;

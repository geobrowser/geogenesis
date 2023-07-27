import { colors } from './colors';

export type ShadowScale = typeof shadows;
export type ShadowType = keyof ShadowScale;

export const shadows = {
  dropdown: `0px 6px 8px ${colors.light['grey-04']}33`,
  button: `0px 1px 2px ${colors.light.divider}`,
  card: '0px 26px 45px rgba(0, 0, 0, 0.09)',
};

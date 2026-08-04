import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

type Props = {
  color?: ColorName;
};

/**
 * Debates icon. Shown on Claim entities in the interaction bar, alongside the
 * vote and comment controls.
 */
export function Megaphone({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d={CONE_PATH} stroke={themeColor} />
      <rect x="9.5" y="0.5" width="2" height="11" rx="1" fill="var(--color-white, #fff)" stroke={themeColor} />
      <path d={HANDLE_PATH} fill={themeColor} />
      <rect x="4" y="3" width="1" height="6" fill={themeColor} />
    </svg>
  );
}

const CONE_PATH =
  'M9.5 2L1.25921 4.04444C0.813193 4.15509 0.5 4.55548 0.5 5.01502V6.98559C0.5 7.44516 0.813228 7.84556 1.25928 7.95618L9.5 10V2Z';

const HANDLE_PATH = 'M1.5 8L3.5 8.5V10C3.5 10.5523 3.05228 11 2.5 11C1.94772 11 1.5 10.5523 1.5 10V8Z';

import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

/**
 * Sort trigger: two thin arrows side by side — **down** (left), **up** (right), matching the toolbar mock.
 */
export function SortArrows({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';
  const sw = 1.15;

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      {/* Left: downward */}
      <path
        d="M5 2.5V9.5M5 9.5L3.25 7.75M5 9.5L6.75 7.75"
        stroke={themeColor}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Right: upward */}
      <path
        d="M11 13.5V6.5M11 6.5L9.25 8.25M11 6.5L12.75 8.25"
        stroke={themeColor}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

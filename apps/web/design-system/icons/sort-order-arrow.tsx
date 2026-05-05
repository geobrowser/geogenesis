import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
  direction: 'asc' | 'desc';
}

/** Thin line-style ↑ / ↓ for sort direction rows in menus. */
export function SortOrderArrow({ color, direction }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  if (direction === 'asc') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <path
          d="M6 9.5V2.5M6 2.5L3 5.5M6 2.5L9 5.5"
          stroke={themeColor}
          strokeWidth="1.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M6 2.5V9.5M6 9.5L3 6.5M6 9.5L9 6.5"
        stroke={themeColor}
        strokeWidth="1.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

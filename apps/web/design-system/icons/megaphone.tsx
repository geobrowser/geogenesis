import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
  size?: number;
}

export function Megaphone({ color, size = 16 }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M14 2.5L5.5 6H2.5C1.94772 6 1.5 6.44772 1.5 7V9C1.5 9.55228 1.94772 10 2.5 10H5.5L14 13.5V2.5Z"
        stroke={themeColor}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5.5 6V10" stroke={themeColor} strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M4 10V13C4 13.5523 4.44772 14 5 14H6C6.55228 14 7 13.5523 7 13V10.6"
        stroke={themeColor}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

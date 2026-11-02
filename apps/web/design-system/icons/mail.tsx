import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
  /** Drawn at 20px; the stroke scales with it. */
  size?: number;
}

export function Mail({ color, size = 20 }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" stroke={themeColor} strokeWidth="1.4" />
      <path d="M3 5.5L10 10.5L17 5.5" stroke={themeColor} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName | string;
  variant?: 'filled' | 'outline';
}

export function VideoSmall({ color, variant = 'outline' }: Props) {
  // Check if it's a theme color name or a raw color string
  const themeColor = color ? (color in colors.light ? colors.light[color as ColorName] : color) : 'currentColor';

  // Use expanded viewBox for outline variant to prevent stroke clipping
  const viewBox = variant === 'outline' ? '-1 -1 18 18' : '0 0 16 16';

  return (
    <svg width="16" height="16" viewBox={viewBox} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M1 14.4693L1 1.53044C1 0.362899 2.27086 -0.373408 3.30141 0.197054L14.2094 6.23518C15.2283 6.79922 15.271 8.23347 14.2874 8.85574L3.37941 15.7565C2.35036 16.4075 1 15.677 1 14.4693Z"
        fill={variant === 'outline' ? 'transparent' : themeColor}
        stroke={variant === 'outline' ? themeColor : undefined}
        strokeWidth={variant === 'outline' ? 1.5 : undefined}
      />
    </svg>
  );
}

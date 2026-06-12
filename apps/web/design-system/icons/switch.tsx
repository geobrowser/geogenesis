import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Switch({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.5 0.5L3.5 14.5" stroke={themeColor} strokeLinecap="round" />
      <path d="M0.5 12.25L3.5 15.25L6.5 12.25" stroke={themeColor} strokeLinecap="round" />
      <path d="M12.5 1.5L12.5 15.5" stroke={themeColor} strokeLinecap="round" />
      <path d="M9.5 4.5L12.5 1.5L15.5 4.5" stroke={themeColor} strokeLinecap="round" />
    </svg>
  );
}

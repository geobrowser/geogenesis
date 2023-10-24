import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Merge({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 5L6 8L3 11" stroke={themeColor} strokeLinecap="round" />
      <path d="M13 11L10 8L13 5" stroke={themeColor} strokeLinecap="round" />
      <path d="M0.5 8L5.5 8" stroke={themeColor} strokeLinecap="round" />
      <path d="M15.5 8L10.5 8" stroke={themeColor} strokeLinecap="round" />
      <path d="M6.5 0.5H0.5V15.5H6.5" stroke={themeColor} strokeLinecap="round" />
      <path d="M9.5 0.5H15.5V15.5H9.5" stroke={themeColor} strokeLinecap="round" />
    </svg>
  );
}

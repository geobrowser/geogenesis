import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function NavigationMenu({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 5.5H17" stroke={themeColor} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 10H17" stroke={themeColor} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 14.5H17" stroke={themeColor} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function ShieldCheckSmall({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 1.5L3 3.5V7.2C3 10.4 5.1 13.3 8 14.5C10.9 13.3 13 10.4 13 7.2V3.5L8 1.5Z"
        stroke={themeColor}
        strokeLinejoin="round"
      />
      <path d="M5.5 8L7.2 9.7L10.5 6.3" stroke={themeColor} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

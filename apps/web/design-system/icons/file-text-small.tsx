import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function FileTextSmall({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 1.5H9.5L12.5 4.5V14.5H4V1.5Z"
        stroke={themeColor}
        strokeLinejoin="round"
      />
      <path d="M9.5 1.5V5H12.5" stroke={themeColor} strokeLinejoin="round" />
      <path d="M6 8.5H10.5" stroke={themeColor} strokeLinecap="round" />
      <path d="M6 10.5H10.5" stroke={themeColor} strokeLinecap="round" />
      <path d="M6 12.5H9" stroke={themeColor} strokeLinecap="round" />
    </svg>
  );
}

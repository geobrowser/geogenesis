import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Gem({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="7" fill={themeColor} />
      <path
        d="M8 5.1L11.2 10.4H4.8L8 5.1Z"
        stroke="white"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
        strokeMiterlimit="1"
        fill="none"
      />
    </svg>
  );
}

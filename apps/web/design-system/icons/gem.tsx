import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Gem({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 1L14 5L8 15L2 5L8 1Z"
        fill={themeColor}
        stroke={themeColor}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path d="M2 5H14" stroke="white" strokeWidth="0.5" strokeOpacity="0.5" />
      <path d="M8 1V15" stroke="white" strokeWidth="0.5" strokeOpacity="0.3" />
    </svg>
  );
}

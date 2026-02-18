import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function RightArrowLongChip({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="15" height="15" rx="5.5" fill="white" stroke={themeColor} />
      <path d="M9.5 5L12 8L9.5 11" stroke={themeColor} strokeLinecap="round" />
      <path d="M4 8H11.75" stroke={themeColor} strokeLinecap="round" />
    </svg>
  );
}

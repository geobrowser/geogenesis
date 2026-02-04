import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function ChevronDown({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 5L8 12L15 5" stroke={themeColor} stroke-linecap="round" />
    </svg>
  );
}

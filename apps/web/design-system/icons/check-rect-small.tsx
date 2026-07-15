import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

type Props = {
  color?: ColorName;
  filled?: boolean;
};

export function CheckRectSmall({ color, filled = false }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="11" height="11" rx="3" stroke={themeColor} fill={filled ? themeColor : 'none'} />
      <path d="M3.25 6.25L5.25 8.25L8.75 4" stroke={filled ? colors.light.white : themeColor} />
    </svg>
  );
}

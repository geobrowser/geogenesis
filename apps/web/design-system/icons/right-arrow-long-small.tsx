import * as React from 'react';

import { colors, ColorName } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function RightArrowLongSmall({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="14" height="12" viewBox="0 0 14 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.4751 3L12.4751 6L9.4751 9" stroke={themeColor} strokeLinecap="round" />
      <path d="M1.375 6H12.25" stroke={themeColor} strokeLinecap="round" />
    </svg>
  );
}

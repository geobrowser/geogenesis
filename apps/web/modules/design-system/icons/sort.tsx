import * as React from 'react';

import { colors, ColorName } from '~/modules/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Sort({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="17" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.5 13.25L3.5 16.25L0.5 13.25" stroke={themeColor} strokeLinecap="round" />
      <path d="M3.5 1.5L3.5 15.5" stroke={themeColor} strokeLinecap="round" />
      <path d="M9.5 4.5L12.5 1.5L15.5 4.5" stroke={themeColor} strokeLinecap="round" />
      <path d="M12.5 16.25L12.5 2.25" stroke={themeColor} strokeLinecap="round" />
    </svg>
  );
}

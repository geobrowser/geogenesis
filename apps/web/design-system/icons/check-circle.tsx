import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function CheckCircle({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="7" r="6.25" stroke={themeColor} strokeWidth="1.5" />
      <path d="M4 7L6 9L10 5" stroke={themeColor} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

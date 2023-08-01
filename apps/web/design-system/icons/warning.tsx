import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Warning({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="7.5" stroke={themeColor} />
      <rect x="7.5" y="4" width="1" height="6" rx="0.5" fill={themeColor} />
      <rect x="7.5" y="11.5" width="1" height="1" rx="0.5" fill={themeColor} />
    </svg>
  );
}

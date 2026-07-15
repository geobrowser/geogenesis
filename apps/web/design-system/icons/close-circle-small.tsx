import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function CloseCircleSmall({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="12" height="13" viewBox="0 0 12 13" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="6.5" r="5.5" stroke={themeColor} />
      <path d="M4 4.5L8 8.5" stroke={themeColor} />
      <path d="M8 4.5L4 8.5" stroke={themeColor} />
    </svg>
  );
}

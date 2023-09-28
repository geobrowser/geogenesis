import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function CheckCircleReview({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="17" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8.5" r="7.5" stroke={themeColor} />
      <path d="M3.5 8.5L6.5 11.5L12.5 5.5" stroke={themeColor} />
    </svg>
  );
}

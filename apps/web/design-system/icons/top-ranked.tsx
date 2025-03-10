import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function TopRanked({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="8" height="7" viewBox="0 0 8 7" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="1" width="7" height="1" fill={themeColor} stroke={themeColor} />
      <rect y="5.5" width="8" height="1" fill={themeColor} />
      <rect y="3.5" width="8" height="1" fill={themeColor} />
    </svg>
  );
}

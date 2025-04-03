import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Menu({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="15" height="15" rx="5.5" fill="white" stroke={themeColor} />
      <ellipse cx="4.5" cy="8" rx="1" ry="1" fill={themeColor} />
      <ellipse cx="8" cy="8" rx="1" ry="1" fill={themeColor} />
      <ellipse cx="11.5" cy="8" rx="1" ry="1" fill={themeColor} />
    </svg>
  );
}

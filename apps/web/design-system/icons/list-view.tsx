import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function ListView({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="17" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="1" width="3" height="3" rx="0.5" stroke={themeColor} />
      <rect x="6" y="2" width="10" height="1" rx="0.5" fill={themeColor} />
      <rect x="0.5" y="7" width="3" height="3" rx="0.5" stroke={themeColor} />
      <rect x="6" y="8" width="10" height="1" rx="0.5" fill={themeColor} />
      <rect x="0.5" y="13" width="3" height="3" rx="0.5" stroke={themeColor} />
      <rect x="6" y="14" width="10" height="1" rx="0.5" fill={themeColor} />
    </svg>
  );
}

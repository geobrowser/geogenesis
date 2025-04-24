import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function BulletedListView({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="17" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="2" cy="2.5" r="1.5" fill={themeColor} />
      <rect x="6" y="2" width="10" height="1" rx="0.5" fill={themeColor} />
      <circle cx="2" cy="8.5" r="1.5" fill={themeColor} />
      <rect x="6" y="8" width="10" height="1" rx="0.5" fill={themeColor} />
      <circle cx="2" cy="14.5" r="1.5" fill={themeColor} />
      <rect x="6" y="14" width="10" height="1" rx="0.5" fill={themeColor} />
    </svg>
  );
}

import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function TableView({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="17" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="1" width="15" height="15" rx="2.5" stroke={themeColor} />
      <rect x="5" y="1.5" width="1" height="14" fill={themeColor} />
      <rect x="10" y="1.5" width="1" height="14" fill={themeColor} />
      <rect x="1" y="5.5" width="14" height="1" fill={themeColor} />
      <rect x="1" y="10.5" width="14" height="1" fill={themeColor} />
    </svg>
  );
}

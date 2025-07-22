import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function EntitySmall({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="2.25" cy="8.25006" r="1" stroke={themeColor} />
      <circle cx="2.25" cy="3.75006" r="1" stroke={themeColor} />
      <path d="M6 2.62506V9.37506" stroke={themeColor} />
      <path d="M9 4.50006L6 6.37506" stroke={themeColor} />
      <path d="M9 7.87506L6 6.00006" stroke={themeColor} />
      <path d="M3 4.50006L6 6.37506" stroke={themeColor} />
      <path d="M3 7.87506L6 6.00006" stroke={themeColor} />
      <circle cx="9.75" cy="8.25006" r="1" stroke={themeColor} />
      <circle cx="9.75" cy="3.75006" r="1" stroke={themeColor} />
      <circle cx="6" cy="1.50006" r="1" stroke={themeColor} />
      <circle cx="6" cy="10.5001" r="1" stroke={themeColor} />
    </svg>
  );
}

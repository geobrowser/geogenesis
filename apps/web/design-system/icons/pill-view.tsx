import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function PillView({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="2.5" width="7" height="4" rx="2" stroke={themeColor} />
      <rect x="8.5" y="2.5" width="7" height="4" rx="2" stroke={themeColor} />
      <rect x="0.5" y="9.5" width="10" height="4" rx="2" stroke={themeColor} />
      <rect x="11.5" y="9.5" width="4" height="4" rx="2" stroke={themeColor} />
    </svg>
  );
}

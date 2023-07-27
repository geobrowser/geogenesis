import * as React from 'react';

import { colors, ColorName } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Expand({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0.5H15.5V4" stroke={themeColor} />
      <path d="M15.5 0.5L12.3182 3.68182" stroke={themeColor} />
      <path d="M4 15.5L0.5 15.5L0.5 12" stroke={themeColor} />
      <path d="M3.68182 12.3182L0.5 15.5" stroke={themeColor} />
    </svg>
  );
}

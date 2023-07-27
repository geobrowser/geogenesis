import * as React from 'react';

import { colors, ColorName } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function ExpandSmall({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="12" height="13" viewBox="0 0 12 13" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 1H11.5V4.5" stroke={themeColor} />
      <path d="M11.5002 1L8.31836 4.18182" stroke={themeColor} />
      <path d="M4 12L0.5 12L0.5 8.5" stroke={themeColor} />
      <path d="M3.68182 8.81812L0.5 11.9999" stroke={themeColor} />
    </svg>
  );
}

import * as React from 'react';

import { colors, ColorName } from '~/modules/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function CheckCircleSmall({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="12" height="13" viewBox="0 0 12 13" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="6.5" r="5.5" stroke={themeColor} />
      <path d="M2.625 6.5L4.875 8.75L9.375 4.25" stroke={themeColor} />
    </svg>
  );
}

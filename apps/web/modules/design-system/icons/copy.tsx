import * as React from 'react';

import { colors, ColorName } from '~/modules/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Copy({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1.5" y="3.5" width="10" height="12" rx="1.5" stroke={themeColor} />
      <rect x="4.5" y="0.5" width="10" height="12" rx="1.5" fill="white" stroke={themeColor} />
    </svg>
  );
}

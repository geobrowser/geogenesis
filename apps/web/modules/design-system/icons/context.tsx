import * as React from 'react';

import { colors, ColorName } from '~/modules/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Context({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="1.25" cy="8.25" r="1.25" fill={themeColor} />
      <circle cx="8" cy="8.25" r="1.25" fill={themeColor} />
      <circle cx="14.75" cy="8.25" r="1.25" fill={themeColor} />
    </svg>
  );
}

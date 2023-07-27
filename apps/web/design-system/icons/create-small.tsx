import * as React from 'react';

import { colors, ColorName } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function CreateSmall({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.5 0V13" stroke={themeColor} />
      <path d="M0 6.5L13 6.5" stroke={themeColor} />
    </svg>
  );
}

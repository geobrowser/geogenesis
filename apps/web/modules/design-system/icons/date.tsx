import * as React from 'react';

import { colors, ColorName } from '~/modules/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Date({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="12" height="13" viewBox="0 0 12 13" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M0.5 4C0.5 3.17157 1.17157 2.5 2 2.5H6H9H10C10.8284 2.5 11.5 3.17157 11.5 4V9.75C11.5 10.5784 10.8284 11.25 10 11.25H2C1.17157 11.25 0.5 10.5784 0.5 9.75V4Z"
        stroke={themeColor}
      />
      <path d="M3.375 0.5V4.25" stroke={themeColor} />
      <path d="M8.625 0.5V4.25" stroke={themeColor} />
    </svg>
  );
}

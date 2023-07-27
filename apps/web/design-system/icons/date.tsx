import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Date({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="17" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M0.5 4.5C0.5 3.67157 1.17157 3 2 3H8H12H14C14.8284 3 15.5 3.67157 15.5 4.5V13.5C15.5 14.3284 14.8284 15 14 15H2C1.17157 15 0.5 14.3284 0.5 13.5V4.5Z"
        stroke={themeColor}
      />
      <path d="M4.5 0.5V5.5" stroke={themeColor} />
      <path d="M11.5 0.5V5.5" stroke={themeColor} />
    </svg>
  );
}

import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function FastPath({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6.75 1L2.25 6.75H5.25L5.25 11L9.75 5.25H6.75L6.75 1Z"
        stroke={themeColor}
        strokeLinejoin="round"
      />
    </svg>
  );
}

import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Stars({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M6 1.5L7.12 4.38H10.24L7.68 6.12L8.8 9L6 7.26L3.2 9L4.32 6.12L1.76 4.38H4.88L6 1.5Z"
        stroke={themeColor}
        strokeLinejoin="round"
      />
    </svg>
  );
}

import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function RightArrowDiagonal({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.87781 2H14V11.1222" stroke={themeColor} />
      <path d="M14 2L2 14" stroke={themeColor} />
    </svg>
  );
}

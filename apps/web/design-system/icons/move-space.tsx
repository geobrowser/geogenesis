import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function MoveSpace({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 5L11 8L8 11" stroke={themeColor} strokeLinecap="round" />
      <path d="M0.5 8L10.5 8" stroke={themeColor} strokeLinecap="round" />
      <path d="M3 2V0.5H15.5V15.5H3V14" stroke={themeColor} strokeLinecap="round" />
    </svg>
  );
}

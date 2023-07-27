import * as React from 'react';

import { colors, ColorName } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function ChevronRight({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 12L10 8L6 4" stroke={themeColor} strokeLinecap="round" />
    </svg>
  );
}

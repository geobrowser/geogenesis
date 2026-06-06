import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function RightArrowDiagonalSmall({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.60547 4.07617H11.8481V8.31881" stroke="#606060" stroke-linecap="round" />
      <path d="M4 11.9238L11.6898 4.23404" stroke="#606060" stroke-linecap="round" />
    </svg>
  );
}

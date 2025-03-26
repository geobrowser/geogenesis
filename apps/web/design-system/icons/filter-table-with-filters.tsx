import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function FilterTableWithFilters({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3.64681 0.5H12.3532C13.5374 0.5 14.2546 1.80779 13.618 2.80633L10.3919 7.86698C10.136 8.26847 10 8.73472 10 9.21086V14C10 14.8284 9.32843 15.5 8.5 15.5H7.5C6.67157 15.5 6 14.8284 6 14V9.21086C6 8.73472 5.86403 8.26848 5.60808 7.86698L2.38196 2.80633C1.74541 1.80779 2.46263 0.5 3.64681 0.5Z"
        stroke={themeColor}
        strokeLinecap="round"
      />
      <circle cx="5.5" cy="6.5" r="3" fill={themeColor} stroke="white" />
    </svg>
  );
}

import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Trash({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3.5 2.5H12.5V13C12.5 14.3807 11.3807 15.5 10 15.5H6C4.61929 15.5 3.5 14.3807 3.5 13V2.5Z"
        stroke={themeColor}
      />
      <rect x="9" y="5" width="1" height="8" rx="0.5" fill={themeColor} />
      <rect x="6" y="5" width="1" height="8" rx="0.5" fill={themeColor} />
      <rect x="1.5" y="2" width="13" height="1" rx="0.5" fill={themeColor} />
      <path
        d="M5 2.5L5.72361 1.05279C5.893 0.714002 6.23926 0.5 6.61803 0.5H9.38197C9.76074 0.5 10.107 0.714002 10.2764 1.05279L11 2.5"
        stroke={themeColor}
      />
    </svg>
  );
}

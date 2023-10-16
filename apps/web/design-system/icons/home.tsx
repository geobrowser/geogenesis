import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Home({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="4" height="4" rx="0.5" stroke={themeColor} />
      <rect x="0.5" y="11.5" width="15" height="4" rx="1.5" stroke={themeColor} />
      <rect x="0.5" y="0.5" width="15" height="9" rx="1.5" stroke={themeColor} />
      <path d="M8.5 3H13" stroke={themeColor} strokeLinecap="round" />
      <path d="M8.5 5H10.75" stroke={themeColor} strokeLinecap="round" />
    </svg>
  );
}

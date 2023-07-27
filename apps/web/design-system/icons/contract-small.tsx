import * as React from 'react';

import { colors, ColorName } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function ContractSmall({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M11.209 4L8.00065 4V0.791667" stroke={themeColor} />
      <path d="M11.5 0.5L8 4" stroke={themeColor} />
      <path d="M0.791016 8L3.99935 8L3.99935 11.2083" stroke={themeColor} />
      <path d="M0.5 11.5L4 8" stroke={themeColor} />
    </svg>
  );
}

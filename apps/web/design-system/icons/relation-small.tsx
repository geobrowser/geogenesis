import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function RelationSmall({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="3.9375" cy="6" r="2.9375" stroke={themeColor} />
      <circle cx="8.0625" cy="6" r="2.9375" stroke={themeColor} />
    </svg>
  );
}

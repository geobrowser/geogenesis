import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function CheckCloseSmall({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="6" r="5.5" stroke={themeColor} />
      <path d="M3.75 8.25L8.25 3.75" stroke={themeColor} />
      <path d="M3.75 3.75L8.25 8.25" stroke={themeColor} />
    </svg>
  );
}

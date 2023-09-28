import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function ArrowLeft({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="14" height="12" viewBox="0 0 14 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.5249 9L1.5249 6L4.5249 3" stroke={themeColor} strokeLinecap="round" />
      <path d="M12.625 6L1.75 6" stroke={themeColor} strokeLinecap="round" />
    </svg>
  );
}

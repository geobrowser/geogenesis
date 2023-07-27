import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function NewTab({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12.625 5.6875V7V10.625C12.625 11.7296 11.7296 12.625 10.625 12.625H3.375C2.27043 12.625 1.375 11.7296 1.375 10.625V3.375C1.375 2.27043 2.27043 1.375 3.375 1.375H7H8.3125"
        stroke={themeColor}
      />
      <path d="M9.25 1.375H12.625V4.75" stroke={themeColor} />
      <path d="M12.25 1.75L8.5 5.5" stroke={themeColor} />
    </svg>
  );
}

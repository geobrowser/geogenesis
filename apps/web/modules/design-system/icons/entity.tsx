import * as React from 'react';

import { colors, ColorName } from '~/modules/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Entity({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="3" cy="11" r="1.5" stroke={themeColor} />
      <circle cx="3" cy="5" r="1.5" stroke={themeColor} />
      <path d="M8 3.5V12.5" stroke={themeColor} />
      <path d="M12 6L8 8.5" stroke={themeColor} />
      <path d="M12 10.5L8 8" stroke={themeColor} />
      <path d="M4 6L8 8.5" stroke={themeColor} />
      <path d="M4 10.5L8 8" stroke={themeColor} />
      <circle cx="13" cy="11" r="1.5" stroke={themeColor} />
      <circle cx="13" cy="5" r="1.5" stroke={themeColor} />
      <circle cx="8" cy="2" r="1.5" stroke={themeColor} />
      <circle cx="8" cy="14" r="1.5" stroke={themeColor} />
    </svg>
  );
}

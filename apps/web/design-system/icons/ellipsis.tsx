import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Ellipsis({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="10" height="2" viewBox="0 0 10 2" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="1.5" cy="1" rx="1" ry="1" fill={themeColor} />
      <ellipse cx="1.5" cy="1" rx="1" ry="1" fill="black" />
      <ellipse cx="5" cy="1" rx="1" ry="1" fill={themeColor} />
      <ellipse cx="5" cy="1" rx="1" ry="1" fill="black" />
      <ellipse cx="8.5" cy="1" rx="1" ry="1" fill={themeColor} />
      <ellipse cx="8.5" cy="1" rx="1" ry="1" fill="black" />
    </svg>
  );
}

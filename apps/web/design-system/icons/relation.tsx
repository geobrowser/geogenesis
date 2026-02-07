import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
  className?: string;
}

export function Relation({ color, className }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg
      width="16"
      height="17"
      viewBox="0 0 16 17"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="5" cy="8.5" r="4.5" stroke={themeColor} />
      <circle cx="11" cy="8.5" r="4.5" stroke={themeColor} />
    </svg>
  );
}

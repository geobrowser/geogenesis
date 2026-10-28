import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
  /** Rendered size. Defaults to the 13px this is drawn at, as `TickSmall` does. */
  size?: number;
  /** Drawn at the SVG default of 1; heavier for a plus shrunk onto a small badge. */
  strokeWidth?: number;
  className?: string;
}

export function CreateSmall({ color, size = 13, strokeWidth, className }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 13 13"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d="M6.5 0V13" stroke={themeColor} strokeWidth={strokeWidth} />
      <path d="M0 6.5L13 6.5" stroke={themeColor} strokeWidth={strokeWidth} />
    </svg>
  );
}

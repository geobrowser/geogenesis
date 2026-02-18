import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
  className?: string;
}

export function Date({ color, className }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M15.5 6V12C15.5 13.933 13.933 15.5 12 15.5H4C2.067 15.5 0.5 13.933 0.5 12V6C0.5 4.067 2.067 2.5 4 2.5H8H12C13.933 2.5 15.5 4.067 15.5 6Z"
        stroke={themeColor}
      />
      <path d="M4 5C4 5.27614 4.22386 5.5 4.5 5.5C4.77614 5.5 5 5.27614 5 5H4ZM4 0V5H5V0H4Z" fill={themeColor} />
      <path
        d="M11 5C11 5.27614 11.2239 5.5 11.5 5.5C11.7761 5.5 12 5.27614 12 5H11ZM11 0V5H12V0H11Z"
        fill={themeColor}
      />
    </svg>
  );
}

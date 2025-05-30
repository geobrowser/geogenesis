import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
  className?: string;
}

export function Create({ color, className }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className={className ? className : ''}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M8 0V16" stroke={themeColor} />
      <path d="M0 8L16 8" stroke={themeColor} />
    </svg>
  );
}

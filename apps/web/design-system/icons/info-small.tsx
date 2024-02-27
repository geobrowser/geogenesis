import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function InfoSmall({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="7.5" stroke={themeColor} />
      <path
        d="M7.04 11.68C7.04 12.265 7.49 12.715 8.06 12.715C8.63 12.715 9.08 12.265 9.08 11.68C9.08 11.095 8.63 10.645 8.06 10.645C7.49 10.645 7.04 11.095 7.04 11.68ZM11.015 5.92C11.015 4.285 9.935 3.25 8.09 3.25C6.38 3.25 5.18 4.45 5 6.16H6.62C6.68 5.29 7.16 4.63 8.09 4.63C8.96 4.63 9.485 5.17 9.485 5.935C9.485 6.73 8.81 7.21 8.3 7.78C7.64 8.5 7.43 8.89 7.385 9.715H8.855C8.855 9.4 8.96 9.07 9.485 8.53C10.19 7.81 11.015 7.045 11.015 5.92Z"
        fill={themeColor}
      />
    </svg>
  );
}

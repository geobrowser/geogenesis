import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Copy({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clipPath="url(#clip0_50264_328177)">
        <mask id="path-1-inside-1_50264_328177" fill="white">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M5 4H3C1.34315 4 0 5.34315 0 7V13C0 14.6569 1.34315 16 3 16H9C10.6569 16 12 14.6569 12 13V11H7C5.89543 11 5 10.1046 5 9V4Z"
          />
        </mask>
        <path
          d="M5 4H6V3H5V4ZM12 11H13V10H12V11ZM3 5H5V3H3V5ZM1 7C1 5.89543 1.89543 5 3 5V3C0.790861 3 -1 4.79086 -1 7H1ZM1 13V7H-1V13H1ZM3 15C1.89543 15 1 14.1046 1 13H-1C-1 15.2091 0.790861 17 3 17V15ZM9 15H3V17H9V15ZM11 13C11 14.1046 10.1046 15 9 15V17C11.2091 17 13 15.2091 13 13H11ZM11 11V13H13V11H11ZM12 10H7V12H12V10ZM7 10C6.44772 10 6 9.55228 6 9H4C4 10.6569 5.34315 12 7 12V10ZM6 9V4H4V9H6Z"
          fill={themeColor}
          mask="url(#path-1-inside-1_50264_328177)"
        />
        <rect x="4.5" y="0.5" width="11" height="11" rx="2.5" stroke={themeColor} />
      </g>
      <defs>
        <clipPath id="clip0_50264_328177">
          <rect width="16" height="16" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

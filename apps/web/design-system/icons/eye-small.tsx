import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function EyeSmall({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <mask id="path-1-inside-1_13611_139414" fill="white">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M-2.07127e-06 6C1.41899 8.28856 3.57974 9.74999 6 9.74999C8.42025 9.74999 10.581 8.28856 12 6C10.581 3.71144 8.42025 2.25 6 2.25C3.57974 2.25 1.41899 3.71144 -2.07127e-06 6Z"
        />
      </mask>
      <path
        d="M-2.07127e-06 6L-0.84989 5.47303L-1.17663 6L-0.84989 6.52696L-2.07127e-06 6ZM12 6L12.8499 6.52696L13.1766 6L12.8499 5.47303L12 6ZM6 8.74999C4.01296 8.74999 2.13772 7.55006 0.849886 5.47303L-0.84989 6.52696C0.700267 9.02706 3.14653 10.75 6 10.75L6 8.74999ZM11.1501 5.47303C9.86228 7.55006 7.98704 8.74999 6 8.74999L6 10.75C8.85347 10.75 11.2997 9.02706 12.8499 6.52696L11.1501 5.47303ZM6 3.25C7.98704 3.25 9.86228 4.44994 11.1501 6.52696L12.8499 5.47303C11.2997 2.97294 8.85347 1.25 6 1.25L6 3.25ZM0.849886 6.52696C2.13772 4.44994 4.01296 3.25 6 3.25L6 1.25C3.14653 1.25 0.700268 2.97294 -0.84989 5.47303L0.849886 6.52696Z"
        fill={themeColor}
        mask="url(#path-1-inside-1_13611_139414)"
      />
      <circle cx="6" cy="6" r="1.75" stroke={themeColor} />
    </svg>
  );
}

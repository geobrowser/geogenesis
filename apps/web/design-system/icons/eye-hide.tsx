import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function EyeHide({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <mask id="path-1-inside-1_4951_84098" fill="white">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M0.999998 8.99999C2.89199 12.0514 5.77299 14 9 14C12.227 14 15.108 12.0514 17 9C15.108 5.94858 12.227 4 9 4C5.77299 4 2.89199 5.94858 0.999998 8.99999Z"
        />
      </mask>
      <path
        d="M0.999998 8.99999L0.15011 8.47303L-0.176628 8.99999L0.15011 9.52696L0.999998 8.99999ZM17 9L17.8499 9.52696L18.1766 9L17.8499 8.47303L17 9ZM9 13C6.20621 13 3.61072 11.3129 1.84989 8.47303L0.15011 9.52696C2.17327 12.7899 5.33978 15 9 15L9 13ZM16.1501 8.47303C14.3893 11.3129 11.7938 13 9 13L9 15C12.6602 15 15.8267 12.7899 17.8499 9.52696L16.1501 8.47303ZM9 5C11.7938 5 14.3893 6.68708 16.1501 9.52696L17.8499 8.47303C15.8267 5.21008 12.6602 3 9 3L9 5ZM1.84989 9.52696C3.61072 6.68708 6.20621 5 9 5L9 3C5.33978 3 2.17327 5.21008 0.15011 8.47303L1.84989 9.52696Z"
        fill={themeColor}
        mask="url(#path-1-inside-1_4951_84098)"
      />
      <circle cx="9" cy="9" r="2.5" stroke={themeColor} />
      <path d="M1 17L17 1" stroke={themeColor} />
    </svg>
  );
}

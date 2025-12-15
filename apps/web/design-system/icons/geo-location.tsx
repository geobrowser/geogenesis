import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function GeoLocation({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clipPath="url(#clip0_49261_69243)">
        <circle cx="8" cy="8.5" r="7.5" stroke={themeColor} />
        <path
          d="M11 8.5C11 10.6569 10.6165 12.5856 10.0168 13.9564C9.7166 14.6426 9.37206 15.1665 9.01483 15.5118C8.66 15.8549 8.31782 16 8 16C7.68218 16 7.34 15.8549 6.98517 15.5118C6.62794 15.1665 6.2834 14.6426 5.9832 13.9564C5.38347 12.5856 5 10.6569 5 8.5C5 6.34314 5.38347 4.41439 5.9832 3.04356C6.2834 2.3574 6.62794 1.83351 6.98517 1.48815C7.34 1.14512 7.68218 1 8 1C8.31782 1 8.66 1.14512 9.01483 1.48815C9.37206 1.83351 9.7166 2.3574 10.0168 3.04356C10.6165 4.41439 11 6.34314 11 8.5Z"
          stroke={themeColor}
        />
        <rect x="1" y="10.5" width="14" height="1" fill={themeColor} />
        <rect x="1" y="5.5" width="14" height="1" fill={themeColor} />
      </g>
      <defs>
        <clipPath id="clip0_49261_69243">
          <rect width="16" height="16" fill="white" transform="translate(0 0.5)" />
        </clipPath>
      </defs>
    </svg>
  );
}

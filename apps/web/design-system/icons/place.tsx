import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
  className?: string;
}

export function Place({ color, className }: Props) {
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
      <g clip-path="url(#clip0_56349_78608)">
        <rect y="15" width="16" height="1" rx="0.5" fill={themeColor} />
        <path
          d="M2.5 3.5C2.59398 3.5 2.79269 3.57676 3.06738 3.95801C3.32635 4.31752 3.57662 4.84631 3.79492 5.48047C4.23083 6.74688 4.5 8.31724 4.5 9.5C4.5 10.6939 4.2276 11.1011 3.98242 11.2715C3.84534 11.3667 3.66193 11.4285 3.40625 11.4629C3.14625 11.4978 2.85184 11.5 2.5 11.5C2.14816 11.5 1.85375 11.4978 1.59375 11.4629C1.33807 11.4285 1.15466 11.3667 1.01758 11.2715C0.772398 11.1011 0.5 10.6939 0.5 9.5C0.5 8.31724 0.769166 6.74688 1.20508 5.48047C1.42338 4.84631 1.67365 4.31752 1.93262 3.95801C2.20731 3.57676 2.40602 3.5 2.5 3.5Z"
          stroke={themeColor}
        />
        <rect x="2" y="12" width="1" height="3" fill={themeColor} />
        <path
          d="M9 0.5H11C11.8284 0.5 12.5 1.17157 12.5 2V15C12.5 15.2761 12.2761 15.5 12 15.5H7.5V2C7.5 1.17157 8.17157 0.5 9 0.5Z"
          stroke={themeColor}
        />
        <path d="M9 13C9 12.4477 9.44772 12 10 12C10.5523 12 11 12.4477 11 13V15H9V13Z" fill={themeColor} />
        <rect x="9" y="9" width="2" height="1" rx="0.5" fill={themeColor} />
        <rect x="9" y="7" width="2" height="1" rx="0.5" fill={themeColor} />
        <rect x="9" y="5" width="2" height="1" rx="0.5" fill={themeColor} />
        <rect x="9" y="3" width="2" height="1" rx="0.5" fill={themeColor} />
      </g>
      <defs>
        <clipPath id="clip0_56349_78608">
          <rect width="16" height="16" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

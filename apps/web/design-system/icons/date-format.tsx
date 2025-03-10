import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
  className?: string;
}

export function DateFormat({ color, className }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="13"
      viewBox="0 0 12 13"
      fill="none"
      className={className}
    >
      <path d="M12 0.642334V9.35842H10.4178V2.41678L8.16211 3.45306V1.96252L11.0444 0.642334H12Z" fill={themeColor} />
      <path
        d="M3.63422 9.5C1.45682 9.5 0 7.65457 0 5C0 2.34543 1.45682 0.5 3.63422 0.5C5.81161 0.5 7.26843 2.34543 7.26843 5C7.26843 7.65457 5.81161 9.5 3.63422 9.5ZM3.63422 1.83438C2.20873 1.83438 1.58214 3.16877 1.58214 5C1.58214 6.83123 2.20873 8.16562 3.63422 8.16562C5.04404 8.16562 5.67063 6.83123 5.67063 5C5.67063 3.16877 5.04404 1.83438 3.63422 1.83438Z"
        fill={themeColor}
      />
      <path d="M0.5 12H11.5" stroke={themeColor} strokeLinecap="round" strokeDasharray="0.1 2" />
    </svg>
  );
}

import * as React from 'react';

import { colors, ColorName } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Preset({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 15.5H4C2.067 15.5 0.5 13.933 0.5 12V4C0.5 2.067 2.067 0.5 4 0.5H8H12C13.437 0.5 14.2869 1.08757 14.7942 1.79215C15.3199 2.52223 15.5 3.41334 15.5 4V8V12C15.5 13.933 13.933 15.5 12 15.5Z"
        stroke={themeColor}
      />
      <path
        d="M4 10.5C3.72386 10.5 3.5 10.7239 3.5 11C3.5 11.2761 3.72386 11.5 4 11.5V10.5ZM12 11.5C12.2761 11.5 12.5 11.2761 12.5 11C12.5 10.7239 12.2761 10.5 12 10.5V11.5ZM4 11.5H12V10.5H4V11.5Z"
        fill={themeColor}
      />
      <path
        d="M4 7.5C3.72386 7.5 3.5 7.72386 3.5 8C3.5 8.27614 3.72386 8.5 4 8.5L4 7.5ZM5.5 8.5C5.77614 8.5 6 8.27614 6 8C6 7.72386 5.77614 7.5 5.5 7.5L5.5 8.5ZM4 8.5L5.5 8.5L5.5 7.5L4 7.5L4 8.5Z"
        fill={themeColor}
      />
      <path
        d="M4 4.5C3.72386 4.5 3.5 4.72386 3.5 5C3.5 5.27614 3.72386 5.5 4 5.5L4 4.5ZM5.5 5.5C5.77614 5.5 6 5.27614 6 5C6 4.72386 5.77614 4.5 5.5 4.5L5.5 5.5ZM4 5.5L5.5 5.5L5.5 4.5L4 4.5L4 5.5Z"
        fill={themeColor}
      />
      <rect x="7.5" y="4.5" width="3.0625" height="3.0625" rx="1.53125" stroke={themeColor} />
      <path d="M11.7906 8.79063L10.4375 7.4375" stroke={themeColor} strokeLinecap="round" />
    </svg>
  );
}

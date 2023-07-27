import * as React from 'react';

import { colors, ColorName } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function FilterTableWithFilters({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2.87024 0.5H13.1298C13.9374 0.5 14.4119 1.4079 13.9507 2.07095L9.67902 8.21341C9.56247 8.38099 9.5 8.58023 9.5 8.78436V14.5C9.5 15.0523 9.05228 15.5 8.5 15.5H7.5C6.94772 15.5 6.5 15.0523 6.5 14.5V8.78436C6.5 8.58023 6.43753 8.38099 6.32099 8.21341L2.04925 2.07095C1.58814 1.4079 2.06261 0.5 2.87024 0.5Z"
        stroke={themeColor}
        strokeLinecap="round"
      />
      <circle cx="5" cy="6" r="3" fill={themeColor} stroke="white" />
    </svg>
  );
}

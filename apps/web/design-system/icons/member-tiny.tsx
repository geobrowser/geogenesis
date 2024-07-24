import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function MemberTiny({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="8" height="9" viewBox="0 0 8 9" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="3.99995" cy="1.82295" r="1.32295" stroke={themeColor} />
      <path
        d="M7.53916 7.7068H0.460844C0.501086 5.99886 1.89821 4.6267 3.61582 4.6267H4.38418C6.10179 4.6267 7.49891 5.99886 7.53916 7.7068Z"
        stroke={themeColor}
        strokeWidth="0.919904"
      />
    </svg>
  );
}

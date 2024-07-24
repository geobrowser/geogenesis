import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function MemberTinyFilled({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="8" height="9" viewBox="0 0 8 9" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="3.99995" cy="1.82295" r="1.82295" fill={themeColor} />
      <path
        d="M0 7.78257C0 5.78561 1.61886 4.16675 3.61582 4.16675H4.38418C6.38114 4.16675 8 5.78561 8 7.78257C8 7.99474 7.828 8.16675 7.61582 8.16675H0.384181C0.172004 8.16675 0 7.99474 0 7.78257Z"
        fill={themeColor}
      />
    </svg>
  );
}

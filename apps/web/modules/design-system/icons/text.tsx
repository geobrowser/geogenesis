import * as React from 'react';

import { colors, ColorName } from '~/modules/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Text({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3.51811 4.51818L0 13.3561H1.56526L2.50441 10.9091H6.00761L6.94677 13.3561H8.52694L5.00883 4.51818H3.51811ZM4.24856 6.34621L5.50077 9.61364H2.99635L4.24856 6.34621Z"
        fill={themeColor}
      />
      <path
        d="M11.2446 12.8091C11.5427 13.1689 12.1987 13.5 12.9291 13.5C14.8671 13.5 16 12.003 16 10.1606C16 8.33258 14.8671 6.82121 12.9291 6.82121C12.1987 6.82121 11.5427 7.15227 11.2446 7.51212V4H9.75387V13.3561H11.2446V12.8091ZM11.2446 8.95152C11.498 8.44773 12.0645 8.10227 12.6757 8.10227C13.8235 8.10227 14.5093 8.9803 14.5093 10.1606C14.5093 11.3409 13.8235 12.2189 12.6757 12.2189C12.0645 12.2189 11.498 11.8735 11.2446 11.3697V8.95152Z"
        fill={themeColor}
      />
    </svg>
  );
}

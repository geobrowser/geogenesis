import * as React from 'react';

import { colors, ColorName } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function BulkEdit({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.75 11.0781L10.6924 11.0781" stroke={themeColor} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.75 9.57812L10.6924 9.57812" stroke={themeColor} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.25 8.07812L10.695 8.07812" stroke={themeColor} strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M9.81544 0.789024C10.0005 0.603965 10.2515 0.499999 10.5132 0.499999C10.6428 0.499999 10.7711 0.525524 10.8908 0.575114L11.0822 0.113175L10.8908 0.575115C11.0106 0.624705 11.1193 0.697392 11.211 0.789024C11.3026 0.880656 11.3753 0.989439 11.4249 1.10916C11.4745 1.22889 11.5 1.3572 11.5 1.48679C11.5 1.61638 11.4745 1.7447 11.4249 1.86442C11.3753 1.98414 11.3026 2.09293 11.211 2.18456L2.5479 10.8476L0.687185 11.3128L1.15236 9.4521L9.81544 0.789024Z"
        stroke={themeColor}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

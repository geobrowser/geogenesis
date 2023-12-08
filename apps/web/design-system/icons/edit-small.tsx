import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function EditSmall({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.30789 11.0773L10.2503 11.0773" stroke={themeColor} strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M9.81544 0.788994C10.0005 0.603934 10.2515 0.499969 10.5132 0.499969C10.6428 0.499969 10.7711 0.525493 10.8908 0.575084L11.0822 0.113144L10.8908 0.575084C11.0106 0.624675 11.1193 0.697361 11.211 0.788994C11.3026 0.880625 11.3753 0.989409 11.4249 1.10913C11.4745 1.22885 11.5 1.35717 11.5 1.48676C11.5 1.61635 11.4745 1.74467 11.4249 1.86439C11.3753 1.98411 11.3026 2.0929 11.211 2.18453L2.5479 10.8476L0.687185 11.3128L1.15236 9.45207L9.81544 0.788994Z"
        stroke={themeColor}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

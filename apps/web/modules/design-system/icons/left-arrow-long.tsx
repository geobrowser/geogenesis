import * as React from 'react';

import { colors, ColorName } from '~/modules/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function LeftArrowLong({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M5.34644 12.3536C5.54171 12.5488 5.85829 12.5488 6.05355 12.3536C6.24881 12.1583 6.24881 11.8417 6.05355 11.6464L5.34644 12.3536ZM1.7 8L1.34644 7.64645L0.992891 8L1.34644 8.35355L1.7 8ZM6.05355 4.35355C6.24881 4.15829 6.24881 3.84171 6.05355 3.64645C5.85829 3.45118 5.54171 3.45118 5.34644 3.64645L6.05355 4.35355ZM6.05355 11.6464L2.05355 7.64645L1.34644 8.35355L5.34644 12.3536L6.05355 11.6464ZM2.05355 8.35355L6.05355 4.35355L5.34644 3.64645L1.34644 7.64645L2.05355 8.35355Z"
        fill={themeColor}
      />
      <path d="M16.5 8L2 8" stroke={themeColor} strokeLinecap="round" />
    </svg>
  );
}

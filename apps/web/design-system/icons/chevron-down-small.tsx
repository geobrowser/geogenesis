import * as React from 'react';

import { colors, ColorName } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function ChevronDownSmall({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M0.853553 2.14645C0.658291 1.95118 0.341709 1.95118 0.146447 2.14645C-0.0488155 2.34171 -0.0488155 2.65829 0.146447 2.85355L0.853553 2.14645ZM4 6L3.64645 6.35355L4 6.70711L4.35355 6.35355L4 6ZM7.85355 2.85355C8.04882 2.65829 8.04882 2.34171 7.85355 2.14645C7.65829 1.95118 7.34171 1.95118 7.14645 2.14645L7.85355 2.85355ZM0.146447 2.85355L3.64645 6.35355L4.35355 5.64645L0.853553 2.14645L0.146447 2.85355ZM4.35355 6.35355L7.85355 2.85355L7.14645 2.14645L3.64645 5.64645L4.35355 6.35355Z"
        fill={themeColor}
      />
    </svg>
  );
}

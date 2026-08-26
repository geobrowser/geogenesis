import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
  /** Rendered size. Defaults to the 12px this is drawn at; callers standing beside a larger
   *  control pass its size so the tick lands in the same box the icon it replaces did. */
  size?: number;
}

export function TickSmall({ color, size = 12 }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 6L4.5 9L10.5 3" stroke={themeColor} />
    </svg>
  );
}

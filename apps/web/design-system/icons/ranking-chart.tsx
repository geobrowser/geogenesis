import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

/** Vertical bar chart — used for Add/Edit my ranking actions. */
export function RankingChart({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="1.5" y="8" width="3" height="6" rx="0.5" fill={themeColor} />
      <rect x="6.5" y="3" width="3" height="11" rx="0.5" fill={themeColor} />
      <rect x="11.5" y="6" width="3" height="8" rx="0.5" fill={themeColor} />
    </svg>
  );
}

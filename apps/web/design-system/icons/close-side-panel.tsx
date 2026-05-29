import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

/** Double chevron — used to dismiss the right-hand entity side panel. */
export function CloseSidePanel({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="39.64,90 35.36,85.72 76.08,45 35.36,4.28 39.64,0 84.64,45" fill={themeColor} />
      <polygon points="9.64,90 5.36,85.72 46.08,45 5.36,4.28 9.64,0 54.64,45" fill={themeColor} />
    </svg>
  );
}

import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

/** Globe icon for news-story metrics. */
export function NewsGlobe({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke={themeColor} />
      <ellipse cx="8" cy="8" rx="3" ry="6.5" stroke={themeColor} />
      <path d="M1.5 8H14.5" stroke={themeColor} />
      <path d="M2.5 5H13.5" stroke={themeColor} />
      <path d="M2.5 11H13.5" stroke={themeColor} />
    </svg>
  );
}

import * as React from 'react';

import { colors, ColorName } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Edit({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8.41064 14.7698L13.6672 14.7698" stroke={themeColor} strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M12.9694 0.934181C13.2474 0.656179 13.6245 0.499999 14.0176 0.499999C14.2123 0.499999 14.405 0.538342 14.5849 0.612839C14.7647 0.687336 14.9282 0.796528 15.0658 0.934181C15.2035 1.07183 15.3127 1.23525 15.3872 1.4151C15.4617 1.59495 15.5 1.78772 15.5 1.98239C15.5 2.17706 15.4617 2.36982 15.3872 2.54967C15.3127 2.72953 15.2035 2.89294 15.0658 3.0306L3.4824 14.614L0.687185 15.3128L1.38599 12.5176L12.9694 0.934181Z"
        stroke={themeColor}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Member({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="2.625" r="2.125" stroke={themeColor} />
      <path
        d="M0.5 11.4237C0.5 8.70443 2.70443 6.5 5.42373 6.5H6.57627C9.29557 6.5 11.5 8.70443 11.5 11.4237C11.5 11.4659 11.4659 11.5 11.4237 11.5H0.576271C0.534148 11.5 0.5 11.4659 0.5 11.4237Z"
        stroke={themeColor}
      />
    </svg>
  );
}

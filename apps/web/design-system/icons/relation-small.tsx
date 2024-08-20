import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
  fill?: ColorName;
}

export function RelationSmall({ color, fill }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';
  const fillColor = fill ? colors.light[fill] : 'white';

  return (
    <svg width="12" height="6" viewBox="0 0 12 6" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8.99988" cy="3" r="2" transform="rotate(-180 8.99988 3)" stroke={themeColor} fill={fillColor} />
      <rect x="7.49988" y="3.5" width="2.99993" height="1" transform="rotate(-180 7.49988 3.5)" fill={themeColor} />
      <circle cx="3" cy="3" r="2" transform="rotate(-180 3 3)" stroke={themeColor} fill={fillColor} />
    </svg>
  );
}

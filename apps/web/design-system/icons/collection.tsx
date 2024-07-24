import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Collection({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M0.5 3.00006C0.5 1.61935 1.61929 0.500061 3 0.500061L6 0.500061C6.27614 0.500061 6.5 0.723919 6.5 1.00006L6.5 4.00006C6.5 5.38077 5.38071 6.50006 4 6.50006L1 6.50006C0.723857 6.50006 0.5 6.2762 0.5 6.00006L0.5 3.00006Z"
        stroke={themeColor}
      />
      <path
        d="M15.087 9.50006C15.3151 9.50006 15.5 9.68499 15.5 9.9131C15.5 12.9987 12.9986 15.5001 9.91304 15.5001C9.68493 15.5001 9.5 15.3151 9.5 15.087L9.5 10.7501C9.5 10.0597 10.0596 9.50006 10.75 9.50006L15.087 9.50006Z"
        stroke={themeColor}
      />
      <rect x="9.5" y="0.5" width="6" height="6" rx="3" stroke={themeColor} />
      <path
        d="M2.8615 9.89492C3.12462 9.36844 3.87538 9.36844 4.1385 9.89492L6.42302 14.466C6.6606 14.9414 6.3149 15.5001 5.78453 15.5001L1.21547 15.5001C0.685095 15.5001 0.339395 14.9414 0.576975 14.466L2.8615 9.89492Z"
        stroke={themeColor}
      />
    </svg>
  );
}

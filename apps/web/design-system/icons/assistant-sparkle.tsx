import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

type Props = {
  color?: ColorName;
  size?: number;
};

export function AssistantSparkle({ color, size = 16 }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 1.5C8.3 4.2 9.8 5.7 12.5 6C9.8 6.3 8.3 7.8 8 10.5C7.7 7.8 6.2 6.3 3.5 6C6.2 5.7 7.7 4.2 8 1.5Z"
        fill={themeColor}
      />
      <path
        d="M12.75 9.5C12.9 10.85 13.65 11.6 15 11.75C13.65 11.9 12.9 12.65 12.75 14C12.6 12.65 11.85 11.9 10.5 11.75C11.85 11.6 12.6 10.85 12.75 9.5Z"
        fill={themeColor}
      />
    </svg>
  );
}

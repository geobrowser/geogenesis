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
        d="M6 5C6.65 8 8 9.35 11 10C8 10.65 6.65 12 6 15C5.35 12 4 10.65 1 10C4 9.35 5.35 8 6 5Z"
        fill={themeColor}
      />
      <path
        d="M12 1.25C12.4 2.9 13.1 3.6 14.75 4C13.1 4.4 12.4 5.1 12 6.75C11.6 5.1 10.9 4.4 9.25 4C10.9 3.6 11.6 2.9 12 1.25Z"
        fill={themeColor}
      />
    </svg>
  );
}

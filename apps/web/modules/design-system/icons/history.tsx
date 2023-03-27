import * as React from 'react';

import { colors, ColorName } from '~/modules/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function History({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3.30078 8.25C3.30078 4.79822 6.099 2 9.55078 2C13.0026 2 15.8008 4.79822 15.8008 8.25C15.8008 11.7018 13.0026 14.5 9.55078 14.5C8.11793 14.5 6.79769 14.0178 5.74347 13.2069"
        stroke={themeColor}
      />
      <path d="M1.34961 6.80078L3.34961 8.80078L5.34961 6.80078" stroke={themeColor} />
      <path d="M9.25 5V8.5L11.25 10.5" stroke={themeColor} />
    </svg>
  );
}

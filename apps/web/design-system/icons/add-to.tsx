import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function AddTo({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M11.3999 14.8999L15.3999 10.8999L11.3999 6.8999" stroke={themeColor} strokeLinecap="round" />
      <path d="M0.600098 10.8999L15.1001 10.8999" stroke={themeColor} strokeLinecap="round" />
      <path d="M0.600098 10.8999L0.600098 4" stroke={themeColor} strokeLinecap="round" />
    </svg>
  );
}

import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function QuestionCircle({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6.5" cy="6.5" r="5.5" stroke={themeColor} />
      <path
        d="M5.85661 9.23455C5.85661 9.66719 6.15586 10 6.53491 10C6.91397 10 7.21322 9.66719 7.21322 9.23455C7.21322 8.8019 6.91397 8.4691 6.53491 8.4691C6.15586 8.4691 5.85661 8.8019 5.85661 9.23455ZM8.5 4.97464C8.5 3.76545 7.7818 3 6.55486 3C5.41771 3 4.6197 3.88748 4.5 5.15214H5.57731C5.61721 4.50872 5.93641 4.0206 6.55486 4.0206C7.13342 4.0206 7.48254 4.41997 7.48254 4.98574C7.48254 5.57369 7.03367 5.92868 6.69451 6.35024C6.25561 6.88273 6.11596 7.17116 6.08604 7.7813H7.06359C7.06359 7.54834 7.13342 7.30428 7.48254 6.90491C7.95137 6.37242 8.5 5.80666 8.5 4.97464Z"
        fill={themeColor}
      />
    </svg>
  );
}

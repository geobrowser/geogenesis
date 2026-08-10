import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

type Props = {
  color?: ColorName;
  filled?: boolean;
};

export function ThumbDown({ color, filled = false }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d={BODY_PATH} stroke={themeColor} fill={filled ? themeColor : 'none'} />
      {!filled && <path d={HANDLE_PATH} stroke={themeColor} />}
    </svg>
  );
}

const BODY_PATH =
  'M4.56413 0.75H10.875C11.0821 0.75 11.25 0.917892 11.25 1.125V6.98611C11.25 7.19322 11.0821 7.36111 10.875 7.36111H9.07597C8.38634 7.36111 7.73332 7.67621 7.34366 8.2452C6.92481 8.85679 6.39101 9.69144 5.85759 10.6515C5.65451 11.017 5.24114 11.3093 4.87568 11.1061C3.99835 10.6185 4.51827 8.99463 4.90015 7.8463C4.98009 7.6059 4.80144 7.36111 4.5481 7.36111H2.71693C1.85505 7.36111 1.23154 6.53801 1.46493 5.70833L1.6974 4.88195L1.92987 4.05556L2.3948 2.40278C2.66776 1.43245 3.55614 0.75 4.56413 0.75Z';

const HANDLE_PATH = 'M9.375 7.5V0.75';

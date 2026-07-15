import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

type Props = {
  color?: ColorName;
  filled?: boolean;
};

export function ThumbUp({ color, filled = false }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d={BODY_PATH} stroke={themeColor} fill={filled ? themeColor : 'none'} />
      {!filled && <path d={HANDLE_PATH} stroke={themeColor} />}
    </svg>
  );
}

const BODY_PATH =
  'M7.43587 11.25H1.125C0.917893 11.25 0.75 11.0821 0.75 10.875V5.01389C0.75 4.80678 0.917893 4.63889 1.125 4.63889H2.92403C3.61366 4.63889 4.26668 4.32379 4.65634 3.7548C5.07519 3.14321 5.60899 2.30856 6.14241 1.34851C6.34549 0.983011 6.75886 0.690728 7.12432 0.893874C8.00165 1.38154 7.48173 3.00537 7.09985 4.1537C7.01991 4.3941 7.19856 4.63889 7.4519 4.63889H9.28307C10.1449 4.63889 10.7685 5.46199 10.5351 6.29167L10.3026 7.11805L10.0701 7.94444L9.6052 9.59722C9.33224 10.5675 8.44386 11.25 7.43587 11.25Z';

const HANDLE_PATH = 'M2.625 4.5V11.25';

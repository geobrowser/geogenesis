import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

type Props = {
  color?: ColorName;
  filled?: boolean;
  direction?: 'up' | 'down';
};

const OUTLINE_PATH =
  'M5.13363 1.50391L1.13468 8.50304C0.753789 9.1697 1.23516 9.99913 2.00296 9.99913H10.0009C10.7687 9.99913 11.25 9.16969 10.8691 8.50304L6.87018 1.50391C6.4863 0.83203 5.51752 0.832028 5.13363 1.50391ZM4.26536 1.00783L0.26641 8.00696C-0.495379 9.34027 0.467363 10.9991 2.00296 10.9991H10.0009C11.5364 10.9991 12.4992 9.34027 11.7374 8.00695L7.73845 1.00782C6.97069 -0.335943 5.03312 -0.33594 4.26536 1.00783Z';

const FILLED_PATH =
  'M4.26536 1.00783L0.26641 8.00696C-0.495379 9.34027 0.467363 10.9991 2.00296 10.9991H10.0009C11.5364 10.9991 12.4992 9.34027 11.7374 8.00695L7.73845 1.00782C6.97069 -0.335943 5.03312 -0.33594 4.26536 1.00783Z';

export function VoteArrow({ color, filled = false, direction = 'up' }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';
  const transform = direction === 'down' ? 'scale(1, -1)' : undefined;

  if (filled) {
    return (
      <svg
        width="12"
        height="11"
        viewBox="0 0 12 11"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ transform }}
      >
        <path fillRule="evenodd" clipRule="evenodd" d={FILLED_PATH} fill={themeColor} />
      </svg>
    );
  }

  return (
    <svg
      width="12"
      height="11"
      viewBox="0 0 12 11"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ transform }}
    >
      <path fillRule="evenodd" clipRule="evenodd" d={OUTLINE_PATH} fill={themeColor} className="group-hover:hidden" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d={FILLED_PATH}
        fill={themeColor}
        className="hidden group-hover:block"
      />
    </svg>
  );
}

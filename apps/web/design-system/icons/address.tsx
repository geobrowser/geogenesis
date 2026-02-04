import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
  className?: string;
}

export function Address({ color, className }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 0.5C10.7614 0.5 13 2.73858 13 5.5C13 7.8862 11.9362 10.417 10.7148 12.374C10.1074 13.3474 9.47275 14.1602 8.93555 14.7227C8.66606 15.0048 8.42999 15.2145 8.24219 15.3496C8.14824 15.4172 8.07501 15.4597 8.02344 15.4834C8.01831 15.4858 8.01305 15.4865 8.00879 15.4883C8.00754 15.4876 8.0062 15.487 8.00488 15.4863C7.95471 15.4593 7.88154 15.4097 7.78613 15.3301C7.59584 15.1713 7.35717 14.9272 7.08496 14.6045C6.54269 13.9616 5.90348 13.0519 5.29199 12.0107C4.05557 9.90554 3 7.37832 3 5.5C3 2.73858 5.23858 0.5 8 0.5Z"
        stroke={themeColor}
      />
      <circle cx="8" cy="5.5" r="2.5" fill="white" stroke={themeColor} />
    </svg>
  );
}

import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
  className?: string;
}

/**
 * A page of a calendar: the binding rings, the header rule, and a few days marked on the grid.
 *
 * Drawn on the half-pixel so the 1px strokes land on whole device pixels, like the rest of the set.
 * For a clock face — a countdown, a duration — use `Time` instead; this is for "when you're free".
 */
export function Calendar({ color, className }: Props) {
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
      <rect x="1.5" y="2.5" width="13" height="12" rx="2.5" stroke={themeColor} />
      <path d="M1.5 6.5H14.5" stroke={themeColor} />
      <path d="M5 1V4" stroke={themeColor} strokeLinecap="round" />
      <path d="M11 1V4" stroke={themeColor} strokeLinecap="round" />
      <rect x="4" y="8" width="2" height="2" rx="0.5" fill={themeColor} />
      <rect x="7" y="8" width="2" height="2" rx="0.5" fill={themeColor} />
      <rect x="10" y="8" width="2" height="2" rx="0.5" fill={themeColor} />
      <rect x="4" y="11" width="2" height="2" rx="0.5" fill={themeColor} />
      <rect x="7" y="11" width="2" height="2" rx="0.5" fill={themeColor} />
    </svg>
  );
}

import * as React from 'react';

import { type ColorName, colors } from '~/design-system/theme/colors';

type Props = {
  color?: ColorName;
};

function resolve(color?: ColorName) {
  return color ? colors.light[color] : 'currentColor';
}

export function Crown({ color }: Props) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 4.5L4.5 7L8 2.5L11.5 7L14 4.5V12.5C14 12.7761 13.7761 13 13.5 13H2.5C2.22386 13 2 12.7761 2 12.5V4.5Z"
        fill={resolve(color)}
      />
    </svg>
  );
}

export function Comment({ color }: Props) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 3.5C2 2.94772 2.44772 2.5 3 2.5H13C13.5523 2.5 14 2.94772 14 3.5V10.5C14 11.0523 13.5523 11.5 13 11.5H6.5L3.5 14V11.5H3C2.44772 11.5 2 11.0523 2 10.5V3.5Z"
        stroke={resolve(color)}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Share({ color }: Props) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 2.5V10M8 2.5L5.25 5.25M8 2.5L10.75 5.25M3 9V12.5C3 13.0523 3.44772 13.5 4 13.5H12C12.5523 13.5 13 13.0523 13 12.5V9"
        stroke={resolve(color)}
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Pause({ color }: Props) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4.5" y="3" width="3" height="12" rx="1" fill={resolve(color)} />
      <rect x="10.5" y="3" width="3" height="12" rx="1" fill={resolve(color)} />
    </svg>
  );
}

export function SpeakerMuted({ color }: Props) {
  const themeColor = resolve(color);
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 6V10H4.5L8 12.5V3.5L4.5 6H2Z"
        fill={themeColor}
        stroke={themeColor}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M11 6.5L14 9.5M14 6.5L11 9.5" stroke={themeColor} strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

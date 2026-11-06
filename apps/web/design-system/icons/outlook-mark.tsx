import * as React from 'react';

/** Outlook's mark, simplified: an "O" on its blue tile. Beside `GoogleMark` on calendar chips. */
export function OutlookMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect width="16" height="16" rx="3" fill="#0A64C9" />
      <ellipse cx="8" cy="8" rx="3.4" ry="4" fill="none" stroke="#fff" strokeWidth="1.8" />
    </svg>
  );
}

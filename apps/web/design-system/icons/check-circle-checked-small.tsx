import * as React from 'react';


// Takes no `color`: unlike its siblings this icon hardcodes its stroke, so a `color` prop would
// have been accepted and ignored. No caller passed one.
export function CheckedCircleCheckedSmall() {

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="6" r="6" fill="#2A2B2E" />
      <path d="M2.625 6L4.875 8.25L9.375 3.75" stroke="white" />
    </svg>
  );
}

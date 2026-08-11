import * as React from 'react';

/**
 * Compact info-circle icon for explore feed claims counts. Matches the Figma "Warning-circle"
 * flipped vertically (exclamation mark upside down = "i"): a hairline 12px circle with a 1px dot
 * over a 1px stem.
 */
export function ExploreClaimsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="6" cy="6" r="5.5" stroke="currentColor" />
      <rect x="5.5" y="2.75" width="1" height="1" rx="0.5" fill="currentColor" />
      <rect x="5.5" y="4.75" width="1" height="4.5" rx="0.5" fill="currentColor" />
    </svg>
  );
}

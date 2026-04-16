import * as React from 'react';

/** Compact speech-bubble icon for explore feed comment counts. */
export function ExploreCommentsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M3 3.25C3 2.83579 3.33579 2.5 3.75 2.5H12.25C12.6642 2.5 13 2.83579 13 3.25V9.25C13 9.66421 12.6642 10 12.25 10H6.2L4.2 12.25C3.9 12.58 3.25 12.37 3.25 11.92V10H3.75C3.33579 10 3 9.66421 3 9.25V3.25Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

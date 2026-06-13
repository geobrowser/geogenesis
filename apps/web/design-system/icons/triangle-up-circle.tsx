import * as React from 'react';

export function TriangleUpCircle() {
  return (
    <span className="flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-full bg-purple">
      <svg width="9" height="7" viewBox="0 0 6 5" fill="none" aria-hidden>
        <path
          d="M3 0.5L5.5 4.5H0.5L3 0.5Z"
          fill="transparent"
          stroke="white"
          strokeWidth="0.85"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

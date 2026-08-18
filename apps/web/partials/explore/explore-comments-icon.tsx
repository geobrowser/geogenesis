import * as React from 'react';

/** Compact speech-bubble icon for explore feed comment counts. */
export function ExploreCommentsIcon({ className }: { className?: string }) {
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
      {/* The glyph spans only y 0–10.4 of the 12px viewBox, so nudge it down to
          visually center it alongside icons that fill their box (info circle, share). */}
      <path
        d="M2.28906 0.5H9.71094C10.6988 0.5 11.5 1.30117 11.5 2.28906V6.05566C11.5 7.04356 10.6988 7.84473 9.71094 7.84473H8.5V9.88965L6.43945 8.06641L6.31055 7.97168C6.17402 7.88934 6.0169 7.84473 5.85547 7.84473H2.28906C1.30117 7.84473 0.5 7.04356 0.5 6.05566V2.28906C0.5 1.30117 1.30117 0.5 2.28906 0.5Z"
        stroke="currentColor"
        transform="translate(0 0.8)"
      />
    </svg>
  );
}

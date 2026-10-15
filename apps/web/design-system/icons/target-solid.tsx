import * as React from 'react';

/**
 * A solid target: a point that landed. The claim counter's icon (GEO-3317), solid where `Target` is
 * outlined, so it holds up at chip size. Sized in `em` to sit beside the count it belongs to; see
 * `ClaimCount` for its alignment.
 */
export function TargetSolid() {
  return (
    <svg width="1.05em" height="1.05em" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M8 1.3a6.7 6.7 0 1 0 0 13.4A6.7 6.7 0 0 0 8 1.3Zm0 2.3a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8Z"
      />
      <circle cx="8" cy="8" r="2.3" />
    </svg>
  );
}

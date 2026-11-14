import * as React from 'react';

/**
 * The up-right arrow beside a Trending claim.
 *
 * Sized like the Controversial flame (10px tall) so the two tags sit on one line at the same
 * height. Stroked in `currentColor`, so the tag's text colour carries it.
 *
 * `aria-hidden`: the word "Trending" beside it says the same thing.
 */
export function TrendingArrow() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M3 1.5H8.5V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.25 1.75L1.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

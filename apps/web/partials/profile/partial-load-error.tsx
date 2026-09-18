'use client';

import * as React from 'react';

import { SmallButton } from '~/design-system/button';

/**
 * A page that failed, after the pages that did not (GEO-2859).
 *
 * The record tabs stop their sentinel on `isError`, because the 8000px margin
 * keeps it permanently in view and one failing page otherwise becomes a loop
 * that asks forever and never grows the list. Stopping was right; stopping
 * *silently* was not — a 208-claim record that failed on page two looked like a
 * 20-claim record, complete, with nothing to press.
 *
 * So: keep the rows that arrived, say the rest did not, and offer the retry the
 * sentinel can no longer perform. `fetchNextPage` retries the failed page, and
 * a success clears `isError` and hands the sentinel back its job.
 *
 * Shared because the same hole existed on Positions and on Proposals, in two
 * different render paths, and a second copy of this wording would drift from
 * the first.
 */
export function PartialLoadError({ noun, onRetry }: { noun: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-4">
      <p className="text-metadata text-grey-04">Couldn’t load more {noun}.</p>
      <SmallButton onClick={onRetry}>Try again</SmallButton>
    </div>
  );
}

'use client';

import * as React from 'react';

import { SmallButton } from '~/design-system/button';

/** Shared record error presentation for both initial and later-page retries. */
export function RecordLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-4">
      <p className="text-metadata text-grey-04">{message}</p>
      <SmallButton onClick={onRetry}>Try again</SmallButton>
    </div>
  );
}

/**
 * A page that failed after earlier pages succeeded (GEO-2859).
 *
 * Sentinels stop on errors to avoid an automatic retry loop. Keep the rows that arrived, say the
 * rest did not, and offer the same explicit retry used by initial record failures.
 */
export function PartialLoadError({ noun, onRetry }: { noun: string; onRetry: () => void }) {
  return <RecordLoadError message={`Couldn’t load more ${noun}.`} onRetry={onRetry} />;
}

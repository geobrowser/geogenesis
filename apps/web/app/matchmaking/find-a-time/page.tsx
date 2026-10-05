import * as React from 'react';

import type { Metadata } from 'next';

import { FindATime } from '~/core/debates/matchmaking/find-a-time';
import { FindATimeWeekSkeleton } from '~/core/debates/matchmaking/find-a-time-week';

/** Everyone's debate availability this week and next (GEO-3152), opened from the debates panel. */
export const metadata: Metadata = {
  title: 'Find a time to debate',
  description: "See who's free to debate this week and book a time.",
};

export default function FindATimeRoutePage() {
  // `FindATime` reads its return path from the query string.
  return (
    <React.Suspense
      fallback={
        <div className="px-6 py-6">
          <FindATimeWeekSkeleton />
        </div>
      }
    >
      <FindATime />
    </React.Suspense>
  );
}

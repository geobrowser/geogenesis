import * as React from 'react';

import type { Metadata } from 'next';

import { DebateCalendar } from '~/core/debates/matchmaking/debate-calendar';
import { CalendarWeekSkeleton } from '~/core/debates/matchmaking/debate-calendar-week';

/** Everyone's debate availability this week and next (GEO-3152), opened from the debates panel. */
export const metadata: Metadata = {
  title: 'Debate calendar',
  description: "See who's free to debate this week and book a time.",
};

export default function CalendarRoutePage() {
  // `DebateCalendar` reads its return path from the query string.
  return (
    <React.Suspense
      fallback={
        <div className="px-6 py-6">
          <CalendarWeekSkeleton />
        </div>
      }
    >
      <DebateCalendar />
    </React.Suspense>
  );
}

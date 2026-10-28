import * as React from 'react';

import type { Metadata } from 'next';

import { Geist } from 'next/font/google';

import { DebateHoursPage } from '~/core/debates/lobbies/debate-hours-page';

/**
 * The marketing site's face, for this page only (GEO-3517): visitors arrive from the home page's
 * "Join debate hours", and the page continues its look. The app keeps Calibre everywhere else.
 */
const geist = Geist({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Debate hours',
  description: 'Join a live, drop-in debate on a topic you care about. RSVP and we’ll send you a calendar invite.',
};

export default function DebateHoursRoutePage() {
  // Suspense because signing in from the page reads the URL to come back to it.
  return (
    <React.Suspense fallback={null}>
      <DebateHoursPage className={geist.className} />
    </React.Suspense>
  );
}

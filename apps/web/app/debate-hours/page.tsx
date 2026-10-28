import * as React from 'react';

import type { Metadata } from 'next';

import localFont from 'next/font/local';

import { DebateHoursPage } from '~/core/debates/lobbies/debate-hours-page';

/**
 * The marketing site's face, for this page only (GEO-3517): visitors arrive from the home page's
 * "Join debate hours", and the page continues its look. The app keeps Calibre everywhere else.
 * Self-hosted like the root layout's Geist; the variable latin cut covers the 400 to 600 the page sets.
 */
const geist = localFont({
  src: '../fonts/Geist-Variable-latin.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
});

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

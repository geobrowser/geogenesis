import * as React from 'react';

import type { Metadata } from 'next';

import { UnsubscribePage } from '~/partials/notifications/unsubscribe-page';

export const metadata: Metadata = {
  title: 'Unsubscribe',
  // Every link carries a person's token: nothing here belongs in a search index.
  robots: { index: false, follow: false },
};

/** An email's Unsubscribe link (GEO-3392). `useSearchParams` reads the token, hence the boundary. */
export default function Page() {
  return (
    <React.Suspense fallback={null}>
      <UnsubscribePage />
    </React.Suspense>
  );
}

import type * as React from 'react';

import { Text } from '~/design-system/text';

/**
 * A labelled group in the requests list — "Upcoming debates", "Scheduled", "Sent", "Received". One
 * definition, so the headings stacked in the rail read as one kind of thing.
 */
export function RequestSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <Text as="h3" variant="footnote" color="grey-04">
        {label}
      </Text>
      {children}
    </section>
  );
}

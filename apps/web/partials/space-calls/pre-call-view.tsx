'use client';

import * as React from 'react';

import Link from 'next/link';

import { callDateLabel, callTimeLabel } from '~/core/space-calls/series/format';

import { Text } from '~/design-system/text';

/**
 * A scheduled call's page before it opens (GEO-3420): when, in the viewer's zone, which series,
 * and the agenda and Remind me passed in. The same route becomes the call room when it opens.
 */
export function PreCallView({
  name,
  seriesName,
  startsAt,
  endsAt,
  exitHref,
  spaceName,
  opensLabel,
  remind,
  agenda,
}: {
  name: string;
  seriesName: string | null;
  startsAt: string;
  endsAt: string | null;
  exitHref: string;
  spaceName?: string | null;
  /** "Opens at 9:50 AM · in 2 days". */
  opensLabel: string;
  remind: React.ReactNode;
  agenda: React.ReactNode;
}) {
  const date = callDateLabel(startsAt);
  const time = callTimeLabel(startsAt, endsAt);
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-4 py-8" data-testid="pre-call-view">
      <Link href={exitHref} className="text-metadata text-grey-04 hover:text-text">
        ← {spaceName ? `Back to ${spaceName}` : 'Back to space'}
      </Link>
      <header className="flex flex-col gap-3">
        {seriesName && seriesName !== name ? (
          <Text as="p" variant="metadataMedium" color="grey-04">
            {seriesName}
          </Text>
        ) : null}
        <Text as="h1" variant="mainPage">
          {name}
        </Text>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Text as="p" variant="body" data-testid="pre-call-when">
            {date ? <time dateTime={startsAt}>{[date, time].filter(Boolean).join(' · ')}</time> : null}
          </Text>
          {remind}
        </div>
        <Text as="p" variant="footnote" color="grey-04">
          {opensLabel}
        </Text>
      </header>
      {agenda}
    </div>
  );
}

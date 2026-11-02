'use client';

import * as React from 'react';

import Link from 'next/link';

import { LobbyAvatarStack } from '~/core/debates/lobbies/lobby-people';
import { hubPillClassName } from '~/core/debates/matchmaking/hub-pill-button';
import { spaceCallPath } from '~/core/space-calls/routes';
import type { CallListItem } from '~/core/space-calls/series/call-list';
import { callDateLabel, callTimeLabel } from '~/core/space-calls/series/format';

import { Text } from '~/design-system/text';

/** One section of the Calls tab: a heading, its rows, or what to say when it has none. */
export function CallsSection({
  title,
  empty,
  children,
  count,
  testId,
}: {
  title: string;
  empty: string | null;
  count: number;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3" data-testid={testId}>
      <Text as="h2" variant="smallTitle">
        {title}
      </Text>
      {count === 0 && empty ? (
        <Text as="p" variant="metadata" color="grey-04">
          {empty}
        </Text>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
    </section>
  );
}

/**
 * A call on the Calls tab: its time in the viewer's zone, name and series, and either Join (live)
 * or the row's own action, such as Remind me.
 */
export function CallRow({ spaceId, call, action }: { spaceId: string; call: CallListItem; action?: React.ReactNode }) {
  const href = spaceCallPath(spaceId, call.callId);
  const live = call.status === 'live';
  const date = live ? 'Live now' : callDateLabel(call.startsAt);
  const time = live ? null : callTimeLabel(call.startsAt, call.endsAt);
  const subtitle = call.seriesName && call.seriesName !== call.name ? call.seriesName : null;

  return (
    <li
      className="flex items-center gap-3 rounded-lg border border-grey-02 bg-white p-3"
      data-testid={live ? 'calls-tab-live-row' : 'calls-tab-upcoming-row'}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Text
          as="span"
          variant="footnoteMedium"
          color={live ? 'red-01' : 'grey-04'}
          className="flex items-center gap-1.5"
        >
          {live ? <span aria-hidden className="size-2 animate-pulse rounded-full bg-red-01" /> : null}
          {[date, time].filter(Boolean).join(' · ')}
        </Text>
        <Link href={href} className="min-w-0 hover:underline">
          <Text as="span" variant="metadataMedium" className="block truncate">
            {call.name}
          </Text>
        </Link>
        {subtitle ? (
          <Text as="span" variant="footnote" color="grey-04" className="truncate">
            {subtitle}
          </Text>
        ) : null}
      </div>
      {live ? (
        <div className="flex shrink-0 items-center gap-2">
          <LobbyAvatarStack people={call.avatars} total={call.headcount} />
          <Link href={href} className={hubPillClassName('primary')} data-geo-analytics-label="Calls tab join">
            Join
          </Link>
        </div>
      ) : (
        action
      )}
    </li>
  );
}

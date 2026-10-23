'use client';

import * as React from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { GeoChatRequestError } from '~/core/debates/api';
import { lobbyErrorMessage } from '~/core/debates/lobbies/lobby-format';
import { HubPillButton, hubPillClassName } from '~/core/debates/matchmaking/hub-pill-button';
import { useFeatureFlag } from '~/core/state/feature-flags';

import { Text } from '~/design-system/text';

import { useSpaceCalls, useStartSpaceCall } from './hooks';
import { spaceCallPath } from './routes';

export const SPACE_CALL_ENTRY_COPY = {
  start: 'Start call',
  starting: 'Starting…',
  live: (count: number) => (count > 0 ? `Live call · ${count}` : 'Live call'),
  join: (name: string) => `Join ${name}`,
  startFailed: 'Could not start a call. Try again.',
} as const;

/**
 * The space page's way into its calls (GEO-3419): the live call to join, or Start call for an
 * editor. A thin mount beside the space name; GEO-3420's Calls tab is where calls are listed.
 */
export function SpaceCallEntry({ spaceId }: { spaceId: string }) {
  const enabled = useFeatureFlag('spaceCalls');
  if (!enabled) return null;
  return <SpaceCallEntryInner spaceId={spaceId} />;
}

function SpaceCallEntryInner({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const callsQuery = useSpaceCalls(spaceId);
  const start = useStartSpaceCall(spaceId);
  const data = callsQuery.data;
  const live = data?.calls[0] ?? null;

  const onStart = () =>
    start.mutate(undefined, {
      onSuccess: view => router.push(spaceCallPath(spaceId, view.lobby_id)),
      onError: error => {
        // Someone else started one first: join theirs.
        const callId = alreadyLiveCallId(error);
        if (callId) router.push(spaceCallPath(spaceId, callId));
      },
    });

  if (!data?.supported) return null;

  if (live) {
    return (
      <Link
        href={spaceCallPath(spaceId, live.call_id)}
        aria-label={SPACE_CALL_ENTRY_COPY.join(live.name)}
        data-geo-analytics-label="Space call join"
        className={hubPillClassName('secondary', 'gap-1.5')}
        data-testid="space-call-live"
      >
        <span aria-hidden className="size-2 rounded-full bg-green" />
        {SPACE_CALL_ENTRY_COPY.live(live.headcount)}
      </Link>
    );
  }

  if (!data.viewer_can_start) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <HubPillButton
        variant="primary"
        analyticsLabel="Space call start"
        pending={start.isPending}
        pendingLabel={SPACE_CALL_ENTRY_COPY.starting}
        onClick={onStart}
      >
        {SPACE_CALL_ENTRY_COPY.start}
      </HubPillButton>
      {start.isError && !alreadyLiveCallId(start.error) ? (
        <Text as="p" variant="footnote" color="red-01">
          {lobbyErrorMessage(start.error, SPACE_CALL_ENTRY_COPY.startFailed)}
        </Text>
      ) : null}
    </div>
  );
}

/** `409 call_already_live` names the call to join instead. */
export function alreadyLiveCallId(error: unknown): string | null {
  if (!(error instanceof GeoChatRequestError) || error.code !== 'call_already_live') return null;
  const id = error.details?.call_id;
  return typeof id === 'string' && id ? id : null;
}

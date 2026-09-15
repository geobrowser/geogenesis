'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { getLiveParticipants } from './api';
import type { CallPresence } from './presence';

/** Matches `ParticipantAvatarStrip` — the two share a cache entry, so they poll once between them. */
const POLL_MS = 15_000;

/**
 * Who is in a call's room right now, for deciding whether it is actually live.
 *
 * Keyed identically to `ParticipantAvatarStrip` on purpose: React Query then serves both from one
 * entry rather than running two timers against the same endpoint on a page that shows both.
 *
 * `enabled` is the caller's window check — see `shouldAskPresence`. Without it this would poll a
 * call from months ago every fifteen seconds for as long as the page stayed open.
 */
export function useCallPresence({
  spaceId,
  callId,
  occurrenceStart,
  enabled,
}: {
  spaceId: string;
  callId: string | null;
  occurrenceStart: number | null;
  enabled: boolean;
}): CallPresence | null {
  const active = enabled && callId !== null && occurrenceStart !== null;

  const { data } = useQuery({
    queryKey: ['community-call-live-participants', spaceId, callId, occurrenceStart],
    enabled: active,
    refetchInterval: POLL_MS,
    // No retries. This endpoint can legitimately fail — an occurrence curator-backend has no room
    // for, or a backend that is simply down — and the page already treats "no answer" as "trust the
    // clock". Retrying would triple the requests for an answer the page does not need, and the
    // poll above is a better next attempt than an immediate one.
    retry: false,
    queryFn: () =>
      getLiveParticipants({ spaceId, callId: callId as string, occurrenceStart: occurrenceStart as number }),
  });

  return React.useMemo(() => {
    if (!active || !data) return null;
    return {
      // Editors and members only, as the avatar strip has it: a room can hold people the space has
      // no record of, and naming them on a public page is a different claim than "the team is here".
      names: data.participants.filter(p => p.isEditor || p.isMember).map(p => p.name ?? ''),
      isEnded: data.isEnded,
    };
  }, [active, data]);
}

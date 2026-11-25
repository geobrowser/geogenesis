'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { ID } from '~/core/id';

import type { DebateParticipantsPair } from '~/app/api/debates/participants/route';

/**
 * Batch-fetches real speaker names, profile avatars, and Agree/Disagree stances for a list of
 * debates via `/api/debates/participants`.
 */
export function useDebateParticipantsBatch(debateIds: readonly string[]) {
  const normalizedIds = React.useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of debateIds) {
      if (!id) continue;
      const hex = ID.uuidToHex(id).toLowerCase();
      if (seen.has(hex)) continue;
      seen.add(hex);
      out.push(hex);
    }
    return out.slice(0, 16);
  }, [debateIds]);

  const queryKeyId = normalizedIds.join(',');

  return useQuery({
    queryKey: ['template-debate-participants', queryKeyId],
    enabled: normalizedIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, DebateParticipantsPair>> => {
      const res = await fetch(`/api/debates/participants?ids=${encodeURIComponent(queryKeyId)}`);
      if (!res.ok) return {};
      const data = (await res.json()) as { participantsByDebateId?: Record<string, DebateParticipantsPair> };
      return data.participantsByDebateId ?? {};
    },
  });
}

/**
 * Picks a direct HTTPS poster URL if the feed already pre-resolved one (e.g. a presigned R2 URL),
 * otherwise falls back to our server-side `/api/debates/still/<debateId>/<1|2>` redirect route so
 * relative `/api/geo-chat/...` paths never 404 in local dev.
 */
export function resolveDebateStillSrc(posterUrl: string | null | undefined, normDebateId: string, slot: 1 | 2): string {
  const trimmed = posterUrl?.trim();
  if (trimmed && trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `/api/debates/still/${normDebateId}/${slot}`;
}

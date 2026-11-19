'use client';

import { useQuery } from '@tanstack/react-query';

import { getDebateExtractedClaims } from '../api';
import { getGeoChatApiBaseUrl } from '../geo-chat-public-base-url';
import {
  type DebateMoment,
  type DebateMomentsPayload,
  type SlotNames,
  decodeDebateMoments,
  decodeSlotNames,
} from './debate-moments';

/** Its own key, apart from `debateQueryKeys.extractedClaims`: that one caches the raw, polled payload. */
export const debateMomentsQueryKey = (debateId: string) =>
  ['debates', 'moments-player', debateId.replace(/-/g, '').toLowerCase()] as const;

export type DebateMomentsState =
  /** Still reading. The player shows its loading card and plays nothing yet. */
  | { status: 'loading'; moments: []; slotNames: SlotNames }
  /** Read. `moments` is empty for a debate with no reel, which then opens in the full debate. */
  | { status: 'ready'; moments: DebateMoment[]; slotNames: SlotNames }
  /** The read failed. Treated like no reel: the full debate still plays. */
  | { status: 'error'; moments: []; slotNames: SlotNames };

const NONE: [] = [];
const NO_NAMES: SlotNames = {};

/**
 * A debate's moments (GEO-3687), read from geo-chat's `GET /debates/{id}/claims`, the source the
 * debates app plays its reels from.
 *
 * Public and read unsigned, so every viewer shares one cache entry per debate. Read once and not
 * polled: the ranking compare view shows finished debates, whose reel does not change under the
 * viewer (a re-cut gives new clip URLs, picked up on the next visit). Not retried: a failed read
 * falls back to the full debate, which is a fine way to compare.
 */
export function useDebateMoments(debateId: string, { enabled = true }: { enabled?: boolean } = {}): DebateMomentsState {
  const query = useQuery({
    queryKey: debateMomentsQueryKey(debateId),
    queryFn: async ({ signal }) => {
      const payload = await getDebateExtractedClaims(debateId, undefined, null, signal);
      return {
        moments: decodeDebateMoments(payload as DebateMomentsPayload, getGeoChatApiBaseUrl()),
        slotNames: decodeSlotNames(payload as DebateMomentsPayload),
      };
    },
    enabled: enabled && Boolean(debateId),
    staleTime: Infinity,
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  if (query.isError) return { status: 'error', moments: NONE, slotNames: NO_NAMES };
  if (query.data) return { status: 'ready', moments: query.data.moments, slotNames: query.data.slotNames };
  return { status: 'loading', moments: NONE, slotNames: NO_NAMES };
}

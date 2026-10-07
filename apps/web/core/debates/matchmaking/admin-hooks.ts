'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { normId } from '~/core/utils/norm-id';

import {
  ADMIN_DEBATE_SCHEDULES_PAGE,
  type AdminScheduledDebater,
  adminScheduleOverlaps,
  createAdminScheduledDebate,
  listAdminDebateSchedules,
  sendAdminAvailabilityPrompt,
} from '../api';
import { debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';

/**
 * Where the list stops paging. Far past today's debater count; past it, the dialog still finds
 * anyone by name through Geo search, and only their availability is unknown.
 */
const MAX_ADMIN_DEBATERS = 1000;

/** How far ahead New match offers times, matching the calendar's two weeks. */
export const ADMIN_MATCH_DAYS = 14;

const adminKeys = {
  debaters: (accountKey: string | null) => ['debates', 'admin-debaters', accountKey] as const,
  overlap: (accountKey: string | null, of: string, other: string) =>
    ['debates', 'admin-overlap', of, other, accountKey] as const,
  /** The calendar's list, whatever week it was read from. */
  scheduledRoot: ['debates', 'admin-scheduled-debates'] as const,
};

/**
 * Everyone who has saved availability, and each one's zone (GEO-2942). The set New match may pick
 * from, and where the calendar's cards get a debater's local time.
 */
export function useAdminDebaters(enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  const query = useQuery({
    ...debateQueryNetworkOptions,
    queryKey: adminKeys.debaters(accountKey),
    queryFn: async ({ signal }) => {
      const debaters: AdminScheduledDebater[] = [];
      for (let offset = 0; offset < MAX_ADMIN_DEBATERS; offset += ADMIN_DEBATE_SCHEDULES_PAGE) {
        const page = await listAdminDebateSchedules(
          { limit: ADMIN_DEBATE_SCHEDULES_PAGE, offset },
          getPrivyIdentityToken,
          accountKey,
          signal
        );
        debaters.push(...page.debaters);
        if (page.debaters.length < ADMIN_DEBATE_SCHEDULES_PAGE || debaters.length >= page.total) break;
      }
      return debaters;
    },
    enabled: enabled && authenticated,
    staleTime: 60_000,
  });

  const timezoneByUser = React.useMemo(() => {
    const byUser = new Map<string, string>();
    for (const debater of query.data ?? []) {
      if (debater.timezone) byUser.set(normId(debater.user_id), debater.timezone);
    }
    return byUser;
  }, [query.data]);

  return { ...query, timezoneByUser };
}

/** The half-hours two debaters share over the next two weeks, measured from the first. */
export function useAdminPairOverlap(firstUserId: string | null, secondUserId: string | null) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: adminKeys.overlap(accountKey, firstUserId ?? '', secondUserId ?? ''),
    queryFn: ({ signal }) =>
      adminScheduleOverlaps(
        { of: firstUserId!, users: [secondUserId!], days: ADMIN_MATCH_DAYS },
        getPrivyIdentityToken,
        accountKey,
        signal
      ),
    enabled: authenticated && Boolean(firstUserId && secondUserId),
  });
}

export function useCreateAdminMatch() {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ firstUserId, secondUserId, start }: { firstUserId: string; secondUserId: string; start: Date }) =>
      createAdminScheduledDebate(
        {
          first_user_id: firstUserId,
          second_user_id: secondUserId,
          scheduled_start_at: start.toISOString(),
          scheduled_end_at: new Date(start.getTime() + 30 * 60_000).toISOString(),
        },
        getPrivyIdentityToken,
        accountKey
      ),
    // The calendar draws the new match from its own list, so it has to read it again.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.scheduledRoot }),
  });
}

/** Emails someone asking them to set availability. `sent: false` means no email on file. */
export function useAdminAvailabilityPrompt() {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  return useMutation({
    mutationFn: (userId: string) => sendAdminAvailabilityPrompt(userId, getPrivyIdentityToken, accountKey),
  });
}

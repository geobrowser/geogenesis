'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchProfileFacts, profileFactsQueryKey } from '~/core/io/subgraph/fetch-profile-facts';
import { NO_FACTS } from '~/core/profile/profile-facts';

type Params = {
  /** The personal space. Every count keys on this, not on the person entity. */
  spaceId: string;
  /** The person entity, for the join date alone. Null on a space with no profile. */
  personEntityId: string | null;
  enabled?: boolean;
};

/**
 * The facts the profile rail states (GEO-2859).
 *
 * Held for a minute: none of it changes on any action taken from this page, and
 * the counts are seven aggregate queries the reader should not wait for twice.
 */
export function useProfileFacts({ spaceId, personEntityId, enabled = true }: Params) {
  const { data, isLoading } = useQuery({
    queryKey: profileFactsQueryKey(spaceId, personEntityId),
    enabled: enabled && spaceId !== '',
    queryFn: () => fetchProfileFacts(spaceId, personEntityId),
    staleTime: 60_000,
  });

  return { facts: data ?? NO_FACTS, isLoading };
}

'use client';

import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { useCallback } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Where closing a proposal goes back to.
 *
 * A proposal lives in one space but is reached from several places, and the
 * space it lives in is routinely not where the reader was. Governance's own
 * list is the default; `from` names the surfaces that are somewhere else.
 *
 * `from=profile` carries `returnSpaceId`, the personal space whose Proposals tab
 * the reader came from (GEO-2859) — a person's proposals span every space they
 * proposed into, so without this, closing one drops them in the governance tab
 * of a space they have never opened.
 */
/**
 * The governance tab's own filters, which survive closing a proposal.
 *
 * Everything else in the search belongs to how the reader *got* here and has no
 * meaning on the list they are going back to.
 */
/*
 * `proposalType` is the legacy spelling of `proposalCategory` and is still read:
 * `parseGovernanceCategory` takes it as the fallback when the current param is
 * absent, so an old link's filter is honoured on arrival and would have been
 * dropped on the way back out.
 */
const GOVERNANCE_FILTER_PARAMS = ['proposalCategory', 'proposalType', 'proposalStatus'] as const;

export function useCloseProposal(spaceId: string) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return useCallback(() => {
    const from = searchParams?.get('from');

    if (from === 'home') {
      const returnSearch = searchParams?.get('returnSearch');
      router.push(returnSearch && returnSearch.length > 0 ? `/home?${returnSearch}` : '/home');
      return;
    }

    if (from === 'profile') {
      // Validated rather than interpolated: this reaches the router from the
      // URL bar, and an id that is not an id has no business being pasted into
      // a path. An invalid one falls through to this space's own governance
      // tab, which is where the reader would have gone anyway.
      const returnSpaceId = searchParams?.get('returnSpaceId');
      if (returnSpaceId && IdUtils.isValid(returnSpaceId)) {
        router.push(`/space/${returnSpaceId}/proposals`);
        return;
      }
    }

    // Everything else lands on governance, carrying only the tab's own filters.
    // An allowlist keeps navigation-only parameters from leaking back into the
    // list URL, including a rejected `returnSpaceId`.
    const params = new URLSearchParams();
    for (const name of GOVERNANCE_FILTER_PARAMS) {
      const value = searchParams?.get(name);
      if (value) params.set(name, value);
    }

    const search = params.toString();
    router.push(search ? `/space/${spaceId}/governance?${search}` : `/space/${spaceId}/governance`);
  }, [router, spaceId, searchParams]);
}

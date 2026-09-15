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

    const params = new URLSearchParams(searchParams?.toString());
    params.delete('proposalId');
    const search = params.toString();
    router.push(search ? `/space/${spaceId}/governance?${search}` : `/space/${spaceId}/governance`);
  }, [router, spaceId, searchParams]);
}

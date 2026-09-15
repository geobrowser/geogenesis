'use client';

import { useCallback } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

export function useCloseProposal(spaceId: string) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return useCallback(() => {
    if (searchParams?.get('from') === 'home') {
      const returnSearch = searchParams.get('returnSearch');
      router.push(returnSearch && returnSearch.length > 0 ? `/home?${returnSearch}` : '/home');
    } else {
      const params = new URLSearchParams(searchParams?.toString());
      params.delete('proposalId');
      const search = params.toString();
      router.push(search ? `/space/${spaceId}/governance?${search}` : `/space/${spaceId}/governance`);
    }
  }, [router, spaceId, searchParams]);
}

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export function useCloseProposal(spaceId: string) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return useCallback(() => {
    if (searchParams?.get('from') === 'home') {
      router.push('/home');
    } else {
      router.push(`/space/${spaceId}/governance`);
    }
  }, [router, spaceId, searchParams]);
}

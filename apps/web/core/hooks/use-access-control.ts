'use client';

import { useQuery } from '@tanstack/react-query';

import { useAccount } from 'wagmi';

import { Subgraph } from '../io';
import { useHydrated } from './use-hydrated';

export function useAccessControl(spaceId?: string | null) {
  // We need to wait for the client to check the status of the client-side wallet
  // before setting state. Otherwise there will be client-server hydration mismatches.
  const hydrated = useHydrated();
  const { address } = useAccount();

  const { data: space } = useQuery({
    queryKey: ['access-control', spaceId, address],
    queryFn: async () => {
      if (!spaceId || !address) return null;

      return await Subgraph.fetchSpace({ id: spaceId });
    },
  });

  if (process.env.NODE_ENV === 'development') {
    return {
      isEditor: true,
      isMember: true,
    };
  }

  if (!address || !hydrated || !space) {
    return {
      isEditor: false,
      isMember: false,
    };
  }

  return {
    isMember: space.members.map(s => s.toLowerCase()).includes(address.toLowerCase()),
    isEditor: space.editors.map(s => s.toLowerCase()).includes(address.toLowerCase()),
  };
}

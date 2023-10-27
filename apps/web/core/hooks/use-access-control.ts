'use client';

import { useQuery } from '@tanstack/react-query';

import { useAccount } from 'wagmi';

import { API } from '../io';
import { useHydrated } from './use-hydrated';

export function useAccessControl(spaceId?: string | null) {
  // We need to wait for the client to check the status of the client-side wallet
  // before setting state. Otherwise there will be client-server hydration mismatches.
  const hydrated = useHydrated();
  const { address } = useAccount();

  const { data } = useQuery({
    queryKey: ['access-control', spaceId, address],
    queryFn: async () => {
      if (!spaceId || !address) return null;

      return await API.space(spaceId);
    },
  });

  if (process.env.NODE_ENV === 'development') {
    return {
      isAdmin: true,
      isEditorController: true,
      isEditor: true,
    };
  }

  if (!address || !hydrated || !data || !data.space) {
    return {
      isAdmin: false,
      isEditorController: false,
      isEditor: false,
    };
  }

  return {
    isAdmin: data.space.admins.includes(address),
    isEditorController: data.space.editorControllers.includes(address),
    isEditor: data.space.editors.includes(address),
  };
}

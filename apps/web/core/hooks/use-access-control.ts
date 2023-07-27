'use client';

import { useAccount } from 'wagmi';

import { useHydrated } from './use-hydrated';
import { useSpaces } from './use-spaces';

export function useAccessControl(space?: string | null) {
  // We need to wait for the client to check the status of the client-side wallet
  // before setting state. Otherwise there will be client-server hydration mismatches.
  const hydrated = useHydrated();
  const { address } = useAccount();
  const { admins, editors, editorControllers } = useSpaces();

  if (process.env.NODE_ENV === 'development') {
    return {
      isAdmin: true,
      isEditorController: true,
      isEditor: true,
    };
  }

  if (!address || !hydrated || !space) {
    return {
      isAdmin: false,
      isEditorController: false,
      isEditor: false,
    };
  }

  return {
    isAdmin: (admins[space] || []).includes(address),
    isEditorController: (editorControllers[space] || []).includes(address),
    isEditor: (editors[space] || []).includes(address),
  };
}

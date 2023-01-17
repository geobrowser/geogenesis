import { useAccount } from 'wagmi';
import { useHydrated } from '../hooks/use-hydrated';
import { useSpaces } from '../spaces/use-spaces';

export function useAccessControl(space: string) {
  // We need to wait for the client to check the status of the client-side wallet
  // before setting state. Otherwise there will be client-server hydration mismatches.
  const hydrated = useHydrated();
  const { address } = useAccount();
  const { admins, editors, editorControllers } = useSpaces();

  if (!address || !hydrated) {
    return {
      isAdmin: false,
      isEditorController: false,
      isEditor: false,
    };
  }

  return {
    isAdmin: true,
    isEditor: true,
    isEditorController: true,
  };

  return {
    isAdmin: (admins[space] || []).includes(address),
    isEditorController: (editorControllers[space] || []).includes(address),
    isEditor: (editors[space] || []).includes(address),
  };
}

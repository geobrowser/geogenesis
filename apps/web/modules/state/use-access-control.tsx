import { useAccount } from 'wagmi';
import { useSpaces } from './use-spaces';

export function useAccessControl(space: string) {
  const { address } = useAccount();
  const { admins, editors } = useSpaces();

  if (!address) {
    return {
      isAdmin: false,
      isEditor: false,
    };
  }

  return {
    isAdmin: (admins[space] || []).some(admin => admin.id === address),
    isEditor: (editors[space] || []).some(editor => editor.id === address),
  };
}

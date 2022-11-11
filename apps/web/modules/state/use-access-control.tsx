import { useAccount } from 'wagmi';
import { useSpaces } from './use-spaces';

export function useAccessControl(space: string) {
  const { address } = useAccount();
  const { admins, editors, editorControllers } = useSpaces();

  if (!address) {
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

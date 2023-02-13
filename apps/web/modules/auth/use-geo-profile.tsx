import { useAccount } from 'wagmi';
import { useHydrated } from '../hooks/use-hydrated';

export function useGeoProfile() {
  // We need to wait for the client to check the status of the client-side wallet
  // before setting state. Otherwise there will be client-server hydration mismatches.
  const hydrated = useHydrated();
  const { address } = useAccount();
  // const { admins, editors, editorControllers } = useSpaces();

  if (!address || !hydrated) {
    return { profile: null };
  }

  // Stubbing for now...
  return {
    profile: {
      id: address,
      name: 'John Doe',
      avatar: 'https://avatars.githubusercontent.com/u/1234567?v=4',
    },
  };
}

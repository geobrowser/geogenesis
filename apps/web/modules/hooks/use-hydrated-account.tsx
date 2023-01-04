import { useAccount } from 'wagmi';
import { useHydrated } from './use-hydrated';

export function useHydratedAccount() {
  const hydrated = useHydrated();
  const account = useAccount();

  return hydrated ? { address: account.address } : { address: undefined };
}

import { useLogin as usePrivyLogin, useWallets } from '@privy-io/react-auth';
import { useSetActiveWallet } from '@privy-io/wagmi';

type UseLoginParams = Parameters<typeof usePrivyLogin>[0];

/**
 * Custom login hook that wraps Privy's useLogin with automatic wallet activation.
 *
 * @param params - Login parameters passed to Privy's useLogin hook
 * @returns The same return type as Privy's useLogin hook
 *
 * @remarks
 * This hook automatically sets the connected wallet as the active wallet in wagmi's context
 * after a successful login, enabling consumers to interact with wagmi/viem through normal APIs
 * for transactions and other blockchain operations.
 */
export function useGeoLogin(params: UseLoginParams): ReturnType<typeof usePrivyLogin> {
  const { setActiveWallet } = useSetActiveWallet();
  const { wallets } = useWallets();

  /**
   * We automatically set the connected wallet into wagmi's context. This means
   * any consumer of useLogin can interact with wagmi/viem through normal APIs
   * to do things like make transactions.
   */
  return usePrivyLogin({
    ...params,
    onComplete: async args => {
      const userWallet = args.user.wallet;

      if (userWallet !== undefined) {
        const wallet = wallets.find(wallet => wallet.address === userWallet.address);

        if (wallet) {
          await setActiveWallet(wallet);
        }

        params?.onComplete?.(args);
      }
    },
  });
}

import { useLoginWithEmail as usePrivyLoginWithEmail, useWallets } from '@privy-io/react-auth';
import { useSetActiveWallet } from '@privy-io/wagmi';

type UseLoginWithEmailParams = Parameters<typeof usePrivyLoginWithEmail>[0];

/**
 * Privy's headless email login, with the wallet activation `useGeoLogin` does.
 *
 * The headless flow is a separate hook from Privy's modal login and fires its own callbacks, so a
 * caller that reaches for it gets none of the wiring `useGeoLogin` performs. That wiring is not
 * optional: `setActiveWallet` is what puts the wallet into wagmi's context, and without it
 * `useWalletClient` stays empty, `useSmartAccount` resolves no address, and everything downstream
 * that keys on that address behaves as though nobody is signed in — `usePersonalSpaceId` never
 * runs its query, so onboarding never decides the new account needs onboarding.
 *
 * Which is exactly what happened: a code that verified, a session that existed, and an account
 * with no wallet sitting on a page that carried on as if logged out.
 *
 * Kept beside `useGeoLogin` rather than solved at the call site so the next caller inherits it.
 */
export function useGeoLoginWithEmail(params?: UseLoginWithEmailParams) {
  const { setActiveWallet } = useSetActiveWallet();
  const { wallets } = useWallets();

  return usePrivyLoginWithEmail({
    ...params,
    onComplete: async args => {
      const userWallet = args.user.wallet;

      if (userWallet !== undefined) {
        const wallet = wallets.find(wallet => wallet.address === userWallet.address);

        if (wallet) {
          await setActiveWallet(wallet);
        }
      }

      await params?.onComplete?.(args);
    },
  });
}

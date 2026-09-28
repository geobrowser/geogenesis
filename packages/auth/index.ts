export {
  usePrivy,
  useLogout,
  // Privy's headless email login — `sendCode`/`loginWithCode` against an address already in hand,
  // so someone who has just typed their email into another form is not asked for it twice
  // (GEO-2948).
  //
  // Re-exported unchanged, and deliberately so: unlike `useGeoLogin`, which wraps `useLogin` with
  // `setActiveWallet`, this adds nothing. A headless login creates no embedded wallet and activates
  // nothing, and none of that is fixed here — `useEnsureEmbeddedWallet`, mounted app-wide in
  // `core/providers.tsx`, is the only thing making an authenticated session end up with a usable
  // wallet. Deleting it does not fall back to something; it reinstates the bug this was opened for.
  useLoginWithEmail,
  type UseLoginWithEmail,
  useIdentityToken,
  getIdentityToken,
  PrivyProvider,
  type PrivyClientConfig,
  useWallets,
  toViemAccount,
} from '@privy-io/react-auth';
export { WagmiProvider } from '@privy-io/wagmi';
export { useAccountEffect, useWalletClient } from 'wagmi';
export { getGeoChain } from './src/chain.js';
export { useGeoLogin } from './src/use-login.js';
// Mounted once for the life of the app. A headless login authenticates without creating the
// embedded wallet the modal flow creates, and nothing downstream works without one.
export { useEnsureEmbeddedWallet } from './src/use-ensure-embedded-wallet.js';

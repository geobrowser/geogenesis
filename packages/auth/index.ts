export {
  usePrivy,
  useLogout,
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
// Privy's headless email login — `sendCode`/`loginWithCode` against an address already in hand, so
// someone who has just typed their email into another form is not asked for it twice (GEO-2948).
// Wrapped rather than re-exported raw: the bare hook skips the wallet activation `useGeoLogin`
// does, which leaves the account signed in with nothing in wagmi's context. The modal flow stays
// the default everywhere else.
export { useGeoLoginWithEmail } from './src/use-login-with-email.js';

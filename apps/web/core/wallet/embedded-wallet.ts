import type { PrivyValue, WalletsValue } from './auth-store';

/** Privy's own embedded wallet, as opposed to a linked external one: the signer `useSmartAccount` needs. */
const EMBEDDED_WALLET_TYPE = 'privy';

type ConnectedWallet = WalletsValue['wallets'][number];

/** The embedded wallet among the ones connected to this page, if it has arrived. */
export function findEmbeddedWallet(wallets: readonly ConnectedWallet[]): ConnectedWallet | undefined {
  return wallets.find(wallet => wallet.walletClientType === EMBEDDED_WALLET_TYPE);
}

/**
 * Whether the account has an embedded Ethereum wallet, connected to this page or not. Known as soon
 * as the user is, before the wallet itself has reached `useWallets()`.
 */
export function accountHasEmbeddedWallet(user: PrivyValue['user']): boolean {
  return (user?.linkedAccounts ?? []).some(
    account =>
      account.type === 'wallet' && account.walletClientType === EMBEDDED_WALLET_TYPE && account.chainType === 'ethereum'
  );
}

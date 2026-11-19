import { describe, expect, it } from 'vitest';

import type { PrivyValue, WalletsValue } from './auth-store';
import { accountHasEmbeddedWallet, embeddedWalletAddress, findEmbeddedWallet } from './embedded-wallet';

const user = (linkedAccounts: unknown[]) => ({ linkedAccounts }) as unknown as PrivyValue['user'];
const wallets = (...types: string[]) =>
  types.map(walletClientType => ({ walletClientType })) as unknown as WalletsValue['wallets'];

describe('findEmbeddedWallet', () => {
  it("picks Privy's embedded wallet over a linked external one", () => {
    const connected = wallets('metamask', 'privy');
    expect(findEmbeddedWallet(connected)).toBe(connected[1]);
  });

  it('finds nothing before the embedded wallet has arrived', () => {
    expect(findEmbeddedWallet(wallets('metamask'))).toBeUndefined();
  });
});

describe('accountHasEmbeddedWallet', () => {
  it('is true for an account with an embedded Ethereum wallet', () => {
    expect(
      accountHasEmbeddedWallet(
        user([{ type: 'email' }, { type: 'wallet', walletClientType: 'privy', chainType: 'ethereum' }])
      )
    ).toBe(true);
  });

  it('is false for an external wallet, a Solana embedded wallet, or no user', () => {
    expect(
      accountHasEmbeddedWallet(user([{ type: 'wallet', walletClientType: 'metamask', chainType: 'ethereum' }]))
    ).toBe(false);
    expect(accountHasEmbeddedWallet(user([{ type: 'wallet', walletClientType: 'privy', chainType: 'solana' }]))).toBe(
      false
    );
    expect(accountHasEmbeddedWallet(null)).toBe(false);
  });
});

describe('embeddedWalletAddress', () => {
  const ADDRESS = '0x5D6d0E45D76D360AB4F94941CE9a005b0AEa2ebD';
  const embedded = (address: unknown) => ({
    type: 'wallet',
    walletClientType: 'privy',
    chainType: 'ethereum',
    address,
  });

  it("reads the embedded wallet's address off the restored account, checksummed", () => {
    expect(embeddedWalletAddress(user([{ type: 'email' }, embedded(ADDRESS.toLowerCase())]))).toBe(ADDRESS);
  });

  it('takes the first embedded wallet, as the server does, over an external one', () => {
    const other = '0x0000000000000000000000000000000000000001';
    const linked = [{ type: 'wallet', walletClientType: 'metamask', chainType: 'ethereum', address: other }];
    expect(embeddedWalletAddress(user([...linked, embedded(ADDRESS), embedded(other)]))).toBe(ADDRESS);
  });

  it('is null with no embedded wallet yet, no user, or a malformed address', () => {
    expect(embeddedWalletAddress(user([{ type: 'email' }]))).toBeNull();
    expect(embeddedWalletAddress(null)).toBeNull();
    expect(embeddedWalletAddress(user([embedded('not-an-address')]))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import type { PrivyValue, WalletsValue } from './auth-store';
import { accountHasEmbeddedWallet, findEmbeddedWallet } from './embedded-wallet';

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

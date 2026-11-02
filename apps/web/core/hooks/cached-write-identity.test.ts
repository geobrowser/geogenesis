import { QueryClient } from '@tanstack/react-query';

import { describe, expect, it } from 'vitest';

import { readCachedSmartAccount } from './cached-write-identity';
import { smartAccountQueryKey } from './use-smart-account';

type Account = Parameters<typeof readCachedSmartAccount>[1];

const account = (address: string) => ({ account: { address } }) as unknown as NonNullable<Account>;

describe('readCachedSmartAccount', () => {
  // A fresh sign-up: the query first runs before Privy sets the active wagmi wallet, then again
  // once it has — one account under two keys.
  it('reads one account cached under two keys as that account', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(smartAccountQueryKey(undefined, '0xembedded'), account('0xABC'));
    queryClient.setQueryData(smartAccountQueryKey('0xwallet', '0xembedded'), account('0xabc'));

    expect(readCachedSmartAccount(queryClient, null)?.account.address.toLowerCase()).toBe('0xabc');
  });

  it('refuses to pick between two different accounts', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(smartAccountQueryKey('0xa', '0xa'), account('0xaaa'));
    queryClient.setQueryData(smartAccountQueryKey('0xb', '0xb'), account('0xbbb'));

    expect(readCachedSmartAccount(queryClient, null)).toBeNull();
  });

  it('prefers the live account', () => {
    const queryClient = new QueryClient();
    const live = account('0xlive');

    expect(readCachedSmartAccount(queryClient, live)).toBe(live);
  });
});

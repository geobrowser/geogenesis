import { QueryClient } from '@tanstack/react-query';

import { describe, expect, it } from 'vitest';

import { publishReadinessForTests, resetPublishedReadiness } from '~/core/wallet/account-readiness';

import { awaitSigningAccount, readCachedSmartAccount } from './cached-write-identity';
import { smartAccountQueryKey } from './use-smart-account';

type Account = Parameters<typeof readCachedSmartAccount>[1];

const account = (address: string) => ({ account: { address } }) as unknown as NonNullable<Account>;

describe('readCachedSmartAccount', () => {
  it('reads the cached account when there is no live one', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(smartAccountQueryKey('0xembedded'), account('0xabc'));

    expect(readCachedSmartAccount(queryClient, null)?.account.address).toBe('0xabc');
  });

  it('refuses to pick between two different accounts', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(smartAccountQueryKey('0xa'), account('0xaaa'));
    queryClient.setQueryData(smartAccountQueryKey('0xb'), account('0xbbb'));

    expect(readCachedSmartAccount(queryClient, null)).toBeNull();
  });

  it('prefers the live account', () => {
    const queryClient = new QueryClient();
    const live = account('0xlive');

    expect(readCachedSmartAccount(queryClient, live)).toBe(live);
  });
});

describe('awaitSigningAccount', () => {
  it('waits for an account still being built', async () => {
    resetPublishedReadiness({ state: 'identified', address: '0xabc' });
    const waiting = awaitSigningAccount(new QueryClient(), null);
    const built = account('0xabc');
    publishReadinessForTests({ state: 'ready_to_write', address: '0xabc', signingAccount: built });

    await expect(waiting).resolves.toBe(built);
  });

  it('is null for someone signed out, so the caller can ask them to sign in', async () => {
    resetPublishedReadiness({ state: 'signed_out' });

    await expect(awaitSigningAccount(new QueryClient(), null)).resolves.toBeNull();
  });
});

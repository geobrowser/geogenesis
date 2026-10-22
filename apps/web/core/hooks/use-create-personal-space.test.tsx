import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import * as React from 'react';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreatePersonalSpace } from './use-create-personal-space';
import { markPersonalProfilePublished } from './use-personal-space-id';

const ADDRESS = '0x2e766B1B973EC3049c5Dd7ea8EbDc30d6D919dDE';
const SPACE_ID = '17b847abe1d146079294071b11ab81fc';

const readRegisteredSpaceId = vi.fn();
const createPersonalSpaceOnChain = vi.fn();
const getSpace = vi.fn();

vi.mock('~/core/utils/contracts/create-personal-space-on-chain', () => ({
  readRegisteredSpaceId: (address: string) => readRegisteredSpaceId(address),
  createPersonalSpaceOnChain: (args: unknown) => createPersonalSpaceOnChain(args),
}));

vi.mock('~/core/io/queries', () => ({
  getSpace: (spaceId: string) => getSpace(spaceId),
}));

vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address: ADDRESS } }, isLoading: false }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function create(onRegistered = vi.fn()) {
  const { result } = renderHook(() => useCreatePersonalSpace(), { wrapper });
  return result.current.createPersonalSpace({ spaceName: 'Ada', topicId: 'topic-1', onRegistered });
}

beforeEach(() => {
  readRegisteredSpaceId.mockReset();
  createPersonalSpaceOnChain.mockReset();
  getSpace.mockReset();
  window.localStorage.clear();
  createPersonalSpaceOnChain.mockResolvedValue(SPACE_ID);
});

describe('useCreatePersonalSpace', () => {
  it('publishes the profile for a registered space that never got one', async () => {
    // hi@techfren.net, 2026-10-18: onboarding reopened for a space with no profile, and this
    // hook returned the registered id without publishing. The runner logged the profile as
    // sent, nothing reached the chain, and geo-chat kept refusing the account a session.
    readRegisteredSpaceId.mockResolvedValue(SPACE_ID);
    getSpace.mockReturnValue(Effect.succeed({ id: SPACE_ID, type: 'PERSONAL', hasProfile: false }));
    const onRegistered = vi.fn();

    await expect(create(onRegistered)).resolves.toBe(SPACE_ID);

    expect(createPersonalSpaceOnChain).toHaveBeenCalledTimes(1);
    expect(createPersonalSpaceOnChain).toHaveBeenCalledWith(
      expect.objectContaining({ walletAddress: ADDRESS, spaceName: 'Ada', topicId: 'topic-1', onRegistered })
    );
    // The on-chain flow calls it once the publish is sent; calling it here first would mark
    // a profile that has not been sent.
    expect(onRegistered).not.toHaveBeenCalled();
  });

  it('publishes the profile when the index has not served the registered space yet', async () => {
    // A reload between registration and the profile publish: the space exists on-chain but
    // the index does not know it, and the profile was never sent.
    readRegisteredSpaceId.mockResolvedValue(SPACE_ID);
    getSpace.mockReturnValue(Effect.succeed(null));

    await create();

    expect(createPersonalSpaceOnChain).toHaveBeenCalledTimes(1);
  });

  it('returns a registered space that already has its profile without publishing again', async () => {
    readRegisteredSpaceId.mockResolvedValue(SPACE_ID);
    getSpace.mockReturnValue(Effect.succeed({ id: SPACE_ID, type: 'PERSONAL', hasProfile: true }));
    const onRegistered = vi.fn();

    await expect(create(onRegistered)).resolves.toBe(SPACE_ID);

    expect(createPersonalSpaceOnChain).not.toHaveBeenCalled();
    expect(onRegistered).toHaveBeenCalledWith(SPACE_ID);
  });

  it('trusts a profile this browser just sent over an index that has not caught up', async () => {
    markPersonalProfilePublished(ADDRESS);
    readRegisteredSpaceId.mockResolvedValue(SPACE_ID);
    getSpace.mockReturnValue(Effect.succeed({ id: SPACE_ID, type: 'PERSONAL', hasProfile: false }));

    await create();

    expect(createPersonalSpaceOnChain).not.toHaveBeenCalled();
  });

  it('fails rather than guessing when the profile check cannot be read', async () => {
    readRegisteredSpaceId.mockResolvedValue(SPACE_ID);
    getSpace.mockReturnValue(Effect.fail(new Error('index unavailable')));
    const onRegistered = vi.fn();

    await expect(create(onRegistered)).rejects.toThrow();

    expect(createPersonalSpaceOnChain).not.toHaveBeenCalled();
    expect(onRegistered).not.toHaveBeenCalled();
  });

  it('registers and publishes an account with no space', async () => {
    readRegisteredSpaceId.mockResolvedValue(null);

    await create();

    expect(getSpace).not.toHaveBeenCalled();
    expect(createPersonalSpaceOnChain).toHaveBeenCalledTimes(1);
  });
});

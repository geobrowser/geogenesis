import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import * as React from 'react';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { INDEX_LAG_WINDOW_MS, ProfileStillProcessingError } from '~/core/utils/contracts/personal-profile-recovery';

import { useCreatePersonalSpace } from './use-create-personal-space';
import { markPersonalProfilePublished, needsPersonalProfile } from './use-personal-space-id';

const ADDRESS = '0x2e766B1B973EC3049c5Dd7ea8EbDc30d6D919dDE';
const SPACE_ID = '17b847abe1d146079294071b11ab81fc';
const PERSON_ID = '5cc83bb5b39540b3922f9a8664bf6831';
// A real profile the index serves as the space's page, with `topicId` still null (the indexer
// ignores the web's TOPIC_DECLARED).
const indexedProfile = { id: SPACE_ID, type: 'PERSONAL', topicId: null, hasProfile: true, entity: { id: PERSON_ID } };

function declaration(ageMs: number) {
  return {
    topicId: PERSON_ID,
    blockNumber: 126_690n,
    transactionHash: '0x383a',
    declaredAtMs: Date.now() - ageMs,
    editUri: 'ipfs://QmX65gRctsCHnBZSG7izR4vhMUTH3HbMuCuHRYP8tu5BVv',
  };
}

const readRegisteredSpaceId = vi.fn();
const createPersonalSpaceOnChain = vi.fn();
const findPersonalProfileDeclaration = vi.fn();
const republishPersonalProfile = vi.fn();
const getSpace = vi.fn();

vi.mock('~/core/utils/contracts/create-personal-space-on-chain', () => ({
  readRegisteredSpaceId: (address: string) => readRegisteredSpaceId(address),
  findPersonalProfileDeclaration: (spaceId: string) => findPersonalProfileDeclaration(spaceId),
  republishPersonalProfile: (args: unknown) => republishPersonalProfile(args),
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
  findPersonalProfileDeclaration.mockReset();
  republishPersonalProfile.mockReset();
  getSpace.mockReset();
  window.localStorage.clear();
  createPersonalSpaceOnChain.mockResolvedValue(SPACE_ID);
  findPersonalProfileDeclaration.mockResolvedValue(null);
  republishPersonalProfile.mockResolvedValue(SPACE_ID);
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
    getSpace.mockReturnValue(Effect.succeed(indexedProfile));
    const onRegistered = vi.fn();

    await expect(create(onRegistered)).resolves.toBe(SPACE_ID);

    expect(createPersonalSpaceOnChain).not.toHaveBeenCalled();
    expect(onRegistered).toHaveBeenCalledWith(SPACE_ID, PERSON_ID);
    // The index already answered; the chain is only asked when the index says "missing".
    expect(findPersonalProfileDeclaration).not.toHaveBeenCalled();
  });

  it('does not publish a second profile that another browser landed while the index lags', async () => {
    // Browser A sent the profile; browser B finishes onboarding before the index serves it. B's
    // dialog minted a fresh topic id, so publishing here would write a second profile under it.
    readRegisteredSpaceId.mockResolvedValue(SPACE_ID);
    getSpace.mockReturnValue(Effect.succeed(null));
    const recent = declaration(60_000);
    findPersonalProfileDeclaration.mockResolvedValue(recent);
    const onRegistered = vi.fn();

    await expect(create(onRegistered)).rejects.toBeInstanceOf(ProfileStillProcessingError);

    expect(findPersonalProfileDeclaration).toHaveBeenCalledWith(SPACE_ID);
    expect(createPersonalSpaceOnChain).not.toHaveBeenCalled();
    expect(republishPersonalProfile).not.toHaveBeenCalled();
    // Not "sent": nothing was. The grace window is anchored to the chain's time, not now.
    expect(onRegistered).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(`personalProfilePublishedAt:${ADDRESS.toLowerCase()}`)).toBe(
      String(recent.declaredAtMs)
    );
  });

  it('republishes a profile the index dropped, under the declared topic, instead of a fresh one', async () => {
    // GEO-3803: the sign-up edit and its declaration landed, the indexer dropped the edit, and the
    // retry was skipped because the declaration existed. The prompt came back every 10 minutes.
    readRegisteredSpaceId.mockResolvedValue(SPACE_ID);
    getSpace.mockReturnValue(
      Effect.succeed({ id: SPACE_ID, type: 'PERSONAL', topicId: null, hasProfile: false, entity: { id: '' } })
    );
    const old = declaration(INDEX_LAG_WINDOW_MS + 60_000);
    findPersonalProfileDeclaration.mockResolvedValue(old);
    const onRegistered = vi.fn();

    await expect(create(onRegistered)).resolves.toBe(SPACE_ID);

    expect(republishPersonalProfile).toHaveBeenCalledTimes(1);
    expect(republishPersonalProfile).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: SPACE_ID, declaration: old, spaceName: 'Ada', onRegistered })
    );
    expect(createPersonalSpaceOnChain).not.toHaveBeenCalled();
  });

  it('publishes a fresh profile when the chain has no profile publish at all', async () => {
    readRegisteredSpaceId.mockResolvedValue(SPACE_ID);
    getSpace.mockReturnValue(
      Effect.succeed({ id: SPACE_ID, type: 'PERSONAL', topicId: null, hasProfile: false, entity: { id: '' } })
    );
    findPersonalProfileDeclaration.mockResolvedValue(null);

    await create();

    expect(createPersonalSpaceOnChain).toHaveBeenCalledTimes(1);
    expect(republishPersonalProfile).not.toHaveBeenCalled();
  });

  it('never prompts or publishes for a declared space whose real profile is indexed', async () => {
    expect(needsPersonalProfile(indexedProfile as never, ADDRESS)).toBe(false);

    readRegisteredSpaceId.mockResolvedValue(SPACE_ID);
    getSpace.mockReturnValue(Effect.succeed(indexedProfile));
    findPersonalProfileDeclaration.mockResolvedValue(declaration(INDEX_LAG_WINDOW_MS + 60_000));

    await create();

    expect(findPersonalProfileDeclaration).not.toHaveBeenCalled();
    expect(republishPersonalProfile).not.toHaveBeenCalled();
    expect(createPersonalSpaceOnChain).not.toHaveBeenCalled();
  });

  it('still publishes the missing profile when the chain check cannot be read', async () => {
    readRegisteredSpaceId.mockResolvedValue(SPACE_ID);
    getSpace.mockReturnValue(Effect.succeed({ id: SPACE_ID, type: 'PERSONAL', hasProfile: false }));
    findPersonalProfileDeclaration.mockRejectedValue(new Error('rpc unavailable'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await create();

    expect(createPersonalSpaceOnChain).toHaveBeenCalledTimes(1);
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

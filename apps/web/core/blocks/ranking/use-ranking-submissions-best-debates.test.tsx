import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRankingSubmissions } from './use-ranking-submissions';

// The Best debates block id is unset until GEO-3685; inject one so its rules can be exercised.

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  capture: vi.fn(),
  publish: vi.fn(),
  reportError: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  myRankEntity: null as unknown,
}));
const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BLOCK = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const ITEM = 'cccccccccccccccccccccccccccccccc';

vi.mock('./best-debates', async importOriginal => ({
  ...(await importOriginal<typeof import('./best-debates')>()),
  BEST_DEBATES_BLOCK_ID: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
}));
vi.mock('~/core/analytics', () => ({ capture: mocks.capture, analyticsContextRevision: () => 0 }));
vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address: '0xabc' }, sendUserOperation: mocks.send } }),
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
  personalSpaceIdQueryKey: (address: string) => ['personal-space', address],
}));
vi.mock('~/core/hooks/use-geo-profile', () => ({ useGeoProfile: () => ({ profile: null }) }));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, vi.fn()] }));
vi.mock('~/core/io/queries', () => ({ getEntity: () => ({}) }));
vi.mock('~/core/state/status-bar-store', () => ({ useReportError: () => mocks.reportError }));
vi.mock('~/core/sdk/geo-client', () => ({
  geo: { personalSpaces: { publishEdit: mocks.publish }, ranks: { update: mocks.update } },
}));
vi.mock('./use-my-ranking', () => ({
  useMyRanking: () => ({
    myRankEntity: mocks.myRankEntity,
    orderedEntityIds: [],
    isLoading: false,
    refetchMyRanking: vi.fn().mockResolvedValue(undefined),
  }),
  recordPublishedRank: vi.fn(),
}));
vi.mock('./use-ranking-block-config', () => ({
  useRankingBlockConfig: () => ({ isRolling: false, submissionFrequencyHours: null }),
}));
vi.mock('@geoprotocol/geo-sdk', async importOriginal => {
  const actual = await importOriginal<typeof import('@geoprotocol/geo-sdk')>();
  return {
    ...actual,
    Ops: {
      ...actual.Ops,
      ranks: { create: mocks.create },
    },
  };
});

const OTHER_BLOCK = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
// Best debates is the Debates space's block only.
const DEBATES_SPACE = '9284477c8fe746368698994e2e517b32';
const RANK = '44444444444444444444444444444444';
const DEBATE_SPACE = 'ffffffffffffffffffffffffffffffff';
const ITEM_2 = '12121212121212121212121212121212';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue('0xhash');
  mocks.publish.mockResolvedValue({ to: '0xabc', calldata: '0x01' });
  mocks.create.mockReturnValue({ id: 'dddddddddddddddddddddddddddddddd', ops: [{ op: 'noop' }] });
  mocks.update.mockResolvedValue({ id: RANK, ops: [{ op: 'votes' }] });
  mocks.myRankEntity = null;
});

function renderSubmissions(blockId: string, blockSpaceId = DEBATES_SPACE) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['personal-space', '0xabc'], { personalSpaceId: SPACE, isRegistered: true });
  return renderHook(() => useRankingSubmissions(blockId, blockSpaceId, 'Best debates'), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe('ballot rules per block (GEO-3678)', () => {
  it('publishes a Best debates ballot as ORDINAL with each debate in its own space, no fallback', async () => {
    const view = renderSubmissions(BLOCK);
    await act(async () => {
      await view.result.current.saveMySubmission([
        { id: ITEM, name: null, spaceId: DEBATE_SPACE },
        { id: ITEM_2, name: null, spaceId: undefined },
      ]);
    });

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        rankType: 'ORDINAL',
        blockId: BLOCK,
        votes: [{ entityId: ITEM, spaceId: DEBATE_SPACE }],
      })
    );
    // One edit, one transaction: the ballot, and no vote.
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('keeps every other block WEIGHTED, falling back to the block space as before', async () => {
    const view = renderSubmissions(OTHER_BLOCK, SPACE);
    await act(async () => {
      await view.result.current.saveMySubmission([{ id: ITEM_2, name: null, spaceId: undefined }]);
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        rankType: 'WEIGHTED',
        votes: [{ entityId: ITEM_2, spaceId: SPACE, value: expect.any(Number) }],
      })
    );
  });

  it('publishes a fresh ORDINAL Rank when the existing Best debates ballot is WEIGHTED', async () => {
    mocks.myRankEntity = {
      id: RANK,
      createdAt: '1',
      updatedAt: '1',
      values: [{ property: { id: '48e01bc8324e48c2a6c9cab3f49290c6' }, value: 'WEIGHTED', isDeleted: false }],
    };
    const view = renderSubmissions(BLOCK);
    await act(async () => {
      await view.result.current.saveMySubmission([{ id: ITEM, name: null, spaceId: DEBATE_SPACE }]);
    });

    // A create the indexer detects with its type, never an update it would keep scoring as WEIGHTED.
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        rankType: 'ORDINAL',
        blockId: BLOCK,
        votes: [{ entityId: ITEM, spaceId: DEBATE_SPACE }],
      })
    );
    expect(mocks.publish).toHaveBeenCalledTimes(1);
  });

  it('updates an existing ORDINAL Best debates ballot in place, as before', async () => {
    mocks.myRankEntity = {
      id: RANK,
      createdAt: '1',
      updatedAt: '1',
      values: [{ property: { id: '48e01bc8324e48c2a6c9cab3f49290c6' }, value: 'ORDINAL', isDeleted: false }],
    };
    const view = renderSubmissions(BLOCK);
    await act(async () => {
      await view.result.current.saveMySubmission([{ id: ITEM, name: null, spaceId: DEBATE_SPACE }]);
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ rankId: RANK, rankType: 'ORDINAL' }));
    expect((mocks.publish.mock.calls[0][0] as { ops: unknown[] }).ops).toEqual([{ op: 'votes' }]);
  });

  it('leaves an existing ballot on another block exactly as before', async () => {
    mocks.myRankEntity = {
      id: RANK,
      createdAt: '1',
      updatedAt: '1',
      values: [{ property: { id: '48e01bc8324e48c2a6c9cab3f49290c6' }, value: 'WEIGHTED', isDeleted: false }],
    };
    const view = renderSubmissions(OTHER_BLOCK, SPACE);
    await act(async () => {
      await view.result.current.saveMySubmission([{ id: ITEM, name: null, spaceId: DEBATE_SPACE }]);
    });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ rankType: 'WEIGHTED' }));
    expect((mocks.publish.mock.calls[0][0] as { ops: unknown[] }).ops).toEqual([{ op: 'votes' }]);
  });

  it('treats the Best debates block id in another space as an ordinary block', async () => {
    const view = renderSubmissions(BLOCK, SPACE);
    await act(async () => {
      await view.result.current.saveMySubmission([{ id: ITEM_2, name: null, spaceId: undefined }]);
    });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ rankType: 'WEIGHTED' }));
  });
});

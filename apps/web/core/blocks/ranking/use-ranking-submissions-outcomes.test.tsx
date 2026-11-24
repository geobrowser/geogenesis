import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRankingSubmissions } from './use-ranking-submissions';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  capture: vi.fn(),
  publish: vi.fn(),
  reportError: vi.fn(),
  signer: true,
  accountArrives: Promise.resolve(null) as Promise<unknown>,
}));
const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BLOCK = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const ITEM = 'cccccccccccccccccccccccccccccccc';

vi.mock('~/core/analytics', () => ({ capture: mocks.capture, analyticsContextRevision: () => 0 }));
vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({
    smartAccount: mocks.signer ? { account: { address: '0xabc' }, sendUserOperation: mocks.send } : null,
  }),
}));
vi.mock('~/core/hooks/cached-write-identity', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/hooks/cached-write-identity')>()),
  awaitSigningAccount: (live: unknown) => (live ? Promise.resolve(live) : mocks.accountArrives),
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
  personalSpaceIdQueryKey: (address: string) => ['personal-space', address],
}));
vi.mock('~/core/hooks/use-geo-profile', () => ({ useGeoProfile: () => ({ profile: null }) }));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, vi.fn()] }));
vi.mock('~/core/state/status-bar-store', () => ({ useReportError: () => mocks.reportError }));
vi.mock('~/core/sdk/geo-client', () => ({ geo: { personalSpaces: { publishEdit: mocks.publish } } }));
vi.mock('./use-my-ranking', () => ({
  useMyRanking: () => ({ myRankEntity: null, orderedEntityIds: [], isLoading: false, refetchMyRanking: vi.fn() }),
  recordPublishedRank: vi.fn(),
  releasePublishedRankPin: vi.fn(),
  fetchMyRankingBallot: vi.fn(async () => ({ rankEntity: null, orderedEntityIds: [] })),
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
      ranks: { create: () => ({ id: 'dddddddddddddddddddddddddddddddd', ops: [{ op: 'noop' }] }) },
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signer = true;
  mocks.send.mockReset();
  mocks.send.mockResolvedValue('0xhash');
  mocks.publish.mockResolvedValue({ to: '0xabc', calldata: '0x01' });
});

describe('ranking submission outcomes', () => {
  it.each([
    ['uncertain response', new Error('Connection lost after sending'), 'action_outcome_unknown', 'unknown'],
    ['wallet rejection', Object.assign(new Error('Request denied'), { code: 4001 }), 'action_failed', 'rejected'],
  ])('does not resend after a %s', async (_label, error, event, failureCode) => {
    mocks.send.mockRejectedValueOnce(error);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['personal-space', '0xabc'], { personalSpaceId: SPACE, isRegistered: true });
    const view = renderHook(() => useRankingSubmissions(BLOCK, SPACE, 'Test ranking'), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    await act(async () => {
      expect(await view.result.current.saveMySubmission([{ id: ITEM, name: null, spaceId: SPACE }])).toBeNull();
    });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ action_kind: 'ranking', failure_code: failureCode })
    );
    expect(mocks.capture.mock.calls.some(([name]) => name === 'ranking_submitted')).toBe(false);
    expect(view.result.current.isSaving).toBe(false);
    view.unmount();
    client.clear();
  });

  it('is saving from the press, while it waits for the signing account', async () => {
    mocks.signer = false;
    let arrive!: (account: unknown) => void;
    mocks.accountArrives = new Promise(resolve => (arrive = resolve));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = renderHook(() => useRankingSubmissions(BLOCK, SPACE, 'Test ranking'), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    let saving!: Promise<unknown>;
    act(() => {
      saving = view.result.current.saveMySubmission([{ id: ITEM, name: null, spaceId: SPACE }]);
    });
    expect(view.result.current.isSaving).toBe(true);

    await act(async () => {
      arrive(null);
      expect(await saving).toBeNull();
    });

    expect(view.result.current.isSaving).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
    view.unmount();
    client.clear();
  });
});

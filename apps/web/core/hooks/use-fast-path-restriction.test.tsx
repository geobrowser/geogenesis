import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFastPathRestriction } from './use-fast-path-restricted';

const DAO = '0x2222222222222222222222222222222222222222';
const SPACE = '41e851610e13a19441c4d980f2f2ce6b';

const mocks = vi.hoisted(() => ({ resolveDaoAddress: vi.fn(), readRoleAt: vi.fn() }));
vi.mock('~/core/utils/contracts/read-space-membership', () => ({
  resolveDaoAddress: mocks.resolveDaoAddress,
  readRoleAt: mocks.readRoleAt,
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: null }) }));
vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: null }) }));

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.resolveDaoAddress.mockResolvedValue(DAO);
  mocks.readRoleAt.mockImplementation(async (_dao: string, member: string) => member === 'restricted');
});
afterEach(() => {
  cleanup();
  client.clear();
});

describe('useFastPathRestriction', () => {
  // A members dialog mounts one of these per row; the registry lookup must not repeat per row.
  it('resolves the space once and reads only the role per row', async () => {
    const rows = renderHook(
      () => [useFastPathRestriction(SPACE, 'restricted'), useFastPathRestriction(SPACE, 'open')] as const,
      { wrapper }
    );

    await waitFor(() => expect(rows.result.current[1].isLoading).toBe(false));

    expect(rows.result.current.map(row => row.isRestricted)).toEqual([true, false]);
    expect(mocks.resolveDaoAddress).toHaveBeenCalledTimes(1);
    expect(mocks.readRoleAt).toHaveBeenCalledTimes(2);
  });

  // Acting on a guessed answer sends a write that reverts, so a failure is reported, not read as false.
  it('reports a failed lookup as an error', async () => {
    mocks.resolveDaoAddress.mockRejectedValue(new Error('not registered'));
    const { result } = renderHook(() => useFastPathRestriction(SPACE, 'open'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isRestricted).toBeUndefined();
  });
});

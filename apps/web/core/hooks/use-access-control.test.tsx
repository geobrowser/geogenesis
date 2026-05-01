import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import { Effect } from 'effect';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const accessChecks = {
  isMember: vi.fn(),
  isEditor: vi.fn(),
};

const hookState = {
  hydrated: true,
  personalSpaceId: 'member-space-id',
  isLoadingPersonalSpaceId: false,
  space: {
    id: 'dao-space-id',
    type: 'DAO',
    members: [] as string[],
    editors: [] as string[],
  },
  isLoadingSpace: false,
};

vi.mock('~/core/io/queries', () => ({
  getIsMemberOfSpace: accessChecks.isMember,
  getIsEditorOfSpace: accessChecks.isEditor,
}));

vi.mock('./use-hydrated', () => ({
  useHydrated: () => hookState.hydrated,
}));

vi.mock('./use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({
    personalSpaceId: hookState.personalSpaceId,
    isLoading: hookState.isLoadingPersonalSpaceId,
  }),
}));

vi.mock('./use-space', () => ({
  useSpace: () => ({
    space: hookState.space,
    isLoading: hookState.isLoadingSpace,
  }),
}));

const { useAccessControl } = await import('./use-access-control');

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useAccessControl', () => {
  beforeEach(() => {
    hookState.hydrated = true;
    hookState.personalSpaceId = 'member-space-id';
    hookState.isLoadingPersonalSpaceId = false;
    hookState.space = {
      id: 'dao-space-id',
      type: 'DAO',
      members: [],
      editors: [],
    };
    hookState.isLoadingSpace = false;
    accessChecks.isMember.mockReset();
    accessChecks.isEditor.mockReset();
    accessChecks.isMember.mockReturnValue(Effect.succeed(true));
    accessChecks.isEditor.mockReturnValue(Effect.succeed(false));
  });

  it('uses server-filtered DAO membership instead of the paginated space member list', async () => {
    const { result } = renderHook(() => useAccessControl('dao-space-id'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(accessChecks.isMember).toHaveBeenCalledWith('dao-space-id', 'member-space-id');
    expect(result.current).toMatchObject({
      isMember: true,
      isEditor: false,
    });
  });
});

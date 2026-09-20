import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreateEntityActions } from './use-create-entity-actions';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  createSpace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('~/core/id', () => ({ ID: { createEntityId: () => 'new-entity' } }));
vi.mock('~/core/state/pending-personal-space', () => ({
  isPendingPersonalSpaceId: (spaceId: string | null | undefined) => spaceId?.startsWith('pending:') ?? false,
}));
vi.mock('../create-space/create-space-dialog', () => ({
  useOpenCreateSpaceDialog: () => mocks.createSpace,
}));

beforeEach(() => {
  mocks.push.mockReset();
  mocks.createSpace.mockReset();
});

afterEach(cleanup);

describe('useCreateEntityActions', () => {
  it('builds entity and property routes from a real space ID', () => {
    const { result } = renderHook(() => useCreateEntityActions('space-1'));

    expect(result.current.canCreateInSpace).toBe(true);

    act(() => result.current.createEntity());
    act(() => result.current.createProperty());

    expect(mocks.push).toHaveBeenNthCalledWith(1, '/space/space-1/new-entity?edit=true');
    expect(mocks.push).toHaveBeenNthCalledWith(2, '/space/space-1/new-entity?edit=true&type=property');
  });

  it('blocks entity routes for a pending personal-space sentinel while preserving new-space creation', () => {
    const { result } = renderHook(() => useCreateEntityActions('pending:topic-1'));

    expect(result.current.canCreateInSpace).toBe(false);

    act(() => result.current.createEntity());
    act(() => result.current.createProperty());
    act(() => result.current.createSpace());

    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.createSpace).toHaveBeenCalledWith();
  });
});

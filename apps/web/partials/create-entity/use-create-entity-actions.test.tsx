import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ROOT_SPACE } from '~/core/constants';

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
  // Root sits in this list rather than in a case of its own: it is an ordinary indexed space
  // with working entity pages, and the point is that it builds the same routes as any other.
  // It used to be excluded, which left its "+" menu offering nothing but "New space".
  it.each([
    { name: 'a real space ID', spaceId: 'space-1' },
    { name: 'the root space', spaceId: ROOT_SPACE },
  ])('builds entity and property routes from $name', ({ spaceId }) => {
    const { result } = renderHook(() => useCreateEntityActions(spaceId));

    expect(result.current.canCreateInSpace).toBe(true);

    act(() => result.current.createEntity());
    act(() => result.current.createProperty());

    expect(mocks.push).toHaveBeenNthCalledWith(1, `/space/${spaceId}/new-entity?edit=true`);
    expect(mocks.push).toHaveBeenNthCalledWith(2, `/space/${spaceId}/new-entity?edit=true&type=property`);
  });

  it.each([
    { name: 'a missing space ID', spaceId: null },
    { name: 'an undefined space ID', spaceId: undefined },
    { name: 'an empty space ID', spaceId: '' },
    { name: 'a pending personal-space sentinel', spaceId: 'pending:topic-1' },
  ])('blocks entity routes for $name while preserving new-space creation', ({ spaceId }) => {
    const { result } = renderHook(() => useCreateEntityActions(spaceId));

    expect(result.current.canCreateInSpace).toBe(false);

    act(() => result.current.createEntity());
    act(() => result.current.createProperty());
    act(() => result.current.createSpace());

    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.createSpace).toHaveBeenCalledWith();
  });
});

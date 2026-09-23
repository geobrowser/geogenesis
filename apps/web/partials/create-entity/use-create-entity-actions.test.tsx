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
  it('builds entity and property routes from a real space ID', () => {
    const { result } = renderHook(() => useCreateEntityActions('space-1'));

    expect(result.current.canCreateInSpace).toBe(true);

    act(() => result.current.createEntity());
    act(() => result.current.createProperty());

    expect(mocks.push).toHaveBeenNthCalledWith(1, '/space/space-1/new-entity?edit=true');
    expect(mocks.push).toHaveBeenNthCalledWith(2, '/space/space-1/new-entity?edit=true&type=property');
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

  // Root is an ordinary indexed space with working entity pages; it used to be
  // excluded here, which left its "+" menu offering nothing but "New space".
  it('offers entity and property creation in the root space', () => {
    const { result } = renderHook(() => useCreateEntityActions(ROOT_SPACE));

    expect(result.current.canCreateInSpace).toBe(true);

    act(() => result.current.createEntity());
    act(() => result.current.createProperty());

    expect(mocks.push).toHaveBeenNthCalledWith(1, `/space/${ROOT_SPACE}/new-entity?edit=true`);
    expect(mocks.push).toHaveBeenNthCalledWith(2, `/space/${ROOT_SPACE}/new-entity?edit=true&type=property`);
  });
});

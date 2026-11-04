import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntityId } from '~/core/io/substream-schema';

import { MoveEntityToSpace } from './move-entity-to-space';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  cloneEntityIntoSpace: vi.fn(),
  loadMoveBacklinks: vi.fn(),
  loadMoveSubtree: vi.fn(),
  collectMoveDeletions: vi.fn(),
  deleteValues: vi.fn(),
  deleteRelations: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({}),
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: null }) }));
vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: undefined }) }));
vi.mock('~/core/hooks/use-spaces-where-member', () => ({
  useSpacesWhereMember: () => [
    { id: 'space-a', entity: { name: 'Space A', image: '' } },
    { id: 'space-b', entity: { name: 'Space B', image: '' } },
  ],
}));
vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({
    storage: { values: { deleteMany: mocks.deleteValues }, relations: { deleteMany: mocks.deleteRelations } },
  }),
}));
vi.mock('~/core/sync/use-sync-engine', () => ({ useSyncEngine: () => ({ store: {}, stream: { emit: vi.fn() } }) }));
vi.mock('~/design-system/geo-image', () => ({ GeoImage: () => null }));
vi.mock('~/partials/versions/clone-entity-into-space', () => ({
  cloneEntityIntoSpace: mocks.cloneEntityIntoSpace,
  collectHydrationTargetIds: () => [],
}));
vi.mock('~/partials/versions/load-move-backlinks', () => ({ loadMoveBacklinks: mocks.loadMoveBacklinks }));
vi.mock('~/partials/versions/load-move-subtree', () => ({ loadMoveSubtree: mocks.loadMoveSubtree }));
vi.mock('~/partials/versions/move-entity-deletions', () => ({ collectMoveDeletions: mocks.collectMoveDeletions }));
vi.mock('~/partials/versions/retarget-move-backlinks', () => ({ retargetMoveBacklinks: vi.fn() }));

function deferBacklinks() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const pending = new Promise<[]>((res, rej) => {
    resolve = () => res([]);
    reject = rej;
  });
  mocks.loadMoveBacklinks.mockImplementationOnce(() => pending);
  return { resolve, reject };
}

function renderList() {
  const onDone = vi.fn();
  render(
    <MoveEntityToSpace
      entityId={'entity-1' as EntityId}
      entityName="Entity"
      sourceSpaceId="space-source"
      setIsMovingEntity={vi.fn()}
      onDone={onDone}
    />
  );
  const [back] = screen.getAllByRole('button');
  return {
    onDone,
    back: back!,
    spaceA: screen.getByRole('button', { name: /Space A/ }),
    spaceB: screen.getByRole('button', { name: /Space B/ }),
  };
}

beforeEach(() => {
  mocks.push.mockReset();
  mocks.cloneEntityIntoSpace.mockReset();
  mocks.loadMoveBacklinks.mockReset().mockResolvedValue([]);
  mocks.loadMoveSubtree.mockReset().mockResolvedValue([]);
  mocks.collectMoveDeletions.mockReset().mockReturnValue({ values: [], relations: [] });
  mocks.deleteValues.mockReset();
  mocks.deleteRelations.mockReset();
});

afterEach(cleanup);

describe('the Move to list', () => {
  it('moves once when a space is clicked twice', async () => {
    const backlinks = deferBacklinks();
    const { onDone, spaceA } = renderList();

    fireEvent.click(spaceA);
    fireEvent.click(spaceA);
    await act(async () => backlinks.resolve());

    expect(mocks.loadMoveBacklinks).toHaveBeenCalledTimes(1);
    expect(mocks.cloneEntityIntoSpace).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('disables the list and marks the chosen space while the move runs', async () => {
    const backlinks = deferBacklinks();
    const { back, spaceA, spaceB } = renderList();

    fireEvent.click(spaceA);
    fireEvent.click(spaceB);

    expect(spaceA).toBeDisabled();
    expect(spaceB).toBeDisabled();
    expect(back).toBeDisabled();
    expect(spaceA).toHaveAttribute('aria-busy', 'true');
    expect(spaceA).toHaveTextContent('Moving…');
    expect(spaceB).not.toHaveTextContent('Moving…');

    await act(async () => backlinks.resolve());

    expect(mocks.cloneEntityIntoSpace).toHaveBeenCalledTimes(1);
    expect(mocks.cloneEntityIntoSpace.mock.calls[0]![2]).toBe('space-a');
  });

  it('lets a failed move be tried again', async () => {
    const backlinks = deferBacklinks();
    const { onDone, spaceA, spaceB } = renderList();

    fireEvent.click(spaceA);
    await act(async () => backlinks.reject(new Error('backlinks failed')));

    expect(spaceA).toBeEnabled();
    expect(spaceB).toBeEnabled();
    expect(spaceA).not.toHaveTextContent('Moving…');
    expect(mocks.cloneEntityIntoSpace).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(spaceA);
    });

    expect(mocks.loadMoveBacklinks).toHaveBeenCalledTimes(2);
    expect(mocks.cloneEntityIntoSpace).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('loads the subtree first, and hands it to every step of the move', async () => {
    const tab = { id: 'tab', values: [], relations: [] };
    mocks.loadMoveSubtree.mockResolvedValue([tab]);
    const { spaceA } = renderList();

    await act(async () => {
      fireEvent.click(spaceA);
    });

    expect(mocks.loadMoveSubtree.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.loadMoveBacklinks.mock.invocationCallOrder[0]!
    );
    expect(mocks.loadMoveBacklinks.mock.calls[0]![0].loaded).toEqual([tab]);
    expect(mocks.cloneEntityIntoSpace.mock.calls[0]![4]).toContain(tab);
    expect(mocks.collectMoveDeletions.mock.calls[0]![3]).toEqual([tab]);
  });

  it('writes nothing when the subtree fails to load', async () => {
    mocks.loadMoveSubtree.mockRejectedValue(new Error('network'));
    const { onDone, spaceA } = renderList();

    await act(async () => {
      fireEvent.click(spaceA);
    });

    expect(mocks.loadMoveBacklinks).not.toHaveBeenCalled();
    expect(mocks.cloneEntityIntoSpace).not.toHaveBeenCalled();
    expect(mocks.deleteValues).not.toHaveBeenCalled();
    expect(mocks.deleteRelations).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(spaceA).toBeEnabled();
  });
});

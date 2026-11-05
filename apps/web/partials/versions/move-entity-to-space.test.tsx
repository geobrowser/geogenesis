import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntityId } from '~/core/io/substream-schema';

import { MoveEntityToSpace } from './move-entity-to-space';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  moveEntity: vi.fn(),
  storage: { name: 'storage' },
  store: { name: 'store' },
  stream: { name: 'stream' },
  cache: { name: 'cache' },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => mocks.cache,
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: null }) }));
vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: undefined }) }));
vi.mock('~/core/hooks/use-spaces-where-member', () => ({
  useSpacesWhereMember: () => [
    { id: 'space-a', entity: { name: 'Space A', image: '' } },
    { id: 'space-b', entity: { name: 'Space B', image: '' } },
  ],
}));
vi.mock('~/core/sync/use-mutate', () => ({ useMutate: () => ({ storage: mocks.storage }) }));
vi.mock('~/core/sync/use-sync-engine', () => ({
  useSyncEngine: () => ({ store: mocks.store, stream: mocks.stream }),
}));
vi.mock('~/design-system/geo-image', () => ({ GeoImage: () => null }));
vi.mock('~/partials/versions/move-entity', () => ({ moveEntity: mocks.moveEntity }));

/** Holds the move open, so it is in flight until the test settles it. */
function deferMove() {
  let settle!: (moved: boolean) => void;
  const pending = new Promise<boolean>(resolve => {
    settle = resolve;
  });
  mocks.moveEntity.mockImplementationOnce(() => pending);
  return { settle };
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
  mocks.moveEntity.mockReset().mockResolvedValue(true);
});

afterEach(cleanup);

describe('the Move to list', () => {
  it('moves once when a space is clicked twice', async () => {
    const move = deferMove();
    const { onDone, spaceA } = renderList();

    fireEvent.click(spaceA);
    fireEvent.click(spaceA);
    await act(async () => move.settle(true));

    expect(mocks.moveEntity).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('disables the list and marks the chosen space while the move runs', async () => {
    const move = deferMove();
    const { back, spaceA, spaceB } = renderList();

    fireEvent.click(spaceA);
    fireEvent.click(spaceB);

    expect(spaceA).toBeDisabled();
    expect(spaceB).toBeDisabled();
    expect(back).toBeDisabled();
    expect(spaceA).toHaveAttribute('aria-busy', 'true');
    expect(spaceA).toHaveTextContent('Moving…');
    expect(spaceB).not.toHaveTextContent('Moving…');

    await act(async () => move.settle(true));

    expect(mocks.moveEntity).toHaveBeenCalledTimes(1);
    expect(mocks.moveEntity).toHaveBeenCalledWith({
      entityId: 'entity-1',
      sourceSpaceId: 'space-source',
      targetSpaceId: 'space-a',
      storage: mocks.storage,
      store: mocks.store,
      cache: mocks.cache,
      stream: mocks.stream,
    });
  });

  it('lets a failed move be tried again', async () => {
    const move = deferMove();
    const { onDone, spaceA, spaceB } = renderList();

    fireEvent.click(spaceA);
    await act(async () => move.settle(false));

    expect(spaceA).toBeEnabled();
    expect(spaceB).toBeEnabled();
    expect(spaceA).not.toHaveTextContent('Moving…');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(spaceA);
    });

    expect(mocks.moveEntity).toHaveBeenCalledTimes(2);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

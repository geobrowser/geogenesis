import { beforeEach, describe, expect, it, vi } from 'vitest';

import { moveEntity } from './move-entity';

const mocks = vi.hoisted(() => ({
  cloneEntityIntoSpace: vi.fn(),
  collectHydrationTargetIds: vi.fn(),
  syncMany: vi.fn(),
  loadMoveBacklinks: vi.fn(),
  loadMoveSubtree: vi.fn(),
  collectMoveDeletions: vi.fn(),
  retargetMoveBacklinks: vi.fn(),
  deleteValues: vi.fn(),
  deleteRelations: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('~/core/sync/orm', () => ({ E: { syncMany: mocks.syncMany } }));
vi.mock('./clone-entity-into-space', () => ({
  cloneEntityIntoSpace: mocks.cloneEntityIntoSpace,
  collectHydrationTargetIds: mocks.collectHydrationTargetIds,
}));
vi.mock('./load-move-backlinks', () => ({ loadMoveBacklinks: mocks.loadMoveBacklinks }));
vi.mock('./load-move-subtree', () => ({ loadMoveSubtree: mocks.loadMoveSubtree }));
vi.mock('./move-entity-deletions', () => ({ collectMoveDeletions: mocks.collectMoveDeletions }));
vi.mock('./retarget-move-backlinks', () => ({ retargetMoveBacklinks: mocks.retargetMoveBacklinks }));

const ENTITY = 'entity-moved';
const SOURCE = 'space-source';
const TARGET = 'space-target';

const storage = {
  values: { deleteMany: mocks.deleteValues },
  relations: { deleteMany: mocks.deleteRelations },
} as any;

const run = (targetSpaceId = TARGET) =>
  moveEntity({
    entityId: ENTITY,
    sourceSpaceId: SOURCE,
    targetSpaceId,
    storage,
    store: {} as any,
    cache: {} as any,
    stream: { emit: mocks.emit } as any,
  });

const expectNothingWritten = () => {
  expect(mocks.cloneEntityIntoSpace).not.toHaveBeenCalled();
  expect(mocks.deleteValues).not.toHaveBeenCalled();
  expect(mocks.deleteRelations).not.toHaveBeenCalled();
  expect(mocks.retargetMoveBacklinks).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.collectHydrationTargetIds.mockReturnValue([]);
  mocks.loadMoveSubtree.mockResolvedValue([]);
  mocks.loadMoveBacklinks.mockResolvedValue([]);
  mocks.collectMoveDeletions.mockReturnValue({ values: [], relations: [] });
});

describe('moveEntity', () => {
  it('loads the subtree first, and hands it to every step of the move', async () => {
    const linkBack = { id: 'tab-links-back' };
    const tab = { id: 'tab', values: [], relations: [linkBack] };
    const image = { id: 'an-image', values: [], relations: [] };
    const backlink = { id: 'backlink' };
    mocks.loadMoveSubtree.mockResolvedValue([tab]);
    mocks.collectHydrationTargetIds.mockReturnValue(['an-image']);
    mocks.syncMany.mockResolvedValue({ merged: [image], remote: [image] });
    mocks.loadMoveBacklinks.mockResolvedValue([backlink]);

    expect(await run()).toBe(true);

    expect(mocks.loadMoveSubtree.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.loadMoveBacklinks.mock.invocationCallOrder[0]!
    );
    expect(mocks.collectHydrationTargetIds).toHaveBeenCalledWith(ENTITY, SOURCE, [tab]);
    expect(mocks.loadMoveBacklinks.mock.calls[0]![0].loaded).toEqual([tab]);
    expect(mocks.cloneEntityIntoSpace).toHaveBeenCalledWith(ENTITY, SOURCE, TARGET, storage, [tab, image]);
    expect(mocks.collectMoveDeletions).toHaveBeenCalledWith(ENTITY, SOURCE, [backlink], [tab]);
    expect(mocks.retargetMoveBacklinks).toHaveBeenCalledWith(ENTITY, SOURCE, TARGET, storage, [backlink, linkBack]);
  });

  it('writes nothing when the subtree fails to load', async () => {
    mocks.loadMoveSubtree.mockRejectedValue(new Error('network'));

    expect(await run()).toBe(false);
    expect(mocks.loadMoveBacklinks).not.toHaveBeenCalled();
    expectNothingWritten();
  });

  it('writes nothing when the media fails to load', async () => {
    mocks.collectHydrationTargetIds.mockReturnValue(['an-image']);
    mocks.syncMany.mockRejectedValue(new Error('network'));

    expect(await run()).toBe(false);
    expectNothingWritten();
  });

  it('writes nothing when the backlinks fail to load', async () => {
    mocks.loadMoveBacklinks.mockRejectedValue(new Error('network'));

    expect(await run()).toBe(false);
    expectNothingWritten();
  });

  it('does nothing when the target is the source', async () => {
    expect(await run(SOURCE)).toBe(false);
    expect(mocks.loadMoveSubtree).not.toHaveBeenCalled();
    expectNothingWritten();
  });
});

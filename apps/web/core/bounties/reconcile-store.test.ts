import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Relation } from '~/core/types';

import { reconcileDeletedRelations } from './reconcile-store';

const mocks = vi.hoisted(() => ({
  deleteMany: vi.fn(),
  setAsPublished: vi.fn(),
}));

vi.mock('~/core/sync/use-mutate', () => ({
  storage: {
    relations: { deleteMany: mocks.deleteMany },
    setAsPublished: mocks.setAsPublished,
  },
}));

const rel = (id: string, isDeleted?: boolean) => ({ id, isDeleted }) as unknown as Relation;

beforeEach(() => {
  mocks.deleteMany.mockReset();
  mocks.setAsPublished.mockReset();
});

describe('reconcileDeletedRelations', () => {
  it('marks only the tombstoned relations deleted-and-published in the store', () => {
    reconcileDeletedRelations([rel('keep'), rel('gone-1', true), rel('gone-2', true)]);
    expect(mocks.deleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.deleteMany.mock.calls[0][0].map((r: Relation) => r.id)).toEqual(['gone-1', 'gone-2']);
    expect(mocks.setAsPublished).toHaveBeenCalledWith([], ['gone-1', 'gone-2']);
  });

  it('is a no-op when nothing was deleted', () => {
    reconcileDeletedRelations([rel('a'), rel('b')]);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.setAsPublished).not.toHaveBeenCalled();
  });
});

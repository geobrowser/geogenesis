import { describe, expect, it } from 'vitest';

import type { Entity } from '../types';
import { E } from './orm';

function remoteEntity(): Entity {
  return {
    id: 'entity-1',
    name: 'Published claim',
    description: null,
    spaces: ['space-1'],
    types: [],
    values: [],
    relations: [],
    createdAt: '1784778383',
    updatedAt: '1785350349',
  } as Entity;
}

function storeWith(local: Entity | null) {
  return {
    getEntity: () => local,
  } as unknown as Parameters<typeof E.merge>[0]['store'];
}

describe('E.merge timestamps', () => {
  // Rebuilding the entity without these made anything carrying a local edit
  // look as though it had never been created: feed rows lost their age for as
  // long as an edit sat in review, and callers couldn't tell an edited
  // published entity from a draft that has no indexed record at all.
  it('carries the indexed timestamps through a local edit', () => {
    const local = { ...remoteEntity(), createdAt: undefined, updatedAt: undefined, name: 'Locally renamed' };

    const merged = E.merge({ id: 'entity-1', store: storeWith(local), mergeWith: remoteEntity() });

    expect(merged?.createdAt).toBe('1784778383');
    expect(merged?.updatedAt).toBe('1785350349');
  });

  it('leaves a local-only entity without timestamps', () => {
    const local = { ...remoteEntity(), createdAt: undefined, updatedAt: undefined };

    const merged = E.merge({ id: 'entity-1', store: storeWith(local), mergeWith: null });

    expect(merged?.createdAt).toBeUndefined();
    expect(merged?.updatedAt).toBeUndefined();
  });
});

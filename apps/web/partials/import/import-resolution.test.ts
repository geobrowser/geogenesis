import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveRelationEntities, resolveTypesForRows } from './import-resolution';

const getResultsMock = vi.fn();

vi.mock('~/core/io/queries', () => ({
  getResults: (...args: unknown[]) => getResultsMock(...args),
}));

describe('import resolution helpers', () => {
  beforeEach(() => {
    getResultsMock.mockReset();
  });

  it('resolves relation entities by exact match', async () => {
    getResultsMock.mockImplementation(() =>
      Effect.succeed([{ id: 'entity-1', name: 'Alice' }])
    );

    const result = await resolveRelationEntities({
      relationProperties: [
        {
          propertyId: 'prop-1',
          property: {
            id: 'prop-1',
            name: 'Founders',
            dataType: 'RELATION',
            relationValueTypes: [{ id: 'type-person', name: 'Person' }],
          },
          typeIds: ['type-person'],
          uniqueCellValues: new Set(['Alice']),
        },
      ],
      spaceId: 'space-1',
      guard: { isCurrent: () => true },
    });

    expect(result.aborted).toBe(false);
    expect(result.bootstrappedValues).toHaveLength(0);
    expect(result.bootstrappedRelations).toHaveLength(0);
    expect(result.resolvedEntities.get('prop-1::Alice')).toEqual({
      id: 'entity-1',
      name: 'Alice',
      status: 'found',
    });
  });

  it('creates bootstrap type relation with distinct relation entityId', async () => {
    getResultsMock.mockImplementation(() => Effect.succeed([]));

    const result = await resolveRelationEntities({
      relationProperties: [
        {
          propertyId: 'prop-1',
          property: {
            id: 'prop-1',
            name: 'Founders',
            dataType: 'RELATION',
            relationValueTypes: [{ id: 'type-person', name: 'Person' }],
          },
          typeIds: ['type-person'],
          uniqueCellValues: new Set(['New Person']),
        },
      ],
      spaceId: 'space-1',
      guard: { isCurrent: () => true },
    });

    expect(result.bootstrappedRelations).toHaveLength(1);
    const rel = result.bootstrappedRelations[0];
    expect(rel.entityId).toBeTruthy();
    expect(rel.entityId).not.toEqual(rel.fromEntity.id);
  });

  it('resolves types by exact match', async () => {
    getResultsMock.mockImplementation(({ query }: { query: string }) =>
      Effect.succeed([{ id: `${query}-id`, name: query }])
    );

    const result = await resolveTypesForRows({
      dataRows: [['Project A', 'Protocol'], ['Project B', 'Company']],
      typesColumnIndex: 1,
      spaceId: 'space-1',
      guard: { isCurrent: () => true },
    });

    expect(result.aborted).toBe(false);
    expect(result.resolvedTypes.get('Protocol')).toEqual({ id: 'Protocol-id', name: 'Protocol' });
    expect(result.resolvedTypes.get('Company')).toEqual({ id: 'Company-id', name: 'Company' });
  });
});

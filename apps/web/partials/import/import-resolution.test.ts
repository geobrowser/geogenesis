import { SystemIds } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ID } from '~/core/id';

import { resolveRelationEntities, resolveRowsByNameAndType, resolveTypesForRows } from './import-resolution';

const getNameValuesBatchMock = vi.fn();
const getEntityTiebreakerBatchMock = vi.fn();

vi.mock('~/core/io/queries', () => ({
  getNameValuesBatch: (...args: unknown[]) => getNameValuesBatchMock(...args),
  getEntityTiebreakerBatch: (...args: unknown[]) => getEntityTiebreakerBatchMock(...args),
}));

/** Helper: create a value row matching the NameValueMatch shape. */
function valueRow(text: string, entityId: string, opts?: { spaceId?: string; typeIds?: string[]; backlinks?: number; relations?: number }) {
  return {
    id: `val-${entityId}-${text}`,
    text,
    spaceId: opts?.spaceId ?? 'space-1',
    entity: {
      id: entityId,
      name: text,
      typeIds: opts?.typeIds ?? [],
      backlinks: { totalCount: opts?.backlinks ?? 0 },
      relations: { totalCount: opts?.relations ?? 0 },
    },
  };
}

function makeTiebreakerData(
  id: string,
  overrides: { backlinksCount?: number; relationsCount?: number; valuesCount?: number; createdAt?: string } = {}
) {
  return {
    id,
    backlinksCount: overrides.backlinksCount ?? 0,
    relationsCount: overrides.relationsCount ?? 0,
    valuesCount: overrides.valuesCount ?? 0,
    createdAt: overrides.createdAt ?? '2025-01-01T00:00:00Z',
  };
}

describe('import resolution helpers', () => {
  beforeEach(() => {
    getNameValuesBatchMock.mockReset();
    getEntityTiebreakerBatchMock.mockReset();
    // Default: no values found
    getNameValuesBatchMock.mockImplementation(() => Effect.succeed([]));
    getEntityTiebreakerBatchMock.mockImplementation(() => Effect.succeed([]));
  });

  it('auto-creates row entities when no match exists', async () => {
    const createIdSpy = vi.spyOn(ID, 'createEntityId').mockReturnValue('created-row-id');

    const result = await resolveRowsByNameAndType({
      dataRows: [['Brand New']],
      nameColIdx: 0,
      selectedType: { id: 'type-project', name: 'Project' },
      typesColumnIndex: undefined,
      resolvedTypes: new Map(),
      guard: { isCurrent: () => true },
    });

    expect(result.aborted).toBe(false);
    expect(result.unresolvedRowCount).toBe(0);
    expect(result.resolvedRows.get(0)).toEqual({ entityId: 'created-row-id', name: 'Brand New' });

    createIdSpy.mockRestore();
  });

  it('resolves relation entities by exact match via values', async () => {
    getNameValuesBatchMock.mockImplementation(() =>
      Effect.succeed([
        valueRow('Alice', 'entity-1', { typeIds: ['type-person'] }),
      ])
    );

    const result = await resolveRelationEntities({
      relationProperties: [
        {
          propertyId: 'prop-1',
          property: { id: 'prop-1', name: 'Founders', dataType: 'RELATION', relationValueTypes: [{ id: 'type-person', name: 'Person' }] },
          typeIds: ['type-person'],
          uniqueCellValues: new Set(['Alice']),
        },
      ],
      guard: { isCurrent: () => true },
    });

    expect(result.aborted).toBe(false);
    expect(result.unresolvedCount).toBe(0);
    expect(result.resolvedEntities.get('prop-1::Alice')).toEqual({
      id: 'entity-1',
      name: 'Alice',
      status: 'found',
    });
  });

  it('resolves relation tie using connectedness when backlinks differ', async () => {
    getNameValuesBatchMock.mockImplementation(() =>
      Effect.succeed([
        valueRow('Alice', 'entity-1', { spaceId: 'space-1', typeIds: ['type-person'], backlinks: 5, relations: 0 }),
        valueRow('Alice', 'entity-2', { spaceId: 'space-1', typeIds: ['type-person'], backlinks: 2, relations: 0 }),
      ])
    );

    const result = await resolveRelationEntities({
      relationProperties: [
        {
          propertyId: 'prop-1',
          property: { id: 'prop-1', name: 'Founders', dataType: 'RELATION', relationValueTypes: [{ id: 'type-person', name: 'Person' }] },
          typeIds: ['type-person'],
          uniqueCellValues: new Set(['Alice']),
        },
      ],
      guard: { isCurrent: () => true },
    });

    expect(result.unresolvedCount).toBe(0);
    expect(result.resolvedEntities.get('prop-1::Alice')).toEqual({
      id: 'entity-1',
      name: 'Alice',
      status: 'found',
    });
  });

  it('breaks connectedness tie using deep tiebreaker (backlinks count)', async () => {
    getNameValuesBatchMock.mockImplementation(() =>
      Effect.succeed([
        valueRow('Alice', 'entity-1', { spaceId: 'space-1', typeIds: ['type-person'], backlinks: 3, relations: 2 }),
        valueRow('Alice', 'entity-2', { spaceId: 'space-1', typeIds: ['type-person'], backlinks: 3, relations: 2 }),
      ])
    );
    getEntityTiebreakerBatchMock.mockImplementation(() =>
      Effect.succeed([
        makeTiebreakerData('entity-1', { backlinksCount: 3, relationsCount: 2 }),
        makeTiebreakerData('entity-2', { backlinksCount: 10, relationsCount: 2 }),
      ])
    );

    const result = await resolveRelationEntities({
      relationProperties: [
        {
          propertyId: 'prop-1',
          property: { id: 'prop-1', name: 'Founders', dataType: 'RELATION', relationValueTypes: [{ id: 'type-person', name: 'Person' }] },
          typeIds: ['type-person'],
          uniqueCellValues: new Set(['Alice']),
        },
      ],
      guard: { isCurrent: () => true },
    });

    expect(result.unresolvedCount).toBe(0);
    expect(result.resolvedEntities.get('prop-1::Alice')).toEqual({
      id: 'entity-2',
      name: 'Alice',
      status: 'found',
    });
  });

  it('breaks deep tiebreaker by outgoing relations count', async () => {
    getNameValuesBatchMock.mockImplementation(() =>
      Effect.succeed([
        valueRow('Alice', 'entity-1', { spaceId: 'space-1', typeIds: ['type-person'], backlinks: 5, relations: 5 }),
        valueRow('Alice', 'entity-2', { spaceId: 'space-1', typeIds: ['type-person'], backlinks: 5, relations: 5 }),
      ])
    );
    getEntityTiebreakerBatchMock.mockImplementation(() =>
      Effect.succeed([
        makeTiebreakerData('entity-1', { backlinksCount: 5, relationsCount: 2 }),
        makeTiebreakerData('entity-2', { backlinksCount: 5, relationsCount: 7 }),
      ])
    );

    const result = await resolveRelationEntities({
      relationProperties: [
        {
          propertyId: 'prop-1',
          property: { id: 'prop-1', name: 'Founders', dataType: 'RELATION', relationValueTypes: [{ id: 'type-person', name: 'Person' }] },
          typeIds: ['type-person'],
          uniqueCellValues: new Set(['Alice']),
        },
      ],
      guard: { isCurrent: () => true },
    });

    expect(result.unresolvedCount).toBe(0);
    expect(result.resolvedEntities.get('prop-1::Alice')).toEqual({
      id: 'entity-2',
      name: 'Alice',
      status: 'found',
    });
  });

  it('breaks deep tiebreaker by value properties count', async () => {
    getNameValuesBatchMock.mockImplementation(() =>
      Effect.succeed([
        valueRow('Alice', 'entity-1', { spaceId: 'space-1', typeIds: ['type-person'], backlinks: 0, relations: 0 }),
        valueRow('Alice', 'entity-2', { spaceId: 'space-1', typeIds: ['type-person'], backlinks: 0, relations: 0 }),
      ])
    );
    getEntityTiebreakerBatchMock.mockImplementation(() =>
      Effect.succeed([
        makeTiebreakerData('entity-1', { backlinksCount: 0, relationsCount: 0, valuesCount: 10 }),
        makeTiebreakerData('entity-2', { backlinksCount: 0, relationsCount: 0, valuesCount: 2 }),
      ])
    );

    const result = await resolveRelationEntities({
      relationProperties: [
        {
          propertyId: 'prop-1',
          property: { id: 'prop-1', name: 'Founders', dataType: 'RELATION', relationValueTypes: [{ id: 'type-person', name: 'Person' }] },
          typeIds: ['type-person'],
          uniqueCellValues: new Set(['Alice']),
        },
      ],
      guard: { isCurrent: () => true },
    });

    expect(result.unresolvedCount).toBe(0);
    expect(result.resolvedEntities.get('prop-1::Alice')).toEqual({
      id: 'entity-1',
      name: 'Alice',
      status: 'found',
    });
  });

  it('breaks deep tiebreaker by earlier creation date', async () => {
    getNameValuesBatchMock.mockImplementation(() =>
      Effect.succeed([
        valueRow('Alice', 'entity-1', { spaceId: 'space-1', typeIds: ['type-person'], backlinks: 0, relations: 0 }),
        valueRow('Alice', 'entity-2', { spaceId: 'space-1', typeIds: ['type-person'], backlinks: 0, relations: 0 }),
      ])
    );
    getEntityTiebreakerBatchMock.mockImplementation(() =>
      Effect.succeed([
        makeTiebreakerData('entity-1', { createdAt: '2025-06-01T00:00:00Z' }),
        makeTiebreakerData('entity-2', { createdAt: '2024-01-01T00:00:00Z' }),
      ])
    );

    const result = await resolveRelationEntities({
      relationProperties: [
        {
          propertyId: 'prop-1',
          property: { id: 'prop-1', name: 'Founders', dataType: 'RELATION', relationValueTypes: [{ id: 'type-person', name: 'Person' }] },
          typeIds: ['type-person'],
          uniqueCellValues: new Set(['Alice']),
        },
      ],
      guard: { isCurrent: () => true },
    });

    expect(result.unresolvedCount).toBe(0);
    expect(result.resolvedEntities.get('prop-1::Alice')).toEqual({
      id: 'entity-2',
      name: 'Alice',
      status: 'found',
    });
  });

  it('resolves deterministically when all tiebreaker data is identical', async () => {
    getNameValuesBatchMock.mockImplementation(() =>
      Effect.succeed([
        valueRow('Alice', 'entity-1', { spaceId: 'space-1', typeIds: ['type-person'] }),
        valueRow('Alice', 'entity-2', { spaceId: 'space-1', typeIds: ['type-person'] }),
      ])
    );
    getEntityTiebreakerBatchMock.mockImplementation(() =>
      Effect.succeed([
        makeTiebreakerData('entity-1'),
        makeTiebreakerData('entity-2'),
      ])
    );

    const result = await resolveRelationEntities({
      relationProperties: [
        {
          propertyId: 'prop-1',
          property: { id: 'prop-1', name: 'Founders', dataType: 'RELATION', relationValueTypes: [{ id: 'type-person', name: 'Person' }] },
          typeIds: ['type-person'],
          uniqueCellValues: new Set(['Alice']),
        },
      ],
      guard: { isCurrent: () => true },
    });

    // Should resolve (not be unresolved) — picks one deterministically
    expect(result.unresolvedCount).toBe(0);
    expect(result.resolvedEntities.get('prop-1::Alice')).toMatchObject({
      status: 'found',
      name: 'Alice',
    });
  });

  it('falls back to first candidate when tiebreaker query fails', async () => {
    getNameValuesBatchMock.mockImplementation(() =>
      Effect.succeed([
        valueRow('Alice', 'entity-1', { spaceId: 'space-1', typeIds: ['type-person'] }),
        valueRow('Alice', 'entity-2', { spaceId: 'space-1', typeIds: ['type-person'] }),
      ])
    );
    getEntityTiebreakerBatchMock.mockImplementation(() => Effect.fail(new Error('network error')));

    const result = await resolveRelationEntities({
      relationProperties: [
        {
          propertyId: 'prop-1',
          property: { id: 'prop-1', name: 'Founders', dataType: 'RELATION', relationValueTypes: [{ id: 'type-person', name: 'Person' }] },
          typeIds: ['type-person'],
          uniqueCellValues: new Set(['Alice']),
        },
      ],
      guard: { isCurrent: () => true },
    });

    expect(result.unresolvedCount).toBe(0);
    expect(result.resolvedEntities.get('prop-1::Alice')).toMatchObject({
      status: 'found',
      name: 'Alice',
    });
  });

  it('auto-creates relation entities when no type constraints', async () => {
    const createIdSpy = vi.spyOn(ID, 'createEntityId').mockReturnValue('created-relation-id');

    const result = await resolveRelationEntities({
      relationProperties: [
        {
          propertyId: 'prop-1',
          property: { id: 'prop-1', name: 'Related', dataType: 'RELATION', relationValueTypes: [] },
          typeIds: [],
          uniqueCellValues: new Set(['New Entity']),
        },
      ],
      guard: { isCurrent: () => true },
    });

    expect(result.unresolvedCount).toBe(0);
    expect(result.resolvedEntities.get('prop-1::New Entity')).toEqual({
      id: 'created-relation-id',
      name: 'New Entity',
      status: 'created',
      typeId: undefined,
      typeName: undefined,
    });

    createIdSpy.mockRestore();
  });

  it('auto-creates relation entities when no exact match', async () => {
    const result = await resolveRelationEntities({
      relationProperties: [
        {
          propertyId: 'prop-1',
          property: { id: 'prop-1', name: 'Founders', dataType: 'RELATION', relationValueTypes: [{ id: 'type-person', name: 'Person' }] },
          typeIds: ['type-person'],
          uniqueCellValues: new Set(['New Person']),
        },
      ],
      guard: { isCurrent: () => true },
    });

    expect(result.unresolvedCount).toBe(0);
    expect(result.resolvedEntities.get('prop-1::New Person')).toMatchObject({
      name: 'New Person',
      status: 'created',
      typeId: 'type-person',
      typeName: 'Person',
    });
  });

  it('resolves types by exact match', async () => {
    getNameValuesBatchMock.mockImplementation(({ names }: { names: string[] }) =>
      Effect.succeed(
        names.map(name => valueRow(name, `${name}-id`, { typeIds: [SystemIds.SCHEMA_TYPE] }))
      )
    );

    const result = await resolveTypesForRows({
      dataRows: [['Project A', 'Protocol'], ['Project B', 'Company']],
      typesColumnIndex: 1,
      guard: { isCurrent: () => true },
    });

    expect(result.aborted).toBe(false);
    expect(result.resolvedTypes.get('Protocol')).toEqual({ id: 'Protocol-id', name: 'Protocol' });
    expect(result.resolvedTypes.get('Company')).toEqual({ id: 'Company-id', name: 'Company' });
  });

  it('auto-resolves to top-ranked space when multiple matches exist', async () => {
    getNameValuesBatchMock.mockImplementation(() =>
      Effect.succeed([
        valueRow('Alpha', 'entity-current', { spaceId: 'space-1', typeIds: ['type-project'] }),
        valueRow('Alpha', 'entity-root', { spaceId: 'a19c345ab9866679b001d7d2138d88a1', typeIds: ['type-project'] }),
      ])
    );

    const result = await resolveRowsByNameAndType({
      dataRows: [['Alpha']],
      nameColIdx: 0,
      selectedType: { id: 'type-project', name: 'Project' },
      typesColumnIndex: undefined,
      resolvedTypes: new Map(),
      guard: { isCurrent: () => true },
    });

    expect(result.aborted).toBe(false);
    expect(result.unresolvedRowCount).toBe(0);
    expect(result.resolvedRows.get(0)).toEqual({ entityId: 'entity-root', name: 'Alpha' });
  });

  it('resolves rows via tiebreaker when multiple exact matches tie at the same space rank', async () => {
    getNameValuesBatchMock.mockImplementation(() =>
      Effect.succeed([
        valueRow('Alpha', 'entity-a', { spaceId: 'space-x', typeIds: ['type-project'] }),
        valueRow('Alpha', 'entity-b', { spaceId: 'space-y', typeIds: ['type-project'] }),
      ])
    );
    getEntityTiebreakerBatchMock.mockImplementation(() =>
      Effect.succeed([
        makeTiebreakerData('entity-a', { backlinksCount: 1 }),
        makeTiebreakerData('entity-b', { backlinksCount: 5 }),
      ])
    );

    const result = await resolveRowsByNameAndType({
      dataRows: [['Alpha']],
      nameColIdx: 0,
      selectedType: { id: 'type-project', name: 'Project' },
      typesColumnIndex: undefined,
      resolvedTypes: new Map(),
      guard: { isCurrent: () => true },
    });

    expect(result.aborted).toBe(false);
    expect(result.unresolvedRowCount).toBe(0);
    expect(result.resolvedRows.get(0)).toEqual({ entityId: 'entity-b', name: 'Alpha' });
  });

  it('resolves row when exactly one match exists', async () => {
    getNameValuesBatchMock.mockImplementation(() =>
      Effect.succeed([
        valueRow('Alpha', 'entity-only', { typeIds: ['type-project'] }),
      ])
    );

    const result = await resolveRowsByNameAndType({
      dataRows: [['Alpha']],
      nameColIdx: 0,
      selectedType: { id: 'type-project', name: 'Project' },
      typesColumnIndex: undefined,
      resolvedTypes: new Map(),
      guard: { isCurrent: () => true },
    });

    expect(result.unresolvedRowCount).toBe(0);
    expect(result.resolvedRows.get(0)?.entityId).toBe('entity-only');
  });
});

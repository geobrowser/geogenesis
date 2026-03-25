import { SystemIds } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ID } from '~/core/id';

import { resolveRelationEntities, resolveRowsByNameAndType, resolveTypesForRows } from './import-resolution';

const getNameValuesBatchMock = vi.fn();

vi.mock('~/core/io/queries', () => ({
  getNameValuesBatch: (...args: unknown[]) => getNameValuesBatchMock(...args),
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

describe('import resolution helpers', () => {
  beforeEach(() => {
    getNameValuesBatchMock.mockReset();
    // Default: no values found
    getNameValuesBatchMock.mockImplementation(() => Effect.succeed([]));
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

  it('marks relation entities unresolved when multiple exact matches tie', async () => {
    getNameValuesBatchMock.mockImplementation(() =>
      Effect.succeed([
        valueRow('Alice', 'entity-1', { spaceId: 'space-1', typeIds: ['type-person'] }),
        valueRow('Alice', 'entity-2', { spaceId: 'space-1', typeIds: ['type-person'] }),
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

    expect(result.unresolvedCount).toBe(1);
    expect(result.resolvedEntities.get('prop-1::Alice')).toEqual({ status: 'ambiguous' });
  });

  it('breaks ties using connectedness (backlinks + relations)', async () => {
    getNameValuesBatchMock.mockImplementation(() =>
      Effect.succeed([
        valueRow('Alice', 'entity-1', { spaceId: 'space-1', typeIds: ['type-person'], backlinks: 5, relations: 3 }),
        valueRow('Alice', 'entity-2', { spaceId: 'space-1', typeIds: ['type-person'], backlinks: 20, relations: 10 }),
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

  it('leaves row unresolved when multiple equally-ranked matches exist', async () => {
    getNameValuesBatchMock.mockImplementation(() =>
      Effect.succeed([
        valueRow('Alpha', 'entity-a', {
          spaceId: 'space-1',
          typeIds: ['type-project'],
          backlinks: 2,
          relations: 3,
        }),
        valueRow('Alpha', 'entity-b', {
          spaceId: 'space-1',
          typeIds: ['type-project'],
          backlinks: 2,
          relations: 3,
        }),
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
    expect(result.unresolvedRowCount).toBe(1);
    expect(result.resolvedRows.get(0)).toBeUndefined();
  });
});

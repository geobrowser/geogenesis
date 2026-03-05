import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ID } from '~/core/id';

import { resolveRelationEntities, resolveRowsByNameAndType, resolveTypesForRows } from './import-resolution';

const getResultsMock = vi.fn();
const getRelationsByToEntityIdsMock = vi.fn();

vi.mock('~/core/io/queries', () => ({
  getResults: (...args: unknown[]) => getResultsMock(...args),
  getRelationsByToEntityIds: (...args: unknown[]) => getRelationsByToEntityIdsMock(...args),
}));

describe('import resolution helpers', () => {
  beforeEach(() => {
    getResultsMock.mockReset();
    getRelationsByToEntityIdsMock.mockReset();
    getRelationsByToEntityIdsMock.mockImplementation(() => Effect.succeed([]));
  });

  it('auto-creates row entities when exact name+type match does not exist', async () => {
    const createIdSpy = vi.spyOn(ID, 'createEntityId').mockReturnValue('created-row-id');
    getResultsMock.mockImplementation(() => Effect.succeed([]));

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

  it('resolves relation entities by exact match', async () => {
    getResultsMock.mockImplementation(() =>
      Effect.succeed([
        {
          id: 'entity-1',
          name: 'Alice',
          description: null,
          types: [{ id: 'type-person', name: 'Person' }],
          spaces: [{ id: 'space-1', name: null, description: null, image: '', relations: [], spaceId: 'space-1', spaces: ['space-1'], values: [], types: [] }],
        },
      ])
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
    getResultsMock.mockImplementation(() =>
      Effect.succeed([
        {
          id: 'entity-1',
          name: 'Alice',
          description: null,
          types: [{ id: 'type-person', name: 'Person' }],
          spaces: [{ id: 'space-1', name: null, description: null, image: '', relations: [], spaceId: 'space-1', spaces: ['space-1'], values: [], types: [] }],
        },
        {
          id: 'entity-2',
          name: 'Alice',
          description: null,
          types: [{ id: 'type-person', name: 'Person' }],
          spaces: [{ id: 'space-1', name: null, description: null, image: '', relations: [], spaceId: 'space-1', spaces: ['space-1'], values: [], types: [] }],
        },
      ])
    );
    getRelationsByToEntityIdsMock.mockImplementation(() => Effect.succeed([]));

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
      guard: { isCurrent: () => true },
    });

    expect(result.unresolvedCount).toBe(1);
    expect(result.resolvedEntities.get('prop-1::Alice')).toEqual({ status: 'ambiguous' });
  });

  it('keeps relation target unresolved when multiple exact matches exist even with backlink skew', async () => {
    getResultsMock.mockImplementation(() =>
      Effect.succeed([
        {
          id: 'entity-1',
          name: 'Alice',
          description: null,
          types: [{ id: 'type-person', name: 'Person' }],
          spaces: [{ id: 'space-1', name: null, description: null, image: '', relations: [], spaceId: 'space-1', spaces: ['space-1'], values: [], types: [] }],
        },
        {
          id: 'entity-2',
          name: 'Alice',
          description: null,
          types: [{ id: 'type-person', name: 'Person' }],
          spaces: [{ id: 'space-2', name: null, description: null, image: '', relations: [], spaceId: 'space-2', spaces: ['space-2'], values: [], types: [] }],
        },
      ])
    );
    getRelationsByToEntityIdsMock.mockImplementation(() =>
      Effect.succeed([{ toEntityId: 'entity-1' }, { toEntityId: 'entity-1' }])
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
      guard: { isCurrent: () => true },
    });

    expect(result.unresolvedCount).toBe(1);
    expect(result.resolvedEntities.get('prop-1::Alice')).toEqual({ status: 'ambiguous' });
  });

  it('auto-creates relation entities when relation property has no type constraints', async () => {
    const createIdSpy = vi.spyOn(ID, 'createEntityId').mockReturnValue('created-relation-id');

    const result = await resolveRelationEntities({
      relationProperties: [
        {
          propertyId: 'prop-1',
          property: {
            id: 'prop-1',
            name: 'Related',
            dataType: 'RELATION',
            relationValueTypes: [],
          },
          typeIds: [],
          uniqueCellValues: new Set(['New Relation Entity']),
        },
      ],
      guard: { isCurrent: () => true },
    });

    expect(result.unresolvedCount).toBe(0);
    expect(result.resolvedEntities.get('prop-1::New Relation Entity')).toEqual({
      id: 'created-relation-id',
      name: 'New Relation Entity',
      status: 'created',
    });

    createIdSpy.mockRestore();
  });

  it('auto-creates relation entities when there is no exact match', async () => {
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
      guard: { isCurrent: () => true },
    });

    expect(result.unresolvedCount).toBe(0);
    expect(result.resolvedEntities.get('prop-1::New Person')).toMatchObject({
      name: 'New Person',
      status: 'created',
    });
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

  it('resolves rows by exact name + type using SPACE_RANK priority', async () => {
    getResultsMock.mockImplementation(() =>
      Effect.succeed([
        {
          id: 'entity-current',
          name: 'Alpha',
          description: null,
          types: [{ id: 'type-project', name: 'Project' }],
          spaces: [{ id: 'space-1', name: null, description: null, image: '', relations: [], spaceId: 'space-1', spaces: ['space-1'], values: [], types: [] }],
        },
        {
          id: 'entity-root',
          name: 'Alpha',
          description: null,
          types: [{ id: 'type-project', name: 'Project' }],
          spaces: [{ id: 'a19c345ab9866679b001d7d2138d88a1', name: null, description: null, image: '', relations: [], spaceId: 'a19c345ab9866679b001d7d2138d88a1', spaces: ['a19c345ab9866679b001d7d2138d88a1'], values: [], types: [] }],
        },
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
    expect(result.resolvedRows.get(0)?.entityId).toBe('entity-root');
  });

  it('resolves row ties deterministically instead of leaving unresolved', async () => {
    getResultsMock.mockImplementation(() =>
      Effect.succeed([
        {
          id: 'entity-b',
          name: 'Alpha',
          description: null,
          types: [{ id: 'type-project', name: 'Project' }],
          spaces: [{ id: 'a19c345ab9866679b001d7d2138d88a1', name: null, description: null, image: '', relations: [], spaceId: 'a19c345ab9866679b001d7d2138d88a1', spaces: ['a19c345ab9866679b001d7d2138d88a1'], values: [], types: [] }],
        },
        {
          id: 'entity-a',
          name: 'Alpha',
          description: null,
          types: [{ id: 'type-project', name: 'Project' }],
          spaces: [{ id: 'a19c345ab9866679b001d7d2138d88a1', name: null, description: null, image: '', relations: [], spaceId: 'a19c345ab9866679b001d7d2138d88a1', spaces: ['a19c345ab9866679b001d7d2138d88a1'], values: [], types: [] }],
        },
      ])
    );
    getRelationsByToEntityIdsMock.mockImplementation(() => Effect.succeed([]));

    const result = await resolveRowsByNameAndType({
      dataRows: [['Alpha']],
      nameColIdx: 0,
      selectedType: { id: 'type-project', name: 'Project' },
      typesColumnIndex: undefined,
      resolvedTypes: new Map(),
      guard: { isCurrent: () => true },
    });

    expect(result.unresolvedRowCount).toBe(0);
    expect(result.resolvedRows.get(0)?.entityId).toBe('entity-a');
  });
});

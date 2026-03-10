import { SystemIds } from '@geoprotocol/geo-sdk';
import { describe, expect, it } from 'vitest';

import {
  buildGeneratedRows,
  buildUnresolvedLinksByCell,
  collectRelationCells,
  createGenerationTracker,
} from './import-generation';

describe('import generation helpers', () => {
  it('tracks superseded generations', () => {
    const tracker = createGenerationTracker();
    const first = tracker.start();
    const second = tracker.start();

    expect(tracker.isCurrent(first)).toBe(false);
    expect(tracker.isCurrent(second)).toBe(true);
  });

  it('collects unique relation cell values from mapped relation columns', () => {
    const rows = [
      ['A', 'Alice, Bob'],
      ['B', 'Bob;Charlie'],
      ['C', 'Alice|Delta'],
    ];
    const relationProperty = {
      id: 'prop-rel',
      name: 'Related',
      dataType: 'RELATION' as const,
      relationValueTypes: [{ id: 'type-1', name: 'Person' }],
    };

    const metas = collectRelationCells({
      columnMapping: { 0: SystemIds.NAME_PROPERTY, 1: relationProperty.id },
      dataRows: rows,
      propertyLookup: {
        schema: [relationProperty],
        extraProperties: {},
        getProperty: () => null,
      },
    });

    expect(metas).toHaveLength(1);
    expect([...metas[0].uniqueCellValues].sort()).toEqual(['Alice', 'Bob', 'Charlie', 'Delta']);
    expect(metas[0].typeIds).toEqual(['type-1']);
  });

  it('creates relations with distinct relation entityId (not the row entity id)', () => {
    const built = buildGeneratedRows({
      dataRows: [['Project X', 'Alice']],
      columnMapping: { 0: SystemIds.NAME_PROPERTY, 1: 'prop-rel' },
      resolvedRows: new Map([[0, { entityId: 'project-x', name: 'Project X' }]]),
      selectedType: null,
      typesColumnIndex: undefined,
      resolvedTypes: new Map(),
      resolvedEntities: new Map([
        ['prop-rel::Alice', { id: 'alice-id', name: 'Alice', status: 'found' as const }],
      ]),
      spaceId: 'space-1',
      propertyLookup: {
        schema: [
          { id: 'prop-rel', name: 'Related', dataType: 'RELATION', relationValueTypes: [{ id: 'type-1', name: 'Person' }] },
        ],
        extraProperties: {},
        getProperty: () => null,
      },
    });

    expect(built.relations).toHaveLength(1);
    expect(built.relations[0].entityId).toBeTruthy();
    expect(built.relations[0].entityId).not.toEqual(built.relations[0].fromEntity.id);
  });

  it('writes a Name value for auto-created relation target entities', () => {
    const built = buildGeneratedRows({
      dataRows: [['Project X', 'New Person']],
      columnMapping: { 0: SystemIds.NAME_PROPERTY, 1: 'prop-rel' },
      resolvedRows: new Map([[0, { entityId: 'project-x', name: 'Project X' }]]),
      selectedType: null,
      typesColumnIndex: undefined,
      resolvedTypes: new Map(),
      resolvedEntities: new Map([
        ['prop-rel::New Person', { id: 'created-person-id', name: 'New Person', status: 'created' as const }],
      ]),
      spaceId: 'space-1',
      propertyLookup: {
        schema: [
          { id: 'prop-rel', name: 'Related', dataType: 'RELATION', relationValueTypes: [{ id: 'type-1', name: 'Person' }] },
        ],
        extraProperties: {},
        getProperty: () => null,
      },
    });

    expect(
      built.values.find(v => v.entity.id === 'created-person-id' && v.property.id === SystemIds.NAME_PROPERTY)?.value
    ).toBe('New Person');
  });

  it('emits a Types relation for auto-created relation entities with typeId', () => {
    const built = buildGeneratedRows({
      dataRows: [['Project X', 'New Person']],
      columnMapping: { 0: SystemIds.NAME_PROPERTY, 1: 'prop-rel' },
      resolvedRows: new Map([[0, { entityId: 'project-x', name: 'Project X' }]]),
      selectedType: null,
      typesColumnIndex: undefined,
      resolvedTypes: new Map(),
      resolvedEntities: new Map([
        ['prop-rel::New Person', { id: 'created-person-id', name: 'New Person', status: 'created' as const, typeId: 'type-1', typeName: 'Person' }],
      ]),
      spaceId: 'space-1',
      propertyLookup: {
        schema: [
          { id: 'prop-rel', name: 'Related', dataType: 'RELATION', relationValueTypes: [{ id: 'type-1', name: 'Person' }] },
        ],
        extraProperties: {},
        getProperty: () => null,
      },
    });

    const typesRelation = built.relations.find(
      r => r.type.id === SystemIds.TYPES_PROPERTY && r.fromEntity.id === 'created-person-id'
    );
    expect(typesRelation).toBeDefined();
    expect(typesRelation!.toEntity.id).toBe('type-1');
    expect(typesRelation!.toEntity.name).toBe('Person');
  });

  it('marks unresolved entity-name and relation cells for review UI', () => {
    const unresolved = buildUnresolvedLinksByCell({
      dataRows: [['Project X', 'Alice, Bob']],
      columnMapping: { 0: SystemIds.NAME_PROPERTY, 1: 'prop-rel' },
      nameColIdx: 0,
      typesColumnIndex: undefined,
      resolvedTypes: new Map(),
      resolvedRows: new Map(),
      resolvedEntities: new Map([['prop-rel::Alice', { id: 'alice-id', name: 'Alice', status: 'found' as const }]]),
      propertyLookup: {
        schema: [{ id: 'prop-rel', name: 'Related', dataType: 'RELATION', relationValueTypes: [] }],
        extraProperties: {},
        getProperty: () => null,
      },
    });

    expect(unresolved['0:0']).toEqual({ kind: 'entity' });
    expect(unresolved['0:1']).toEqual({ kind: 'relation', unresolvedValues: ['Bob'] });
  });

  it('marks unresolved type cells when CSV types cannot be resolved', () => {
    const unresolved = buildUnresolvedLinksByCell({
      dataRows: [['Project X', 'Unresolved Type']],
      columnMapping: { 0: SystemIds.NAME_PROPERTY },
      nameColIdx: 0,
      typesColumnIndex: 1,
      resolvedTypes: new Map(),
      resolvedRows: new Map([[0, { entityId: 'project-x', name: 'Project X' }]]),
      resolvedEntities: new Map(),
      propertyLookup: {
        schema: [],
        extraProperties: {},
        getProperty: () => null,
      },
    });

    expect(unresolved['0:1']).toEqual({ kind: 'type', rawType: 'Unresolved Type' });
  });
});

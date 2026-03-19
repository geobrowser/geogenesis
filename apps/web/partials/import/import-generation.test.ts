import { SystemIds } from '@geoprotocol/geo-sdk';

import { describe, expect, it } from 'vitest';

import {
  buildEntitySnapshot,
  buildGeneratedRows,
  buildImportPlan,
  buildUnresolvedLinksByCell,
  collectRelationCells,
  createGenerationTracker,
} from './import-generation';
import type { ResolvedEntity } from './import-generation';

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
      resolvedEntities: new Map([['prop-rel::Alice', { id: 'alice-id', name: 'Alice', status: 'found' as const }]]),
      spaceId: 'space-1',
      propertyLookup: {
        schema: [
          {
            id: 'prop-rel',
            name: 'Related',
            dataType: 'RELATION',
            relationValueTypes: [{ id: 'type-1', name: 'Person' }],
          },
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
          {
            id: 'prop-rel',
            name: 'Related',
            dataType: 'RELATION',
            relationValueTypes: [{ id: 'type-1', name: 'Person' }],
          },
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
        [
          'prop-rel::New Person',
          {
            id: 'created-person-id',
            name: 'New Person',
            status: 'created' as const,
            typeId: 'type-1',
            typeName: 'Person',
          },
        ],
      ]),
      spaceId: 'space-1',
      propertyLookup: {
        schema: [
          {
            id: 'prop-rel',
            name: 'Related',
            dataType: 'RELATION',
            relationValueTypes: [{ id: 'type-1', name: 'Person' }],
          },
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

  it('does not emit duplicate type relations when a column is mapped to TYPES_PROPERTY', () => {
    const built = buildGeneratedRows({
      dataRows: [['Project X', 'MyType', 'Alice']],
      columnMapping: {
        0: SystemIds.NAME_PROPERTY,
        1: SystemIds.TYPES_PROPERTY,
        2: 'prop-rel',
      },
      resolvedRows: new Map([[0, { entityId: 'project-x', name: 'Project X' }]]),
      selectedType: null,
      typesColumnIndex: 1,
      resolvedTypes: new Map([['MyType', { id: 'type-my', name: 'MyType' }]]),
      resolvedEntities: new Map([['prop-rel::Alice', { id: 'alice-id', name: 'Alice', status: 'found' as const }]]),
      spaceId: 'space-1',
      propertyLookup: {
        schema: [{ id: 'prop-rel', name: 'Related', dataType: 'RELATION', relationValueTypes: [] }],
        extraProperties: {},
        getProperty: () => null,
      },
    });

    // The row should get exactly one TYPES_PROPERTY relation (from the typesColumnIndex path),
    // not a second one from iterating the column mapping.
    const typesRelations = built.relations.filter(
      r => r.type.id === SystemIds.TYPES_PROPERTY && r.fromEntity.id === 'project-x'
    );
    expect(typesRelations).toHaveLength(1);
    expect(typesRelations[0].toEntity.id).toBe('type-my');
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

describe('buildEntitySnapshot', () => {
  it('includes found and created entities, filtering out ambiguous ones', () => {
    const entities = new Map<string, ResolvedEntity>([
      ['prop::Alice', { id: 'alice-id', name: 'Alice', status: 'found' }],
      ['prop::Bob', { status: 'ambiguous' }],
      ['prop::Charlie', { id: 'charlie-id', name: 'Charlie', status: 'created', typeId: 'type-1', typeName: 'Person' }],
    ]);

    const snapshot = buildEntitySnapshot(entities);

    expect(snapshot.size).toBe(2);
    expect(snapshot.get('prop::Alice')).toEqual({
      id: 'alice-id',
      name: 'Alice',
      status: 'found',
      typeId: undefined,
      typeName: undefined,
    });
    expect(snapshot.has('prop::Bob')).toBe(false);
    expect(snapshot.get('prop::Charlie')).toEqual({
      id: 'charlie-id',
      name: 'Charlie',
      status: 'created',
      typeId: 'type-1',
      typeName: 'Person',
    });
  });
});

describe('buildImportPlan', () => {
  const propertyLookup = {
    schema: [
      {
        id: 'prop-rel',
        name: 'Related',
        dataType: 'RELATION' as const,
        relationValueTypes: [{ id: 'type-1', name: 'Person' }],
      },
    ],
    extraProperties: {},
    getProperty: () => null,
  };

  it('produces a complete plan with values, relations, unresolved links, and snapshots', () => {
    const plan = buildImportPlan({
      dataRows: [['Project X', 'Alice']],
      columnMapping: { 0: SystemIds.NAME_PROPERTY, 1: 'prop-rel' },
      nameColIdx: 0,
      selectedType: { id: 'type-project', name: 'Project' },
      typesColumnIndex: undefined,
      resolvedEntities: new Map([['prop-rel::Alice', { id: 'alice-id', name: 'Alice', status: 'found' as const }]]),
      resolvedTypes: new Map(),
      resolvedRows: new Map([[0, { entityId: 'project-x', name: 'Project X' }]]),
      spaceId: 'space-1',
      propertyLookup,
    });

    // Values: Name for Project X
    expect(plan.values.some(v => v.entity.id === 'project-x' && v.value === 'Project X')).toBe(true);
    // Relations: Types for Project X + prop-rel to Alice
    expect(plan.relations.some(r => r.type.id === SystemIds.TYPES_PROPERTY && r.fromEntity.id === 'project-x')).toBe(
      true
    );
    expect(plan.relations.some(r => r.type.id === 'prop-rel' && r.toEntity.id === 'alice-id')).toBe(true);
    // Snapshots
    expect(plan.resolvedRowsSnapshot.get(0)?.entityId).toBe('project-x');
    expect(plan.resolvedEntitiesSnapshot.get('prop-rel::Alice')?.status).toBe('found');
    // No unresolved links
    expect(Object.keys(plan.unresolvedLinks)).toHaveLength(0);
  });

  it('does not mutate the caller-provided maps', () => {
    const resolvedEntities = new Map<string, ResolvedEntity>([
      ['prop-rel::Project X', { id: 'created-id', name: 'Project X', status: 'created' as const }],
    ]);
    const resolvedRows = new Map([[0, { entityId: 'project-x', name: 'Project X' }]]);

    // crossReferenceRelationsWithRows would mutate resolvedEntities if not cloned
    buildImportPlan({
      dataRows: [['Project X', 'Project X']],
      columnMapping: { 0: SystemIds.NAME_PROPERTY, 1: 'prop-rel' },
      nameColIdx: 0,
      selectedType: { id: 'type-1', name: 'Person' },
      typesColumnIndex: undefined,
      resolvedEntities,
      resolvedTypes: new Map(),
      resolvedRows,
      spaceId: 'space-1',
      propertyLookup,
    });

    // Caller's map should still have status 'created'
    expect(resolvedEntities.get('prop-rel::Project X')?.status).toBe('created');
  });
});

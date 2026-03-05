import { SystemIds } from '@geoprotocol/geo-sdk';
import { describe, expect, it } from 'vitest';

import { buildGeneratedRows, collectRelationCells, createGenerationTracker } from './import-generation';

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
      nameColIdx: 0,
      columnMapping: { 0: SystemIds.NAME_PROPERTY, 1: 'prop-rel' },
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
});

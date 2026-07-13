import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { Relation } from '~/core/types';

import { buildCreateCallOps, buildDeleteCallOps, buildUpdateCallOps } from './call-ops';

function fakeBlockRelation(id: string): Relation {
  return {
    id,
    entityId: id,
    renderableType: 'TEXT',
    type: { id: SystemIds.BLOCKS, name: 'Blocks' },
    fromEntity: { id: 'series-1', name: 'Series' },
    toEntity: { id: `block-${id}`, name: null, value: `block-${id}` },
    spaceId: 'space-1',
  };
}

describe('buildCreateCallOps', () => {
  it('writes a plain-TEXT description alongside BLOCKS relations for each paragraph', () => {
    const { values, relations } = buildCreateCallOps({
      spaceId: 'space-1',
      name: 'Weekly sync',
      description: 'First paragraph.\n\nSecond paragraph.',
      schedule: 'DTSTART:20260305T170000Z',
      autoPublishAhead: 0,
    });

    const descriptionValue = values.find(v => v.property.id === SystemIds.DESCRIPTION_PROPERTY);
    expect(descriptionValue?.value).toBe('First paragraph.\n\nSecond paragraph.');

    const blocksRelations = relations.filter(r => r.type.id === SystemIds.BLOCKS);
    expect(blocksRelations).toHaveLength(2);

    const markdownValues = values.filter(v => v.property.id === SystemIds.MARKDOWN_CONTENT);
    expect(markdownValues.map(v => v.value).sort()).toEqual(['First paragraph.', 'Second paragraph.']);
  });

  it('writes no BLOCKS relations for an empty description', () => {
    const { relations } = buildCreateCallOps({
      spaceId: 'space-1',
      name: 'Weekly sync',
      description: '',
      schedule: 'DTSTART:20260305T170000Z',
      autoPublishAhead: 0,
    });

    expect(relations.filter(r => r.type.id === SystemIds.BLOCKS)).toHaveLength(0);
  });
});

describe('buildUpdateCallOps', () => {
  it('tombstones existing block relations and writes fresh ones for the new description', () => {
    const existing = [fakeBlockRelation('rel-1'), fakeBlockRelation('rel-2')];
    const { relations } = buildUpdateCallOps({
      entityId: 'series-1',
      spaceId: 'space-1',
      name: 'Weekly sync',
      description: 'Updated paragraph.',
      schedule: 'DTSTART:20260305T170000Z',
      autoPublishAhead: 0,
      existingBlockRelations: existing,
    });

    const tombstoned = relations.filter(r => r.isDeleted);
    expect(tombstoned.map(r => r.id).sort()).toEqual(['rel-1', 'rel-2']);

    const fresh = relations.filter(r => !r.isDeleted && r.type.id === SystemIds.BLOCKS);
    expect(fresh).toHaveLength(1);
  });

  it('unsets the description value when cleared, and tombstones existing blocks without writing new ones', () => {
    const existing = [fakeBlockRelation('rel-1')];
    const { values, relations } = buildUpdateCallOps({
      entityId: 'series-1',
      spaceId: 'space-1',
      name: 'Weekly sync',
      description: '',
      schedule: 'DTSTART:20260305T170000Z',
      autoPublishAhead: 0,
      existingBlockRelations: existing,
    });

    const descriptionValue = values.find(v => v.property.id === SystemIds.DESCRIPTION_PROPERTY);
    expect(descriptionValue?.isDeleted).toBe(true);

    expect(relations).toHaveLength(1);
    expect(relations[0].isDeleted).toBe(true);
  });
});

describe('buildDeleteCallOps', () => {
  it('tombstones existing block relations alongside the unset values', () => {
    const existing = [fakeBlockRelation('rel-1')];
    const { values, relations } = buildDeleteCallOps({
      entityId: 'series-1',
      spaceId: 'space-1',
      name: 'Weekly sync',
      existingBlockRelations: existing,
    });

    expect(values.every(v => v.isDeleted)).toBe(true);
    expect(relations).toHaveLength(1);
    expect(relations[0].isDeleted).toBe(true);
    expect(relations[0].id).toBe('rel-1');
  });

  it('returns no relations when there are no existing blocks', () => {
    const { relations } = buildDeleteCallOps({ entityId: 'series-1', spaceId: 'space-1', name: 'Weekly sync' });
    expect(relations).toHaveLength(0);
  });
});

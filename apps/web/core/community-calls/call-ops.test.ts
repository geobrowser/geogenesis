import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { Relation } from '~/core/types';

import {
  buildCreateCallOps,
  buildDeleteCallOps,
  buildPublishOccurrenceOps,
  buildPublishRecordingsOps,
  buildUpdateCallOps,
} from './call-ops';
import { EVENT_SCHEMA } from './constants';

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

describe('buildPublishOccurrenceOps', () => {
  const base = {
    spaceId: 'space-1',
    seriesId: 'series-1',
    seriesName: 'Weekly sync',
    occurrenceStart: Date.UTC(2026, 2, 5, 17),
    occurrenceEnd: Date.UTC(2026, 2, 5, 18),
    agendaBlocks: [],
  };

  it('inherits the series description onto the event Description', () => {
    const { values } = buildPublishOccurrenceOps({ ...base, seriesDescription: 'A recurring call.' });
    const description = values.find(v => v.property.id === EVENT_SCHEMA.DESCRIPTION_PROPERTY);
    expect(description?.value).toBe('A recurring call.');
    expect(description?.isDeleted).toBeFalsy();
  });

  it('unsets the event Description when the series description is empty', () => {
    const { values } = buildPublishOccurrenceOps({ ...base, seriesDescription: '' });
    const description = values.find(v => v.property.id === EVENT_SCHEMA.DESCRIPTION_PROPERTY);
    expect(description?.isDeleted).toBe(true);
  });

  it('leaves the event Description untouched when no series description is passed', () => {
    const { values } = buildPublishOccurrenceOps(base);
    expect(values.find(v => v.property.id === EVENT_SCHEMA.DESCRIPTION_PROPERTY)).toBeUndefined();
  });
});

describe('buildPublishRecordingsOps', () => {
  const base = {
    spaceId: 'space-1',
    seriesId: 'series-1',
    seriesName: 'Weekly sync',
    occurrenceStart: Date.UTC(2026, 2, 5, 17),
    occurrenceEnd: Date.UTC(2026, 2, 5, 18),
    ipfsUrls: ['ipfs://cid-1'],
  };

  it('inherits the series description when it mints a fresh event', () => {
    const { values } = buildPublishRecordingsOps({ ...base, seriesDescription: 'A recurring call.' });
    const description = values.find(v => v.property.id === EVENT_SCHEMA.DESCRIPTION_PROPERTY);
    expect(description?.value).toBe('A recurring call.');
  });

  it('does not touch Description when attaching to an existing event', () => {
    const { values } = buildPublishRecordingsOps({
      ...base,
      seriesDescription: 'A recurring call.',
      existingEventId: 'event-1',
    });
    expect(values.find(v => v.property.id === EVENT_SCHEMA.DESCRIPTION_PROPERTY)).toBeUndefined();
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

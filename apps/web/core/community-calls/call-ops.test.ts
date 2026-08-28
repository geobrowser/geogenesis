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
import { CALL_SCHEMA, EVENT_SCHEMA } from './constants';

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

/**
 * The bug this closes: a Meeting Time value stored as the empty string
 * (`65587cf0adea4ea8b5c2c8b3c39cc87f`). Both readers expand a call into occurrences and
 * drop anything yielding none, so an empty schedule does not degrade the call — it deletes
 * it from every view while leaving the entity in the graph, with no feedback to the author.
 */
describe('empty schedules are refused rather than written', () => {
  const fields = {
    spaceId: 'space-1',
    name: 'Test community call',
    description: 'Test description',
    autoPublishAhead: 0,
  };

  it.each(['', '   ', '\n'])('create refuses schedule %j', schedule => {
    expect(() => buildCreateCallOps({ ...fields, schedule })).toThrow(/empty schedule/i);
  });

  // The path that actually produced the bad row: create only writes autoPublishAhead when
  // it is > 0, and the broken call had one at 0 — so it had been through an edit.
  it.each(['', '   '])('update refuses schedule %j', schedule => {
    expect(() => buildUpdateCallOps({ ...fields, schedule, entityId: 'call-1' })).toThrow(/empty schedule/i);
  });

  // Refused, not unset. Every other optional field here unsets when empty, and for the
  // schedule that would be equally invisible — so neither is acceptable.
  it('does not fall back to unsetting the meeting time', () => {
    let captured: unknown = null;
    try {
      buildUpdateCallOps({ ...fields, schedule: '', entityId: 'call-1' });
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(Error);
  });

  it('still accepts a real schedule', () => {
    const { values } = buildCreateCallOps({
      ...fields,
      schedule: 'DTSTART;TZID=Europe/Vilnius:20260821T220000\nDTEND;TZID=Europe/Vilnius:20260821T230000',
    });
    const meeting = values.find(v => v.property.id === CALL_SCHEMA.MEETING_TIME_PROPERTY);
    expect(meeting?.value).toContain('DTSTART');
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

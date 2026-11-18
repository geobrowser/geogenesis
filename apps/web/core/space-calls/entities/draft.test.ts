import { describe, expect, it } from 'vitest';

import { CALL_SCHEMA, EVENT_SCHEMA } from '~/core/community-calls/constants';
import { TYPES_PROPERTY_ID, WEB_URL_PROPERTY_ID } from '~/core/debates/ontology';

import {
  CALL_EVENT_PUBLISHED_BY_PROPERTY_ID,
  buildCallEventDraft,
  buildCallEventRemoval,
  mintedCallEntityId,
  singleOccurrenceSchedule,
} from './draft';
import type { CallEntity, CallEntityClaim } from './service';

const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CALL = '0d9c5b2e-7a11-4f3c-9e2d-8b6a4f1c3e70';
const SERIES = '39c0a4c8a1d24e30971498f9014b4ef4';
const CURATOR_EVENT = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const entity = (over: Partial<CallEntity> = {}): CallEntity => ({
  space_id: SPACE,
  status: 'scheduled',
  name: 'Crypto Community Call',
  series_id: SERIES,
  original_start: '2026-11-25T16:00:00Z',
  scheduled_starts_at: '2026-11-25T16:00:00Z',
  scheduled_ends_at: '2026-11-25T17:00:00Z',
  started_at: null,
  ended_at: null,
  starts_at: '2026-11-25T16:00:00Z',
  ends_at: '2026-11-25T17:00:00Z',
  attendees: ['cccccccccccccccccccccccccccccccc'],
  recording: null,
  ...over,
});

const claim = (over: Partial<CallEntityClaim> = {}): CallEntityClaim => ({
  call_id: CALL.replace(/-/g, ''),
  claim_id: 'dddddddddddddddddddddddddddddddd',
  claimed_until: '2026-11-18T15:15:00Z',
  action: 'create',
  entity_id: null,
  entity: entity(),
  previous: null,
  attempts: 0,
  last_error: null,
  ...over,
});

const build = (c: CallEntityClaim, entityId = mintedCallEntityId(c.call_id)) =>
  buildCallEventDraft({
    claim: c,
    entityId,
    publisherAddress: '0xABCDEF0000000000000000000000000000000001',
    appOrigin: 'https://geobrowser.io/',
    createPosition: () => 'a0',
  });

const valueOf = (draft: ReturnType<typeof build>, propertyId: string, entityId = draft.entityId) =>
  draft.values.find(v => v.property.id === propertyId && v.entity.id === entityId);
const relationsOf = (draft: ReturnType<typeof build>, typeId: string) =>
  draft.relations.filter(r => r.type.id === typeId);

describe('buildCallEventDraft', () => {
  it('mints a scheduled call under the call id in curator shape', () => {
    const draft = build(claim());
    expect(draft.entityId).toBe(CALL.replace(/-/g, ''));
    expect(valueOf(draft, EVENT_SCHEMA.START_TIME_PROPERTY)?.value).toBe('2026-11-25T16:00:00Z');
    expect(valueOf(draft, EVENT_SCHEMA.END_TIME_PROPERTY)?.value).toBe('2026-11-25T17:00:00Z');
    expect(valueOf(draft, EVENT_SCHEMA.OCCURRENCE_ORIGINAL_START_PROPERTY)?.value).toBe('2026-11-25T16:00:00Z');
    expect(valueOf(draft, CALL_SCHEMA.MEETING_TIME_PROPERTY)?.value).toBe(
      'DTSTART:20261125T160000Z\nDTEND:20261125T170000Z'
    );
    expect(valueOf(draft, CALL_EVENT_PUBLISHED_BY_PROPERTY_ID)?.value).toBe(
      '0xabcdef0000000000000000000000000000000001'
    );
    expect(relationsOf(draft, TYPES_PROPERTY_ID).map(r => r.toEntity.id)).toEqual([
      EVENT_SCHEMA.COMMUNITY_CALL_EVENT_TYPE,
    ]);
    expect(relationsOf(draft, EVENT_SCHEMA.COMMUNITY_CALL_PARENT_PROPERTY).map(r => r.toEntity.id)).toEqual([SERIES]);
    expect(draft.values.every(v => v.spaceId === SPACE)).toBe(true);
  });

  it('derives every id, so a rewrite of the same claim is the same edit', () => {
    const first = build(claim());
    const second = build(claim());
    expect(second.relations.map(r => [r.id, r.entityId])).toEqual(first.relations.map(r => [r.id, r.entityId]));
    expect(second.values.map(v => v.id)).toEqual(first.values.map(v => v.id));
  });

  it('writes no Types or parent relation on an adopted curator event', () => {
    const draft = build(claim(), CURATOR_EVENT);
    expect(draft.entityId).toBe(CURATOR_EVENT);
    expect(relationsOf(draft, TYPES_PROPERTY_ID)).toEqual([]);
    expect(relationsOf(draft, EVENT_SCHEMA.COMMUNITY_CALL_PARENT_PROPERTY)).toEqual([]);
    expect(valueOf(draft, EVENT_SCHEMA.START_TIME_PROPERTY)?.entity.id).toBe(CURATOR_EVENT);
  });

  it('leaves attendees off', () => {
    const draft = build(claim({ entity: entity({ status: 'ended' }) }));
    expect(relationsOf(draft, EVENT_SCHEMA.ATTENDEES_PROPERTY)).toEqual([]);
  });

  it('links a linked recording as a Video holding the call page URL', () => {
    const draft = build(
      claim({
        action: 'update',
        entity: entity({
          status: 'ended',
          recording: { status: 'ready', published: true, linked: true, duration_seconds: 60 },
        }),
      })
    );
    const [link] = relationsOf(draft, EVENT_SCHEMA.RECORDINGS_PROPERTY);
    expect(link?.isDeleted).toBeUndefined();
    expect(valueOf(draft, WEB_URL_PROPERTY_ID, link!.toEntity.id)?.value).toBe(
      `https://geobrowser.io/space/${SPACE}/calls/${CALL.replace(/-/g, '')}`
    );
  });

  it('deletes the Recordings relation when the recording is unlinked', () => {
    const linked = entity({
      status: 'ended',
      recording: { status: 'ready', published: true, linked: true, duration_seconds: 60 },
    });
    const before = relationsOf(build(claim({ entity: linked })), EVENT_SCHEMA.RECORDINGS_PROPERTY)[0]!;
    const draft = build(
      claim({
        action: 'update',
        previous: linked,
        entity: entity({
          status: 'ended',
          recording: { status: 'ready', published: false, linked: false, duration_seconds: 60 },
        }),
      })
    );
    const [unlink] = relationsOf(draft, EVENT_SCHEMA.RECORDINGS_PROPERTY);
    expect(unlink).toMatchObject({ id: before.id, isDeleted: true });
    expect(draft.values.some(v => v.property.id === WEB_URL_PROPERTY_ID)).toBe(false);
  });

  it('moves the parent when the series changes on a minted entity', () => {
    const other = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const draft = build(claim({ action: 'update', previous: entity(), entity: entity({ series_id: other }) }));
    expect(
      relationsOf(draft, EVENT_SCHEMA.COMMUNITY_CALL_PARENT_PROPERTY).map(r => [r.toEntity.id, Boolean(r.isDeleted)])
    ).toEqual([
      [SERIES, true],
      [other, false],
    ]);
  });

  it('writes no slot for a call started on the spot', () => {
    const draft = build(
      claim({
        entity: entity({
          status: 'ended',
          series_id: null,
          original_start: null,
          scheduled_starts_at: null,
          scheduled_ends_at: null,
        }),
      })
    );
    expect(valueOf(draft, EVENT_SCHEMA.OCCURRENCE_ORIGINAL_START_PROPERTY)).toBeUndefined();
    expect(valueOf(draft, CALL_SCHEMA.MEETING_TIME_PROPERTY)).toBeUndefined();
    expect(relationsOf(draft, EVENT_SCHEMA.COMMUNITY_CALL_PARENT_PROPERTY)).toEqual([]);
  });
});

describe('buildCallEventRemoval', () => {
  it('unsets every value and deletes every relation it is given', () => {
    const draft = buildCallEventRemoval({
      claim: claim({ action: 'remove', entity_id: CURATOR_EVENT }),
      entityId: CURATOR_EVENT,
      current: {
        values: [{ propertyId: EVENT_SCHEMA.START_TIME_PROPERTY, dataType: 'DATETIME' }],
        relations: [{ id: 'r1', entityId: 'r1e', typeId: TYPES_PROPERTY_ID, toEntityId: 't' }],
      },
    });
    expect(draft.values.map(v => [v.property.id, v.isDeleted])).toEqual([[EVENT_SCHEMA.START_TIME_PROPERTY, true]]);
    expect(draft.relations.map(r => [r.id, r.isDeleted])).toEqual([['r1', true]]);
  });
});

describe('singleOccurrenceSchedule', () => {
  it('matches curator', () => {
    expect(singleOccurrenceSchedule('2026-11-11T16:00:00Z', '2026-11-11T17:00:00Z')).toBe(
      'DTSTART:20261111T160000Z\nDTEND:20261111T170000Z'
    );
  });
});

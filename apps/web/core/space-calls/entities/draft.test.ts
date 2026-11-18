import { describe, expect, it } from 'vitest';

import { CALL_SCHEMA, EVENT_SCHEMA } from '~/core/community-calls/constants';
import { debatePublishIds } from '~/core/debates/debate-publish-draft';
import { NAME_PROPERTY_ID, TYPES_PROPERTY_ID, WEB_URL_PROPERTY_ID } from '~/core/debates/ontology';

import {
  CALL_EVENT_PUBLISHED_BY_PROPERTY_ID,
  buildCallEventDraft,
  buildCallEventRemoval,
  callEventName,
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

const MINTED = CALL.replace(/-/g, '');
const PAGE = `https://geobrowser.io/space/${SPACE}/calls/${MINTED}`;
const BLOCKS = 'beaba5cba67741a8b35377030613fc70';
const DESCRIPTION = '9b1f76ff9711404c861e59dc3fa7d037';
const edgeId = (entityId: string, type: string, to: string) =>
  debatePublishIds(entityId).relationIds(entityId, type, to).id;

describe('callEventName', () => {
  it('dates the occurrence as curator does, in UTC', () => {
    expect(callEventName(entity())).toBe('Crypto Community Call · 25 Nov 2026');
    expect(callEventName(entity({ original_start: '2026-11-25T23:30:00Z' }))).toBe(
      'Crypto Community Call · 25 Nov 2026'
    );
    expect(callEventName(entity({ original_start: null, starts_at: '2026-12-01T00:10:00Z' }))).toBe(
      'Crypto Community Call · 1 Dec 2026'
    );
  });
});

describe('buildCallEventDraft', () => {
  it('mints a scheduled call under the call id in curator shape', () => {
    const draft = build(claim());
    expect(draft.entityId).toBe(MINTED);
    expect(draft.name).toBe('Crypto Community Call · 25 Nov 2026');
    expect(valueOf(draft, NAME_PROPERTY_ID)?.value).toBe('Crypto Community Call · 25 Nov 2026');
    expect(valueOf(draft, EVENT_SCHEMA.START_TIME_PROPERTY)?.value).toBe('2026-11-25T16:00:00Z');
    expect(valueOf(draft, EVENT_SCHEMA.END_TIME_PROPERTY)?.value).toBe('2026-11-25T17:00:00Z');
    expect(valueOf(draft, EVENT_SCHEMA.OCCURRENCE_ORIGINAL_START_PROPERTY)?.value).toBe('2026-11-25T16:00:00Z');
    expect(valueOf(draft, CALL_SCHEMA.MEETING_TIME_PROPERTY)?.value).toBe(
      'DTSTART:20261125T160000Z\nDTEND:20261125T170000Z'
    );
    expect(valueOf(draft, WEB_URL_PROPERTY_ID)?.value).toBe(PAGE);
    expect(valueOf(draft, CALL_EVENT_PUBLISHED_BY_PROPERTY_ID)?.value).toBe(
      '0xabcdef0000000000000000000000000000000001'
    );
    expect(relationsOf(draft, TYPES_PROPERTY_ID).map(r => r.toEntity.id)).toEqual([
      EVENT_SCHEMA.COMMUNITY_CALL_EVENT_TYPE,
    ]);
    expect(relationsOf(draft, EVENT_SCHEMA.COMMUNITY_CALL_PARENT_PROPERTY).map(r => r.toEntity.id)).toEqual([SERIES]);
  });

  it('writes the same ids twice, so a rewrite upserts', () => {
    const a = build(claim());
    const b = build(claim());
    expect(b.values.map(v => v.id)).toEqual(a.values.map(v => v.id));
    expect(b.relations.map(r => r.id)).toEqual(a.relations.map(r => r.id));
  });

  it('writes only the times and the Web URL on an adopted curator event', () => {
    const draft = build(claim({ entity_id: CURATOR_EVENT }), CURATOR_EVENT);
    expect(draft.entityId).toBe(CURATOR_EVENT);
    expect(draft.values.map(v => v.property.id).sort()).toEqual(
      [
        EVENT_SCHEMA.START_TIME_PROPERTY,
        EVENT_SCHEMA.END_TIME_PROPERTY,
        EVENT_SCHEMA.OCCURRENCE_ORIGINAL_START_PROPERTY,
        CALL_SCHEMA.MEETING_TIME_PROPERTY,
        WEB_URL_PROPERTY_ID,
      ].sort()
    );
    expect(draft.relations).toEqual([]);
  });

  it('puts nothing about the recording on the graph', () => {
    const recording = { status: 'ready', published: true, linked: true, duration_seconds: 60 };
    const linked = build(claim({ entity: entity({ status: 'ended', recording }) }));
    const unlinked = build(
      claim({
        action: 'update',
        entity_id: MINTED,
        entity: entity({ status: 'ended', recording: { ...recording, published: false, linked: false } }),
        previous: entity({ status: 'ended', recording }),
      })
    );
    for (const draft of [linked, unlinked]) {
      expect(relationsOf(draft, EVENT_SCHEMA.RECORDINGS_PROPERTY)).toEqual([]);
      expect(draft.values.every(v => v.entity.id === MINTED)).toBe(true);
    }
  });

  it('moves a minted call to its new series', () => {
    const draft = build(
      claim({ action: 'update', entity_id: MINTED, previous: entity({ series_id: 'e'.repeat(32) }) })
    );
    const parents = relationsOf(draft, EVENT_SCHEMA.COMMUNITY_CALL_PARENT_PROPERTY);
    expect(parents.map(r => [r.toEntity.id, Boolean(r.isDeleted)])).toEqual([
      ['e'.repeat(32), true],
      [SERIES, false],
    ]);
  });

  it('writes no parent for a call started on the spot, and no attendees', () => {
    const draft = build(claim({ entity: entity({ series_id: null, original_start: null }) }));
    expect(relationsOf(draft, EVENT_SCHEMA.COMMUNITY_CALL_PARENT_PROPERTY)).toEqual([]);
    expect(relationsOf(draft, EVENT_SCHEMA.ATTENDEES_PROPERTY)).toEqual([]);
  });
});

describe('singleOccurrenceSchedule', () => {
  it('spells the slot as curator does', () => {
    expect(singleOccurrenceSchedule('2026-11-25T16:00:00.000Z', '2026-11-25T17:00:00Z')).toBe(
      'DTSTART:20261125T160000Z\nDTEND:20261125T170000Z'
    );
  });
});

describe('buildCallEventRemoval', () => {
  const removal = (
    c: CallEntityClaim,
    entityId: string,
    current: Parameters<typeof buildCallEventRemoval>[0]['current']
  ) => buildCallEventRemoval({ claim: c, entityId, current });

  it('deletes only what this publisher wrote on a minted entity', () => {
    const c = claim({ action: 'remove', entity_id: MINTED, entity: entity({ status: 'not_held' }) });
    const types = edgeId(MINTED, TYPES_PROPERTY_ID, EVENT_SCHEMA.COMMUNITY_CALL_EVENT_TYPE);
    const parent = edgeId(MINTED, EVENT_SCHEMA.COMMUNITY_CALL_PARENT_PROPERTY, SERIES);
    const draft = removal(c, MINTED, {
      values: [
        { propertyId: NAME_PROPERTY_ID, dataType: 'TEXT' },
        { propertyId: EVENT_SCHEMA.START_TIME_PROPERTY, dataType: 'DATETIME' },
        { propertyId: WEB_URL_PROPERTY_ID, dataType: 'TEXT' },
        { propertyId: DESCRIPTION, dataType: 'TEXT' },
      ],
      relations: [
        { id: types, entityId: 'r1', typeId: TYPES_PROPERTY_ID, toEntityId: EVENT_SCHEMA.COMMUNITY_CALL_EVENT_TYPE },
        { id: parent, entityId: 'r2', typeId: EVENT_SCHEMA.COMMUNITY_CALL_PARENT_PROPERTY, toEntityId: SERIES },
        { id: 'f'.repeat(32), entityId: 'r3', typeId: BLOCKS, toEntityId: 'a'.repeat(32) },
        { id: 'e'.repeat(32), entityId: 'r4', typeId: TYPES_PROPERTY_ID, toEntityId: 'b'.repeat(32) },
      ],
    });
    expect(draft.values.map(v => v.property.id)).toEqual([
      NAME_PROPERTY_ID,
      EVENT_SCHEMA.START_TIME_PROPERTY,
      WEB_URL_PROPERTY_ID,
    ]);
    expect(draft.values.every(v => v.isDeleted)).toBe(true);
    expect(draft.relations.map(r => r.id)).toEqual([types, parent]);
    expect(draft.relations.every(r => r.isDeleted)).toBe(true);
  });

  it('leaves an adopted curator event its record, removing only the Web URL', () => {
    const c = claim({ action: 'remove', entity_id: CURATOR_EVENT, entity: entity({ status: 'not_held' }) });
    const draft = removal(c, CURATOR_EVENT, {
      values: [
        { propertyId: NAME_PROPERTY_ID, dataType: 'TEXT' },
        { propertyId: EVENT_SCHEMA.START_TIME_PROPERTY, dataType: 'DATETIME' },
        { propertyId: WEB_URL_PROPERTY_ID, dataType: 'TEXT' },
      ],
      relations: [
        {
          id: 'c'.repeat(32),
          entityId: 'r1',
          typeId: TYPES_PROPERTY_ID,
          toEntityId: EVENT_SCHEMA.COMMUNITY_CALL_EVENT_TYPE,
        },
        { id: 'd'.repeat(32), entityId: 'r2', typeId: EVENT_SCHEMA.COMMUNITY_CALL_PARENT_PROPERTY, toEntityId: SERIES },
      ],
    });
    expect(draft.values.map(v => v.property.id)).toEqual([WEB_URL_PROPERTY_ID]);
    expect(draft.relations).toEqual([]);
  });
});

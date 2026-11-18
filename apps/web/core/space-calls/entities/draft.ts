import { Position } from '@geoprotocol/geo-sdk/lite';

import { CALL_SCHEMA, EVENT_SCHEMA } from '~/core/community-calls/constants';
import { debatePublishIds } from '~/core/debates/debate-publish-draft';
import { NAME_PROPERTY_ID, TYPES_PROPERTY_ID, VIDEO_TYPE_ID, WEB_URL_PROPERTY_ID } from '~/core/debates/ontology';
import { ID } from '~/core/id';
import type { DataType, Relation, Value } from '~/core/types';

import { spaceCallPath } from '../routes';
import type { CallEntity, CallEntityClaim } from './service';

/** curator-utils `PUBLISHED_BY_PROPERTY_ID`: the publisher's address, as curator's bot writes it. */
export const CALL_EVENT_PUBLISHED_BY_PROPERTY_ID = 'e48d2a72293b56168f73337371035130';

/** Who joined stays off the graph until that is decided; turning it on is this one flag. */
export const PUBLISH_CALL_ATTENDEES = false;

export function callEventAttendees(entity: CallEntity): string[] {
  return PUBLISH_CALL_ATTENDEES ? entity.attendees : [];
}

export type CallEventDraft = { entityId: string; name: string; values: Value[]; relations: Relation[] };

type DraftInput = {
  claim: CallEntityClaim;
  /** The id to write: recorded, adopted from curator, or the call id. */
  entityId: string;
  /** The publisher's address, for Published by. */
  publisherAddress: string;
  /** The canonical web origin, for the recording's stable call page URL. */
  appOrigin: string;
  createPosition?: () => string;
};

/** A minted entity's id is the call id, as a debate's is the debate id. */
export function mintedCallEntityId(callId: string): string {
  return ID.uuidToHex(callId);
}

/** The single-occurrence schedule curator writes on an event's Meeting Time. */
export function singleOccurrenceSchedule(startIso: string, endIso: string): string {
  const fmt = (iso: string) =>
    new Date(iso)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  return `DTSTART:${fmt(startIso)}\nDTEND:${fmt(endIso)}`;
}

export function callRecordingPageUrl(appOrigin: string, entity: CallEntity, callId: string): string {
  return `${appOrigin.replace(/\/+$/, '')}${spaceCallPath(ID.uuidToHex(entity.space_id), ID.uuidToHex(callId))}`;
}

/**
 * The edit for a `create` or `update` claim, in curator's Call Event shape. Every id is derived from
 * the entity id, so writing the same claim twice rewrites rather than duplicates. The Types and
 * parent relations are written only on an entity this publisher minted: an adopted curator event
 * already has both, under ids nobody here knows.
 */
export function buildCallEventDraft({
  claim,
  entityId: rawEntityId,
  publisherAddress,
  appOrigin,
  createPosition = Position.generate,
}: DraftInput): CallEventDraft {
  const { entity, previous } = claim;
  const entityId = ID.uuidToHex(rawEntityId);
  const spaceId = ID.uuidToHex(entity.space_id);
  const minted = ID.equals(entityId, mintedCallEntityId(claim.call_id));
  const ids = debatePublishIds(entityId);
  const ref = { id: entityId, name: entity.name };

  const values: Value[] = [];
  const relations: Relation[] = [];
  const setValue = (
    entityRef: { id: string; name: string | null },
    propertyId: string,
    dataType: DataType,
    value: string
  ) => {
    values.push({
      id: ID.createValueId({ entityId: entityRef.id, propertyId, spaceId }),
      entity: entityRef,
      property: { id: propertyId, name: null, dataType },
      value,
      spaceId,
      isLocal: true,
      hasBeenPublished: false,
    });
  };
  const relate = (
    from: { id: string; name: string | null },
    propertyId: string,
    toEntityId: string,
    toEntityName: string | null,
    isDeleted = false
  ) => {
    const relationIds = ids.relationIds(from.id, propertyId, toEntityId);
    relations.push({
      id: relationIds.id,
      entityId: relationIds.entityId,
      spaceId,
      renderableType: 'RELATION',
      verified: false,
      position: createPosition(),
      isLocal: true,
      hasBeenPublished: false,
      ...(isDeleted ? { isDeleted: true } : {}),
      type: { id: propertyId, name: null },
      fromEntity: from,
      toEntity: { id: toEntityId, name: toEntityName, value: toEntityId },
    });
  };

  setValue(ref, NAME_PROPERTY_ID, 'TEXT', entity.name);
  setValue(ref, EVENT_SCHEMA.START_TIME_PROPERTY, 'DATETIME', entity.starts_at);
  setValue(ref, EVENT_SCHEMA.END_TIME_PROPERTY, 'DATETIME', entity.ends_at);
  if (entity.original_start) {
    setValue(ref, EVENT_SCHEMA.OCCURRENCE_ORIGINAL_START_PROPERTY, 'DATETIME', entity.original_start);
  }
  if (entity.scheduled_starts_at && entity.scheduled_ends_at) {
    setValue(
      ref,
      CALL_SCHEMA.MEETING_TIME_PROPERTY,
      'SCHEDULE',
      singleOccurrenceSchedule(entity.scheduled_starts_at, entity.scheduled_ends_at)
    );
  }
  setValue(ref, CALL_EVENT_PUBLISHED_BY_PROPERTY_ID, 'TEXT', publisherAddress.toLowerCase());

  if (minted) {
    relate(ref, TYPES_PROPERTY_ID, EVENT_SCHEMA.COMMUNITY_CALL_EVENT_TYPE, 'Community call event');
    const previousSeries = previous?.series_id ?? null;
    if (previousSeries && !ID.equals(previousSeries, entity.series_id ?? '')) {
      relate(ref, EVENT_SCHEMA.COMMUNITY_CALL_PARENT_PROPERTY, ID.uuidToHex(previousSeries), null, true);
    }
    if (entity.series_id) {
      relate(ref, EVENT_SCHEMA.COMMUNITY_CALL_PARENT_PROPERTY, ID.uuidToHex(entity.series_id), null);
    }
  }

  for (const attendee of callEventAttendees(entity)) {
    relate(ref, EVENT_SCHEMA.ATTENDEES_PROPERTY, ID.uuidToHex(attendee), null);
  }

  // The recording is linked as curator links one, a Video entity under Recordings, holding the call
  // page's stable URL; the video itself stays off the graph. Unlinking deletes the relation.
  const videoId = ids.entityId('recording');
  if (entity.recording?.linked) {
    const videoName = `${entity.name} | recording`;
    const videoRef = { id: videoId, name: videoName };
    setValue(videoRef, NAME_PROPERTY_ID, 'TEXT', videoName);
    setValue(videoRef, WEB_URL_PROPERTY_ID, 'TEXT', callRecordingPageUrl(appOrigin, entity, claim.call_id));
    relate(videoRef, TYPES_PROPERTY_ID, VIDEO_TYPE_ID, 'Video');
    relate(ref, EVENT_SCHEMA.RECORDINGS_PROPERTY, videoId, videoName);
  } else if (previous?.recording?.linked) {
    relate(ref, EVENT_SCHEMA.RECORDINGS_PROPERTY, videoId, null, true);
  }

  return { entityId, name: entity.name, values, relations };
}

/** What a `remove` deletes: every value and outgoing relation the entity has in the call's space. */
export type GraphEntityForRemoval = {
  values: Array<{ propertyId: string; dataType: DataType }>;
  relations: Array<{ id: string; entityId: string; typeId: string; toEntityId: string }>;
};

export function buildCallEventRemoval({
  claim,
  entityId: rawEntityId,
  current,
}: {
  claim: CallEntityClaim;
  entityId: string;
  current: GraphEntityForRemoval;
}): CallEventDraft {
  const entityId = ID.uuidToHex(rawEntityId);
  const spaceId = ID.uuidToHex(claim.entity.space_id);
  const ref = { id: entityId, name: claim.entity.name };
  const values: Value[] = current.values.map(value => ({
    id: ID.createValueId({ entityId, propertyId: value.propertyId, spaceId }),
    entity: ref,
    property: { id: value.propertyId, name: null, dataType: value.dataType },
    value: '',
    spaceId,
    isLocal: true,
    isDeleted: true,
    hasBeenPublished: false,
  }));
  const relations: Relation[] = current.relations.map(relation => ({
    id: relation.id,
    entityId: relation.entityId,
    spaceId,
    renderableType: 'RELATION',
    verified: false,

    isLocal: true,
    isDeleted: true,
    hasBeenPublished: false,
    type: { id: relation.typeId, name: null },
    fromEntity: ref,
    toEntity: { id: relation.toEntityId, name: null, value: relation.toEntityId },
  }));
  return { entityId, name: claim.entity.name, values, relations };
}

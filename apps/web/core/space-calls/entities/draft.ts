import { Position } from '@geoprotocol/geo-sdk/lite';

import { CALL_SCHEMA, EVENT_SCHEMA } from '~/core/community-calls/constants';
import { debatePublishIds } from '~/core/debates/debate-publish-draft';
import { NAME_PROPERTY_ID, TYPES_PROPERTY_ID, WEB_URL_PROPERTY_ID } from '~/core/debates/ontology';
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
  /** The canonical web origin, for the call page URL. */
  appOrigin: string;
  createPosition?: () => string;
};

/** A minted entity's id is the call id, as a debate's is the debate id. */
export function mintedCallEntityId(callId: string): string {
  return ID.uuidToHex(callId);
}

/** Whether `entityId` is one this publisher minted, rather than curator's event it adopted. */
export function isMintedCallEntity(claim: CallEntityClaim, entityId: string): boolean {
  return ID.equals(entityId, mintedCallEntityId(claim.call_id));
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

/** Curator's occurrence name, "{series} · 11 Nov 2026", dated in UTC as its server runs. */
export function callEventName(entity: CallEntity): string {
  const date = new Date(entity.original_start ?? entity.starts_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${entity.name} · ${date}`;
}

export function callPageUrl(appOrigin: string, entity: CallEntity, callId: string): string {
  return `${appOrigin.replace(/\/+$/, '')}${spaceCallPath(ID.uuidToHex(entity.space_id), ID.uuidToHex(callId))}`;
}

/** Values this publisher writes on a minted entity; an adopted one gets only the times and Web URL. */
const TIME_PROPERTIES = [
  EVENT_SCHEMA.START_TIME_PROPERTY,
  EVENT_SCHEMA.END_TIME_PROPERTY,
  EVENT_SCHEMA.OCCURRENCE_ORIGINAL_START_PROPERTY,
  CALL_SCHEMA.MEETING_TIME_PROPERTY,
];
const MINTED_VALUE_PROPERTIES = [
  NAME_PROPERTY_ID,
  ...TIME_PROPERTIES,
  WEB_URL_PROPERTY_ID,
  CALL_EVENT_PUBLISHED_BY_PROPERTY_ID,
];

/** The relation ids this publisher can have written from `entityId`, all derived. */
function ownRelationIds(claim: CallEntityClaim, entityId: string): Set<string> {
  if (!isMintedCallEntity(claim, entityId)) return new Set();
  const ids = debatePublishIds(entityId);
  const { entity, previous } = claim;
  const edges: Array<[string, string]> = [[TYPES_PROPERTY_ID, EVENT_SCHEMA.COMMUNITY_CALL_EVENT_TYPE]];
  for (const series of [entity.series_id, previous?.series_id]) {
    if (series) edges.push([EVENT_SCHEMA.COMMUNITY_CALL_PARENT_PROPERTY, ID.uuidToHex(series)]);
  }
  for (const attendee of [...entity.attendees, ...(previous?.attendees ?? [])]) {
    edges.push([EVENT_SCHEMA.ATTENDEES_PROPERTY, ID.uuidToHex(attendee)]);
  }
  // Each edge once: `relationIds` numbers a repeated edge as another relation.
  const unique = new Map(edges.map(edge => [edge.join(':'), edge] as const));
  return new Set([...unique.values()].map(([type, to]) => ID.uuidToHex(ids.relationIds(entityId, type, to).id)));
}

/**
 * A `create` or `update` in curator's Call Event shape, with ids derived from the entity id so a
 * rewrite upserts. On curator's adopted event only the times (overwritten) and Web URL are written.
 * The recording stays off the graph; the call page plays it.
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
  const minted = isMintedCallEntity(claim, entityId);
  const ids = debatePublishIds(entityId);
  const name = callEventName(entity);
  const ref = { id: entityId, name };

  const values: Value[] = [];
  const relations: Relation[] = [];
  const setValue = (propertyId: string, dataType: DataType, value: string) => {
    values.push({
      id: ID.createValueId({ entityId, propertyId, spaceId }),
      entity: ref,
      property: { id: propertyId, name: null, dataType },
      value,
      spaceId,
      isLocal: true,
      hasBeenPublished: false,
    });
  };
  const relate = (propertyId: string, toEntityId: string, toEntityName: string | null, isDeleted = false) => {
    const relationIds = ids.relationIds(entityId, propertyId, toEntityId);
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
      fromEntity: ref,
      toEntity: { id: toEntityId, name: toEntityName, value: toEntityId },
    });
  };

  // Curator's event keeps its own name, so a moved call keeps curator's original date in it.
  if (minted) setValue(NAME_PROPERTY_ID, 'TEXT', name);
  setValue(EVENT_SCHEMA.START_TIME_PROPERTY, 'DATETIME', entity.starts_at);
  setValue(EVENT_SCHEMA.END_TIME_PROPERTY, 'DATETIME', entity.ends_at);
  if (entity.original_start) {
    setValue(EVENT_SCHEMA.OCCURRENCE_ORIGINAL_START_PROPERTY, 'DATETIME', entity.original_start);
  }
  if (entity.scheduled_starts_at && entity.scheduled_ends_at) {
    setValue(
      CALL_SCHEMA.MEETING_TIME_PROPERTY,
      'SCHEDULE',
      singleOccurrenceSchedule(entity.scheduled_starts_at, entity.scheduled_ends_at)
    );
  }
  setValue(WEB_URL_PROPERTY_ID, 'TEXT', callPageUrl(appOrigin, entity, claim.call_id));
  if (!minted) return { entityId, name, values, relations };

  setValue(CALL_EVENT_PUBLISHED_BY_PROPERTY_ID, 'TEXT', publisherAddress.toLowerCase());
  relate(TYPES_PROPERTY_ID, EVENT_SCHEMA.COMMUNITY_CALL_EVENT_TYPE, 'Community call event');
  const previousSeries = previous?.series_id ?? null;
  if (previousSeries && !ID.equals(previousSeries, entity.series_id ?? '')) {
    relate(EVENT_SCHEMA.COMMUNITY_CALL_PARENT_PROPERTY, ID.uuidToHex(previousSeries), null, true);
  }
  if (entity.series_id) relate(EVENT_SCHEMA.COMMUNITY_CALL_PARENT_PROPERTY, ID.uuidToHex(entity.series_id), null);
  for (const attendee of callEventAttendees(entity)) {
    relate(EVENT_SCHEMA.ATTENDEES_PROPERTY, ID.uuidToHex(attendee), null);
  }

  return { entityId, name, values, relations };
}

/**
 * Whether an `update` changes nothing the graph holds: geo-chat also lists a call when its attendees
 * change, which are not written. A shape bump is always a rewrite.
 */
export function updateChangesNothing(claim: CallEntityClaim): boolean {
  const { entity, previous } = claim;
  if (claim.action !== 'update' || !previous) return false;
  const written = (e: CallEntity) =>
    JSON.stringify([
      e.shape,
      e.space_id,
      e.name,
      e.series_id,
      e.original_start,
      e.scheduled_starts_at,
      e.scheduled_ends_at,
      e.starts_at,
      e.ends_at,
      callEventAttendees(e),
    ]);
  return written(entity) === written(previous);
}

/** What the graph holds for the entity in the call's space. */
export type GraphEntityForRemoval = {
  values: Array<{ propertyId: string; dataType: DataType; value: string }>;
  relations: Array<{ id: string; entityId: string; typeId: string; toEntityId: string }>;
};

const sameValue = (dataType: DataType, a: string, b: string) => {
  if (dataType !== 'DATETIME') return a === b;
  const [ta, tb] = [Date.parse(a), Date.parse(b)];
  return Number.isNaN(ta) || Number.isNaN(tb) ? a === b : ta === tb;
};

/**
 * A `remove` deletes only what this publisher wrote: a minted entity's values and derived relations,
 * or an adopted curator event's Web URL. A value is deleted only while it still equals our last
 * write (`previous`, else what `entity` would write), so a newer edit by anyone else stays.
 */
export function buildCallEventRemoval({
  claim,
  entityId: rawEntityId,
  current,
  publisherAddress,
  appOrigin,
}: {
  claim: CallEntityClaim;
  entityId: string;
  current: GraphEntityForRemoval;
  publisherAddress: string;
  appOrigin: string;
}): CallEventDraft {
  const entityId = ID.uuidToHex(rawEntityId);
  const spaceId = ID.uuidToHex(claim.entity.space_id);
  const name = callEventName(claim.entity);
  const ref = { id: entityId, name };
  const ownProperties = isMintedCallEntity(claim, entityId) ? MINTED_VALUE_PROPERTIES : [WEB_URL_PROPERTY_ID];
  const ownRelations = ownRelationIds(claim, entityId);
  const written = buildCallEventDraft({
    claim: { ...claim, entity: claim.previous ?? claim.entity, previous: null },
    entityId,
    publisherAddress,
    appOrigin,
  }).values;
  const stillOurs = (value: GraphEntityForRemoval['values'][number]) =>
    written.some(
      ours => ID.equals(ours.property.id, value.propertyId) && sameValue(value.dataType, ours.value, value.value)
    );

  const values: Value[] = current.values
    .filter(value => ownProperties.some(id => ID.equals(id, value.propertyId)) && stillOurs(value))
    .map(value => ({
      id: ID.createValueId({ entityId, propertyId: value.propertyId, spaceId }),
      entity: ref,
      property: { id: value.propertyId, name: null, dataType: value.dataType },
      value: '',
      spaceId,
      isLocal: true,
      isDeleted: true,
      hasBeenPublished: false,
    }));
  const relations: Relation[] = current.relations
    .filter(relation => ownRelations.has(ID.uuidToHex(relation.id)))
    .map(relation => ({
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
  return { entityId, name, values, relations };
}

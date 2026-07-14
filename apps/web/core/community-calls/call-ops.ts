/**
 * Value[]/Relation[] builders for the community-call series entity, shared
 * between the create and edit forms (both funnel into `usePublish().makeProposal`).
 *
 * Value ids are deterministic (`createValueId`), so writing the same property
 * for the same entity/space twice is an upsert, never a duplicate — this is
 * what makes `buildUpdateCallOps` safe to call against an entity that was
 * created outside this module.
 */
import { Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { createEntityId, createValueId } from '~/core/id/create-id';
import { getRelationForBlockType } from '~/core/state/editor/block-types';
import { DataType, Relation, Value } from '~/core/types';

import { parseAgendaText } from './agenda';
import { CALL_SCHEMA, EVENT_SCHEMA } from './constants';
import { formatFullDate } from './format';
import { OccurrenceAgendaBlock } from './types';

export type CallFields = {
  spaceId: string;
  name: string;
  description: string;
  schedule: string;
  autoPublishAhead: number;
};

function buildValue({
  entityRef,
  spaceId,
  propertyId,
  propertyName,
  dataType,
  value,
}: {
  entityRef: { id: string; name: string | null };
  spaceId: string;
  propertyId: string;
  propertyName: string;
  dataType: DataType;
  value: string;
}): Value {
  return {
    id: createValueId({ entityId: entityRef.id, propertyId, spaceId }),
    entity: entityRef,
    property: { id: propertyId, name: propertyName, dataType },
    value,
    spaceId,
    isLocal: true,
  };
}

/** An `isDeleted` Value becomes an `unset: [{property, language: 'all'}]` op on publish. */
function buildUnsetValue(args: {
  entityRef: { id: string; name: string | null };
  spaceId: string;
  propertyId: string;
  propertyName: string;
  dataType: DataType;
}): Value {
  return { ...buildValue({ ...args, value: '' }), isDeleted: true };
}

/** The event's Description value — a plain-TEXT write when non-empty, an unset when cleared. */
function buildEventDescriptionValue({
  entityRef,
  spaceId,
  description,
}: {
  entityRef: { id: string; name: string | null };
  spaceId: string;
  description: string;
}): Value {
  const args = {
    entityRef,
    spaceId,
    propertyId: EVENT_SCHEMA.DESCRIPTION_PROPERTY,
    propertyName: 'Description',
    dataType: 'TEXT' as const,
  };
  return description.trim() ? buildValue({ ...args, value: description }) : buildUnsetValue(args);
}

type EventRef = { id: string; name: string };

/** Name/Start time/End time for an occurrence's event entity. */
function buildEventCoreValues({
  entityRef,
  spaceId,
  occurrenceStart,
  occurrenceEnd,
}: {
  entityRef: EventRef;
  spaceId: string;
  occurrenceStart: number;
  occurrenceEnd: number;
}): Value[] {
  return [
    buildValue({
      entityRef,
      spaceId,
      propertyId: SystemIds.NAME_PROPERTY,
      propertyName: 'Name',
      dataType: 'TEXT',
      value: entityRef.name,
    }),
    buildValue({
      entityRef,
      spaceId,
      propertyId: EVENT_SCHEMA.START_TIME_PROPERTY,
      propertyName: 'Start time',
      dataType: 'DATETIME',
      value: new Date(occurrenceStart).toISOString(),
    }),
    buildValue({
      entityRef,
      spaceId,
      propertyId: EVENT_SCHEMA.END_TIME_PROPERTY,
      propertyName: 'End time',
      dataType: 'DATETIME',
      value: new Date(occurrenceEnd).toISOString(),
    }),
  ];
}

/**
 * The event's `Community call parent` relation back to the series + its `Types` relation. Only
 * safe to write when minting the event: relation ids aren't deterministic, so re-adding these on
 * an update would duplicate them.
 */
function buildEventLinkRelations({
  entityRef,
  spaceId,
  seriesId,
  seriesName,
}: {
  entityRef: EventRef;
  spaceId: string;
  seriesId: string;
  seriesName: string;
}): Relation[] {
  return [
    {
      id: createEntityId(),
      entityId: createEntityId(),
      spaceId,
      renderableType: 'RELATION',
      fromEntity: entityRef,
      toEntity: { id: seriesId, name: seriesName, value: seriesId },
      type: { id: EVENT_SCHEMA.COMMUNITY_CALL_PARENT_PROPERTY, name: 'Community call parent' },
    },
    {
      id: createEntityId(),
      entityId: createEntityId(),
      spaceId,
      renderableType: 'RELATION',
      fromEntity: entityRef,
      toEntity: {
        id: EVENT_SCHEMA.COMMUNITY_CALL_EVENT_TYPE,
        name: 'Community call event',
        value: EVENT_SCHEMA.COMMUNITY_CALL_EVENT_TYPE,
      },
      type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
    },
  ];
}

/**
 * Builds fresh `TEXT_BLOCK` entities + `BLOCKS` relations for a set of markdown blocks off
 * `entityRef`, tombstoning `existingBlockRelations` — a full republish, not a diff. Shared by
 * the create/update/publish builders below.
 */
function buildBlockOps({
  entityRef,
  spaceId,
  blocks,
  existingBlockRelations = [],
}: {
  entityRef: { id: string; name: string | null };
  spaceId: string;
  blocks: OccurrenceAgendaBlock[];
  existingBlockRelations?: Relation[];
}): { values: Value[]; relations: Relation[] } {
  const values: Value[] = [];
  const relations: Relation[] = existingBlockRelations.map(r => ({ ...r, spaceId, isLocal: true, isDeleted: true }));

  let position: string | null = null;
  for (const block of blocks) {
    const blockId = createEntityId();
    const blockRef = { id: blockId, name: null };
    position = Position.generateBetween(position, null);

    relations.push(getRelationForBlockType(blockId, SystemIds.TEXT_BLOCK, spaceId));
    values.push(
      buildValue({
        entityRef: blockRef,
        spaceId,
        propertyId: SystemIds.MARKDOWN_CONTENT,
        propertyName: 'Markdown content',
        dataType: 'TEXT',
        value: block.markdown,
      })
    );
    relations.push({
      id: createEntityId(),
      entityId: createEntityId(),
      spaceId,
      position,
      renderableType: 'TEXT',
      type: { id: SystemIds.BLOCKS, name: 'Blocks' },
      fromEntity: entityRef,
      toEntity: { id: blockId, name: null, value: blockId },
    });
  }

  return { values, relations };
}

/** Mints a new community-call series entity: Name, Meeting time, optional Description/Auto publish ahead, + Types relation. */
export function buildCreateCallOps({ spaceId, name, description, schedule, autoPublishAhead }: CallFields): {
  entityId: string;
  values: Value[];
  relations: Relation[];
} {
  const entityId = createEntityId();
  const entityRef = { id: entityId, name };

  const values: Value[] = [
    buildValue({
      entityRef,
      spaceId,
      propertyId: SystemIds.NAME_PROPERTY,
      propertyName: 'Name',
      dataType: 'TEXT',
      value: name,
    }),
    buildValue({
      entityRef,
      spaceId,
      propertyId: CALL_SCHEMA.MEETING_TIME_PROPERTY,
      propertyName: 'Meeting time',
      dataType: 'SCHEDULE',
      value: schedule,
    }),
  ];

  if (description.trim()) {
    values.push(
      buildValue({
        entityRef,
        spaceId,
        propertyId: SystemIds.DESCRIPTION_PROPERTY,
        propertyName: 'Description',
        dataType: 'TEXT',
        value: description,
      })
    );
  }

  if (autoPublishAhead > 0 && CALL_SCHEMA.AUTO_PUBLISH_AHEAD_PROPERTY) {
    values.push(
      buildValue({
        entityRef,
        spaceId,
        propertyId: CALL_SCHEMA.AUTO_PUBLISH_AHEAD_PROPERTY,
        propertyName: 'Auto publish ahead',
        dataType: 'INTEGER',
        value: String(autoPublishAhead),
      })
    );
  }

  const relations: Relation[] = [
    {
      id: createEntityId(),
      entityId: createEntityId(),
      spaceId,
      renderableType: 'RELATION',
      fromEntity: entityRef,
      toEntity: {
        id: CALL_SCHEMA.COMMUNITY_CALL_TYPE,
        name: 'Community call',
        value: CALL_SCHEMA.COMMUNITY_CALL_TYPE,
      },
      type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
    },
  ];

  // Description keeps its plain-TEXT value (read by the ICS export, list-page previews,
  // search) *and* gets split into markdown blocks for parity with the agenda's block view.
  if (description.trim()) {
    const blockOps = buildBlockOps({ entityRef, spaceId, blocks: parseAgendaText(description) });
    values.push(...blockOps.values);
    relations.push(...blockOps.relations);
  }

  return { entityId, values, relations };
}

/**
 * Updates an existing community-call series entity's fields. The Types relation never
 * changes on edit. An empty `description` or a zero `autoPublishAhead` unsets that
 * property rather than writing an empty value. `existingBlockRelations` (the series'
 * current `BLOCKS` relations, if any) are tombstoned and replaced wholesale with the new
 * description's blocks — same full-republish approach as `buildPublishOccurrenceOps`.
 */
export function buildUpdateCallOps({
  entityId,
  spaceId,
  name,
  description,
  schedule,
  autoPublishAhead,
  existingBlockRelations = [],
}: CallFields & { entityId: string; existingBlockRelations?: Relation[] }): { values: Value[]; relations: Relation[] } {
  const entityRef = { id: entityId, name };

  const values: Value[] = [
    buildValue({
      entityRef,
      spaceId,
      propertyId: SystemIds.NAME_PROPERTY,
      propertyName: 'Name',
      dataType: 'TEXT',
      value: name,
    }),
    buildValue({
      entityRef,
      spaceId,
      propertyId: CALL_SCHEMA.MEETING_TIME_PROPERTY,
      propertyName: 'Meeting time',
      dataType: 'SCHEDULE',
      value: schedule,
    }),
  ];

  values.push(
    description.trim()
      ? buildValue({
          entityRef,
          spaceId,
          propertyId: SystemIds.DESCRIPTION_PROPERTY,
          propertyName: 'Description',
          dataType: 'TEXT',
          value: description,
        })
      : buildUnsetValue({
          entityRef,
          spaceId,
          propertyId: SystemIds.DESCRIPTION_PROPERTY,
          propertyName: 'Description',
          dataType: 'TEXT',
        })
  );

  if (CALL_SCHEMA.AUTO_PUBLISH_AHEAD_PROPERTY) {
    values.push(
      autoPublishAhead > 0
        ? buildValue({
            entityRef,
            spaceId,
            propertyId: CALL_SCHEMA.AUTO_PUBLISH_AHEAD_PROPERTY,
            propertyName: 'Auto publish ahead',
            dataType: 'INTEGER',
            value: String(autoPublishAhead),
          })
        : buildUnsetValue({
            entityRef,
            spaceId,
            propertyId: CALL_SCHEMA.AUTO_PUBLISH_AHEAD_PROPERTY,
            propertyName: 'Auto publish ahead',
            dataType: 'INTEGER',
          })
    );
  }

  const blockOps = buildBlockOps({
    entityRef,
    spaceId,
    blocks: description.trim() ? parseAgendaText(description) : [],
    existingBlockRelations,
  });
  values.push(...blockOps.values);

  return { values, relations: blockOps.relations };
}

/**
 * Unsets the series entity's core fields, effectively deleting the call from listings.
 * `existingBlockRelations` (the series' current `BLOCKS` relations, if any) are tombstoned
 * alongside — `prepareLocalDataForPublishing` cascade-deletes their orphaned TEXT_BLOCK children.
 */
export function buildDeleteCallOps({
  entityId,
  spaceId,
  name,
  existingBlockRelations = [],
}: {
  entityId: string;
  spaceId: string;
  name: string;
  existingBlockRelations?: Relation[];
}): { values: Value[]; relations: Relation[] } {
  const entityRef = { id: entityId, name };

  const values: Value[] = [
    buildUnsetValue({
      entityRef,
      spaceId,
      propertyId: SystemIds.NAME_PROPERTY,
      propertyName: 'Name',
      dataType: 'TEXT',
    }),
    buildUnsetValue({
      entityRef,
      spaceId,
      propertyId: CALL_SCHEMA.MEETING_TIME_PROPERTY,
      propertyName: 'Meeting time',
      dataType: 'SCHEDULE',
    }),
    buildUnsetValue({
      entityRef,
      spaceId,
      propertyId: SystemIds.DESCRIPTION_PROPERTY,
      propertyName: 'Description',
      dataType: 'TEXT',
    }),
  ];

  const relations = existingBlockRelations.map(r => ({ ...r, spaceId, isLocal: true, isDeleted: true }));

  return { values, relations };
}

/** Unsets a published occurrence event's core fields, effectively deleting it from listings (not a hard delete). */
export function buildDeleteOccurrenceOps({
  entityId,
  spaceId,
  name,
}: {
  entityId: string;
  spaceId: string;
  name: string;
}): Value[] {
  const entityRef = { id: entityId, name };

  return [
    buildUnsetValue({
      entityRef,
      spaceId,
      propertyId: SystemIds.NAME_PROPERTY,
      propertyName: 'Name',
      dataType: 'TEXT',
    }),
    buildUnsetValue({
      entityRef,
      spaceId,
      propertyId: EVENT_SCHEMA.START_TIME_PROPERTY,
      propertyName: 'Start time',
      dataType: 'DATETIME',
    }),
    buildUnsetValue({
      entityRef,
      spaceId,
      propertyId: EVENT_SCHEMA.END_TIME_PROPERTY,
      propertyName: 'End time',
      dataType: 'DATETIME',
    }),
  ];
}

/**
 * Mints (or updates) a `Community call event` entity for one occurrence: its core fields, the
 * relations back to the series, and fresh `TEXT_BLOCK` children + `BLOCKS` relations for the
 * agenda's markdown blocks.
 *
 * Republishing replaces the agenda wholesale: pass the event's current `BLOCKS` relations
 * as `existingBlockRelations` and they're tombstoned here — `prepareLocalDataForPublishing`
 * cascade-deletes their now-orphaned TEXT_BLOCK children automatically.
 */
export function buildPublishOccurrenceOps({
  spaceId,
  seriesId,
  seriesName,
  seriesDescription,
  occurrenceStart,
  occurrenceEnd,
  agendaBlocks,
  existingEventId,
  existingBlockRelations = [],
}: {
  spaceId: string;
  seriesId: string;
  seriesName: string;
  /** Series description, inherited onto the event's Description. Omit to leave it untouched; '' unsets it. */
  seriesDescription?: string;
  occurrenceStart: number;
  occurrenceEnd: number;
  agendaBlocks: OccurrenceAgendaBlock[];
  existingEventId?: string | null;
  existingBlockRelations?: Relation[];
}): { entityId: string; values: Value[]; relations: Relation[] } {
  const entityId = existingEventId ?? createEntityId();
  const name = `${seriesName} — ${formatFullDate(occurrenceStart)}`;
  const entityRef = { id: entityId, name };

  const values = buildEventCoreValues({ entityRef, spaceId, occurrenceStart, occurrenceEnd });

  if (typeof seriesDescription === 'string') {
    values.push(buildEventDescriptionValue({ entityRef, spaceId, description: seriesDescription }));
  }

  const relations: Relation[] = existingEventId
    ? []
    : buildEventLinkRelations({ entityRef, spaceId, seriesId, seriesName });

  const blockOps = buildBlockOps({ entityRef, spaceId, blocks: agendaBlocks, existingBlockRelations });
  values.push(...blockOps.values);
  relations.push(...blockOps.relations);

  return { entityId, values, relations };
}

/**
 * Attaches recordings to an occurrence's `Community call event` entity. Each `ipfsUrls` entry is
 * an `ipfs://<cid>` already pinned by the publish-recording route.
 *
 * Additive to an existing event: it never touches the agenda blocks or core fields, so
 * publishing a recording can't clobber a published agenda. When the occurrence has no event yet
 * it mints one, so a recording can be published even if an agenda never was.
 */
export function buildPublishRecordingsOps({
  spaceId,
  seriesId,
  seriesName,
  seriesDescription,
  occurrenceStart,
  occurrenceEnd,
  ipfsUrls,
  existingEventId,
}: {
  spaceId: string;
  seriesId: string;
  seriesName: string;
  /** Series description, inherited onto the event's Description only when this call mints the event. */
  seriesDescription?: string;
  occurrenceStart: number;
  occurrenceEnd: number;
  ipfsUrls: string[];
  existingEventId?: string | null;
}): { entityId: string; values: Value[]; relations: Relation[] } {
  const entityId = existingEventId ?? createEntityId();
  const name = `${seriesName} — ${formatFullDate(occurrenceStart)}`;
  const entityRef = { id: entityId, name };

  const values: Value[] = [];
  const relations: Relation[] = [];

  if (!existingEventId) {
    values.push(...buildEventCoreValues({ entityRef, spaceId, occurrenceStart, occurrenceEnd }));
    if (seriesDescription?.trim()) {
      values.push(buildEventDescriptionValue({ entityRef, spaceId, description: seriesDescription }));
    }
    relations.push(...buildEventLinkRelations({ entityRef, spaceId, seriesId, seriesName }));
  }

  // A recording takes the app's standard video shape: a `Video`-typed entity holding the IPFS
  // URL (on IMAGE_URL_PROPERTY, which is the URL property videos use too), linked to the event
  // by a `Recordings` relation. That way it renders through the same path as any other video.
  for (const ipfsUrl of ipfsUrls) {
    const videoEntityId = createEntityId();
    const videoRef = { id: videoEntityId, name: null };
    values.push(
      buildValue({
        entityRef: videoRef,
        spaceId,
        propertyId: SystemIds.IMAGE_URL_PROPERTY,
        propertyName: 'IPFS URL',
        dataType: 'TEXT',
        value: ipfsUrl,
      })
    );
    relations.push(
      {
        id: createEntityId(),
        entityId: createEntityId(),
        spaceId,
        position: Position.generate(),
        renderableType: 'RELATION',
        fromEntity: videoRef,
        toEntity: { id: SystemIds.VIDEO_TYPE, name: 'Video', value: SystemIds.VIDEO_TYPE },
        type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
      },
      {
        id: createEntityId(),
        entityId: createEntityId(),
        spaceId,
        position: Position.generate(),
        renderableType: 'VIDEO',
        fromEntity: entityRef,
        toEntity: { id: videoEntityId, name: null, value: videoEntityId },
        type: { id: EVENT_SCHEMA.RECORDINGS_PROPERTY, name: 'Recordings' },
      }
    );
  }

  return { entityId, values, relations };
}

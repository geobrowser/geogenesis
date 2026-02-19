import { SystemIds } from '@geoprotocol/geo-sdk';

import type { BlockChange, EntityDiff, RelationChange, SimpleValueType, ValueChange } from '~/core/utils/diff/types';

import type { ApiBlockSnapshot, ApiEntitySnapshotResponse, ApiVersionedRelation, ApiVersionedValue } from '../rest';

const {
  TEXT_BLOCK,
  IMAGE_BLOCK,
  IMAGE_TYPE,
  DATA_BLOCK,
  VIDEO_TYPE,
  VIDEO_BLOCK,
  BLOCKS,
  TYPES_PROPERTY,
  NAME_PROPERTY,
  MARKDOWN_CONTENT,
  IMAGE_URL_PROPERTY,
} = SystemIds;

/**
 * Determine block type from a TYPES_PROPERTY relation.
 * Shared logic with `detectBlockType` in diff.ts, but operates on raw API relation shapes.
 */
function classifyBlockType(typeEntityId: string): 'textBlock' | 'imageBlock' | 'videoBlock' | 'dataBlock' | null {
  if (typeEntityId === TEXT_BLOCK) return 'textBlock';
  if (typeEntityId === IMAGE_BLOCK || typeEntityId === IMAGE_TYPE) return 'imageBlock';
  if (typeEntityId === VIDEO_TYPE || typeEntityId === VIDEO_BLOCK) return 'videoBlock';
  if (typeEntityId === DATA_BLOCK) return 'dataBlock';
  return null;
}

function getBlockTypeFromRelations(
  relations: readonly ApiVersionedRelation[]
): 'textBlock' | 'imageBlock' | 'videoBlock' | 'dataBlock' {
  for (const rel of relations) {
    if (rel.typeId === TYPES_PROPERTY) {
      const blockType = classifyBlockType(rel.toEntityId);
      if (blockType) return blockType;
    }
  }
  return 'textBlock';
}

/**
 * Extract the display value from a snapshot value.
 *
 * Handles all GRC-20 v2 data types. Falls through to `{ type: 'TEXT', value: null }`
 * for unsupported types (schedule, embedding) since they can't be meaningfully
 * serialized to a string. If new value types are added, add handling here.
 */
function serializeSnapshotValue(v: ApiVersionedValue): { type: string; value: string | null } {
  if (v.text !== undefined && v.text !== null) return { type: 'TEXT', value: v.text };
  if (v.boolean !== undefined && v.boolean !== null) return { type: 'BOOLEAN', value: String(v.boolean) };
  if (v.integer !== undefined && v.integer !== null) return { type: 'INTEGER', value: String(v.integer) };
  if (v.float !== undefined && v.float !== null) return { type: 'FLOAT', value: String(v.float) };
  if (v.decimal !== undefined && v.decimal !== null) return { type: 'DECIMAL', value: v.decimal };
  if (v.bytes !== undefined && v.bytes !== null) return { type: 'BYTES', value: v.bytes };
  if (v.date !== undefined && v.date !== null) return { type: 'DATE', value: v.date };
  if (v.time !== undefined && v.time !== null) return { type: 'TIME', value: v.time };
  if (v.datetime !== undefined && v.datetime !== null) return { type: 'DATETIME', value: v.datetime };
  if (v.point !== undefined && v.point !== null) return { type: 'POINT', value: v.point };
  if (v.rect !== undefined && v.rect !== null) return { type: 'RECT', value: v.rect };
  // Unsupported types (schedule, embedding) — can't serialize to string meaningfully
  return { type: 'TEXT', value: null };
}

function snapshotValueToChange(v: ApiVersionedValue): ValueChange {
  const { type, value } = serializeSnapshotValue(v);

  if (type === 'TEXT') {
    return {
      propertyId: v.propertyId,
      spaceId: v.spaceId,
      type: 'TEXT',
      before: null,
      after: value,
      diff: value ? [{ value, added: true }] : [],
    };
  }

  return {
    propertyId: v.propertyId,
    spaceId: v.spaceId,
    type: type as SimpleValueType,
    before: null,
    after: value,
  };
}

function snapshotRelationToChange(r: ApiVersionedRelation): RelationChange {
  return {
    relationId: r.relationId,
    typeId: r.typeId,
    spaceId: r.spaceId,
    changeType: 'ADD',
    before: null,
    after: {
      toEntityId: r.toEntityId,
      toSpaceId: r.toSpaceId ?? null,
      position: r.position ?? null,
    },
  };
}

function snapshotBlockToChange(block: ApiBlockSnapshot): BlockChange {
  const blockType = getBlockTypeFromRelations(block.relations);

  switch (blockType) {
    case 'textBlock': {
      const content = block.values.find(v => v.propertyId === MARKDOWN_CONTENT)?.text ?? '';
      return {
        id: block.id,
        type: 'textBlock',
        before: null,
        after: content,
        diff: content ? [{ value: content, added: true }] : [],
      };
    }
    case 'imageBlock': {
      const url = block.values.find(v => v.propertyId === IMAGE_URL_PROPERTY)?.text ?? null;
      return {
        id: block.id,
        type: 'imageBlock',
        before: null,
        after: url,
      };
    }
    case 'videoBlock': {
      const url = block.values.find(v => v.propertyId === IMAGE_URL_PROPERTY)?.text ?? null;
      return {
        id: block.id,
        type: 'videoBlock',
        before: null,
        after: url,
      };
    }
    case 'dataBlock': {
      const name = block.values.find(v => v.propertyId === NAME_PROPERTY)?.text ?? null;
      return {
        id: block.id,
        type: 'dataBlock',
        before: null,
        after: name,
      };
    }
  }
}

/**
 * Convert a snapshot response into an all-added EntityDiff.
 * Used for the oldest version where there's no previous version to diff against.
 *
 * This is a DTO mapper that lives at the I/O boundary — it converts the API snapshot
 * shape into the domain EntityDiff type consumed by the diff UI.
 */
export function snapshotToDiff(snapshot: ApiEntitySnapshotResponse): EntityDiff {
  const nameValue = snapshot.values.find(v => v.propertyId === NAME_PROPERTY);
  const name = nameValue?.text ?? null;

  // Filter out BLOCKS relations from the entity-level relations since blocks are separate
  const entityRelations = snapshot.relations.filter(r => r.typeId !== BLOCKS);

  return {
    entityId: snapshot.id,
    name,
    values: snapshot.values.map(snapshotValueToChange),
    relations: entityRelations.map(snapshotRelationToChange),
    blocks: snapshot.blocks.map(snapshotBlockToChange),
  };
}

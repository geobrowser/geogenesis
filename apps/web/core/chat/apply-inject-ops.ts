'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import { storage } from '~/core/sync/use-mutate';
import type { DataType, Relation, RenderableEntityType, Value, ValueOptions } from '~/core/types';

import type { SerializedOp, SerializedPropertyValue, SerializedValue } from './inject-types';

type ConvertedScalar = {
  stringValue: string;
  dataType: DataType;
  options: ValueOptions | null;
};

// Inverse of parseDecimalString in core/utils/publish/publish.ts. Reconstructs
// a decimal string from { exponent, mantissa }. Handles negative mantissas.
function decimalToString(mantissa: string, exponent: number): string {
  if (mantissa === '0' || mantissa === '-0') return '0';
  const negative = mantissa.startsWith('-');
  const abs = negative ? mantissa.slice(1) : mantissa;

  if (exponent >= 0) {
    const out = abs + '0'.repeat(exponent);
    return negative ? `-${out}` : out;
  }

  const fractionDigits = -exponent;
  if (abs.length > fractionDigits) {
    const dot = abs.length - fractionDigits;
    const out = `${abs.slice(0, dot)}.${abs.slice(dot)}`;
    return negative ? `-${out}` : out;
  }
  const padded = abs.padStart(fractionDigits, '0');
  const out = `0.${padded}`;
  return negative ? `-${out}` : out;
}

// Maps a GRC-20 v2 PropertyValue.value into the local store's flat
// { stringValue, dataType, options } shape. Returns null for value kinds we
// don't yet round-trip (bytes / embedding / schedule / rect).
function convertSerializedValue(v: SerializedValue): ConvertedScalar | null {
  switch (v.type) {
    case 'text':
      return {
        stringValue: v.value,
        dataType: 'TEXT',
        options: v.language ? { language: v.language } : null,
      };
    case 'boolean':
      return { stringValue: v.value ? '1' : '0', dataType: 'BOOLEAN', options: null };
    case 'integer':
      return {
        stringValue: v.value,
        dataType: 'INTEGER',
        options: v.unit ? { unit: v.unit } : null,
      };
    case 'float':
      return {
        stringValue: String(v.value),
        dataType: 'FLOAT',
        options: v.unit ? { unit: v.unit } : null,
      };
    case 'decimal': {
      const mantissaStr = v.mantissa.type === 'i64' ? v.mantissa.value : null;
      if (mantissaStr === null) {
        console.warn('[inject] dropping big-mantissa decimal value; unsupported in local store');
        return null;
      }
      return {
        stringValue: decimalToString(mantissaStr, v.exponent),
        dataType: 'DECIMAL',
        options: v.unit ? { unit: v.unit } : null,
      };
    }
    case 'date':
      return { stringValue: v.value, dataType: 'DATE', options: null };
    case 'datetime':
      return { stringValue: v.value, dataType: 'DATETIME', options: null };
    case 'time':
      return { stringValue: v.value, dataType: 'TIME', options: null };
    case 'point':
      return {
        stringValue: JSON.stringify({ lon: v.lon, lat: v.lat }),
        dataType: 'POINT',
        options: null,
      };
    case 'bytes':
    case 'embedding':
    case 'schedule':
    case 'rect':
      console.warn(`[inject] skipping unsupported value type: ${v.type}`);
      return null;
  }
}

function findEntityName(values: SerializedPropertyValue[]): string | null {
  for (const pv of values) {
    if (pv.property === SystemIds.NAME_PROPERTY && pv.value.type === 'text') {
      return pv.value.value;
    }
  }
  return null;
}

export type ApplyInjectOpsResult = {
  entitiesCreated: number;
  relationsCreated: number;
  valuesSet: number;
  skipped: number;
  /** First `createEntity` op that has a non-empty Name property — treated as the primary entity for navigation + summary. */
  primaryEntityId: string | null;
  primaryEntityName: string | null;
};

/**
 * Applies a batch of decoded GRC-20 ops to the local store as staged
 * (isLocal: true, hasBeenPublished: false) values and relations. The user
 * then reviews and publishes via the standard review panel + publish flow.
 *
 * Only `createEntity` and `createRelation` ops are handled — these are the
 * only kinds the inject pipeline produces for a fresh ingest. Other op
 * types are logged and skipped.
 */
// A block relation's `renderableType` decides which editor component renders it
// (data block, text block, image, …). The remote read path derives this from
// the target entity's types (`RelationDtoLive` → `v2_getRenderableEntityType`);
// we replicate that here so inject-staged blocks render instead of falling back
// to an empty text-block placeholder. Pre-collected from the op batch since the
// type relations may appear after the relation that needs them.
function deriveRenderableType(
  toId: string,
  typesByEntity: Map<string, Set<string>>,
  entitiesWithImageUrl: Set<string>
): RenderableEntityType {
  const types = typesByEntity.get(toId);
  if (types) {
    if (types.has(SystemIds.IMAGE_TYPE)) return 'IMAGE';
    if (types.has(SystemIds.VIDEO_TYPE) || types.has(SystemIds.VIDEO_BLOCK)) return 'VIDEO';
    if (types.has(SystemIds.DATA_BLOCK)) return 'DATA';
    if (types.has(SystemIds.TEXT_BLOCK)) return 'TEXT';
  }
  if (entitiesWithImageUrl.has(toId)) return 'IMAGE';
  return 'RELATION';
}

export function applyInjectOpsToStore(ops: SerializedOp[], spaceId: string): ApplyInjectOpsResult {
  let entitiesCreated = 0;
  let relationsCreated = 0;
  let valuesSet = 0;
  let skipped = 0;
  let primaryEntityId: string | null = null;
  let primaryEntityName: string | null = null;

  // Pre-pass: index each entity's types and whether it carries an image URL, so
  // relations can resolve the correct renderable type regardless of op order.
  const typesByEntity = new Map<string, Set<string>>();
  const entitiesWithImageUrl = new Set<string>();
  for (const op of ops) {
    if (op.type === 'createRelation' && op.relationType === SystemIds.TYPES_PROPERTY) {
      const set = typesByEntity.get(op.from) ?? new Set<string>();
      set.add(op.to);
      typesByEntity.set(op.from, set);
    } else if (op.type === 'createEntity') {
      if (op.values.some(pv => pv.property === SystemIds.IMAGE_URL_PROPERTY)) {
        entitiesWithImageUrl.add(op.id);
      }
    }
  }

  for (const op of ops) {
    switch (op.type) {
      case 'createEntity': {
        const entityName = findEntityName(op.values);
        if (entityName !== null) {
          storage.entities.name.set(op.id, spaceId, entityName);
          valuesSet += 1;
          // First createEntity with a non-empty Name wins. Inject's news / post
          // pipelines emit the primary entity (the article / post itself)
          // before its supporting Person / Org / Topic stubs.
          if (primaryEntityId === null) {
            primaryEntityId = op.id;
            primaryEntityName = entityName;
          }
        }
        entitiesCreated += 1;

        for (const pv of op.values) {
          if (pv.property === SystemIds.NAME_PROPERTY) continue; // handled above
          const scalar = convertSerializedValue(pv.value);
          if (!scalar) {
            skipped += 1;
            continue;
          }
          const value: Value = {
            id: ID.createValueId({ entityId: op.id, propertyId: pv.property, spaceId }),
            entity: { id: op.id, name: entityName },
            property: { id: pv.property, name: null, dataType: scalar.dataType },
            spaceId,
            value: scalar.stringValue,
            ...(scalar.options ? { options: scalar.options } : {}),
          };
          storage.values.set(value);
          valuesSet += 1;
        }
        break;
      }
      case 'createRelation': {
        const relation: Relation = {
          id: op.id,
          entityId: op.entity ?? ID.createEntityId(),
          spaceId,
          renderableType: deriveRenderableType(op.to, typesByEntity, entitiesWithImageUrl),
          type: { id: op.relationType, name: null },
          fromEntity: { id: op.from, name: null },
          toEntity: { id: op.to, name: null, value: op.to },
          ...(op.position ? { position: op.position } : {}),
          ...(op.toSpace ? { toSpaceId: op.toSpace } : {}),
        };
        storage.relations.set(relation);
        relationsCreated += 1;
        break;
      }
      default:
        console.warn(`[inject] skipping op type ${op.type} (not yet supported)`);
        skipped += 1;
    }
  }

  return { entitiesCreated, relationsCreated, valuesSet, skipped, primaryEntityId, primaryEntityName };
}

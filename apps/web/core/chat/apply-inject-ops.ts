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
  /** `updateEntity` ops applied — non-zero means this batch enriched entities that already exist. */
  entitiesUpdated: number;
  relationsCreated: number;
  valuesSet: number;
  valuesUnset: number;
  skipped: number;
  /**
   * The entity this batch is *about*, for navigation + summary.
   *
   * A fresh ingest names it: the first `createEntity` carrying a Name wins. An enrich does not —
   * the story is already on-chain, so nothing in the batch creates or names it — and before this
   * was resolved an enrich produced no pill and nowhere to go. See `resolveEnrichTarget`.
   */
  primaryEntityId: string | null;
  /** Null on an enrich whose ops never restate the name; callers can fall back to the job's name. */
  primaryEntityName: string | null;
  /**
   * Whether the primary is one of the `entitiesCreated`, so a caller can subtract it before
   * calling the rest "supporting". On an enrich it is not — the story already existed — and
   * subtracting it there undercounts what the batch actually added.
   */
  primaryWasCreated: boolean;
};

/**
 * Applies a batch of decoded GRC-20 ops to the local store as staged
 * (isLocal: true, hasBeenPublished: false) values and relations. The user
 * then reviews and publishes via the standard review panel + publish flow.
 *
 * `createEntity`, `updateEntity` and `createRelation` are handled. Other op
 * types are logged and skipped.
 *
 * `updateEntity` is what an *enrich* is made of: the pipeline matched the URL to a story that is
 * already on-chain and is adding to it rather than minting a duplicate, so the story arrives as
 * updates to an existing id instead of a `createEntity`. It used to fall through to the `default`
 * branch and be counted as skipped, which meant every value an enrich contributed was dropped on
 * the floor — silently, since a skip is only a console warning (GEO-2983).
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

/**
 * The entity an enrich is about, when nothing in the batch names it.
 *
 * Two signals, in order of directness:
 *
 * 1. An `updateEntity` op names its target outright. If the batch updates anything, the first one
 *    is the story — the pipeline emits the story's own updates before any supporting entity's.
 * 2. Otherwise, a relation whose `from` is an entity this batch never creates is pointing at
 *    something that already exists, which is the enrich target. Only accepted when every such
 *    relation agrees, because two different pre-existing parents means this is not the shape we
 *    think it is and a guess would navigate the reader somewhere arbitrary.
 */
function resolveEnrichTarget(ops: SerializedOp[]): string | null {
  const created = new Set<string>();
  for (const op of ops) {
    if (op.type === 'createEntity') created.add(op.id);
  }

  for (const op of ops) {
    if (op.type === 'updateEntity') return op.id;
  }

  const preExistingParents = new Set<string>();
  for (const op of ops) {
    if (op.type === 'createRelation' && !created.has(op.from)) preExistingParents.add(op.from);
  }
  if (preExistingParents.size === 1) return [...preExistingParents][0];
  return null;
}

export function applyInjectOpsToStore(ops: SerializedOp[], spaceId: string): ApplyInjectOpsResult {
  let entitiesCreated = 0;
  let entitiesUpdated = 0;
  let relationsCreated = 0;
  let valuesSet = 0;
  let valuesUnset = 0;
  let skipped = 0;
  let primaryEntityId: string | null = null;
  let primaryEntityName: string | null = null;
  let primaryWasCreated = false;
  // Names learned anywhere in the batch, so an enrich target that restates its Name can label its
  // own pill instead of falling back to the job's name.
  const namesById = new Map<string, string>();

  // Stage one property value. Shared by `createEntity` and `updateEntity`: the store draws no
  // distinction between a value on a new entity and a value on an existing one — both are just
  // local values pending publish — so the two op types differ only in how they are counted.
  const stageValue = (entityId: string, entityName: string | null, pv: SerializedPropertyValue): boolean => {
    const scalar = convertSerializedValue(pv.value);
    if (!scalar) return false;
    const value: Value = {
      id: ID.createValueId({ entityId, propertyId: pv.property, spaceId }),
      entity: { id: entityId, name: entityName },
      property: { id: pv.property, name: null, dataType: scalar.dataType },
      spaceId,
      value: scalar.stringValue,
      ...(scalar.options ? { options: scalar.options } : {}),
    };
    storage.values.set(value);
    return true;
  };

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
          namesById.set(op.id, entityName);
          valuesSet += 1;
          // First createEntity with a non-empty Name wins. Inject's news / post
          // pipelines emit the primary entity (the article / post itself)
          // before its supporting Person / Org / Topic stubs.
          if (primaryEntityId === null) {
            primaryEntityId = op.id;
            primaryEntityName = entityName;
            primaryWasCreated = true;
          }
        }
        entitiesCreated += 1;

        for (const pv of op.values) {
          if (pv.property === SystemIds.NAME_PROPERTY) continue; // handled above
          if (stageValue(op.id, entityName, pv)) valuesSet += 1;
          else skipped += 1;
        }
        break;
      }
      case 'updateEntity': {
        entitiesUpdated += 1;
        const updatedName = findEntityName(op.set);
        if (updatedName !== null) {
          storage.entities.name.set(op.id, spaceId, updatedName);
          namesById.set(op.id, updatedName);
          valuesSet += 1;
        }

        for (const pv of op.set) {
          if (pv.property === SystemIds.NAME_PROPERTY) continue; // handled above
          if (stageValue(op.id, updatedName ?? namesById.get(op.id) ?? null, pv)) valuesSet += 1;
          else skipped += 1;
        }

        for (const u of op.unset) {
          // A local value carries no language dimension — `createValueId` keys on
          // entity + property + space — so an unset aimed at one translation cannot be expressed
          // here without dropping the others with it. Clearing the property outright is the
          // honest read of 'all', and of 'english' while the app is single-language. A
          // language-specific unset is left alone and counted, rather than guessed at.
          if (u.language.type === 'specific') {
            console.warn(`[inject] skipping language-specific unset for property ${u.property}`);
            skipped += 1;
            continue;
          }
          const valueId = ID.createValueId({ entityId: op.id, propertyId: u.property, spaceId });
          const existing = storage.values.get(valueId, op.id);
          if (existing) {
            storage.values.delete(existing);
            valuesUnset += 1;
          }
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

  // An enrich names nothing, so the loop above leaves the primary unset. Derive it from the shape
  // of the batch instead — otherwise the reader gets "Imported 0 entities" and stays where they
  // are, with the staged edits sitting on a page they were never shown (GEO-2983).
  if (primaryEntityId === null) {
    primaryEntityId = resolveEnrichTarget(ops);
    if (primaryEntityId !== null) primaryEntityName = namesById.get(primaryEntityId) ?? null;
  }

  return {
    entitiesCreated,
    entitiesUpdated,
    relationsCreated,
    valuesSet,
    valuesUnset,
    skipped,
    primaryEntityId,
    primaryEntityName,
    primaryWasCreated,
  };
}

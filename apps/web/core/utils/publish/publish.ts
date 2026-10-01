import {
  ContentIds,
  type DecimalMantissa,
  Graph,
  IdUtils,
  Op,
  Ops,
  type PropertyValueParam,
  SystemIds,
} from '@geoprotocol/geo-sdk/lite';
import { updateRelation as updateGrc20Relation } from '@geoprotocol/grc-20';

import { Effect } from 'effect';

import { Relation, Value } from '~/core/types';
import { GeoDate, GeoPoint } from '~/core/utils/utils';

import { PrepareOpsError } from '../../errors';
import { buildOrphanChildDeleteOps } from './delete-orphan-blocks';

export type PrepareLocalDataOptions = {
  /**
   * Optional replacement for orphan-delete ops (e.g. in tests to avoid network).
   * When not provided, uses the real buildOrphanChildDeleteOps.
   */
  getOrphanDeleteOps?: (args: {
    deletedRelations: Relation[];
    allLocalRelations: Relation[];
    spaceId: string;
  }) => Effect.Effect<Op[], Error>;
};

/**
 * Converts local values and relations to GRC-20 Ops for publishing.
 *
 * Returns an Effect so that SDK validation errors (e.g. invalid IDs from
 * assertValid) are captured with full context instead of throwing bare
 * errors that surface as React render crashes with no logging.
 */
export function prepareLocalDataForPublishing(
  values: Value[],
  relations: Relation[],
  spaceId: string,
  options?: PrepareLocalDataOptions
): Effect.Effect<Op[], PrepareOpsError> {
  const program = Effect.gen(function* () {
    const baseOps = prepareOps(values, relations, spaceId);

    // Only cascade-delete targets for relation types whose targets are "owned content".
    // Other relation types (e.g. TYPES_PROPERTY, RELATED_TOPICS) should not cascade.
    const CASCADING_RELATION_TYPES: Set<string> = new Set([
      SystemIds.BLOCKS,
      SystemIds.COVER_PROPERTY,
      ContentIds.AVATAR_PROPERTY,
      SystemIds.TABS_PROPERTY,
    ]);

    const deletedRelations = relations.filter(
      r =>
        r.spaceId === spaceId && r.isLocal === true && r.isDeleted === true && CASCADING_RELATION_TYPES.has(r.type.id)
    );

    if (deletedRelations.length === 0) {
      return baseOps;
    }

    const orphanArgs = { deletedRelations, allLocalRelations: relations, spaceId };
    const orphanOps = options?.getOrphanDeleteOps
      ? yield* options.getOrphanDeleteOps(orphanArgs)
      : yield* Effect.promise(() => buildOrphanChildDeleteOps(orphanArgs));

    return [...baseOps, ...orphanOps];
  });

  return program.pipe(
    Effect.catchAll(error => {
      console.error('[PUBLISH] prepareLocalDataForPublishing failed:', error, {
        values,
        relations,
        spaceId,
      });
      return Effect.fail(new PrepareOpsError('Failed to prepare ops for publishing', { cause: error as unknown }));
    })
  );
}

/**
 * Local changes in `spaceId` that `prepareOps` would silently discard because they are not attached
 * to any entity (GEO-2966).
 *
 * `prepareOps` skips a value whose `entity.id` is `''`, and `Graph.createRelation` throws on a
 * relation whose `fromEntity.id` is `''`. Either way the user's change never reaches the edit, while
 * the review screen, which does not check ids, keeps showing it. Callers use this to say so instead
 * of reporting "an empty edit" or a generic failure.
 */
export function findUnattachedChanges(
  values: Value[],
  relations: Relation[],
  spaceId: string
): { values: Value[]; relations: Relation[] } {
  return {
    values: values.filter(
      v =>
        v.spaceId === spaceId && !v.hasBeenPublished && v.isLocal === true && v.property.id !== '' && v.entity.id === ''
    ),
    relations: relations.filter(r => r.spaceId === spaceId && !r.isDeleted && r.fromEntity.id === ''),
  };
}

/** The user-facing error for changes `findUnattachedChanges` found, naming what would be lost. */
export function describeUnattachedChanges(unattached: { values: Value[]; relations: Relation[] }): string {
  const count = unattached.values.length + unattached.relations.length;
  const names = [
    ...new Set([
      ...unattached.values.map(v => v.property.name || v.property.id),
      ...unattached.relations.map(r => r.type.name || r.type.id),
    ]),
  ];
  const noun = count === 1 ? 'change is' : 'changes are';

  return (
    `Unable to publish: ${count} ${noun} not attached to any entity (${names.join(', ')}), ` +
    'so publishing would drop them. Deselect or discard them in review, then make them again.'
  );
}

function prepareOps(values: Value[], relations: Relation[], spaceId: string): Op[] {
  const validValues = values.filter(
    v =>
      v.spaceId === spaceId && !v.hasBeenPublished && v.property.id !== '' && v.entity.id !== '' && v.isLocal === true
  );

  const ops: Op[] = [];

  for (const r of relations) {
    if (r.isDeleted) {
      const { ops: deleteOps } = Graph.deleteRelation({ id: r.id });
      ops.push(...deleteOps);
    } else if (r.isRelationUpdate) {
      if (r.relationUpdateUnsetFields?.length) {
        ops.push(
          updateGrc20Relation({
            id: IdUtils.toGrcId(r.id),
            position: r.position,
            ...(r.toSpaceId && { toSpace: IdUtils.toGrcId(r.toSpaceId) }),
            unset: r.relationUpdateUnsetFields,
          })
        );
      } else {
        const { ops: updateOps } = Ops.relations.update({
          id: r.id,
          position: r.position,
          ...(r.toSpaceId && { toSpace: r.toSpaceId }),
        });
        ops.push(...updateOps);
      }
    } else {
      const { ops: createOps } = Graph.createRelation({
        fromEntity: r.fromEntity.id,
        toEntity: r.toEntity.id,
        type: r.type.id,
        id: r.id,
        entityId: r.entityId,
        position: r.position ?? undefined,
        ...(r.toSpaceId && { toSpace: r.toSpaceId }),
      });
      ops.push(...createOps);
    }
  }

  const valuesByEntity = validValues.reduce(
    (acc, value) => {
      const entityId = value.entity.id;
      if (!acc[entityId]) {
        acc[entityId] = { deleted: [], set: [] };
      }
      if (value.isDeleted) {
        acc[entityId].deleted.push(value);
      } else {
        acc[entityId].set.push(value);
      }
      return acc;
    },
    {} as Record<string, { deleted: Value[]; set: Value[] }>
  );

  for (const [entityId, { deleted, set }] of Object.entries(valuesByEntity)) {
    const grc20Values = set.map(convertToGrc20Value).filter((v): v is PropertyValueParam => v !== null);
    const grc20Unset = deleted
      .filter(value => value.property.dataType !== 'RELATION')
      .map(value => ({
        property: value.property.id,
        language: 'all' as const,
      }));

    if (grc20Values.length > 0 || grc20Unset.length > 0) {
      const { ops: updateOps } = Graph.updateEntity({
        id: entityId,
        values: grc20Values.length > 0 ? grc20Values : undefined,
        unset: grc20Unset.length > 0 ? grc20Unset : undefined,
      });
      ops.push(...updateOps);
    }
  }

  return ops;
}

function convertToGrc20Value(value: Value): PropertyValueParam | null {
  const { dataType } = value.property;
  const val = value.value;
  const property = value.property.id;

  switch (dataType) {
    case 'RELATION':
      // Relations are handled separately via Graph.createRelation/deleteRelation.
      // They can end up in the values array from the local store, so skip them.
      console.log('[PUBLISH] Skipping RELATION value in convertToGrc20Value', { value, property });
      return null;
    case 'TEXT':
      return {
        property,
        type: 'text',
        value: val,
        ...(value.options?.language && { language: value.options.language }),
      };
    case 'SCHEDULE':
      return { property, type: 'schedule', value: val };
    case 'BOOLEAN':
      return { property, type: 'boolean', value: val === '1' || val === 'true' };
    case 'INTEGER':
      return {
        property,
        type: 'integer',
        value: parseInt(val, 10) || 0,
        ...(value.options?.unit && { unit: value.options.unit }),
      };
    case 'FLOAT':
      return {
        property,
        type: 'float',
        value: parseFloat(val) || 0,
        ...(value.options?.unit && { unit: value.options.unit }),
      };
    case 'DECIMAL': {
      const { exponent, mantissa } = parseDecimalString(val);
      return {
        property,
        type: 'decimal',
        exponent,
        mantissa,
        ...(value.options?.unit && { unit: value.options.unit }),
      };
    }
    case 'DATE':
      // Stored as full ISO string (e.g. "2024-01-15T00:00:00.000Z"), SDK expects "YYYY-MM-DD"
      return { property, type: 'date', value: toRfc3339Date(val) };
    case 'DATETIME':
      // Stored as full ISO string (e.g. "2024-01-15T14:30:00.000Z"), SDK expects "YYYY-MM-DDTHH:MM:SSZ"
      return { property, type: 'datetime', value: toRfc3339Datetime(val) };
    case 'TIME':
      // Stored as full ISO string (e.g. "1970-01-01T14:30:00.000Z"), SDK expects "HH:MM:SSZ"
      return { property, type: 'time', value: toRfc3339Time(val) };
    case 'POINT': {
      const point = parsePointValue(val);
      if (!point) throw new Error(`Invalid lon/lat conversion data type ${val}`);
      return { property, type: 'point', lon: point.lon, lat: point.lat };
    }
    default:
      throw new Error(`Unsupported conversion data type: ${dataType}`);
  }
}

/**
 * A stored POINT value, in either encoding the app writes.
 */
function parsePointValue(val: string): { lon: number; lat: number } | null {
  try {
    const parsed = JSON.parse(val);
    if (parsed !== null && typeof parsed === 'object') {
      const lon = (parsed as Record<string, unknown>).lon ?? (parsed as Record<string, unknown>).x;
      const lat = (parsed as Record<string, unknown>).lat ?? (parsed as Record<string, unknown>).y;
      if (typeof lon === 'number' && typeof lat === 'number' && Number.isFinite(lon) && Number.isFinite(lat)) {
        return { lon, lat };
      }
    }
  } catch {
    // Not JSON. The comma form below is the other encoding, not a failure.
  }

  // `parseCoordinates` reads `"lat, lon"` in that order, trims, and rejects anything that is not two
  // numbers — the same reading the entity page renders from, so the published point and the drawn
  // one cannot disagree.
  const coordinates = GeoPoint.parseCoordinates(val);
  return coordinates ? { lon: coordinates.longitude, lat: coordinates.latitude } : null;
}

/**
 * Parse a decimal string (e.g. "10.1", "-0.005", "42") into the SDK's
 * normalized { exponent, mantissa } representation.
 *
 * The mantissa is the integer value with trailing zeros stripped, and
 * the exponent is the power of 10 to multiply by. For example:
 *   "10.1"   → mantissa = 101n, exponent = -1
 *   "0.005"  → mantissa = 5n,   exponent = -3
 *   "42"     → mantissa = 42n,  exponent = 0
 *   "0"      → mantissa = 0n,   exponent = 0
 */
function parseDecimalString(val: string): { exponent: number; mantissa: DecimalMantissa } {
  const trimmed = val.trim();

  // Split on decimal point
  const dotIndex = trimmed.indexOf('.');
  let integerPart: string;
  let fractionPart: string;

  if (dotIndex === -1) {
    integerPart = trimmed;
    fractionPart = '';
  } else {
    integerPart = trimmed.slice(0, dotIndex);
    fractionPart = trimmed.slice(dotIndex + 1);
  }

  // Combine into a single integer string: "10.1" → "101", decimal places = 1
  const decimalPlaces = fractionPart.length;
  const combined = integerPart + fractionPart; // e.g. "101"
  let mantissaBigInt = BigInt(combined);

  if (mantissaBigInt === 0n) {
    return { exponent: 0, mantissa: { type: 'i64', value: 0n } };
  }

  // Normalize: strip trailing zeros from mantissa, adjust exponent
  // e.g. mantissa=1010, exp=-2 → mantissa=101, exp=-1
  let exponent = decimalPlaces === 0 ? 0 : -decimalPlaces;
  while (mantissaBigInt !== 0n && mantissaBigInt % 10n === 0n) {
    mantissaBigInt = mantissaBigInt / 10n;
    exponent += 1;
  }

  return { exponent, mantissa: { type: 'i64', value: mantissaBigInt } };
}

/**
 * Parses a stored date/time value, refusing one the engine cannot read.
 *
 * An unreadable value used to become "NaN-NaN-NaN", which the SDK only rejects at encode time and
 * the publish flow then reports, and retries, as an IPFS upload failure.
 */
function parseStoredDate(val: string): Date {
  const date = new Date(GeoDate.toFullISOString(val));
  if (Number.isNaN(date.getTime())) throw new Error(`Cannot publish unreadable date value "${val}"`);
  return date;
}

/**
 * Convert a stored value to RFC 3339 date-only: "YYYY-MM-DD"
 */
function toRfc3339Date(val: string): string {
  const date = parseStoredDate(val);
  const yyyy = String(date.getUTCFullYear()).padStart(4, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Convert a stored value to RFC 3339 time-only: "HH:MM:SSZ"
 */
function toRfc3339Time(val: string): string {
  const date = parseStoredDate(val);
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${min}:${ss}Z`;
}

/**
 * Convert a stored value to RFC 3339 datetime: "YYYY-MM-DDTHH:MM:SSZ"
 */
function toRfc3339Datetime(val: string): string {
  return `${toRfc3339Date(val)}T${toRfc3339Time(val)}`;
}

export const Publish = {
  prepareLocalDataForPublishing,
  findUnattachedChanges,
  describeUnattachedChanges,
  /** @internal Exported for testing only */
  parseDecimalString,
  toRfc3339Date,
  toRfc3339Time,
  toRfc3339Datetime,
};

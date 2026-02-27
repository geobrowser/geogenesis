import { type DecimalMantissa, Graph, Op, type PropertyValueParam } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';

import { Relation, Value } from '~/core/types';
import { GeoDate } from '~/core/utils/utils';

import { PrepareOpsError } from '../../errors';

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
  spaceId: string
): Effect.Effect<Op[], PrepareOpsError> {
  return Effect.try({
    try: () => prepareOps(values, relations, spaceId),
    catch: error => {
      console.error('[PUBLISH] prepareLocalDataForPublishing failed:', error, {
        values,
        relations,
        spaceId,
      });
      return new PrepareOpsError('Failed to prepare ops for publishing', { cause: error });
    },
  });
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
      try {
        const point = JSON.parse(val);
        return {
          property,
          type: 'point',
          lon: point.lon ?? point.x ?? 0,
          lat: point.lat ?? point.y ?? 0,
        };
      } catch {
        throw new Error(`Invalid lon/lat conversion data type ${val}`);
      }
    }
    default:
      throw new Error(`Unsupported conversion data type: ${dataType}`);
  }
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
 * Convert a stored value to RFC 3339 date-only: "YYYY-MM-DD"
 */
function toRfc3339Date(val: string): string {
  const date = new Date(GeoDate.toFullISOString(val));
  const yyyy = String(date.getUTCFullYear()).padStart(4, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Convert a stored value to RFC 3339 time-only: "HH:MM:SSZ"
 */
function toRfc3339Time(val: string): string {
  const date = new Date(GeoDate.toFullISOString(val));
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
  /** @internal Exported for testing only */
  parseDecimalString,
  toRfc3339Date,
  toRfc3339Time,
  toRfc3339Datetime,
};

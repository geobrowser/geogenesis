import { Graph, Op, type PropertyValueParam } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';

import { Relation, Value } from '~/core/types';

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
    const grc20Values = set.map(convertToGrc20Value);
    const grc20Unset = deleted.map(value => ({
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

// "10.5" → { mantissa: 105n, exponent: -1 }
// "300"  → { mantissa: 300n, exponent: 0 }
function decimalToMantissaExponent(val: string): { mantissa: bigint; exponent: number } {
  const trimmed = val.trim();
  if (!trimmed || isNaN(Number(trimmed))) {
    return { mantissa: 0n, exponent: 0 };
  }

  const negative = trimmed.startsWith('-');
  const abs = negative ? trimmed.slice(1) : trimmed;

  const dotIndex = abs.indexOf('.');
  if (dotIndex === -1) {
    return { mantissa: BigInt(negative ? `-${abs}` : abs), exponent: 0 };
  }

  const fractionalDigits = abs.length - dotIndex - 1;
  const withoutDot = abs.slice(0, dotIndex) + abs.slice(dotIndex + 1);
  const mantissa = BigInt(negative ? `-${withoutDot}` : withoutDot);
  return { mantissa, exponent: -fractionalDigits };
}

function convertToGrc20Value(value: Value): PropertyValueParam {
  const { dataType } = value.property;
  const val = value.value;
  const property = value.property.id;

  switch (dataType) {
    case 'TEXT':
      return {
        property,
        type: 'text',
        value: val,
        ...(value.options?.language && { language: value.options.language }),
      } as PropertyValueParam;
    case 'BOOL':
      return { property, type: 'boolean', value: val === '1' || val === 'true' } as PropertyValueParam;
    case 'INTEGER':
      return {
        property,
        type: 'integer',
        value: parseInt(val, 10) || 0,
        ...(value.options?.unit && { unit: value.options.unit }),
      } as PropertyValueParam;
    case 'FLOAT':
      return {
        property,
        type: 'float',
        value: parseFloat(val) || 0,
        ...(value.options?.unit && { unit: value.options.unit }),
      } as PropertyValueParam;
    case 'DECIMAL': {
      const { mantissa, exponent } = decimalToMantissaExponent(val);
      const decimalParam = {
        property,
        type: 'decimal',
        mantissa: { type: 'i64' as const, value: mantissa },
        exponent,
        ...(value.options?.unit && { unit: value.options.unit }),
      } as PropertyValueParam;
      return decimalParam;
    }
    case 'DATE':
      return { property, type: 'date', value: val } as PropertyValueParam;
    case 'DATETIME':
      return { property, type: 'datetime', value: val } as PropertyValueParam;
    case 'TIME':
      return { property, type: 'time', value: val } as PropertyValueParam;
    case 'POINT': {
      try {
        const point = JSON.parse(val);
        return {
          property,
          type: 'point',
          lon: point.lon ?? point.x ?? 0,
          lat: point.lat ?? point.y ?? 0,
        } as PropertyValueParam;
      } catch {
        return { property, type: 'point', lon: 0, lat: 0 } as PropertyValueParam;
      }
    }
    default:
      return { property, type: 'text', value: val } as PropertyValueParam;
  }
}

export const Publish = {
  prepareLocalDataForPublishing,
};

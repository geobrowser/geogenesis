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
    const sdkValues = set.map(convertToSdkValue);
    const sdkUnset = deleted.map(value => ({
      property: value.property.id,
      language: 'all' as const,
    }));

    if (sdkValues.length > 0 || sdkUnset.length > 0) {
      const { ops: updateOps } = Graph.updateEntity({
        id: entityId,
        values: sdkValues.length > 0 ? sdkValues : undefined,
        unset: sdkUnset.length > 0 ? sdkUnset : undefined,
      });
      ops.push(...updateOps);
    }
  }

  return ops;
}

function convertToSdkValue(value: Value): PropertyValueParam {
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
      return { property, type: 'bool', value: val === '1' || val === 'true' } as PropertyValueParam;
    case 'INT64':
      return {
        property,
        type: 'int64',
        value: parseInt(val, 10) || 0,
        ...(value.options?.unit && { unit: value.options.unit }),
      } as unknown as PropertyValueParam;
    case 'FLOAT64':
    case 'DECIMAL':
      return {
        property,
        type: 'float64',
        value: parseFloat(val) || 0,
        ...(value.options?.unit && { unit: value.options.unit }),
      } as PropertyValueParam;
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

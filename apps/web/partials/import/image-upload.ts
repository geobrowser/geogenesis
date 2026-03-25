import { Graph, Position } from '@geoprotocol/geo-sdk';

import { ID } from '~/core/id';
import type { Property, Relation, Value } from '~/core/types';
import { extractValueString } from '~/core/utils/value';

import type { ImageImportTask } from './atoms';
import { getPropertyFromSources } from './import-generation';

type PropertyLookup = {
  schema: Property[];
  extraProperties: Record<string, Property>;
  getProperty: (propertyId: string) => Property | null;
};

/** Convert a Uint8Array or string ID to a hex string. */
function toHexId(id: unknown): string {
  if (typeof id === 'string') return id;
  if (id instanceof Uint8Array) {
    return Array.from(id)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  if (Array.isArray(id) || (id && typeof id === 'object' && 'length' in id)) {
    return Array.from(id as ArrayLike<number>)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return String(id);
}

/**
 * Scan data rows for IMAGE-typed columns and collect upload tasks.
 * Each task pairs a URL with the row entity it should be linked to.
 */
export function collectImageTasks(params: {
  dataRows: string[][];
  columnMapping: Record<number, string>;
  resolvedRows: Map<number, { entityId: string; name: string }>;
  propertyLookup: PropertyLookup;
}): ImageImportTask[] {
  const { dataRows, columnMapping, resolvedRows, propertyLookup } = params;
  const tasks: ImageImportTask[] = [];

  for (const [colIdxStr, propertyId] of Object.entries(columnMapping)) {
    const property = getPropertyFromSources(propertyId, propertyLookup);
    if (!property || property.dataType !== 'RELATION' || property.renderableTypeStrict !== 'IMAGE') continue;

    const colIdx = parseInt(colIdxStr, 10);

    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
      const raw = (dataRows[rowIndex][colIdx] ?? '').trim();
      if (!raw) continue;

      const resolvedRow = resolvedRows.get(rowIndex);
      if (!resolvedRow) continue;

      if (!isValidImageUrl(raw)) continue;

      tasks.push({
        rowIndex,
        colIdx,
        propertyId,
        propertyName: property.name ?? '',
        fromEntityId: resolvedRow.entityId,
        fromEntityName: resolvedRow.name,
        url: raw,
      });
    }
  }

  return tasks;
}

function isValidImageUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

/**
 * Upload images to Geo IPFS and convert the resulting SDK ops into
 * Value and Relation objects that the normal import publish pipeline
 * can handle. Follows the same pattern as `use-mutate.tsx` `images.createAndLink`.
 *
 * Processes images with controlled concurrency.
 */
export async function uploadImportImages(params: {
  tasks: ImageImportTask[];
  spaceId: string;
  onProgress?: (completed: number, total: number) => void;
}): Promise<{
  values: Value[];
  relations: Relation[];
  errors: Array<{ task: ImageImportTask; error: unknown }>;
}> {
  const { tasks, spaceId, onProgress } = params;
  const allValues: Value[] = [];
  const allRelations: Relation[] = [];
  const errors: Array<{ task: ImageImportTask; error: unknown }> = [];
  let completed = 0;

  const CONCURRENCY = 3;
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(task => uploadSingleImage(task, spaceId))
    );

    for (let j = 0; j < results.length; j++) {
      completed++;
      const result = results[j];
      if (result.status === 'fulfilled') {
        allValues.push(...result.value.values);
        allRelations.push(...result.value.relations);
      } else {
        errors.push({ task: batch[j], error: result.reason });
        console.error('[import] Failed to upload image:', batch[j].url, result.reason);
      }
    }

    onProgress?.(completed, tasks.length);
  }

  return { values: allValues, relations: allRelations, errors };
}

/**
 * Upload a single image and return Values/Relations matching the
 * pattern from `use-mutate.tsx` `images.createAndLink`.
 */
async function uploadSingleImage(
  task: ImageImportTask,
  spaceId: string
): Promise<{ values: Value[]; relations: Relation[] }> {
  const values: Value[] = [];
  const relations: Relation[] = [];

  // 1. Upload image to IPFS via the SDK
  const { id: imageId, ops: createImageOps } = await Graph.createImage({
    url: task.url,
    network: 'TESTNET',
  });

  const imageIdStr = toHexId(imageId);

  // 2. Process SDK ops into Values and Relations for the image entity
  //    (matches use-mutate.tsx createAndLink pattern)
  for (const op of createImageOps) {
    if (op.type === 'createRelation') {
      relations.push({
        id: toHexId(op.id),
        entityId: op.entity ? toHexId(op.entity) : toHexId(op.from),
        fromEntity: {
          id: toHexId(op.from),
          name: null,
        },
        type: {
          id: toHexId(op.relationType),
          name: 'Image',
        },
        toEntity: {
          id: toHexId(op.to),
          name: 'Image',
          value: toHexId(op.to),
        },
        spaceId,
        position: Position.generate(),
        renderableType: 'RELATION',
        isLocal: true,
      });
    } else if (op.type === 'createEntity') {
      for (const pv of op.values) {
        values.push({
          id: ID.createValueId({
            entityId: toHexId(op.id),
            propertyId: toHexId(pv.property),
            spaceId,
          }),
          entity: {
            id: toHexId(op.id),
            name: null,
          },
          property: {
            id: toHexId(pv.property),
            name: 'Image Property',
            dataType: 'TEXT',
            renderableType: 'URL',
          },
          spaceId,
          value: extractValueString(pv.value),
          isLocal: true,
        });
      }
    }
  }

  // 3. Create the relation linking the row entity to the image entity
  relations.push({
    id: ID.createEntityId(),
    entityId: ID.createEntityId(),
    fromEntity: {
      id: task.fromEntityId,
      name: task.fromEntityName,
    },
    type: {
      id: task.propertyId,
      name: task.propertyName,
    },
    toEntity: {
      id: imageIdStr,
      name: null,
      value: imageIdStr,
    },
    spaceId,
    position: Position.generate(),
    renderableType: 'IMAGE',
    isLocal: true,
  });

  return { values, relations };
}

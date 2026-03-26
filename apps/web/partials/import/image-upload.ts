import { Graph, Position, SystemIds } from '@geoprotocol/geo-sdk';

import { ID } from '~/core/id';
import type { Property, Relation, Value } from '~/core/types';
import { extractValueString } from '~/core/utils/value';

import type { ImageEntityData, ImageImportTask } from './atoms';
import { toImportCellKey } from './import-generation';
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

export function isValidImageUrl(value: string): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('ipfs://');
}

/**
 * Upload images to Geo IPFS and return per-cell image entity data.
 * The returned cache is keyed by `${rowIndex}:${colIdx}` and contains
 * the image entity's own values/relations (not the linking relation to
 * the row entity — that is regenerated at merge time from current resolved rows).
 *
 * Processes images with controlled concurrency.
 */
export async function uploadImportImages(params: {
  tasks: ImageImportTask[];
  spaceId: string;
  onProgress?: (completed: number, total: number) => void;
}): Promise<{
  cache: Record<string, ImageEntityData>;
  errors: Array<{ task: ImageImportTask; error: unknown }>;
}> {
  const { tasks, spaceId, onProgress } = params;
  const cache: Record<string, ImageEntityData> = {};
  const errors: Array<{ task: ImageImportTask; error: unknown }> = [];
  let completed = 0;

  const CONCURRENCY = 3;
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(task => processImageTask(task, spaceId))
    );

    for (let j = 0; j < results.length; j++) {
      completed++;
      const result = results[j];
      if (result.status === 'fulfilled') {
        const key = toImportCellKey(batch[j].rowIndex, batch[j].colIdx);
        cache[key] = result.value;
      } else {
        errors.push({ task: batch[j], error: result.reason });
        console.error('[import] Failed to upload image:', batch[j].url, result.reason);
      }
    }

    onProgress?.(completed, tasks.length);
  }

  return { cache, errors };
}

/**
 * Build the full set of Values and Relations for image entities, including
 * linking relations from the current resolved rows. Called during both
 * initial generation and rebuild to ensure linking relations use fresh entity IDs.
 */
export function buildImageValuesAndRelations(params: {
  cache: Record<string, ImageEntityData>;
  resolvedRows: Map<number, { entityId: string; name: string }>;
  spaceId: string;
}): { values: Value[]; relations: Relation[] } {
  const { cache, resolvedRows, spaceId } = params;
  const values: Value[] = [];
  const relations: Relation[] = [];

  for (const [cellKey, data] of Object.entries(cache)) {
    // Add the image entity's own values and internal relations
    values.push(...data.values);
    relations.push(...data.relations);

    // Parse rowIndex from cellKey ("rowIndex:colIdx")
    const rowIndex = parseInt(cellKey.split(':')[0], 10);
    const resolvedRow = resolvedRows.get(rowIndex);
    if (!resolvedRow) continue;

    // Create the linking relation from the row entity to the image entity
    relations.push({
      id: ID.createEntityId(),
      entityId: ID.createEntityId(),
      fromEntity: {
        id: resolvedRow.entityId,
        name: resolvedRow.name,
      },
      type: {
        id: data.propertyId,
        name: data.propertyName,
      },
      toEntity: {
        id: data.imageEntityId,
        name: null,
        value: data.imageEntityId,
      },
      spaceId,
      position: Position.generate(),
      renderableType: 'IMAGE',
      isLocal: true,
    });
  }

  return { values, relations };
}

/**
 * Process a single image task: upload to IPFS (for http(s) URLs) or
 * create the image entity directly (for ipfs:// URLs).
 * Returns the image entity data without the linking relation.
 */
async function processImageTask(task: ImageImportTask, spaceId: string): Promise<ImageEntityData> {
  const isIpfs = task.url.trim().toLowerCase().startsWith('ipfs://');

  if (isIpfs) {
    return createIpfsImageEntity(task, spaceId);
  }

  return uploadAndCreateImageEntity(task, spaceId);
}

/**
 * Upload an external URL to IPFS and create the image entity data.
 */
async function uploadAndCreateImageEntity(task: ImageImportTask, spaceId: string): Promise<ImageEntityData> {
  const values: Value[] = [];
  const relations: Relation[] = [];

  const { id: imageId, ops: createImageOps } = await Graph.createImage({
    url: task.url,
    network: 'TESTNET',
  });

  const imageEntityId = toHexId(imageId);

  for (const op of createImageOps) {
    if (op.type === 'createRelation') {
      relations.push({
        id: toHexId(op.id),
        entityId: op.entity ? toHexId(op.entity) : toHexId(op.from),
        fromEntity: { id: toHexId(op.from), name: null },
        type: { id: toHexId(op.relationType), name: null },
        toEntity: { id: toHexId(op.to), name: null, value: toHexId(op.to) },
        spaceId,
        position: Position.generate(),
        renderableType: 'RELATION',
        isLocal: true,
      });
    } else if (op.type === 'createEntity') {
      for (const pv of op.values) {
        values.push({
          id: ID.createValueId({ entityId: toHexId(op.id), propertyId: toHexId(pv.property), spaceId }),
          entity: { id: toHexId(op.id), name: null },
          property: { id: toHexId(pv.property), name: null, dataType: 'TEXT', renderableType: 'URL' },
          spaceId,
          value: extractValueString(pv.value),
          isLocal: true,
        });
      }
    }
  }

  return { imageEntityId, propertyId: task.propertyId, propertyName: task.propertyName, values, relations };
}

/**
 * Create an image entity for an ipfs:// URL without re-uploading.
 * Directly creates the entity with the IMAGE_URL_PROPERTY value and Types relation.
 */
function createIpfsImageEntity(task: ImageImportTask, spaceId: string): ImageEntityData {
  const imageEntityId = ID.createEntityId();

  const values: Value[] = [
    {
      id: ID.createValueId({ entityId: imageEntityId, propertyId: SystemIds.IMAGE_URL_PROPERTY, spaceId }),
      entity: { id: imageEntityId, name: null },
      property: { id: SystemIds.IMAGE_URL_PROPERTY, name: 'Image URL', dataType: 'TEXT', renderableType: 'URL' },
      spaceId,
      value: task.url.trim(),
      isLocal: true,
    },
  ];

  const relations: Relation[] = [
    {
      id: ID.createEntityId(),
      entityId: ID.createEntityId(),
      fromEntity: { id: imageEntityId, name: null },
      type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
      toEntity: { id: SystemIds.IMAGE_TYPE, name: 'Image', value: SystemIds.IMAGE_TYPE },
      spaceId,
      position: Position.generate(),
      renderableType: 'RELATION',
      isLocal: true,
    },
  ];

  return { imageEntityId, propertyId: task.propertyId, propertyName: task.propertyName, values, relations };
}

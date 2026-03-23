import { Position, SystemIds } from '@geoprotocol/geo-sdk';

import { Effect } from 'effect';

import { ID } from '~/core/id';
import { getEntity } from '~/core/io/queries';
import { Property, Relation, RenderableEntityType, Value } from '~/core/types';

import type { UnresolvedImportCell } from './atoms';
import { parseCheckboxValue } from './checkbox-parse';
import { splitRelationCell } from './relation-cell';

type PropertyLookup = {
  schema: Property[];
  extraProperties: Record<string, Property>;
  getProperty: (propertyId: string) => Property | null;
};

export type RelationPropertyMeta = {
  propertyId: string;
  property: Property;
  typeIds: string[];
  uniqueCellValues: Set<string>;
};

export type ResolvedEntity =
  | { id: string; name: string; status: 'found' | 'created'; typeId?: string; typeName?: string | null }
  | { status: 'ambiguous' };

export type BuildRowsInput = {
  dataRows: string[][];
  columnMapping: Record<number, string>;
  resolvedRows: Map<number, { entityId: string; name: string }>;
  selectedType: { id: string; name: string | null } | null;
  typesColumnIndex: number | undefined;
  resolvedTypes: Map<string, { id: string; name: string; isNew?: boolean }>;
  resolvedEntities: Map<string, ResolvedEntity>;
  spaceId: string;
  propertyLookup: PropertyLookup;
  /** Look up existing relations for an entity to avoid creating duplicates. */
  getExistingRelations?: (entityId: string) => Relation[];
  /** Manual checkbox overrides keyed by import cell key (`${rowIndex}:${colIdx}`). Value is `'1'` or `'0'`. */
  checkboxOverrides?: Record<string, string>;
};

export function toImportCellKey(rowIndex: number, csvColumnIndex: number): string {
  return `${rowIndex}:${csvColumnIndex}`;
}

export function buildUnresolvedLinksByCell(params: {
  dataRows: string[][];
  columnMapping: Record<number, string>;
  nameColIdx: number;
  typesColumnIndex: number | undefined;
  resolvedTypes: Map<string, { id: string; name: string }>;
  resolvedRows: Map<number, { entityId: string; name: string }>;
  resolvedEntities: Map<string, ResolvedEntity>;
  propertyLookup: PropertyLookup;
  checkboxOverrides?: Record<string, string>;
}): Record<string, UnresolvedImportCell> {
  const {
    dataRows,
    columnMapping,
    nameColIdx,
    typesColumnIndex,
    resolvedTypes,
    resolvedRows,
    resolvedEntities,
    propertyLookup,
    checkboxOverrides = {},
  } = params;
  const flags: Record<string, UnresolvedImportCell> = {};

  for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
    const row = dataRows[rowIndex];

    if (typesColumnIndex !== undefined) {
      const rawType = (row[typesColumnIndex] ?? '').trim();
      if (rawType && !resolvedTypes.has(rawType)) {
        flags[toImportCellKey(rowIndex, typesColumnIndex)] = { kind: 'type', rawType };
      }
    }

    const resolvedRow = resolvedRows.get(rowIndex);
    if (!resolvedRow) {
      const rowName = (row[nameColIdx] ?? '').trim();
      if (rowName) {
        flags[toImportCellKey(rowIndex, nameColIdx)] = { kind: 'entity' };
      }
    }

    for (const [colIdxStr, propertyId] of Object.entries(columnMapping)) {
      if (propertyId === SystemIds.NAME_PROPERTY) continue;
      if (propertyId === SystemIds.TYPES_PROPERTY) continue;
      const colIdx = parseInt(colIdxStr, 10);
      const raw = (row[colIdx] ?? '').trim();
      if (!raw) continue;

      const property = getPropertyFromSources(propertyId, propertyLookup);
      if (!property) continue;

      if (property.dataType === 'BOOLEAN') {
        const cellKey = toImportCellKey(rowIndex, colIdx);
        if (!checkboxOverrides[cellKey]) {
          const result = parseCheckboxValue(raw);
          if (!result.parsed) {
            flags[cellKey] = { kind: 'checkbox', rawValue: raw };
          }
        }
        continue;
      }

      if (property.dataType !== 'RELATION') continue;

      const unresolvedValues: string[] = [];

      for (const part of splitRelationCell(raw)) {
        const resolved = resolvedEntities.get(`${propertyId}::${part}`);
        if (!resolved || resolved.status === 'ambiguous') {
          unresolvedValues.push(part);
        }
      }

      if (unresolvedValues.length > 0) {
        flags[toImportCellKey(rowIndex, colIdx)] = {
          kind: 'relation',
          unresolvedValues: Array.from(new Set(unresolvedValues)),
        };
      }
    }
  }

  return flags;
}

export function createGenerationTracker() {
  let current = 0;

  return {
    start() {
      current += 1;
      return current;
    },
    isCurrent(id: number) {
      return id === current;
    },
  };
}

export function getPropertyFromSources(propertyId: string, sources: PropertyLookup): Property | null {
  const schemaProperty = sources.schema.find(p => p.id === propertyId);
  const extraProperty = sources.extraProperties[propertyId];
  const storeProperty = sources.getProperty(propertyId);

  const base = schemaProperty ?? extraProperty ?? storeProperty;
  if (!base) return null;

  // The schema/API properties have relationValueTypes: [] because the API doesn't
  // fetch them. The store has them if the entity was hydrated. Merge them in.
  if (storeProperty?.relationValueTypes?.length && !base.relationValueTypes?.length) {
    return { ...base, relationValueTypes: storeProperty.relationValueTypes };
  }

  return base;
}

/**
 * Hydrate `relationValueTypes` on a RELATION property by fetching the property
 * entity and extracting its RELATION_VALUE_RELATIONSHIP_TYPE relations.
 *
 * The property API (`getProperty`/`getProperties`) always returns
 * `relationValueTypes: []`. This helper fills them in from the entity's relations.
 */
export async function hydrateRelationValueTypes(property: Property): Promise<Property> {
  if (property.dataType !== 'RELATION') return property;
  if (property.relationValueTypes && property.relationValueTypes.length > 0) return property;

  try {
    const stub = await Effect.runPromise(getEntity(property.id));
    const primarySpace = stub?.spaces[0];
    const entity = primarySpace ? await Effect.runPromise(getEntity(property.id, primarySpace)) : stub;
    if (entity) {
      const rvts = entity.relations
        .filter(r => r.type.id === SystemIds.RELATION_VALUE_RELATIONSHIP_TYPE)
        .map(r => ({ id: r.toEntity.id, name: r.toEntity.name }));
      if (rvts.length > 0) {
        return { ...property, relationValueTypes: rvts };
      }
    }
  } catch {
    // Continue with empty relationValueTypes
  }

  return property;
}

export function collectRelationCells(params: {
  columnMapping: Record<number, string>;
  dataRows: string[][];
  propertyLookup: PropertyLookup;
}): RelationPropertyMeta[] {
  const { columnMapping, dataRows, propertyLookup } = params;
  const relationProps: RelationPropertyMeta[] = [];

  for (const [colIdxStr, propertyId] of Object.entries(columnMapping)) {
    if (propertyId === SystemIds.NAME_PROPERTY) continue;
    if (propertyId === SystemIds.TYPES_PROPERTY) continue;
    const property = getPropertyFromSources(propertyId, propertyLookup);
    if (!property || property.dataType !== 'RELATION') continue;

    const colIdx = parseInt(colIdxStr, 10);
    const uniqueCellValues = new Set<string>();
    for (const row of dataRows) {
      const raw = (row[colIdx] ?? '').trim();
      if (!raw) continue;
      for (const part of splitRelationCell(raw)) uniqueCellValues.add(part);
    }

    const typeIds = property.relationValueTypes?.map(t => t.id) ?? [];

    relationProps.push({
      propertyId,
      property,
      typeIds,
      uniqueCellValues,
    });
  }

  return relationProps;
}

/**
 * Cross-reference resolved relation entities with resolved rows from the same
 * import. When a relation cell value was auto-created (status `'created'`) but
 * a row in the import has the same name (case-insensitive) and a compatible
 * type, reuse the row's entity ID so we don't end up with two entities for the
 * same thing.
 *
 * Mutates `resolvedEntities` in place for matched entries.
 */
export function crossReferenceRelationsWithRows(params: {
  dataRows: string[][];
  nameColIdx: number;
  resolvedEntities: Map<string, ResolvedEntity>;
  resolvedRows: Map<number, { entityId: string; name: string }>;
  selectedType: { id: string; name: string | null } | null;
  typesColumnIndex: number | undefined;
  resolvedTypes: Map<string, { id: string; name: string }>;
  columnMapping: Record<number, string>;
  propertyLookup: PropertyLookup;
}): void {
  const {
    dataRows,
    nameColIdx,
    resolvedEntities,
    resolvedRows,
    selectedType,
    typesColumnIndex,
    resolvedTypes,
    columnMapping,
    propertyLookup,
  } = params;

  // Build a lookup: normalizedName → { entityId, typeIds[] } from resolved rows
  const rowsByName = new Map<string, { entityId: string; name: string; typeIds: string[] }>();
  for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
    const resolved = resolvedRows.get(rowIndex);
    if (!resolved) continue;

    const row = dataRows[rowIndex];
    const rowName = (row[nameColIdx] ?? '').trim();
    if (!rowName) continue;

    let rowTypeId: string | null = selectedType?.id ?? null;
    if (typesColumnIndex !== undefined) {
      const rawType = (row[typesColumnIndex] ?? '').trim();
      rowTypeId = rawType ? (resolvedTypes.get(rawType)?.id ?? null) : null;
    }

    const normalized = rowName.toLowerCase();
    const existing = rowsByName.get(normalized);
    if (!existing) {
      rowsByName.set(normalized, {
        entityId: resolved.entityId,
        name: resolved.name,
        typeIds: rowTypeId ? [rowTypeId] : [],
      });
    } else if (rowTypeId && !existing.typeIds.includes(rowTypeId)) {
      existing.typeIds.push(rowTypeId);
    }
  }

  if (rowsByName.size === 0) return;

  // Build a set of type IDs per relation property for matching
  const propertyTypeIds = new Map<string, string[]>();
  for (const [, propertyId] of Object.entries(columnMapping)) {
    if (propertyTypeIds.has(propertyId)) continue;
    const property = getPropertyFromSources(propertyId, propertyLookup);
    if (property?.dataType === 'RELATION') {
      propertyTypeIds.set(propertyId, property.relationValueTypes?.map(t => t.id) ?? []);
    }
  }

  // Match created relation entities to import rows
  for (const [cacheKey, entity] of resolvedEntities) {
    if (entity.status !== 'created') continue;

    const normalized = entity.name.toLowerCase();
    const rowMatch = rowsByName.get(normalized);
    if (!rowMatch) continue;

    // Check type compatibility: the relation property's allowed types should
    // overlap with the row's type(s)
    const propertyId = cacheKey.split('::')[0];
    const allowedTypeIds = propertyTypeIds.get(propertyId) ?? [];
    const typesCompatible =
      allowedTypeIds.length === 0 ||
      rowMatch.typeIds.length === 0 ||
      rowMatch.typeIds.some(t => allowedTypeIds.includes(t));

    if (typesCompatible) {
      resolvedEntities.set(cacheKey, {
        id: rowMatch.entityId,
        name: rowMatch.name,
        status: 'found',
      });
    }
  }
}

export function buildGeneratedRows(input: BuildRowsInput): { values: Value[]; relations: Relation[] } {
  const {
    dataRows,
    columnMapping,
    resolvedRows,
    selectedType,
    typesColumnIndex,
    resolvedTypes,
    resolvedEntities,
    spaceId,
    propertyLookup,
    getExistingRelations,
    checkboxOverrides = {},
  } = input;

  // Cache existing relations per entity so we only look them up once.
  // Only consider relations in the current space — relations from other
  // spaces should not prevent creating the relation in this space.
  const existingRelationsCache = new Map<string, Relation[]>();
  function getExisting(entityId: string): Relation[] {
    if (!getExistingRelations) return [];
    let cached = existingRelationsCache.get(entityId);
    if (!cached) {
      cached = getExistingRelations(entityId).filter(r => r.spaceId === spaceId);
      existingRelationsCache.set(entityId, cached);
    }
    return cached;
  }

  function hasExistingRelation(fromEntityId: string, typeId: string, toEntityId: string): boolean {
    return getExisting(fromEntityId).some(r => r.type.id === typeId && r.toEntity.id === toEntityId);
  }

  const values: Value[] = [];
  const relations: Relation[] = [];
  const createdRelationEntityNameValueIds = new Set<string>();
  const createdRelationEntityTypedIds = new Set<string>();

  // Emit Name triples for newly-created type entities
  for (const [, typeEntry] of resolvedTypes) {
    if (!typeEntry.isNew) continue;
    const typeNameValueId = ID.createValueId({
      entityId: typeEntry.id,
      propertyId: SystemIds.NAME_PROPERTY,
      spaceId,
    });
    if (!createdRelationEntityNameValueIds.has(typeNameValueId)) {
      createdRelationEntityNameValueIds.add(typeNameValueId);
      values.push({
        id: typeNameValueId,
        entity: { id: typeEntry.id, name: typeEntry.name },
        property: { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT' },
        spaceId,
        value: typeEntry.name,
        isLocal: true,
      });
    }
  }

  for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
    const row = dataRows[rowIndex];
    const resolvedRow = resolvedRows.get(rowIndex);
    if (!resolvedRow) continue;
    const entityId = resolvedRow.entityId;
    const rowName = resolvedRow.name;

    let rowType: { id: string; name: string | null } | null = selectedType;
    if (typesColumnIndex !== undefined) {
      const rawType = (row[typesColumnIndex] ?? '').trim();
      rowType = rawType ? (resolvedTypes.get(rawType) ?? null) : null;
    }

    if (rowType && !hasExistingRelation(entityId, SystemIds.TYPES_PROPERTY, rowType.id)) {
      relations.push({
        id: ID.createEntityId(),
        entityId: ID.createEntityId(),
        type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
        fromEntity: { id: entityId, name: rowName },
        toEntity: { id: rowType.id, name: rowType.name, value: rowType.id },
        renderableType: 'RELATION',
        spaceId,
        position: Position.generate(),
        isLocal: true,
      });
    }

    values.push({
      id: ID.createValueId({ entityId, propertyId: SystemIds.NAME_PROPERTY, spaceId }),
      entity: { id: entityId, name: rowName },
      property: { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT' },
      spaceId,
      value: rowName,
      isLocal: true,
    });

    for (const [colIdxStr, propertyId] of Object.entries(columnMapping)) {
      if (propertyId === SystemIds.NAME_PROPERTY) continue;
      // Types relations are handled above via selectedType / typesColumnIndex — skip to avoid duplicates
      if (propertyId === SystemIds.TYPES_PROPERTY) continue;
      const colIdx = parseInt(colIdxStr, 10);
      const raw = row[colIdx]?.trim() ?? '';
      if (!raw) continue;

      const property = getPropertyFromSources(propertyId, propertyLookup);
      if (!property) continue;

      if (property.dataType === 'RELATION') {
        const renderableType: RenderableEntityType =
          property.renderableTypeStrict === 'IMAGE'
            ? 'IMAGE'
            : property.renderableTypeStrict === 'VIDEO'
              ? 'VIDEO'
              : 'RELATION';

        for (const part of splitRelationCell(raw)) {
          const resolved = resolvedEntities.get(`${propertyId}::${part}`);
          if (!resolved || resolved.status === 'ambiguous') continue;

          if (resolved.status === 'created') {
            const createdNameValueId = ID.createValueId({
              entityId: resolved.id,
              propertyId: SystemIds.NAME_PROPERTY,
              spaceId,
            });
            if (!createdRelationEntityNameValueIds.has(createdNameValueId)) {
              createdRelationEntityNameValueIds.add(createdNameValueId);
              values.push({
                id: createdNameValueId,
                entity: { id: resolved.id, name: resolved.name },
                property: { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT' },
                spaceId,
                value: resolved.name,
                isLocal: true,
              });
            }

            // Emit a Types relation for the created entity based on the relation property's value types
            if (resolved.typeId && !createdRelationEntityTypedIds.has(resolved.id)) {
              createdRelationEntityTypedIds.add(resolved.id);
              relations.push({
                id: ID.createEntityId(),
                entityId: ID.createEntityId(),
                type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
                fromEntity: { id: resolved.id, name: resolved.name },
                toEntity: { id: resolved.typeId, name: resolved.typeName ?? null, value: resolved.typeId },
                renderableType: 'RELATION',
                spaceId,
                position: Position.generate(),
                isLocal: true,
              });
            }
          }

          if (!hasExistingRelation(entityId, propertyId, resolved.id)) {
            relations.push({
              id: ID.createEntityId(),
              entityId: ID.createEntityId(),
              type: { id: propertyId, name: property.name ?? '' },
              fromEntity: { id: entityId, name: rowName },
              toEntity: { id: resolved.id, name: resolved.name, value: resolved.id },
              renderableType,
              spaceId,
              position: Position.generate(),
              isLocal: true,
            });
          }
        }
      } else if (property.dataType === 'BOOLEAN') {
        const cellKey = toImportCellKey(rowIndex, colIdx);
        const override = checkboxOverrides[cellKey];
        const result = parseCheckboxValue(raw);
        const resolvedValue = override ?? (result.parsed ? (result.value ? '1' : '0') : undefined);
        if (resolvedValue !== undefined) {
          values.push({
            id: ID.createValueId({ entityId, propertyId, spaceId }),
            entity: { id: entityId, name: rowName },
            property,
            spaceId,
            value: resolvedValue,
            isLocal: true,
          });
        }
      } else {
        values.push({
          id: ID.createValueId({ entityId, propertyId, spaceId }),
          entity: { id: entityId, name: rowName },
          property,
          spaceId,
          value: raw,
          isLocal: true,
        });
      }
    }
  }

  return { values, relations };
}

export type ImportPlan = {
  values: Value[];
  relations: Relation[];
  unresolvedLinks: Record<string, UnresolvedImportCell>;
  resolvedRowsSnapshot: Map<number, { entityId: string; name: string }>;
  resolvedTypesSnapshot: Map<string, { id: string; name: string; isNew?: boolean }>;
  resolvedEntitiesSnapshot: Map<
    string,
    { id: string; name: string; status: string; typeId?: string; typeName?: string | null }
  >;
};

export function buildEntitySnapshot(
  resolvedEntities: Map<string, ResolvedEntity>
): ImportPlan['resolvedEntitiesSnapshot'] {
  const snapshot: ImportPlan['resolvedEntitiesSnapshot'] = new Map();
  for (const [key, entity] of resolvedEntities) {
    if (entity.status !== 'ambiguous') {
      snapshot.set(key, {
        id: entity.id,
        name: entity.name,
        status: entity.status,
        typeId: entity.status === 'created' ? entity.typeId : undefined,
        typeName: entity.status === 'created' ? entity.typeName : undefined,
      });
    }
  }
  return snapshot;
}

export function buildImportPlan(params: {
  dataRows: string[][];
  columnMapping: Record<number, string>;
  nameColIdx: number;
  selectedType: { id: string; name: string | null } | null;
  typesColumnIndex: number | undefined;
  resolvedEntities: Map<string, ResolvedEntity>;
  resolvedTypes: Map<string, { id: string; name: string; isNew?: boolean }>;
  resolvedRows: Map<number, { entityId: string; name: string }>;
  spaceId: string;
  propertyLookup: PropertyLookup;
  getExistingRelations?: (entityId: string) => Relation[];
  checkboxOverrides?: Record<string, string>;
}): ImportPlan {
  // Clone maps so callers' originals are never mutated
  const resolvedEntities = new Map(params.resolvedEntities);
  const resolvedTypes = new Map(params.resolvedTypes);
  const resolvedRows = new Map(params.resolvedRows);

  crossReferenceRelationsWithRows({
    dataRows: params.dataRows,
    nameColIdx: params.nameColIdx,
    resolvedEntities,
    resolvedRows,
    selectedType: params.selectedType,
    typesColumnIndex: params.typesColumnIndex,
    resolvedTypes,
    columnMapping: params.columnMapping,
    propertyLookup: params.propertyLookup,
  });

  const unresolvedLinks = buildUnresolvedLinksByCell({
    dataRows: params.dataRows,
    columnMapping: params.columnMapping,
    nameColIdx: params.nameColIdx,
    typesColumnIndex: params.typesColumnIndex,
    resolvedTypes,
    resolvedRows,
    resolvedEntities,
    propertyLookup: params.propertyLookup,
    checkboxOverrides: params.checkboxOverrides,
  });

  const { values, relations } = buildGeneratedRows({
    dataRows: params.dataRows,
    columnMapping: params.columnMapping,
    resolvedRows,
    selectedType: params.selectedType,
    typesColumnIndex: params.typesColumnIndex,
    resolvedTypes,
    resolvedEntities,
    spaceId: params.spaceId,
    propertyLookup: params.propertyLookup,
    getExistingRelations: params.getExistingRelations,
    checkboxOverrides: params.checkboxOverrides,
  });

  return {
    values,
    relations,
    unresolvedLinks,
    resolvedRowsSnapshot: resolvedRows,
    resolvedTypesSnapshot: resolvedTypes,
    resolvedEntitiesSnapshot: buildEntitySnapshot(resolvedEntities),
  };
}

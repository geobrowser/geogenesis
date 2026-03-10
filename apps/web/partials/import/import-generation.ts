import { Position, SystemIds } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';

import { ID } from '~/core/id';
import { getEntity } from '~/core/io/queries';
import { Property, Relation, RenderableEntityType, Value } from '~/core/types';

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

export type ResolvedEntity = { id: string; name: string; status: 'found' | 'created' | 'ranked'; typeId?: string; typeName?: string | null } | { status: 'ambiguous' };

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
  resolvedRows: Map<number, { entityId: string; name: string; ranked?: boolean }>;
  resolvedEntities: Map<string, ResolvedEntity>;
  propertyLookup: PropertyLookup;
}): Record<string, import('./atoms').UnresolvedImportCell> {
  const { dataRows, columnMapping, nameColIdx, typesColumnIndex, resolvedTypes, resolvedRows, resolvedEntities, propertyLookup } = params;
  const flags: Record<string, import('./atoms').UnresolvedImportCell> = {};

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
    } else if (resolvedRow.ranked) {
      flags[toImportCellKey(rowIndex, nameColIdx)] = { kind: 'ranked-entity' };
    }

    for (const [colIdxStr, propertyId] of Object.entries(columnMapping)) {
      if (propertyId === SystemIds.NAME_PROPERTY) continue;
      const colIdx = parseInt(colIdxStr, 10);
      const raw = (row[colIdx] ?? '').trim();
      if (!raw) continue;

      const property = getPropertyFromSources(propertyId, propertyLookup);
      if (!property || property.dataType !== 'RELATION') continue;

      const unresolvedValues: string[] = [];
      const rankedValues: string[] = [];

      for (const part of splitRelationCell(raw)) {
        const resolved = resolvedEntities.get(`${propertyId}::${part}`);
        if (!resolved || resolved.status === 'ambiguous') {
          unresolvedValues.push(part);
        } else if (resolved.status === 'ranked') {
          rankedValues.push(part);
        }
      }

      if (unresolvedValues.length > 0) {
        flags[toImportCellKey(rowIndex, colIdx)] = {
          kind: 'relation',
          unresolvedValues: Array.from(new Set(unresolvedValues)),
        };
      } else if (rankedValues.length > 0) {
        flags[toImportCellKey(rowIndex, colIdx)] = {
          kind: 'ranked-relation',
          rankedValues: Array.from(new Set(rankedValues)),
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
    const entity = primarySpace
      ? await Effect.runPromise(getEntity(property.id, primarySpace))
      : stub;
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
  } = input;

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

    if (rowType) {
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

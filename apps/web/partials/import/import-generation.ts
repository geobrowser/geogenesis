import { SystemIds } from '@geoprotocol/geo-sdk';

import { Position } from '@geoprotocol/geo-sdk';

import { ID } from '~/core/id';
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

export type ResolvedEntity = { id: string; name: string; status: 'found' | 'created' } | { status: 'ambiguous' };

export type BuildRowsInput = {
  dataRows: string[][];
  nameColIdx: number;
  columnMapping: Record<number, string>;
  selectedType: { id: string; name: string | null } | null;
  typesColumnIndex: number | undefined;
  resolvedTypes: Map<string, { id: string; name: string }>;
  resolvedEntities: Map<string, ResolvedEntity>;
  spaceId: string;
  propertyLookup: PropertyLookup;
};

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
  return sources.schema.find(p => p.id === propertyId) ?? sources.extraProperties[propertyId] ?? sources.getProperty(propertyId);
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

    relationProps.push({
      propertyId,
      property,
      typeIds: property.relationValueTypes?.map(t => t.id) ?? [],
      uniqueCellValues,
    });
  }

  return relationProps;
}

export function buildGeneratedRows(input: BuildRowsInput): { values: Value[]; relations: Relation[] } {
  const {
    dataRows,
    nameColIdx,
    columnMapping,
    selectedType,
    typesColumnIndex,
    resolvedTypes,
    resolvedEntities,
    spaceId,
    propertyLookup,
  } = input;

  const values: Value[] = [];
  const relations: Relation[] = [];

  for (const row of dataRows) {
    const entityId = ID.createEntityId();
    const rowName = (row[nameColIdx] ?? '').trim() || 'Unnamed';

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

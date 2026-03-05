import { Position, SystemIds } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';

import { ID } from '~/core/id';
import { getResults } from '~/core/io/queries';
import { Relation, Value } from '~/core/types';

import { RelationPropertyMeta, ResolvedEntity } from './import-generation';

type ResolutionGuard = {
  isCurrent: () => boolean;
};

export async function resolveRelationEntities(params: {
  relationProperties: RelationPropertyMeta[];
  spaceId: string;
  guard: ResolutionGuard;
}): Promise<{
  aborted: boolean;
  resolvedEntities: Map<string, ResolvedEntity>;
  bootstrappedValues: Value[];
  bootstrappedRelations: Relation[];
}> {
  const { relationProperties, spaceId, guard } = params;

  const resolvedEntities = new Map<string, ResolvedEntity>();
  const bootstrappedValues: Value[] = [];
  const bootstrappedRelations: Relation[] = [];
  const createdByName = new Map<string, { id: string; name: string }>();

  for (const relationProperty of relationProperties) {
    for (const cellValue of relationProperty.uniqueCellValues) {
      const cacheKey = `${relationProperty.propertyId}::${cellValue}`;
      const normalizedName = cellValue.toLowerCase();
      const existing = createdByName.get(normalizedName);
      if (existing) {
        resolvedEntities.set(cacheKey, { id: existing.id, name: existing.name, status: 'created' });
        continue;
      }

      try {
        const results = await Effect.runPromise(
          getResults({
            query: cellValue,
            typeIds: relationProperty.typeIds.length > 0 ? relationProperty.typeIds : undefined,
            spaceId,
          })
        );
        if (!guard.isCurrent()) {
          return { aborted: true, resolvedEntities, bootstrappedValues, bootstrappedRelations };
        }

        const exactMatches = results.filter(r => (r.name ?? '').trim().toLowerCase() === normalizedName);
        if (exactMatches.length === 1) {
          resolvedEntities.set(cacheKey, {
            id: exactMatches[0].id,
            name: exactMatches[0].name ?? cellValue,
            status: 'found',
          });
        } else if (exactMatches.length === 0) {
          const newEntityId = ID.createEntityId();

          bootstrappedValues.push({
            id: ID.createValueId({ entityId: newEntityId, propertyId: SystemIds.NAME_PROPERTY, spaceId }),
            entity: { id: newEntityId, name: cellValue },
            property: { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT' },
            spaceId,
            value: cellValue,
            isLocal: true,
          });

          const firstRelationType = relationProperty.property.relationValueTypes?.[0];
          if (firstRelationType) {
            bootstrappedRelations.push({
              id: ID.createEntityId(),
              entityId: ID.createEntityId(),
              type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
              fromEntity: { id: newEntityId, name: cellValue },
              toEntity: { id: firstRelationType.id, name: firstRelationType.name ?? '', value: firstRelationType.id },
              renderableType: 'RELATION',
              spaceId,
              position: Position.generate(),
              isLocal: true,
            });
          }

          createdByName.set(normalizedName, { id: newEntityId, name: cellValue });
          resolvedEntities.set(cacheKey, { id: newEntityId, name: cellValue, status: 'created' });
        } else {
          resolvedEntities.set(cacheKey, { status: 'ambiguous' });
        }
      } catch (error) {
        console.warn(
          `[import] Failed to resolve relation value "${cellValue}" for property ${relationProperty.propertyId}`,
          error
        );
      }
    }
  }

  return { aborted: false, resolvedEntities, bootstrappedValues, bootstrappedRelations };
}

export async function resolveTypesForRows(params: {
  dataRows: string[][];
  typesColumnIndex: number | undefined;
  spaceId: string;
  guard: ResolutionGuard;
}): Promise<{ aborted: boolean; resolvedTypes: Map<string, { id: string; name: string }> }> {
  const { dataRows, typesColumnIndex, spaceId, guard } = params;
  const resolvedTypes = new Map<string, { id: string; name: string }>();

  if (typesColumnIndex === undefined) {
    return { aborted: false, resolvedTypes };
  }

  const uniqueTypeNames = new Set<string>();
  for (const row of dataRows) {
    const raw = (row[typesColumnIndex] ?? '').trim();
    if (raw) uniqueTypeNames.add(raw);
  }

  for (const typeName of uniqueTypeNames) {
    try {
      const results = await Effect.runPromise(getResults({ query: typeName, spaceId }));
      if (!guard.isCurrent()) return { aborted: true, resolvedTypes };

      const exactMatches = results.filter(r => (r.name ?? '').trim().toLowerCase() === typeName.toLowerCase());
      if (exactMatches.length === 1) {
        resolvedTypes.set(typeName, { id: exactMatches[0].id, name: exactMatches[0].name ?? typeName });
      }
    } catch (error) {
      console.warn(`[import] Failed to resolve type "${typeName}"`, error);
    }
  }

  return { aborted: false, resolvedTypes };
}

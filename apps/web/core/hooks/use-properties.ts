import { SystemIds } from '@graphprotocol/grc-20';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Brand, Effect } from 'effect';

import { EntityId } from '../io/schema';
import { getBatchEntities } from '../io/v2/queries';
import { PropertySchema } from '../v2.types';

export type PropertyId = string & Brand.Brand<'PropertyId'>;
export const PropertyId = Brand.nominal<PropertyId>();

export function useProperties(propertyIds: string[]): Record<PropertyId, PropertySchema> | undefined {
  const { data: properties } = useQuery({
    placeholderData: keepPreviousData,
    enabled: propertyIds.length > 0,
    initialData: {},
    queryKey: ['properties-schema', propertyIds],
    queryFn: async ({ signal }) => {
      const properties = await Effect.runPromise(getBatchEntities(propertyIds, undefined, signal));

      const schema = properties.map((s): PropertySchema => {
        const relationValueTypes = s.relations
          .filter(s => s.type.id === EntityId(SystemIds.RELATION_VALUE_RELATIONSHIP_TYPE))
          .map(s => ({ typeId: s.toEntity.id, typeName: s.toEntity.name }));

        return {
          id: s.id,
          name: s.name,
          // @TODO(migration): Use global properties/types
          dataType: 'TEXT',
          // @TODO(migration): Renderable type
          relationValueTypes,
        };
      });

      const sorted = sortProperties(schema);
      const map: Record<PropertyId, PropertySchema> = {};

      for (const p of sorted) {
        map[PropertyId(p.id)] = p;
      }

      return map;
    },
  });

  return properties;
}

function sortProperties(renderables: PropertySchema[]) {
  /* Visible triples includes both real triples and placeholder triples */
  return renderables.sort((renderableA, renderableB) => {
    // Always put an empty, placeholder triple with no attribute id at the bottom
    // of the list
    if (renderableA.id === '') return 1;

    const { id: attributeIdA, name: attributeNameA } = renderableA;
    const { id: attributeIdB, name: attributeNameB } = renderableB;

    const isNameA = attributeIdA === EntityId(SystemIds.NAME_PROPERTY);
    const isNameB = attributeIdB === EntityId(SystemIds.NAME_PROPERTY);
    const isDescriptionA = attributeIdA === EntityId(SystemIds.DESCRIPTION_PROPERTY);
    const isDescriptionB = attributeIdB === EntityId(SystemIds.DESCRIPTION_PROPERTY);
    const isTypesA = attributeIdA === EntityId(SystemIds.TYPES_PROPERTY);
    const isTypesB = attributeIdB === EntityId(SystemIds.TYPES_PROPERTY);

    if (isNameA && !isNameB) return -1;
    if (!isNameA && isNameB) return 1;

    if (isDescriptionA && !isDescriptionB) return -1;
    if (!isDescriptionA && isDescriptionB) return 1;

    if (isTypesA && !isTypesB) return -1;
    if (!isTypesA && isTypesB) return 1;

    return (attributeNameA || '').localeCompare(attributeNameB || '');
  });
}

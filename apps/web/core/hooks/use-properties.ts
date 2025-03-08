import { SystemIds } from '@graphprotocol/grc-20';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Brand } from 'effect';

import { EntityId } from '../io/schema';
import { fetchEntitiesBatch } from '../io/subgraph/fetch-entities-batch';
import { PropertySchema, ValueTypeId } from '../types';

export type PropertyId = string & Brand.Brand<'PropertyId'>;
export const PropertyId = Brand.nominal<PropertyId>();

type UsePropertyValueTypes = {
  properties: Map<PropertyId, PropertySchema>;
};

const initialData = new Map();

export function useProperties(propertyIds: string[]): UsePropertyValueTypes {
  const { data: properties } = useQuery({
    placeholderData: keepPreviousData,
    initialData: initialData,
    enabled: propertyIds.length > 0,
    queryKey: [{ key: 'properties', propertyIds }],
    queryFn: async ({ queryKey }) => {
      const [{ propertyIds }] = queryKey;

      const properties = await fetchEntitiesBatch({ entityIds: propertyIds });

      const valueTypes = properties.map(a => {
        const valueTypeId = a.relationsOut.find(r => r.typeOf.id === EntityId(SystemIds.VALUE_TYPE_ATTRIBUTE))?.toEntity
          .id;
        return {
          attributeId: a.id,
          valueTypeId,
        };
      });

      const relationValueTypes = properties.map(a => {
        const relationValueType = a.relationsOut.find(
          r => r.typeOf.id === EntityId(SystemIds.RELATION_VALUE_RELATIONSHIP_TYPE)
        )?.toEntity;

        return {
          attributeId: a.id,
          relationValueTypeId: relationValueType?.id,
          relationValueTypeName: relationValueType?.name,
        };
      });

      const schema = properties.map((s): PropertySchema => {
        const relationValueType = relationValueTypes.find(t => t.attributeId === s.id) ?? null;
        return {
          id: s.id,
          name: s.name,
          valueType: (valueTypes.find(v => v.attributeId === s.id)?.valueTypeId ?? SystemIds.TEXT) as ValueTypeId,
          relationValueTypeId: relationValueType?.relationValueTypeId,
          relationValueTypeName: relationValueType?.relationValueTypeName,
          homeSpace: s.spaces[0],
        };
      });

      return new Map<PropertyId, PropertySchema>(sortProperties(schema).map(s => [PropertyId(s.id), s]));
    },
  });

  return {
    properties: properties ?? initialData,
  };
}

function sortProperties(renderables: PropertySchema[]) {
  /* Visible triples includes both real triples and placeholder triples */
  return renderables.sort((renderableA, renderableB) => {
    // Always put an empty, placeholder triple with no attribute id at the bottom
    // of the list
    if (renderableA.id === '') return 1;

    const { id: attributeIdA, name: attributeNameA } = renderableA;
    const { id: attributeIdB, name: attributeNameB } = renderableB;

    const isNameA = attributeIdA === EntityId(SystemIds.NAME_ATTRIBUTE);
    const isNameB = attributeIdB === EntityId(SystemIds.NAME_ATTRIBUTE);
    const isDescriptionA = attributeIdA === EntityId(SystemIds.DESCRIPTION_ATTRIBUTE);
    const isDescriptionB = attributeIdB === EntityId(SystemIds.DESCRIPTION_ATTRIBUTE);
    const isTypesA = attributeIdA === EntityId(SystemIds.TYPES_ATTRIBUTE);
    const isTypesB = attributeIdB === EntityId(SystemIds.TYPES_ATTRIBUTE);

    if (isNameA && !isNameB) return -1;
    if (!isNameA && isNameB) return 1;

    if (isDescriptionA && !isDescriptionB) return -1;
    if (!isDescriptionA && isDescriptionB) return 1;

    if (isTypesA && !isTypesB) return -1;
    if (!isTypesA && isTypesB) return 1;

    return (attributeNameA || '').localeCompare(attributeNameB || '');
  });
}

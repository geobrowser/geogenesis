import { SYSTEM_IDS } from '@geogenesis/sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Brand } from 'effect';

import { fetchEntitiesBatch } from '../io/subgraph/fetch-entities-batch';
import { PropertySchema, ValueTypeId } from '../types';

type PropertyId = string & Brand.Brand<'PropertyId'>;
export const PropertyId = Brand.nominal<PropertyId>();

type UsePropertyValueTypes = {
  propertyValueTypes: Map<PropertyId, PropertySchema>;
};

const initialData = new Map();

export function usePropertyValueTypes(propertyIds: string[]): UsePropertyValueTypes {
  const { data: propertyValueTypes } = useQuery({
    placeholderData: keepPreviousData,
    initialData: initialData,
    enabled: propertyIds.length > 0,
    queryKey: [{ key: 'property-value-types', propertyIds }],
    queryFn: async ({ queryKey }) => {
      const [{ propertyIds }] = queryKey;

      const properties = await fetchEntitiesBatch(propertyIds);

      const valueTypes = properties.map(a => {
        const valueTypeId = a.relationsOut.find(r => r.typeOf.id === SYSTEM_IDS.VALUE_TYPE_ATTRIBUTE)?.toEntity.id;
        return {
          attributeId: a.id,
          valueTypeId,
        };
      });

      const relationValueTypes = properties.map(a => {
        const relationValueType = a.relationsOut.find(r => r.typeOf.id === SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE)
          ?.toEntity;

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
          valueType: (valueTypes.find(v => v.attributeId === s.id)?.valueTypeId ?? SYSTEM_IDS.TEXT) as ValueTypeId,
          relationValueTypeId: relationValueType?.relationValueTypeId,
          relationValueTypeName: relationValueType?.relationValueTypeName,
          homeSpace: s.spaces[0],
        };
      });

      return new Map<PropertyId, PropertySchema>(schema.map(s => [PropertyId(s.id), s]));
    },
  });

  return {
    propertyValueTypes: propertyValueTypes ?? initialData,
  };
}

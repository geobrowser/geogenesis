import { ValueType } from '../types';

type SchemaValueTypes = {
  propertyId: string;
  valueType: ValueType;
  relationValueTypeId?: string; // entity id
  relationValueTypeName?: string | null; // entity name
};

export function useSchemaValueTypes(propertyIds: string[]) {
  return [
    {
      propertyId: '',
      valueType: 'string',
    },
  ];
}

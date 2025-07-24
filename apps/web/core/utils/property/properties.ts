import { SystemIds } from '@graphprotocol/grc-20';
import { DATA_TYPE_PROPERTY, GEO_LOCATION, RENDERABLE_TYPE_PROPERTY } from '~/core/constants';
import { getStrictRenderableType } from '~/core/io/dto/properties';
import { DataType, Property, Relation, Value, SwitchableRenderableType, Entity } from '~/core/v2.types';

/**
 * Interface for property type mapping configuration
 */
export interface PropertyTypeMapping {
  /** The base data type for the property */
  baseDataType: DataType;
  /** The renderable type ID if different from base type, null otherwise */
  renderableTypeId: string | null;
}

/**
 * Maps a switchable renderable type to its base data type and renderable type ID
 * @param type The switchable renderable type to map
 * @returns The property type mapping configuration
 */
export function mapPropertyType(type: SwitchableRenderableType): PropertyTypeMapping {
  switch (type) {
    case 'TEXT':
      return {
        baseDataType: 'TEXT',
        renderableTypeId: null,
      };
    case 'URL':
      return {
        baseDataType: 'TEXT',
        renderableTypeId: SystemIds.URL,
      };
    case 'GEO_LOCATION':
      return {
        baseDataType: 'POINT',
        renderableTypeId: GEO_LOCATION,
      };
    case 'RELATION':
      return {
        baseDataType: 'RELATION',
        renderableTypeId: null,
      };
    case 'IMAGE':
      return {
        baseDataType: 'RELATION',
        renderableTypeId: SystemIds.IMAGE,
      };
    case 'NUMBER':
      return {
        baseDataType: 'NUMBER',
        renderableTypeId: null,
      };
    case 'CHECKBOX':
      return {
        baseDataType: 'CHECKBOX',
        renderableTypeId: null,
      };
    case 'TIME':
      return {
        baseDataType: 'TIME',
        renderableTypeId: null,
      };
    case 'POINT':
      return {
        baseDataType: 'POINT',
        renderableTypeId: null,
      };
    default: {
      // This ensures exhaustive type checking
      const _exhaustiveCheck: never = type;
      console.warn('Unknown property type:', _exhaustiveCheck);
      return {
        baseDataType: 'TEXT',
        renderableTypeId: null,
      };
    }
  }
}

/**
 * Map of property types to their base data types for filtering purposes
 */
export const typeToBaseDataType: Record<SwitchableRenderableType, DataType> = {
  TEXT: 'TEXT',
  URL: 'TEXT',
  RELATION: 'RELATION',
  IMAGE: 'RELATION',
  NUMBER: 'NUMBER',
  CHECKBOX: 'CHECKBOX',
  TIME: 'TIME',
  POINT: 'POINT',
  GEO_LOCATION: 'POINT',
} as const;

/**
 * Reconstructs a Property object from store data for properties that haven't been registered with setDataType()
 * Used as fallback when store.getProperty() returns null for existing properties added to entities
 */
export function reconstructFromStore(
  id: string,
  getValues: (selector: { selector: (v: Value) => boolean }) => Value[],
  getRelations: (selector: { selector: (r: Relation) => boolean }) => Relation[]
): Property | null {
  // Check if this entity has a Property type relation
  const hasPropertyType = getRelations({ 
    selector: r => r.fromEntity.id === id && 
                   r.type.id === SystemIds.TYPES_PROPERTY && 
                   r.toEntity.id === SystemIds.PROPERTY
  }).length > 0;

  if (!hasPropertyType) {
    return null;
  }

  // Get the dataType value
  const dataTypeValue = getValues({
    selector: v => v.entity.id === id && 
                    v.property.id === DATA_TYPE_PROPERTY
  })[0];

  if (!dataTypeValue) {
    return null;
  }

  // Get the name value
  const nameValue = getValues({
    selector: v => v.entity.id === id && 
                    v.property.id === SystemIds.NAME_PROPERTY
  })[0];

  // Get the renderableType relation (if any)
  const renderableTypeRelation = getRelations({
    selector: r => r.fromEntity.id === id && 
                    r.type.id === RENDERABLE_TYPE_PROPERTY
  })[0];

  // Validate and cast dataType
  const validDataTypes: DataType[] = ['TEXT', 'NUMBER', 'CHECKBOX', 'TIME', 'POINT', 'RELATION'];
  const dataTypeString = String(dataTypeValue.value);
  const dataType: DataType = validDataTypes.includes(dataTypeString as DataType) 
    ? (dataTypeString as DataType) 
    : 'TEXT';

  // Get relation value types
  const relationValueTypes = getRelations({
    selector: r => r.fromEntity.id === id && 
                   r.type.id === SystemIds.RELATION_VALUE_RELATIONSHIP_TYPE
  }).map(r => ({
    id: r.toEntity.id,
    name: r.toEntity.name || null,
  }));

  const renderableTypeId = renderableTypeRelation?.toEntity.id || null;
  
  // Construct a Property object
  const property: Property = {
    id,
    name: nameValue?.value || null, // Fixed: use null instead of empty string
    dataType,
    relationValueTypes, // Added: missing field
    renderableType: renderableTypeId,
    renderableTypeStrict: getStrictRenderableType(renderableTypeId),
    isDataTypeEditable: true, // Added: local properties are editable by default
  };

  return property;
}




/**
 * Constructs property data type information from various sources
 */
export function constructDataType(
  propertyData: Property | null,
  renderableTypeEntity: Pick<Entity, 'id' | 'name'> | null,
  renderableTypeRelation: Relation | null | undefined,
  entityId: string
): { id: string; dataType: DataType; renderableType: { id: string; name: string } | null } | null {
  // If we have propertyData from the backend, use it
  if (propertyData) {
    let renderableType = null;
    
    // First check if we have a renderableTypeEntity (from remote data)
    if (propertyData.renderableType && renderableTypeEntity) {
      renderableType = {
        id: renderableTypeEntity.id,
        name: renderableTypeEntity.name || '',
      };
    } 
    // Otherwise check for local renderableType relation
    else if (renderableTypeRelation) {
      renderableType = {
        id: renderableTypeRelation.toEntity.id,
        name: renderableTypeRelation.toEntity.name || '',
      };
    }

    return {
      id: propertyData.id || '',
      dataType: propertyData.dataType,
      renderableType,
    };
  }
  
  return null;
}

/**
 * Determines the current renderable type for display in the dropdown
 */
export function getCurrentRenderableType(
  propertyDataType: { dataType: string; renderableType: { id: string; name: string } | null } | null
): SwitchableRenderableType | undefined {
  if (!propertyDataType) return undefined;
  
  // If there's a renderableType, map it to the appropriate type
  if (propertyDataType.renderableType) {
    return getStrictRenderableType(
      propertyDataType.renderableType.id
    ) || 'TEXT'; // Default to TEXT if mapping fails
  }
  
  // Otherwise, default to the base dataType
  return propertyDataType.dataType as SwitchableRenderableType;
}


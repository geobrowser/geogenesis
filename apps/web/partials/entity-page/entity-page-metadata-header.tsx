'use client';

import { Id, Position, SystemIds } from '@graphprotocol/grc-20';

import * as React from 'react';

import { RENDERABLE_TYPE_PROPERTY, DATA_TYPE_PROPERTY, GEO_LOCATION } from '~/core/constants';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { useMutate } from '~/core/sync/use-mutate';
import { useQueryEntity, useQueryProperty, useRelations } from '~/core/sync/use-store';
import { SwitchableRenderableType } from '~/core/v2.types';

import { Divider } from '~/design-system/divider';

import { DataTypePill } from './data-type-pill';
import { RelationsGroup as EditableRelationsGroup } from './editable-entity-page';
import { PropertyTypeDropdown } from './property-type-dropdown';
import { RelationsGroup as ReadableRelationsGroup } from './readable-entity-page';
import { useEntityStoreInstance } from '~/core/state/entity-page-store/entity-store-provider';
import { useName } from '~/core/state/entity-page-store/entity-store';

interface EntityPageMetadataHeaderProps {
  id: string;
  spaceId: string;
}

export function EntityPageMetadataHeader({ id, spaceId }: EntityPageMetadataHeaderProps) {
  const { id: entityId } = useEntityStoreInstance();
  const relations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.spaceId === spaceId,
  })
  const name = useName(entityId);
  
  const { storage } = useMutate();

  const editable = useUserIsEditing(spaceId);

  // Fetch property data type to see if this is a property entity
  const { property: propertyData } = useQueryProperty({
    id,
    spaceId,
    enabled: true,
  });

  console.log('propertyData:', propertyData);

  // Find renderableType relation
  const renderableTypeRelation = relations.find(
    r => r.fromEntity.id === entityId && r.type.id === RENDERABLE_TYPE_PROPERTY
  );
  
  const { entity: renderableTypeEntity } = useQueryEntity({
    id: propertyData?.renderableType || renderableTypeRelation?.toEntity.id || undefined,
    spaceId,
    enabled: !!(propertyData?.renderableType || renderableTypeRelation?.toEntity.id),
  });

  const dataTypeValue = propertyData?.dataType
  const isPropertyEntity = !!propertyData

  const propertyDataType = React.useMemo(() => {
    // If we have propertyData from the backend, use it
    if (propertyData) {
      console.log('🔍 Using propertyData for propertyDataType:', propertyData);
      let renderableType = null;
      if (propertyData.renderableType && renderableTypeEntity) {
        // It's a UUID, use the entity data
        renderableType = {
          id: renderableTypeEntity.id,
          name: renderableTypeEntity.name,
        };
      }

      return {
        id: propertyData.id || '',
        dataType: propertyData.dataType || '',
        renderableType,
      };
    }
    
    return null;
  }, [propertyData, renderableTypeEntity, entityId, renderableTypeRelation]);

  // Determine the current renderable type based on property data
  const currentRenderableType = React.useMemo(() => {
    console.log('🔍 currentRenderableType calculation:', {
      propertyDataType,
      hasRenderableType: !!propertyDataType?.renderableType,
      renderableTypeName: propertyDataType?.renderableType?.name,
      dataType: propertyDataType?.dataType,
      renderableTypeRelation,
    });
    
    if (!propertyDataType) return undefined;
    
    // If there's a renderableType relation, map it to the appropriate type
    if (propertyDataType.renderableType) {
      const renderableTypeName = propertyDataType.renderableType.name;
      
      console.log('🔎 Mapping renderableType:', {
        renderableTypeName,
        renderableTypeId: propertyDataType.renderableType.id,
        renderableTypeRelation,
      });
      
      // Map renderableType entity names to SwitchableRenderableType
      let mappedType: SwitchableRenderableType;
      const renderableTypeId = propertyDataType.renderableType.id;
      
      console.log('🔎 Detailed renderableType mapping:', {
        renderableTypeName,
        renderableTypeId,
        exactMatch: renderableTypeName === 'URL',
        caseInsensitiveMatch: renderableTypeName?.toLowerCase() === 'url',
      });
      
      switch (renderableTypeName) {
        case 'URL':
        case 'url':
          console.log('✅ Matched URL case');
          mappedType = 'URL';
          break;
        case 'GeoLocation':
        case 'Geo Location':
        case 'geo-location':
          console.log('✅ Matched GEO_LOCATION case');
          mappedType = 'GEO_LOCATION';
          break;
        case 'Image':
        case 'image':
          console.log('✅ Matched IMAGE case');
          mappedType = 'IMAGE';
          break;
        default:
          console.log('⚠️ Fell through to default case');
          // If we can't map it, check if it's a placeholder ID we created
          if (renderableTypeName === 'URL' || renderableTypeId === SystemIds.URL) {
            console.log('✅ Matched URL in default case');
            mappedType = 'URL';
          } else if (renderableTypeName === 'GEO_LOCATION' || renderableTypeId === GEO_LOCATION) {
            console.log('✅ Matched GEO_LOCATION in default case');
            mappedType = 'GEO_LOCATION';
          } else if (renderableTypeName === 'IMAGE' || renderableTypeId === SystemIds.IMAGE) {
            console.log('✅ Matched IMAGE in default case');
            mappedType = 'IMAGE';
          } else {
            console.warn('⚠️ Unknown renderableType name:', renderableTypeName, 'with ID:', renderableTypeId);
            mappedType = propertyDataType.dataType as SwitchableRenderableType;
          }
      }
      
      console.log('🎯 Mapped renderableType:', {
        renderableTypeName,
        mappedType,
        fallbackDataType: propertyDataType.dataType,
      });
      
      return mappedType;
    }
    
    // Otherwise, default to the base dataType
    const baseType = propertyDataType.dataType as SwitchableRenderableType;
    console.log('📦 Using base dataType:', baseType);
    return baseType;
  }, [propertyDataType, renderableTypeRelation]);

  const handlePropertyTypeChange = React.useCallback(
    (newType: SwitchableRenderableType) => {
      console.log('🚀 handlePropertyTypeChange called:', {
        newType,
        entityId,
        spaceId,
        currentPropertyData: propertyData,
        currentRenderableType,
        relationsCount: relations.length,
      });

      if (!entityId || !spaceId) return;

      // Determine the base dataType and renderableType based on the selected type
      let baseDataType: string;
      let renderableTypeId: string | null = null;

      // Map property types to their base dataType and renderableType
      switch (newType) {
        case 'TEXT':
          baseDataType = 'TEXT';
          renderableTypeId = null;
          break;
        case 'URL':
          baseDataType = 'TEXT';
          renderableTypeId = SystemIds.URL;
          break;
        case 'GEO_LOCATION':
          baseDataType = 'TEXT';
          renderableTypeId = GEO_LOCATION; // TODO: Replace with actual GEO_LOCATION id
          break;
        case 'RELATION':
          baseDataType = 'RELATION';
          renderableTypeId = null;
          break;
        case 'IMAGE':
          baseDataType = 'RELATION';
          renderableTypeId = SystemIds.IMAGE;
          break;
        case 'NUMBER':
          baseDataType = 'NUMBER';
          renderableTypeId = null;
          break;
        case 'CHECKBOX':
          baseDataType = 'CHECKBOX';
          renderableTypeId = null;
          break;
        case 'TIME':
          baseDataType = 'TIME';
          renderableTypeId = null;
          break;
        case 'POINT':
          baseDataType = 'POINT';
          renderableTypeId = null;
          break;
        default:
          console.warn('Unknown property type:', newType);
          return;
      }

      console.log('📋 Property type mapping:', {
        newType,
        baseDataType,
        renderableTypeId,
        needsRenderableType: !!renderableTypeId,
      });

      // Properties can't change their base dataType after creation
      // if (propertyData && propertyData.dataType !== baseDataType) {
      //   console.warn('Cannot change property dataType from', propertyData.dataType, 'to', baseDataType);
      //   console.warn('Properties cannot change their base dataType after creation');
      //   return;
      // }

      // Update the dataType value if it's different from the current one
      if (dataTypeValue && dataTypeValue.value !== baseDataType) {
        console.log('🔄 Updating dataType from', dataTypeValue.value, 'to', baseDataType);
        storage.values.set({
          id: ID.createValueId({
            entityId,
            propertyId: DATA_TYPE_PROPERTY,
            spaceId,
          }),
          entity: {
            id: entityId,
            name: name || '',
          },
          property: {
            id: DATA_TYPE_PROPERTY,
            name: 'Data Type',
            dataType: 'TEXT',
          },
          spaceId,
          value: baseDataType,
        });
      } else if (!dataTypeValue && !propertyData) {
        // If no dataType value exists and no propertyData, create the dataType value
        console.log('➕ Creating dataType value:', baseDataType);
        storage.values.set({
          id: ID.createValueId({
            entityId,
            propertyId: DATA_TYPE_PROPERTY,
            spaceId,
          }),
          entity: {
            id: entityId,
            name: name || '',
          },
          property: {
            id: DATA_TYPE_PROPERTY,
            name: 'Data Type',
            dataType: 'TEXT',
          },
          spaceId,
          value: baseDataType,
        });
      }

      // Handle the renderableType relation
      console.log('🔍 Looking for existing relation:', {
        entityId,
        RENDERABLE_TYPE_PROPERTY,
        totalRelations: relations.length,
        relationsForEntity: relations.filter(r => r.fromEntity.id === entityId).map(r => ({
          typeId: r.type.id,
          typeName: r.type.name,
          toEntityId: r.toEntity.id,
          toEntityName: r.toEntity.name,
        })),
      });

      const existingRelation = relations.find(
        r => r.fromEntity.id === entityId && r.type.id === RENDERABLE_TYPE_PROPERTY
      );

      console.log('🔗 Relation management:', {
        existingRelation: existingRelation ? {
          id: existingRelation.id,
          fromEntityId: existingRelation.fromEntity.id,
          toEntityId: existingRelation.toEntity.id,
          toEntityName: existingRelation.toEntity.name,
        } : null,
        renderableTypeId,
        action: renderableTypeId ? (existingRelation ? 'update' : 'create') : (existingRelation ? 'delete' : 'none'),
      });

      if (renderableTypeId) {
        // Need to set or update the renderableType relation
        if (existingRelation) {
          // Update existing relation
          console.log('🔄 Updating existing relation');
          storage.relations.update(existingRelation, draft => {
            draft.toEntity.id = renderableTypeId;
            draft.toEntity.name = newType;
            draft.toEntity.value = renderableTypeId;
          });
        } else {
          // Create new relation
          console.log('➕ Creating new relation');
          storage.relations.set({
            id: Id.generate(),
            entityId: ID.createEntityId(),
            fromEntity: {
              id: entityId,
              name: propertyData?.name || '',
            },
            type: {
              id: RENDERABLE_TYPE_PROPERTY,
              name: 'Renderable Type',
            },
            toEntity: {
              id: renderableTypeId,
              name: newType,
              value: renderableTypeId,
            },
            spaceId,
            position: Position.generate(),
            verified: false,
            renderableType: 'RELATION',
          });
        }
      } else {
        // Remove renderableType relation if it exists
        if (existingRelation) {
          console.log('🗑️ Deleting existing relation');
          storage.relations.delete(existingRelation);
        } else {
          console.log('✅ No relation to delete');
        }
      }
    },
    [entityId, spaceId, storage, propertyData, relations, currentRenderableType]
  );

  // Create property data when Property type is added
  React.useEffect(() => {
    // Check if there's already a Property type relation to avoid duplicates
    const existingPropertyTypeRelation = relations.find(
      r => r.fromEntity.id === entityId && r.type.id === SystemIds.TYPES_PROPERTY && r.toEntity.id === SystemIds.PROPERTY
    );
    
    // Only create property if:
    // 1. Entity has Property type
    // 2. No property data exists from backend
    // 3. No dataType value exists (meaning we haven't created it yet)
    // 4. No existing Property type relation exists
    if (existingPropertyTypeRelation && !propertyData && !dataTypeValue && entityId && spaceId) {
      console.log('🎯 Property type detected but no property data exists, creating property with default dataType');
      
      // Create the property with a default dataType of TEXT
      storage.properties.create({
        entityId,
        spaceId,
        name: name || 'New Property',
        dataType: 'TEXT',
      });
    }
  }, [propertyData, dataTypeValue, entityId, spaceId, storage, name, relations]);

  // Debug logging
  React.useEffect(() => {
    if (propertyData) {
      console.log('Entity has property type', {
        entityId,
        propertyData,
        propertyDataType,
        currentRenderableType,
      });
    }
  }, [entityId, propertyData, propertyDataType, currentRenderableType]);

  return (
    <div className="flex items-center gap-2 text-text">
      {isPropertyEntity && editable && (
        <div className="flex items-center gap-2">
          <PropertyTypeDropdown 
            value={currentRenderableType} 
            onChange={handlePropertyTypeChange}
          />
          <Divider type="vertical" style="solid" className="h-[12px] border-divider" />
        </div>
      )}
      {(propertyDataType && !editable) && (
        <div className="h-100 mt-1 flex items-end">
          <DataTypePill
            dataType={propertyDataType.dataType}
            renderableType={propertyDataType.renderableType}
            spaceId={spaceId}
          />
        </div>
      )}
      {editable ? (
        <EditableRelationsGroup id={id} spaceId={spaceId} propertyId={SystemIds.TYPES_PROPERTY} />
      ) : (
        <ReadableRelationsGroup
          entityId={id}
          spaceId={spaceId}
          propertyId={SystemIds.TYPES_PROPERTY}
          isMetadataHeader={true}
        />
      )}
    </div>
  );
}

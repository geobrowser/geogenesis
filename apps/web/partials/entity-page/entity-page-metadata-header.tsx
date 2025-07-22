'use client';

import { Id, Position, SystemIds } from '@graphprotocol/grc-20';

import * as React from 'react';

import { RENDERABLE_TYPE_PROPERTY, DATA_TYPE_PROPERTY } from '~/core/constants';
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
import { Properties } from '~/core/utils/property';

const typeOptions: Record<SwitchableRenderableType, string> = {
  TIME: 'Time',
  TEXT: 'Text',
  URL: 'Url',
  RELATION: 'Relation',
  IMAGE: 'Image',
  CHECKBOX: 'Checkbox',
  NUMBER: 'Number',
  POINT: 'Point',
  GEO_LOCATION: 'Geo Location',
};

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
    id: entityId, // Use entityId consistently
    spaceId,
    enabled: true,
  });

  // Check if this entity has a Property type relation (local property check)
  const hasLocalPropertyType = relations.find(
    r => r.fromEntity.id === entityId && 
         r.type.id === SystemIds.TYPES_PROPERTY && 
         r.toEntity.id === SystemIds.PROPERTY
  );

  // Determine if property is unpublished by checking if the property data is local only
  const isUnpublishedProperty = React.useMemo(() => {
    const propertyTypeRelation = relations.find(
      r => r.fromEntity.id === entityId && 
           r.type.id === SystemIds.TYPES_PROPERTY && 
           r.toEntity.id === SystemIds.PROPERTY
    );
    
    return Properties.isUnpublished(propertyData, propertyTypeRelation);
  }, [propertyData, relations, entityId]);

  // Find renderableType relation
  const renderableTypeRelation = relations.find(
    r => r.fromEntity.id === entityId && r.type.id === RENDERABLE_TYPE_PROPERTY
  );
  
  const { entity: renderableTypeEntity } = useQueryEntity({
    id: propertyData?.renderableType || renderableTypeRelation?.toEntity.id || undefined,
    spaceId,
    enabled: !!(propertyData?.renderableType || renderableTypeRelation?.toEntity.id),
  });

  const isPropertyEntity = !!propertyData || !!hasLocalPropertyType


  const propertyDataType = React.useMemo(() => {
    return Properties.constructDataType(
      propertyData,
      renderableTypeEntity,
      renderableTypeRelation,
      entityId,
      hasLocalPropertyType
    );
  }, [propertyData, renderableTypeEntity, entityId, renderableTypeRelation, hasLocalPropertyType]);

  // Determine the current renderable type based on property data
  const currentRenderableType = React.useMemo(() => {
    return Properties.getCurrentRenderableType(propertyDataType);
  }, [propertyDataType]);

  const handlePropertyTypeChange = React.useCallback(
    (newType: SwitchableRenderableType) => {

      if (!entityId || !spaceId) return;

      // Determine the base dataType and renderableType based on the selected type
      // Map property types to their base dataType and renderableType
      const mapping = Properties.mapPropertyType(newType);
      const baseDataType = mapping.baseDataType;
      const renderableTypeId = mapping.renderableTypeId;


      // Published properties can't change their base dataType
      if (!isUnpublishedProperty && propertyData && propertyData.dataType !== baseDataType) {
        console.warn('Cannot change property dataType from', propertyData.dataType, 'to', baseDataType);
        console.warn('Published properties cannot change their base dataType');
        return;
      }

      // Update the dataType value if it's different from the current one
      if (propertyData?.dataType !== baseDataType) {
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
      } else if (!propertyData) {
        // If no dataType value exists and no propertyData, create the dataType value
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

      const existingRelation = relations.find(
        r => r.fromEntity.id === entityId && r.type.id === RENDERABLE_TYPE_PROPERTY
      );


      if (renderableTypeId) {
        // Need to set or update the renderableType relation
        if (existingRelation) {
          // Update existing relation
          storage.relations.update(existingRelation, draft => {
            draft.toEntity.id = renderableTypeId;
            draft.toEntity.name = typeOptions[newType] || newType;
            draft.toEntity.value = renderableTypeId;
          });
        } else {
          // Create new relation
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
              name: typeOptions[newType] || newType,
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
          storage.relations.delete(existingRelation);
        }
      }
    },
    [entityId, spaceId, storage, propertyData, relations, isUnpublishedProperty, name]
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
    if (existingPropertyTypeRelation && !propertyData && entityId && spaceId) {
      
      // Create the property with a default dataType of TEXT
      storage.properties.create({
        entityId,
        spaceId,
        name: name || 'New Property',
        dataType: 'TEXT',
      });
    }
  }, [propertyData, entityId, spaceId, storage, name, relations]);

  return (
    <div className="flex items-center gap-2 text-text">
      {isPropertyEntity && editable && (
        <div className="flex items-center gap-2">
          <PropertyTypeDropdown 
            value={currentRenderableType} 
            onChange={handlePropertyTypeChange}
            baseDataType={isUnpublishedProperty ? undefined : propertyDataType?.dataType}
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

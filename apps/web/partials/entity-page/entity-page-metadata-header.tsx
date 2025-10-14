'use client';

import { IdUtils, Position, SystemIds } from '@graphprotocol/grc-20';

import * as React from 'react';

import {
  DATA_TYPE_PROPERTY,
  DEFAULT_NUMBER_FORMAT,
  DEFAULT_TIME_FORMAT,
  FORMAT_PROPERTY,
  RENDERABLE_TYPE_PROPERTY,
} from '~/core/constants';
import { useCreateProperty } from '~/core/hooks/use-create-property';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { useEntityStoreInstance } from '~/core/state/entity-page-store/entity-store-provider';
import { useMutate } from '~/core/sync/use-mutate';
import { useQueryEntity, useQueryProperty, useRelations } from '~/core/sync/use-store';
import { Properties } from '~/core/utils/property';
import { SWITCHABLE_RENDERABLE_TYPE_LABELS, SwitchableRenderableType } from '~/core/v2.types';

import { Divider } from '~/design-system/divider';

import { DataTypePill } from './data-type-pill';
import { RelationsGroup as EditableRelationsGroup } from './editable-entity-page';
import { RelationsGroup as ReadableRelationsGroup } from './readable-entity-page';
import { RenderableTypeDropdown } from './renderable-type-dropdown';

interface EntityPageMetadataHeaderProps {
  id: string;
  spaceId: string;
}

export function EntityPageMetadataHeader({ id, spaceId }: EntityPageMetadataHeaderProps) {
  const { id: entityId } = useEntityStoreInstance();
  const relations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.spaceId === spaceId,
  });

  const name = useName(entityId);

  const { storage } = useMutate();

  const editable = useUserIsEditing(spaceId);

  const { addPropertyToEntity } = useCreateProperty(spaceId);

  // Fetch property data type to see if this is a property entity
  const { property: propertyData } = useQueryProperty({
    id: entityId, // Use entityId consistently
    spaceId,
    enabled: true,
  });

  const { entity } = useQueryEntity({
    id: entityId,
    spaceId,
    enabled: true,
  });

  const formatValue = entity?.values.find(value => value.property.id === FORMAT_PROPERTY);

  // Check if this entity has a Property type relation (local property check)
  const hasLocalPropertyType = relations.find(
    r =>
      r.fromEntity.id === entityId &&
      r.type.id === SystemIds.TYPES_PROPERTY &&
      r.toEntity.id === SystemIds.PROPERTY &&
      r.isLocal === true
  );

  // Check if property data type is editable (simpler than checking publish status)
  const isDataTypeEditable = propertyData?.isDataTypeEditable ?? false;

  // Find renderableType relation
  const renderableTypeRelation = relations.find(
    r => r.fromEntity.id === entityId && r.type.id === RENDERABLE_TYPE_PROPERTY
  );

  const { entity: renderableTypeEntity } = useQueryEntity({
    // id: propertyData?.renderableType || renderableTypeRelation?.toEntity.id || undefined,
    id: propertyData?.renderableType || undefined,
    spaceId,
    enabled: !!(propertyData?.renderableType || renderableTypeRelation?.toEntity.id),
  });

  const isPropertyEntity = !!propertyData || !!hasLocalPropertyType;

  const propertyDataType = React.useMemo(() => {
    return Properties.constructDataType(propertyData, renderableTypeEntity, renderableTypeRelation, entityId);
  }, [propertyData, renderableTypeEntity, entityId, renderableTypeRelation]);

  // Determine the current renderable type based on property data
  const currentRenderableType = React.useMemo(() => {
    return Properties.getCurrentRenderableType(propertyDataType);
  }, [propertyDataType]);

  const handlePropertyTypeChange = React.useCallback(
    (newType: SwitchableRenderableType) => {
      if (!entityId || !spaceId) return;

      // Add format property if type is TIME or NUMBER
      if (newType === 'TIME' || newType === 'NUMBER') {
        addPropertyToEntity({
          entityId,
          propertyId: FORMAT_PROPERTY,
          propertyName: 'Format',
          entityName: name ?? '',
          defaultValue: newType === 'TIME' ? DEFAULT_TIME_FORMAT : DEFAULT_NUMBER_FORMAT,
        });
      } else if (formatValue) {
        // Remove format property if type is not TIME or NUMBER and property exists
        storage.values.delete(formatValue);
      }

      // Determine the base dataType and renderableType based on the selected type
      // Map property types to their base dataType and renderableType
      const mapping = Properties.mapPropertyType(newType);
      const baseDataType = mapping.baseDataType;
      const renderableTypeId = mapping.renderableTypeId;

      // Non-editable properties can't change their base dataType
      if (!isDataTypeEditable && propertyData && propertyData.dataType !== baseDataType) {
        console.warn('Cannot change property dataType from', propertyData.dataType, 'to', baseDataType);
        console.warn('Non-editable properties cannot change their base dataType');
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
            draft.toEntity.name = SWITCHABLE_RENDERABLE_TYPE_LABELS[newType] || newType;
            draft.toEntity.value = renderableTypeId;
          });
        } else {
          // Create new relation
          storage.relations.set({
            id: IdUtils.generate(),
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
              name: SWITCHABLE_RENDERABLE_TYPE_LABELS[newType] || newType,
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
    [entityId, spaceId, storage, propertyData, relations, isDataTypeEditable, name]
  );

  // Create property data when Property type is added
  React.useEffect(() => {
    // Check if there's already a Property type relation to avoid duplicates
    const existingPropertyTypeRelation = relations.find(
      r =>
        r.fromEntity.id === entityId && r.type.id === SystemIds.TYPES_PROPERTY && r.toEntity.id === SystemIds.PROPERTY
    );

    // Only create property if:
    // 1. Entity has Property type relation
    // 2. No property data exists from backend
    if (existingPropertyTypeRelation && !propertyData && entityId && spaceId) {
      // Create the property with a default dataType of TEXT
      // Skip creating the Property type relation since it already exists
      storage.properties.create({
        entityId,
        spaceId,
        name: name || 'New Property',
        dataType: 'TEXT',
        renderableTypeId: null,
        skipTypeRelation: true,
      });
    }
  }, [propertyData, entityId, spaceId, storage, name, relations]);

  return (
    <div className="flex items-center gap-2 text-text">
      {isPropertyEntity && editable && (
        <div className="flex items-center gap-2">
          <RenderableTypeDropdown
            value={currentRenderableType}
            onChange={handlePropertyTypeChange}
            baseDataType={isDataTypeEditable ? undefined : propertyDataType?.dataType}
          />
          <Divider type="vertical" style="solid" className="h-[12px] border-divider" />
        </div>
      )}
      {propertyDataType && !editable && (
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

'use client';

import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk';

import * as React from 'react';

import {
  DATA_TYPE_ENTITY_IDS,
  DATA_TYPE_PROPERTY,
  DEFAULT_NUMBER_FORMAT,
  DEFAULT_URL_TEMPLATE,
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
import { SWITCHABLE_RENDERABLE_TYPE_LABELS, SwitchableRenderableType } from '~/core/types';
import { Properties } from '~/core/utils/property';

import { Divider } from '~/design-system/divider';

import { DataTypePill } from './data-type-pill';
import { RelationsGroup as EditableRelationsGroup } from './editable-entity-page';
import { RelationsGroup as ReadableRelationsGroup } from './readable-entity-page';
import { RenderableTypeDropdown } from './renderable-type-dropdown';

interface EntityPageMetadataHeaderProps {
  id: string;
  spaceId: string;
  isRelationPage?: boolean;
}

export function EntityPageMetadataHeader({ id, spaceId, isRelationPage = false }: EntityPageMetadataHeaderProps) {
  const { id: entityId } = useEntityStoreInstance();
  const relations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.spaceId === spaceId,
  });

  // Include deleted relations so handlePropertyTypeChange can reuse/update
  // them instead of creating new ones each time the dropdown changes.
  const allRelations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.spaceId === spaceId,
    includeDeleted: true,
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
    return Properties.constructDataType(propertyData, renderableTypeEntity, renderableTypeRelation);
  }, [propertyData, renderableTypeEntity, renderableTypeRelation]);

  // Determine the current renderable type based on property data
  const currentRenderableType = React.useMemo(() => {
    return Properties.getCurrentRenderableType(propertyDataType);
  }, [propertyDataType]);

  // @TODO: When a property's dataType changes (e.g. TEXT → RELATION or vice versa),
  // this function only updates the property entity's own metadata (Data Type and
  // Renderable Type relations). It does not clean up existing value or relation entries
  // on consumer entities that use this property. For example, switching TEXT → RELATION
  // leaves orphaned value entries (with value: '') on those entities, and switching
  // RELATION → TEXT would leave orphaned relation entries. These orphans persist in
  // IndexedDB and can surface at publish time. The publish flow has a defensive filter
  // for RELATION values (see publish.ts), but the proper fix would be to clean up
  // stale entries here — needs careful testing to avoid cascading issues.
  const handlePropertyTypeChange = React.useCallback(
    (newType: SwitchableRenderableType) => {
      if (!entityId || !spaceId) return;

      // Add format property if type is temporal or numeric
      const isTemporalType = newType === 'DATE' || newType === 'DATETIME' || newType === 'TIME';
      const isNumericType = newType === 'INTEGER' || newType === 'FLOAT' || newType === 'DECIMAL';
      const isTextOrUrlType = newType === 'TEXT' || newType === 'URL';
      if (isTemporalType || isNumericType) {
        addPropertyToEntity({
          entityId,
          propertyId: FORMAT_PROPERTY,
          propertyName: 'Format',
          entityName: name ?? '',
          defaultValue: isTemporalType ? DEFAULT_TIME_FORMAT : DEFAULT_NUMBER_FORMAT,
        });
      } else if (newType === 'URL') {
        addPropertyToEntity({
          entityId,
          propertyId: FORMAT_PROPERTY,
          propertyName: 'Format',
          entityName: name ?? '',
          defaultValue: DEFAULT_URL_TEMPLATE,
        });
      } else if (formatValue && !isTextOrUrlType) {
        // Remove format property if type is not temporal or numeric and property exists
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

      // Register the data type so store.getProperty() returns the updated type
      storage.properties.setDataType(entityId, baseDataType);

      // Update the data type relation. Every property gets an explicit Data Type relation.
      // Use allRelations (includes deleted) to reuse existing relations instead of accumulating tombstones.
      const dataTypeEntityId = DATA_TYPE_ENTITY_IDS[baseDataType];
      if (dataTypeEntityId) {
        const existingDataTypeRelation = allRelations.find(
          r => r.fromEntity.id === entityId && r.type.id === DATA_TYPE_PROPERTY
        );

        if (existingDataTypeRelation) {
          storage.relations.update(existingDataTypeRelation, draft => {
            draft.toEntity.id = dataTypeEntityId;
            draft.toEntity.name = baseDataType;
            draft.toEntity.value = dataTypeEntityId;
          });
        } else {
          storage.relations.set({
            id: IdUtils.generate(),
            entityId: ID.createEntityId(),
            fromEntity: {
              id: entityId,
              name: name || '',
            },
            type: {
              id: DATA_TYPE_PROPERTY,
              name: 'Data Type',
            },
            toEntity: {
              id: dataTypeEntityId,
              name: baseDataType,
              value: dataTypeEntityId,
            },
            spaceId,
            position: Position.generate(),
            verified: false,
            renderableType: 'RELATION',
          });
        }
      }

      // Handle the renderableType relation.
      // Use allRelations (includes deleted) to reuse existing relations instead of accumulating tombstones.
      const existingRelation = allRelations.find(
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
    [entityId, spaceId, storage, propertyData, allRelations, isDataTypeEditable, name]
  );

  // Create property data when Property type is manually added to an existing entity
  React.useEffect(() => {
    const existingPropertyTypeRelation = relations.find(
      r =>
        r.fromEntity.id === entityId && r.type.id === SystemIds.TYPES_PROPERTY && r.toEntity.id === SystemIds.PROPERTY
    );

    // Only create default property data if:
    // 1. Entity has Property type relation
    // 2. No property data exists yet (not created via storage.properties.create())
    if (existingPropertyTypeRelation && !propertyData && entityId && spaceId) {
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
    <div className="flex items-center gap-1 text-text">
      {isPropertyEntity && editable && (
        <>
          <RenderableTypeDropdown
            value={currentRenderableType}
            onChange={handlePropertyTypeChange}
            baseDataType={isDataTypeEditable ? undefined : propertyDataType?.dataType}
          />
          <Divider type="vertical" style="solid" className="h-[12px] border-divider" />
        </>
      )}
      {propertyDataType && !editable && (
        <DataTypePill
          dataType={propertyDataType.dataType}
          renderableType={propertyDataType.renderableType}
          spaceId={spaceId}
        />
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

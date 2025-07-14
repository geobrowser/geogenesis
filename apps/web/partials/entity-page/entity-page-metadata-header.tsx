'use client';

import { SystemIds } from '@graphprotocol/grc-20';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useQueryEntity, useQueryProperty } from '~/core/sync/use-store';

import { DataTypePill } from './data-type-pill';
import { RelationsGroup as EditableRelationsGroup } from './editable-entity-page';
import { RelationsGroup as ReadableRelationsGroup } from './readable-entity-page';

interface EntityPageMetadataHeaderProps {
  id: string;
  spaceId: string;
}

export function EntityPageMetadataHeader({ id, spaceId }: EntityPageMetadataHeaderProps) {
  const editable = useUserIsEditing(spaceId);

  // Fetch property data type to see if this is a property entity
  const { property: propertyData } = useQueryProperty({
    id,
    spaceId,
    enabled: true,
  });

  const { entity: renderableTypeEntity } = useQueryEntity({
    id: propertyData?.renderableType || undefined,
    spaceId,
    enabled: !!propertyData?.renderableType,
  });

  const propertyDataType = React.useMemo(() => {
    if (!propertyData) return null;

    // If there's a renderableType ID but the entity hasn't loaded yet, return null
    // to prevent the loading flash
    if (propertyData.renderableType && !renderableTypeEntity) {
      return null;
    }

    let renderableType = null;
    if (propertyData.renderableType && renderableTypeEntity) {
      // It's a UUID, use the entity data
      renderableType = {
        id: renderableTypeEntity.id,
        name: renderableTypeEntity.name,
      };
    }

    return {
      id: propertyData.id,
      dataType: propertyData.dataType,
      renderableType,
    };
  }, [propertyData, renderableTypeEntity]);

  return (
    <div className="flex items-center gap-2 text-text">
      {propertyDataType && (
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
        <ReadableRelationsGroup entityId={id} spaceId={spaceId} propertyId={SystemIds.TYPES_PROPERTY} isTypes={true} />
      )}
    </div>
  );
}

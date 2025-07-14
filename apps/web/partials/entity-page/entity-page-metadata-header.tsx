'use client';

import { SystemIds } from '@graphprotocol/grc-20';

import * as React from 'react';

import { useRenderables } from '~/core/hooks/use-renderables';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { useQueryEntity, useQueryProperty } from '~/core/sync/use-store';
import { RelationRenderableProperty } from '~/core/v2.types';

import { DataTypePill } from './data-type-pill';
import { RelationsGroup as EditableRelationsGroup } from './editable-entity-page';
import { RelationsGroup as ReadableRelationsGroup } from './readable-entity-page';

interface EntityPageMetadataHeaderProps {
  id: string;
  spaceId: string;
}

export function EntityPageMetadataHeader({ id, spaceId }: EntityPageMetadataHeaderProps) {
  const editable = useUserIsEditing(spaceId);
  const name = useName(id, spaceId);

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
        <EditableRelationsGroup id={id} name={name} spaceId={spaceId} propertyId={SystemIds.TYPES_PROPERTY} />
      ) : (
        <ReadableRelationsGroup entityId={id} spaceId={spaceId} propertyId={SystemIds.TYPES_PROPERTY} isTypes={true} />
      )}
    </div>
  );
}

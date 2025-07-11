'use client';

import { SystemIds } from '@graphprotocol/grc-20';

import * as React from 'react';

import { useProperties } from '~/core/hooks/use-properties';
import { useRenderables } from '~/core/hooks/use-renderables';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { useQueryEntity, useQueryProperty } from '~/core/sync/use-store';
import { RelationRenderableProperty } from '~/core/v2.types';

import { DataTypePill } from './data-type-pill';
import { RelationsGroup as EditableRelationsGroup } from './editable-entity-page';
import { RelationsGroup as ReadableRelationsGroup } from './readable-entity-page';

interface EntityPageMetadataHeaderProps {
  id: string;
  spaceId: string;
}

export function EntityPageMetadataHeader({ spaceId }: EntityPageMetadataHeaderProps) {
  const { id: entityId } = useEntityPageStore();

  const editable = useUserIsEditing(spaceId);

  const { renderablesGroupedByAttributeId } = useRenderables([], spaceId);
  const properties = useProperties(Object.keys(renderablesGroupedByAttributeId));

  // @TODO noIndexedAccessCheck
  const typesRenderables = renderablesGroupedByAttributeId[SystemIds.TYPES_PROPERTY] ?? [];

  // Fetch property data type to see if this is a property entity
  const { property: propertyData } = useQueryProperty({
    id: entityId,
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

    let renderableType = null;
    if (propertyData.renderableType) {
      if (renderableTypeEntity) {
        // It's a UUID, use the entity data
        renderableType = {
          id: renderableTypeEntity.id,
          name: renderableTypeEntity.name,
        };
      }
    }

    return {
      id: propertyData.id || '',
      dataType: propertyData.dataType || '',
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
        <EditableRelationsGroup relations={typesRenderables as RelationRenderableProperty[]} properties={properties} />
      ) : (
        <ReadableRelationsGroup relations={typesRenderables as RelationRenderableProperty[]} isTypes={true} />
      )}
    </div>
  );
}

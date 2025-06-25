'use client';

import { SystemIds } from '@graphprotocol/grc-20';

import * as React from 'react';

import { useProperties } from '~/core/hooks/use-properties';
import { useProperty } from '~/core/hooks/use-property';
import { useRenderables } from '~/core/hooks/use-renderables';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { RelationRenderableProperty } from '~/core/v2.types';

import { DataTypePill } from './data-type-pill';
import { RelationsGroup as EditableRelationsGroup } from './editable-entity-page';
import { RelationsGroup as ReadableRelationsGroup } from './readable-entity-page';
import { RENDERABLE_TYPE_PROPERTY } from '~/core/constants';

interface EntityPageMetadataHeaderProps {
  id: string;
  spaceId: string;
}

export function EntityPageMetadataHeader({ spaceId }: EntityPageMetadataHeaderProps) {
  const { id: entityId, relations } = useEntityPageStore();

  const editable = useUserIsEditing(spaceId);

  const { renderablesGroupedByAttributeId } = useRenderables([], spaceId);

  const properties = useProperties(Object.keys(renderablesGroupedByAttributeId));

  const typesRenderable = Object.values(renderablesGroupedByAttributeId).map(renderables => {
    const firstRenderable = renderables[0];
    const renderableType = firstRenderable.type;

    if (renderableType === 'RELATION' && firstRenderable.propertyId === SystemIds.TYPES_PROPERTY) {
      return renderables;
    }
  });

  const typesRenderableObj = typesRenderable.find(r => r?.find(re => re.propertyId === SystemIds.TYPES_PROPERTY));
  
  // Fetch property data type to see if this is a property entity
  const { data: propertyData } = useProperty({ 
    id: entityId, 
    enabled: true 
  });

  const propertyDataType = React.useMemo(() => {
    if (!propertyData) return null;


    // Find the renderable type from entity relations
    const renderableTypeRelation = relations.find(relation => {
      return relation.type.id === RENDERABLE_TYPE_PROPERTY
    });

    return {
      id: propertyData.id,
      dataType: propertyData.dataType,
      renderableType: renderableTypeRelation ? {
        id: renderableTypeRelation.toEntity.id,
        name: renderableTypeRelation.toEntity.name
      } : null,
    };
  }, [propertyData, relations]);

  return (
    <div className="flex items-center gap-2 text-text">
      {propertyDataType && (
        <div className="mt-1 h-100 items-end flex">
          <DataTypePill
            dataType={propertyDataType.dataType}
            renderableType={propertyDataType.renderableType}
            spaceId={spaceId}
          />
        </div>
      )}
      {typesRenderableObj &&
        (editable ? (
          <EditableRelationsGroup
            relations={typesRenderableObj as RelationRenderableProperty[]}
            properties={properties}
          />
        ) : (
          <ReadableRelationsGroup relations={typesRenderableObj as RelationRenderableProperty[]} isTypes={true} />
        ))}
    </div>
  );
}

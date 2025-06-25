'use client';

import { SystemIds } from '@graphprotocol/grc-20';

import * as React from 'react';

import { useProperties } from '~/core/hooks/use-properties';
import { useProperty } from '~/core/hooks/use-property';
import { useRelationship } from '~/core/hooks/use-relationship';
import { useRenderables } from '~/core/hooks/use-renderables';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { RelationRenderableProperty, RenderableType } from '~/core/v2.types';

import { DataTypePill } from './data-type-pill';
import { RelationsGroup as EditableRelationsGroup } from './editable-entity-page';
import { RelationsGroup as ReadableRelationsGroup } from './readable-entity-page';

interface EntityPageMetadataHeaderProps {
  id: string;
  spaceId: string;
}

export function EntityPageMetadataHeader({ spaceId }: EntityPageMetadataHeaderProps) {
  const { id: entityId, types, relations } = useEntityPageStore();

  const editable = useUserIsEditing(spaceId);

  const [isRelationPage] = useRelationship(entityId, spaceId);

  const { renderablesGroupedByAttributeId } = useRenderables([], spaceId, isRelationPage);

  const properties = useProperties(Object.keys(renderablesGroupedByAttributeId));

  const typesRenderable = Object.values(renderablesGroupedByAttributeId).map(renderables => {
    const firstRenderable = renderables[0];
    const renderableType = firstRenderable.type;

    if (renderableType === 'RELATION' && firstRenderable.propertyId === SystemIds.TYPES_PROPERTY) {
      return renderables;
    }
  });

  const typesRenderableObj = typesRenderable.find(r => r?.find(re => re.propertyId === SystemIds.TYPES_PROPERTY));

  // Check if this entity is a Property
  const isPropertyEntity = types.some(type => type.id === SystemIds.PROPERTY);
  
  // Fetch property data type if this is a property entity
  const { data: propertyData } = useProperty({ 
    id: entityId, 
    enabled: isPropertyEntity 
  });

  const propertyDataType = React.useMemo(() => {
    if (!isPropertyEntity || !propertyData) return null;


    // Find the renderable type from entity relations
    const renderableTypeRelation = relations.find(relation => {
      return relation.type.name === 'Renderable type'
    });

    return {
      id: propertyData.id,
      dataType: propertyData.dataType,
      renderableType: renderableTypeRelation ? {
        id: renderableTypeRelation.toEntity.id,
        name: renderableTypeRelation.toEntity.name as RenderableType,
      } : null,
    };
  }, [isPropertyEntity, propertyData, relations]);

  return (
    <div className="flex items-center gap-2 text-text">
      {isPropertyEntity && propertyDataType && (
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

'use client';

import { SystemIds } from '@graphprotocol/grc-20';

import * as React from 'react';

import { useProperties } from '~/core/hooks/use-properties';
import { useRenderables } from '~/core/hooks/use-renderables';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { RelationRenderableProperty } from '~/core/v2.types';

import { RelationsGroup as EditableRelationsGroup } from './editable-entity-page';
import { RelationsGroup as ReadableRelationsGroup } from './readable-entity-page';

interface EntityPageMetadataHeaderProps {
  id: string;
  spaceId: string;
}

export function EntityPageMetadataHeader({ spaceId }: EntityPageMetadataHeaderProps) {
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

  return (
    <div className="flex items-center justify-between text-text">
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

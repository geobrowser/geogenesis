'use client';

import * as React from 'react';

import { useProperties } from '~/core/hooks/use-properties';
import { useRelationship } from '~/core/hooks/use-relationship';
import { useRenderables } from '~/core/hooks/use-renderables';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { RelationRenderableProperty } from '~/core/types';

import { Create } from '~/design-system/icons/create';

import { RelationsGroup } from './editable-entity-page';
import { SystemIds } from '@graphprotocol/grc-20';

interface EntityPageMetadataHeaderProps {
  id: string;
  entityName: string;
  spaceId: string;
}

export function EntityPageMetadataHeader({ id, entityName, spaceId }: EntityPageMetadataHeaderProps) {
  const [addTypeState, setAddTypeState] = React.useState(false);

  const { types } = useEntityPageStore();

  const { id: entityId } = useEntityPageStore();

  const editable = useUserIsEditing(spaceId);

  const [isRelationPage] = useRelationship(entityId, spaceId);

  const { renderablesGroupedByAttributeId } = useRenderables([], spaceId, isRelationPage);

  const properties = useProperties(Object.keys(renderablesGroupedByAttributeId));

  const typesRenderable = Object.entries(renderablesGroupedByAttributeId).map(([attributeId, renderables]) => {
    const firstRenderable = renderables[0];
    const renderableType = firstRenderable.type;

    if (renderableType === 'RELATION' && firstRenderable.attributeId === SystemIds.TYPES_PROPERTY) {
      return renderables;
    }
  });

  const typesRenderableObj = typesRenderable.find(r => r?.find(re => re.attributeId === SystemIds.TYPES_PROPERTY));

  return (
    <div className="flex items-center justify-between text-text">
      {editable && (
        <div>
          {(typesRenderableObj && types.length > 0) || (addTypeState && types.length === 0) ? (
            <RelationsGroup
              relations={typesRenderableObj as RelationRenderableProperty[]}
              properties={properties}
            />
          ) : (
            <button
              onClick={() => setAddTypeState(true)}
              className="flex h-6 items-center gap-[6px] rounded border border-dashed border-grey-02 px-2"
            >
              <Create color="grey-04" className="h-3 w-3" /> type
            </button>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { SystemIds } from '@graphprotocol/grc-20';

import * as React from 'react';

import { useProperties } from '~/core/hooks/use-properties';
import { useRelationship } from '~/core/hooks/use-relationship';
import { useRenderables } from '~/core/hooks/use-renderables';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { RelationRenderableProperty } from '~/core/v2.types';

import { Create } from '~/design-system/icons/create';

import { RelationsGroup } from '../entity-page/editable-entity-page';

interface SpacePageMetadataHeaderProps {
  spaceId: string;
  membersComponent: React.ReactElement<any>;
  typeNames: string[];
  entityId: string;
}

export function SpacePageMetadataHeader({
  spaceId,
  membersComponent,
  typeNames,
  entityId,
}: SpacePageMetadataHeaderProps) {
  const additionalTypeChips = typeNames.map((typeName, i) => (
    <span
      key={i}
      className="flex h-6 items-center rounded border border-grey-02 bg-white px-1.5 text-metadata text-text"
    >
      {typeName}
    </span>
  ));

  const [addTypeState, setAddTypeState] = React.useState(false);

  const { types } = useEntityPageStore();

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

  return (
    <div className="relative z-20 flex flex-wrap items-center justify-between gap-y-4 text-text">
      <div className="flex items-center gap-1">
        {editable ? (
          <div className="box-border h-6">
            {(typesRenderableObj && types.length > 0) || (addTypeState && types.length === 0) ? (
              <RelationsGroup relations={typesRenderableObj as RelationRenderableProperty[]} properties={properties} />
            ) : (
              <button
                onClick={() => setAddTypeState(true)}
                className="flex h-6 items-center gap-[6px] rounded border border-dashed border-grey-02 px-2"
              >
                <Create color="grey-04" className="h-3 w-3" /> type
              </button>
            )}
          </div>
        ) : (
          additionalTypeChips
        )}
        {membersComponent}
      </div>
    </div>
  );
}

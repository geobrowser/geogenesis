'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEntityTypes } from '~/core/state/entity-page-store/entity-store';
import { useEntityStoreInstance } from '~/core/state/entity-page-store/entity-store-provider';

import { Create } from '~/design-system/icons/create';

import { RelationsGroup } from '../entity-page/editable-entity-page';

interface SpacePageMetadataHeaderProps {
  spaceId: string;
  membersComponent: React.ReactElement<any>;
  entityId: string;
}

export function SpacePageMetadataHeader({ spaceId, membersComponent }: SpacePageMetadataHeaderProps) {
  const [addTypeState, setAddTypeState] = React.useState(false);

  const { id } = useEntityStoreInstance();
  const types = useEntityTypes(id, spaceId);

  const additionalTypeChips = types.map((type, i) => (
    <span
      key={i}
      className="flex h-6 items-center rounded border border-grey-02 bg-white px-1.5 text-metadata text-text"
    >
      {type.name ?? type.id}
    </span>
  ));

  const editable = useUserIsEditing(spaceId);

  return (
    <div className="relative z-20 flex flex-wrap items-center justify-between gap-y-4 text-text">
      <div className="flex items-center gap-1">
        {editable ? (
          <div className="box-border h-6">
            {types.length > 0 || (addTypeState && types.length === 0) ? (
              <RelationsGroup id={id} spaceId={spaceId} propertyId={SystemIds.TYPES_PROPERTY} />
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

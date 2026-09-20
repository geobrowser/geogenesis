'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEntityTypes } from '~/core/state/entity-page-store/entity-store';
import { useEntityStoreInstance } from '~/core/state/entity-page-store/entity-store-provider';

import { Create } from '~/design-system/icons/create';

import { RelationsGroup } from '../entity-page/editable-entity-page';
import { EntityVoteButtons } from '../entity-page/entity-vote-buttons';
import { AddDataChip } from './add-data-panel';

interface SpacePageMetadataHeaderProps {
  spaceId: string;
  membersComponent: React.ReactElement<any>;
  /**
   * This row belongs to a space, not a person (GEO-2859).
   *
   * Every part of it is either rendered elsewhere on a profile or says nothing
   * about one: types move to the rail's About section, the vote pair up into
   * the action row beside Edit profile, and Import and the member avatars
   * describe a space whose only member is its owner. So a reader sees none of
   * it — moving the votes rather than suppressing them would leave two controls
   * fighting over one number.
   *
   * An editor keeps the *types editor* out of that row and nothing else. It
   * used to keep the whole row, which put a second `EntityVoteButtons` beside
   * the pair `ProfileActions` already draws — two controls fighting over one
   * number, which is the exact thing this flag exists to prevent — and brought
   * back the members and Add Data chips with it.
   */
  profileChrome?: boolean;
}

export function SpacePageMetadataHeader({
  spaceId,
  membersComponent,
  profileChrome = false,
}: SpacePageMetadataHeaderProps) {
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

  /*
   * The editor still edits types even on a profile: the rail's pills are a
   * read-only view, and the only other way to add a type would be a control the
   * profile does not have. Hoisted so the profile branch and the space row draw
   * the same control rather than two that drift.
   */
  const typesEditor = editable ? (
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
  );

  if (profileChrome && !editable) return null;

  // The types editor alone. Everything else in this row is either drawn
  // elsewhere on a profile or is about a space rather than a person, and
  // rendering it here duplicates or contradicts what the profile already shows.
  if (profileChrome) {
    return <div className="relative z-20 flex items-center gap-1 text-text">{typesEditor}</div>;
  }

  return (
    <div className="relative z-20 flex flex-wrap items-center justify-between gap-y-4 text-text">
      <div className="flex items-center gap-1">
        {typesEditor}
        {membersComponent}
        <AddDataChip spaceId={spaceId} />
      </div>
      <EntityVoteButtons entityId={id} spaceId={spaceId} />
    </div>
  );
}

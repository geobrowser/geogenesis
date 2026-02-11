'use client';

import * as React from 'react';
import { memo, useState } from 'react';

import { useMutate } from '~/core/sync/use-mutate';

import { RenderableTypeDropdown } from './renderable-type-dropdown';

interface Props {
  column: { id: string; name: string | null };
  // This spaceId is the spaceId of the attribute, not the current space.
  // We need the attribute spaceId to get the actions for the attribute
  // (since actions are grouped by spaceId) to be able to keep the updated
  // name in sync.
  spaceId: string;
  entityId: string;
  unpublishedColumns: { id: string }[];
}

export const EditableEntityTableColumnHeader = memo(function EditableEntityTableColumn({
  column,
  spaceId,
  entityId,
  unpublishedColumns,
}: Props) {
  // There's some issue where this component is losing focus after changing the value of the input. For now we can work
  // around this issue by using local state.
  const [localName, setLocalName] = useState(column.name ?? '');

  const { storage } = useMutate();

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  const isUnpublished = unpublishedColumns.some(unpublishedColumn => unpublishedColumn.id === column.id);

  // @TODO(migration): Value type comes from property
  const value = 'TEXT';

  return (
    <div className="flex h-full w-full items-center">
      <input
        className="w-full bg-transparent text-smallTitle placeholder:text-grey-02 focus:outline-none"
        onChange={e => setLocalName(e.currentTarget.value)}
        placeholder="Column name..."
        onBlur={e => {
          storage.entities.name.set(entityId, spaceId, e.currentTarget.value);
        }}
        value={localName}
      />

      {/* @TODO: Data type should now come from Property */}
      {isUnpublished && <RenderableTypeDropdown value={value} />}
    </div>
  );
});

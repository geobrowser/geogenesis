import * as React from 'react';
import { memo } from 'react';

import { useEditEvents } from '~/core/events/edit-events';
import { useActionsStore } from '~/core/hooks/use-actions-store';
import { GeoType } from '~/core/types';

import { Plus } from '~/design-system/icons/plus';

interface Props {
  selectedType: GeoType;
  space: string;
}

export const AddNewColumn = memo(function AddNewColumn({ selectedType, space }: Props) {
  const { update, create, remove } = useActionsStore();

  const send = useEditEvents({
    context: {
      entityId: selectedType.entityId,
      spaceId: space,
      entityName: selectedType.entityName || '',
    },
    api: {
      create,
      update,
      remove,
    },
  });

  return (
    <button
      className="absolute right-0 top-0 border-b border-l border-grey-02 bg-white p-[13.5px] transition-colors duration-150 ease-in-out hover:cursor-pointer hover:bg-grey-01 hover:text-text focus:text-text focus:outline-ctaPrimary active:text-text active:outline-ctaPrimary"
      onClick={() => send({ type: 'ADD_NEW_COLUMN' })}
    >
      <Plus />
    </button>
  );
});

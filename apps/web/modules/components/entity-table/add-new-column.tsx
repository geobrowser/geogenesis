import * as React from 'react';
import { memo } from 'react';

import { useActionsStoreContext } from '~/modules/action';
import { Plus } from '~/modules/design-system/icons/plus';
import { Triple } from '~/modules/types';
import { useEditEvents } from '../entity/edit-events';

interface Props {
  selectedType: Triple;
  space: string;
}

export const AddNewColumn = memo(function AddNewColumn({ selectedType, space }: Props) {
  const { update, create, remove } = useActionsStoreContext();

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
      className="absolute top-0 right-0 border-l border-b border-grey-02 bg-white p-[13.5px] transition-colors duration-150 ease-in-out hover:cursor-pointer hover:bg-grey-01 hover:text-text focus:text-text focus:outline-ctaPrimary active:text-text active:outline-ctaPrimary"
      onClick={() => send({ type: 'ADD_NEW_COLUMN' })}
    >
      <Plus />
    </button>
  );
});

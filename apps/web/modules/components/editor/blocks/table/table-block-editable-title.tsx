import * as React from 'react';

import { useActionsStore } from '~/modules/action';
import { useTableBlock } from './table-block-store';
import { useUserCanEdit } from '~/modules/hooks/use-user-can-edit';
import { TableBlockSdk } from '../sdk';

export function TableBlockEditableTitle({ spaceId }: { spaceId: string }) {
  const { update, create } = useActionsStore();
  const userCanEdit = useUserCanEdit(spaceId);
  const { blockEntity } = useTableBlock();

  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    TableBlockSdk.upsertName({ name: e.currentTarget.value, blockEntity, api: { update, create } });
  };

  return userCanEdit ? (
    <input
      onBlur={onNameChange}
      defaultValue={blockEntity?.name ?? undefined}
      placeholder="Enter a name for this table..."
      className="w-full appearance-none text-smallTitle text-text outline-none placeholder:text-grey-03"
    />
  ) : (
    <h4 className="text-smallTitle">{blockEntity?.name}</h4>
  );
}

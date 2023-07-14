import * as React from 'react';

import { useActionsStore } from '~/modules/action';
import { useTableBlock } from './table-block-store';
import { useUserIsEditing } from '~/modules/hooks/use-user-is-editing';
import { TableBlockSdk } from '../sdk';
import { Entity } from '~/modules/entity';

export function TableBlockEditableTitle({ spaceId }: { spaceId: string }) {
  const { update, create } = useActionsStore();
  const userCanEdit = useUserIsEditing(spaceId);
  const { nameTriple, entityId, spaceId: entitySpaceId } = useTableBlock();

  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    TableBlockSdk.upsertName({
      newName: e.currentTarget.value,
      nameTriple,
      spaceId: entitySpaceId,
      entityId,
      api: { update, create },
    });
  };

  const name = Entity.name(nameTriple ? [nameTriple] : []);

  return userCanEdit ? (
    <input
      onBlur={onNameChange}
      defaultValue={name ?? undefined}
      placeholder="Enter a name for this table..."
      className="w-full appearance-none text-smallTitle text-text outline-none placeholder:text-grey-03"
    />
  ) : (
    <h4 className="text-smallTitle">{name}</h4>
  );
}

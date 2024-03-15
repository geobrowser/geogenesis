import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useTableBlock } from '~/core/state/table-block-store';

export function TableBlockEditableTitle({ spaceId }: { spaceId: string }) {
  const userCanEdit = useUserIsEditing(spaceId);
  const { name, setName } = useTableBlock();

  return userCanEdit ? (
    <input
      onBlur={e => setName(e.currentTarget.value)}
      defaultValue={name ?? undefined}
      placeholder="Enter a name for this table..."
      className="w-full shrink-0 grow appearance-none text-smallTitle text-text outline-none placeholder:text-grey-03"
    />
  ) : (
    <h4 className="text-smallTitle">{name}</h4>
  );
}

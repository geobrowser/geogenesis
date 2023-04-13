import * as React from 'react';
import BoringAvatar from 'boring-avatars';
import { SYSTEM_IDS } from '@geogenesis/ids';

import { useTableBlock } from './table-block-store-provider';
import { TableBlockTable } from './table';
import { useEditable } from '~/modules/stores/use-editable';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { Icon } from '~/modules/design-system/icon';
import { colors } from '~/modules/design-system/theme/colors';
import { Entity } from '~/modules/entity';
import { useActionsStore } from '~/modules/action';
import { ID } from '~/modules/id';

interface Props {
  spaceId: string;
}

export function TableBlock({ spaceId }: Props) {
  const { columns, rows, blockEntity } = useTableBlock();

  return (
    <div>
      <div className="mb-2 flex items-center justify-between py-1">
        <div className="flex w-full items-center gap-2">
          <span className="overflow-hidden rounded">
            <BoringAvatar
              size={16}
              square={true}
              variant="bauhaus"
              name={blockEntity?.name ?? 'Untitled'}
              colors={[colors.light['grey-03'], colors.light['grey-02'], colors.light['grey-01']]}
            />
          </span>

          <EditableTitle spaceId={spaceId} />
        </div>
        <div className="flex items-center gap-5">
          <span
            title="Table block filtering coming soon"
            className="hover:cursor-not-allowed"
            onClick={() => {
              //
            }}
          >
            <Icon icon="search" color="grey-02" />
          </span>
          <span
            title="Table block filtering coming soon"
            className="hover:cursor-not-allowed"
            onClick={() => {
              //
            }}
          >
            <Icon icon="filterTable" color="grey-02" />
          </span>
          <span
            title="Table block filtering coming soon"
            className="hover:cursor-not-allowed"
            onClick={() => {
              //
            }}
          >
            <Icon icon="context" color="grey-02" />
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded border border-grey-02 p-0 shadow-button">
        <TableBlockTable space={spaceId} columns={columns} rows={rows} />
      </div>
    </div>
  );
}

function EditableTitle({ spaceId }: { spaceId: string }) {
  const { update, create } = useActionsStore();
  const { editable } = useEditable();
  const { isEditor } = useAccessControl(spaceId);
  const { blockEntity } = useTableBlock();

  const nameTriple = Entity.nameTriple(blockEntity?.triples ?? []);

  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!blockEntity) return;
    if (!nameTriple)
      return create(
        ID.createTripleWithId({
          attributeId: SYSTEM_IDS.NAME,
          entityId: blockEntity.id,
          entityName: e.currentTarget.value,
          attributeName: 'Name',
          space: blockEntity.nameTripleSpace ?? '',
          value: { type: 'string', id: ID.createValueId(), value: e.currentTarget.value },
        })
      );

    update({ ...nameTriple, value: { ...nameTriple.value, type: 'string', value: e.currentTarget.value } }, nameTriple);
  };

  return editable && isEditor ? (
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

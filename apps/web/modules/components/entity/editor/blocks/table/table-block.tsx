import { Text } from '~/modules/design-system/text';
import { useTableBlock } from './table-block-store-provider';
import { TableBlockTable } from './table';
import { useEditable } from '~/modules/stores/use-editable';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { Context } from '~/modules/design-system/icons/context';
import { Search } from '~/modules/design-system/icons/search';
import { Icon } from '~/modules/design-system/icon';

interface Props {
  spaceId: string;
}

export function TableBlock({ spaceId }: Props) {
  const { columns, rows } = useTableBlock();

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <EditableTitle spaceId={spaceId} />
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
  const { editable } = useEditable();
  const { isEditor } = useAccessControl(spaceId);
  const { blockEntity } = useTableBlock();

  return editable && isEditor ? (
    <input
      defaultValue={blockEntity?.name ?? ''}
      placeholder="Enter a name for this table..."
      className="w-full appearance-none text-smallTitle text-text outline-none placeholder:text-grey-03"
    />
  ) : (
    <Text as="h3" variant="smallTitle">
      {blockEntity?.name ?? 'Undefined'}
    </Text>
  );
}

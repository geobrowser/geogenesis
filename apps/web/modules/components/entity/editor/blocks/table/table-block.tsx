import { useEntityTableBlock } from './entity-page-table-block-store-provider';
import { TableBlockTable } from './table';

interface Props {
  spaceId: string;
}

export function TableBlock({ spaceId }: Props) {
  const { columns, rows } = useEntityTableBlock();

  return (
    <div className="overflow-hidden rounded border border-grey-02 p-0">
      <TableBlockTable space={spaceId} columns={columns} rows={rows} />
    </div>
  );
}

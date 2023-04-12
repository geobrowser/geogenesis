import { Text } from '~/modules/design-system/text';
import { useTableBlock } from './table-block-store-provider';
import { TableBlockTable } from './table';
import { Spacer } from '~/modules/design-system/spacer';

interface Props {
  spaceId: string;
}

export function TableBlock({ spaceId }: Props) {
  const { columns, rows, blockEntity } = useTableBlock();

  return (
    <div>
      <div>
        <Text as="h3" variant="smallTitle">
          {blockEntity?.name ?? 'Undefined'}
        </Text>
        <Spacer height={8} />
      </div>

      <Spacer height={8} />

      <div className="overflow-hidden rounded border border-grey-02 p-0">
        <TableBlockTable space={spaceId} columns={columns} rows={rows} />
      </div>
    </div>
  );
}

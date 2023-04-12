import { Text } from '~/modules/design-system/text';
import { useTableBlock } from './table-block-store-provider';
import { TableBlockTable } from './table';
import { Spacer } from '~/modules/design-system/spacer';

interface Props {
  spaceId: string;
  entityId: string;
}

export function TableBlock({ spaceId, entityId }: Props) {
  const { columns, rows } = useTableBlock();

  console.log('entityId', entityId);

  return (
    <div>
      <div>
        <Text as="h3" variant="smallTitle">
          Table name
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

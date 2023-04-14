import * as React from 'react';
import BoringAvatar from 'boring-avatars';

import { useTableBlock } from './table-block-store';
import { TableBlockTable } from './table';
import { useEditable } from '~/modules/stores/use-editable';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { Icon } from '~/modules/design-system/icon';
import { colors } from '~/modules/design-system/theme/colors';
import { useActionsStore } from '~/modules/action';
import { TableBlockSdk } from '../sdk';
import { PageNumberContainer } from '~/modules/components/table/styles';
import { NextButton, PageNumber, PreviousButton } from '~/modules/components/table/table-pagination';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';

interface Props {
  spaceId: string;
}

export function TableBlock({ spaceId }: Props) {
  const { columns, rows, blockEntity, hasNextPage, hasPreviousPage, setPage, pageNumber } = useTableBlock();

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

      <Spacer height={12} />

      <PageNumberContainer>
        {pageNumber > 1 && (
          <>
            <PageNumber number={1} onClick={() => setPage(0)} />
            {pageNumber > 2 ? (
              <>
                <Spacer width={16} />
                <Text color="grey-03" variant="metadataMedium">
                  ...
                </Text>
                <Spacer width={16} />
              </>
            ) : (
              <Spacer width={4} />
            )}
          </>
        )}
        {hasPreviousPage && (
          <>
            <PageNumber number={pageNumber} onClick={() => setPage('previous')} />
            <Spacer width={4} />
          </>
        )}
        <PageNumber isActive number={pageNumber + 1} />
        {hasNextPage && (
          <>
            <Spacer width={4} />
            <PageNumber number={pageNumber + 2} onClick={() => setPage('next')} />
          </>
        )}
        <Spacer width={32} />
        <PreviousButton isDisabled={!hasPreviousPage} onClick={() => setPage('previous')} />
        <Spacer width={12} />
        <NextButton isDisabled={!hasNextPage} onClick={() => setPage('next')} />
      </PageNumberContainer>
    </div>
  );
}

function EditableTitle({ spaceId }: { spaceId: string }) {
  const { update, create } = useActionsStore();
  const { editable } = useEditable();
  const { isEditor } = useAccessControl(spaceId);
  const { blockEntity } = useTableBlock();

  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    TableBlockSdk.upsertName({ name: e.currentTarget.value, blockEntity, api: { update, create } });
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

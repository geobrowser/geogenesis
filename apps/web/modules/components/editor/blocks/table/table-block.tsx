import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { IconButton, SmallButton } from '~/modules/design-system/button';

interface Props {
  spaceId: string;
}

export function TableBlock({ spaceId }: Props) {
  const { columns, rows, blockEntity, hasNextPage, hasPreviousPage, setPage, pageNumber } = useTableBlock();
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);

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

          <IconButton onClick={() => setIsFilterOpen(!isFilterOpen)} icon="filterTable" color="grey-04" />
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

      {isFilterOpen && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="overflow-hidden border-t border-divider py-4"
          >
            <motion.div
              initial={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, ease: 'easeIn', delay: 0.15 }}
              className="flex items-center gap-2"
            >
              <EditableFilters />
              <TableBlockFilterPill />
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      <motion.div layout="position">
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
      </motion.div>
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

function EditableFilters() {
  return (
    <div className="flex items-center gap-2">
      <SmallButton icon="createSmall" variant="secondary">
        Filter
      </SmallButton>

      <SmallButton icon="chevronDownSmall" variant="secondary">
        Clear
      </SmallButton>
    </div>
  );
}

function PublishedFilterIconFilled() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9.12976 0L2.87024 0C1.6588 0 0.947091 1.36185 1.63876 2.35643L4.45525 6.40634C4.48438 6.44823 4.5 6.49804 4.5 6.54907L4.5 10.5C4.5 11.3284 5.17157 12 6 12C6.82843 12 7.5 11.3284 7.5 10.5L7.5 6.54907C7.5 6.49804 7.51562 6.44823 7.54475 6.40634L10.3612 2.35642C11.0529 1.36185 10.3412 0 9.12976 0Z"
        fill={colors.light['text']}
      />
    </svg>
  );
}

function TableBlockFilterPill() {
  const { editable } = useEditable();

  return (
    <div className="flex items-center gap-2 rounded bg-divider py-1 pl-2 pr-1 text-metadata">
      {/* @TODO: Use avatar if the filter is not published */}
      <PublishedFilterIconFilled />
      <div className="flex items-center gap-1">
        <span>Platform is</span>
        <span>·</span>
        <span>N64</span>
      </div>
      {/* @TODO: Only show in edit mode */}
      {editable && <Icon icon="checkCloseSmall" color="grey-04" />}
    </div>
  );
}

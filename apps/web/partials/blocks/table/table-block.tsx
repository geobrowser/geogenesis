'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import BoringAvatar from 'boring-avatars';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import produce from 'immer';
import Link from 'next/link';

import * as React from 'react';

import { useSpaces } from '~/core/hooks/use-spaces';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { useTableBlock } from '~/core/state/table-block-store/table-block-store';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { IconButton, SmallButton } from '~/design-system/button';
import { Icon } from '~/design-system/icon';
import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { Menu } from '~/design-system/menu';
import { Spacer } from '~/design-system/spacer';
import { PageNumberContainer } from '~/design-system/table/styles';
import { NextButton, PageNumber, PreviousButton } from '~/design-system/table/table-pagination';
import { Text } from '~/design-system/text';
import { colors } from '~/design-system/theme/colors';

import { TableBlockEditableFilters } from './table-block-editable-filters';
import { TableBlockEditableTitle } from './table-block-editable-title';
import { TableBlockFilterPill } from './table-block-filter-pill';
import { TableBlockTable } from './table-block-table';

interface Props {
  spaceId: string;
}

export function TableBlock({ spaceId }: Props) {
  const {
    columns,
    rows,
    blockEntity,
    hasNextPage,
    hasPreviousPage,
    setPage,
    pageNumber,
    filterState,
    setFilterState,
    isLoading,
    type,
  } = useTableBlock();

  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const isEditing = useUserIsEditing(spaceId);
  const { spaces } = useSpaces();

  const shownColumns = [
    ...(blockEntity?.triples
      .filter(triple => triple.attributeId === SYSTEM_IDS.SHOWN_COLUMNS)
      .flatMap(item => item.value.id) ?? []),
    'name',
  ];

  const renderedColumns = columns.filter(item => shownColumns.includes(item.id));

  /**
   * There are several types of columns we might be filtering on, some of which aren't actually columns, so have
   * special handling when creating the graphql string.
   * 1. Name
   * 2. Space
   * 3. Any entity or string column
   *
   * Name and Space are treated specially throughout this code path.
   */
  const filtersWithColumnName = filterState.map(f => {
    if (f.columnId === SYSTEM_IDS.NAME) {
      return {
        ...f,
        columnName: 'Name',
      };
    }

    if (f.columnId === SYSTEM_IDS.SPACE) {
      return {
        ...f,
        columnName: 'Space',
        value: spaces.find(s => s.id === f.value)?.attributes[SYSTEM_IDS.NAME] ?? f.value,
      };
    }

    return {
      ...f,
      columnName: Entity.name(columns.find(c => c.id === f.columnId)?.triples ?? []) ?? '',
    };
  });

  const typeId = type.entityId;
  const filterId = filterState?.[0]?.columnId ?? null;
  const filterValue = filterState?.[0]?.value ?? null;

  return (
    <div>
      <div className="mb-2 flex h-8 items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="shrink-0 overflow-hidden rounded">
            <BoringAvatar
              size={16}
              square={true}
              variant="bauhaus"
              name={blockEntity?.name ?? 'Untitled'}
              colors={[colors.light['grey-03'], colors.light['grey-02'], colors.light['grey-01']]}
            />
          </span>

          <TableBlockEditableTitle spaceId={spaceId} />
        </div>
        <div className="flex items-center gap-5">
          <span
            title="Table block searching coming soon"
            className="hover:cursor-not-allowed"
            onClick={() => {
              //
            }}
          >
            <Icon icon="search" color="grey-02" />
          </span>

          <AnimatePresence initial={false} mode="wait">
            {filterState.length > 0 ? (
              <motion.div
                className="flex items-center"
                key="filter-table-with-filters"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15, bounce: 0.2 }}
              >
                <IconButton
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  icon="filterTableWithFilters"
                  color="grey-04"
                />
              </motion.div>
            ) : (
              <motion.div
                className="flex items-center"
                key="filter-table-without-filters"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15, bounce: 0.2 }}
              >
                <IconButton onClick={() => setIsFilterOpen(!isFilterOpen)} icon="filterTable" color="grey-04" />
              </motion.div>
            )}
          </AnimatePresence>
          <Menu
            open={isMenuOpen}
            onOpenChange={setIsMenuOpen}
            align="end"
            trigger={isMenuOpen ? <Close color="grey-04" /> : <Context color="grey-04" />}
            className="max-w-[5.8rem] whitespace-nowrap"
          >
            <Link
              href={NavUtils.toEntity(spaceId, blockEntity?.id ?? '')}
              className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 hover:bg-bg"
            >
              <Text variant="button" className="hover:!text-text">
                View data
              </Text>
            </Link>
          </Menu>
          <span>
            {isEditing && (
              <>
                <Spacer width={12} />
                <Link href={NavUtils.toEntity(spaceId, ID.createEntityId(), typeId, filterId, filterValue)}>
                  <SmallButton className="whitespace-nowrap">New entity</SmallButton>
                </Link>
              </>
            )}
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
              <TableBlockEditableFilters />

              {filtersWithColumnName.map((f, index) => (
                <TableBlockFilterPill
                  key={`${f.columnId}-${f.value}`}
                  filter={f}
                  onDelete={() => {
                    const newFilterState = produce(filterState, draft => {
                      draft.splice(index, 1);
                    });

                    setFilterState(newFilterState);
                  }}
                />
              ))}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      <motion.div layout="position" transition={{ duration: 0.15 }}>
        <div className="overflow-hidden rounded border border-grey-02 p-0 shadow-button">
          {isLoading ? (
            <TableBlockPlaceholder />
          ) : (
            <TableBlockTable space={spaceId} columns={renderedColumns} rows={rows} />
          )}
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

const DEFAULT_PLACEHOLDER_COLUMN_WIDTH = 784 / 3;

type TableBlockPlaceholderProps = {
  className?: string;
  columns?: number;
  rows?: number;
};

export function TableBlockPlaceholder({ className = '', columns = 3, rows = 10 }: TableBlockPlaceholderProps) {
  const PLACEHOLDER_COLUMNS = new Array(columns).fill(0);
  const PLACEHOLDER_ROWS = new Array(rows).fill(0);

  return (
    <div className={cx('overflow-x-scroll rounded-sm', className)}>
      <table className="relative w-full border-collapse border-hidden bg-white" cellSpacing={0} cellPadding={0}>
        <thead>
          <tr>
            {PLACEHOLDER_COLUMNS.map((_item: number, index: number) => (
              <th
                key={index}
                className="lg:min-w-none border border-b-0 border-grey-02 p-[10px] text-left"
                style={{ minWidth: DEFAULT_PLACEHOLDER_COLUMN_WIDTH }}
              >
                <p className="h-5 w-16 rounded-sm bg-divider align-middle"></p>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PLACEHOLDER_ROWS.map((_item: number, index: number) => (
            <tr key={index}>
              {PLACEHOLDER_COLUMNS.map((_item: number, index: number) => (
                <td key={index} className="border border-grey-02 bg-transparent p-[10px] align-top">
                  <p className="h-5 rounded-sm bg-divider" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TableBlockError({ spaceId, blockId }: { spaceId: string; blockId: string }) {
  return (
    <div className="overflow-hidden rounded border border-red-02 p-0 shadow-button shadow-red-02">
      <div className="overflow-x-scroll rounded-sm">
        <table className="relative w-full border-collapse border-hidden bg-white" cellSpacing={0} cellPadding={0}>
          <thead>
            <tr>
              <th className="lg:min-w-none border border-b-0 border-grey-02 p-[10px] text-left">
                <p className="h-5 w-full rounded-sm align-middle"></p>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="flex flex-col items-center border-t border-red-02 bg-transparent p-5 align-top">
                <p className="flex text-lg text-text">
                  Something went wrong. Make sure this table is configured correctly.
                </p>
                <Spacer height={12} />
                <Link
                  href={NavUtils.toEntity(spaceId, blockId ?? '')}
                  className="flex cursor-pointer items-center rounded-sm text-button text-grey-04 transition-colors duration-75 hover:text-text"
                >
                  View table block data
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import { INITIAL_RELATION_INDEX_VALUE } from '@geogenesis/sdk/constants';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import produce from 'immer';

import * as React from 'react';

import { mergeEntityAsync } from '~/core/database/entities';
import { upsertRelation } from '~/core/database/write';
import { useSpaces } from '~/core/hooks/use-spaces';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { EntityId } from '~/core/io/schema';
import { useTableBlock } from '~/core/state/table-block-store';
import { NavUtils } from '~/core/utils/utils';

import { IconButton } from '~/design-system/button';
import { Create } from '~/design-system/icons/create';
import { FilterTable } from '~/design-system/icons/filter-table';
import { FilterTableWithFilters } from '~/design-system/icons/filter-table-with-filters';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Spacer } from '~/design-system/spacer';
import { PageNumberContainer } from '~/design-system/table/styles';
import { NextButton, PageNumber, PreviousButton } from '~/design-system/table/table-pagination';
import { Text } from '~/design-system/text';

import { DataBlockViewMenu } from './data-block-view-menu';
import { TableBlockContextMenu } from './table-block-context-menu';
import { TableBlockEditableFilters } from './table-block-editable-filters';
import { TableBlockEditableTitle } from './table-block-editable-title';
import { TableBlockFilterPill } from './table-block-filter-pill';
import { TableBlockTable } from './table-block-table';

interface Props {
  spaceId: string;
}

// eslint-disable-next-line react/display-name
export const TableBlock = React.memo(({ spaceId }: Props) => {
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const isEditing = useUserIsEditing(spaceId);
  const { spaces } = useSpaces();
  const [nextEntityId, setNextEntityId] = React.useState(ID.createEntityId());

  const {
    columns,
    rows,
    setPage,
    filterState,
    setFilterState,
    isLoading,
    hasNextPage,
    blockEntity,
    hasPreviousPage,
    pageNumber,
    view,
    placeholder,
    source,
    entityId,
  } = useTableBlock();

  const allColumns = columns.map(column => ({
    id: column.id,
    name: column.name,
  }));

  const shownColumnRelations = [
    ...(blockEntity?.relationsOut ?? []).filter(relation => relation.typeOf.id === SYSTEM_IDS.SHOWN_COLUMNS),
  ];

  const shownColumnIds = [...(shownColumnRelations.map(item => item.toEntity.id) ?? []), SYSTEM_IDS.NAME];

  // @TODO(relations): This should live on the relation pointing to the block and not the block itself. It is
  // also a relation and not a triple.
  const viewTriple = (blockEntity?.triples ?? []).find(triple => triple.attributeId === SYSTEM_IDS.VIEW_ATTRIBUTE);

  /**
   * There are several types of columns we might be filtering on, some of which aren't actually columns, so have
   * special handling when creating the graphql string.
   * 1. Name
   * 2. Space
   * 3. Types
   * 4. Any entity or string column
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

    if (f.columnId === SYSTEM_IDS.TYPES) {
      return {
        ...f,
        columnName: 'Types',
      };
    }

    if (f.columnId === SYSTEM_IDS.SPACE_FILTER) {
      return {
        ...f,
        columnName: 'Space',
        value: spaces.find(s => s.id.toLowerCase() === f.value.toLowerCase())?.spaceConfig?.name ?? f.value,
      };
    }

    return {
      ...f,
      columnName: columns.find(c => c.id === f.columnId)?.name ?? '',
    };
  });

  const filteredAttributes: Array<[string, string]> = filterState
    .filter(filter => filter.columnId !== SYSTEM_IDS.SPACE_FILTER && filter.columnId !== SYSTEM_IDS.TYPES)
    .map(filter => [filter.columnId, filter.value]);

  const filteredTypes: Array<string> = filterState
    .filter(filter => filter.columnId === SYSTEM_IDS.TYPES)
    .map(filter => filter.value);

  const hasPagination = hasPreviousPage || hasNextPage;

  return (
    <motion.div layout="position" transition={{ duration: 0.15 }}>
      <div className="mb-2 flex h-8 items-center justify-between">
        <TableBlockEditableTitle spaceId={spaceId} />
        <div className="flex items-center gap-5">
          <IconButton
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            icon={filterState.length > 0 ? <FilterTableWithFilters /> : <FilterTable />}
            color="grey-04"
          />

          <DataBlockViewMenu activeView={view} viewTriple={viewTriple} isLoading={isLoading} />
          <TableBlockContextMenu
            allColumns={allColumns}
            shownColumnRelations={shownColumnRelations}
            shownColumnIds={shownColumnIds}
          />
          {isEditing && (
            <Link
              onClick={() => {
                console.log('adding types');
                addTypesToEntityId(nextEntityId, spaceId, filteredTypes);
                // Real jank but it works
                setNextEntityId(ID.createEntityId());
              }}
              href={NavUtils.toEntity(spaceId, nextEntityId, filteredTypes, filteredAttributes)}
            >
              <Create />
            </Link>
          )}
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

              {filtersWithColumnName.map((f, index) => {
                return (
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
                );
              })}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      <motion.div layout="position" transition={{ duration: 0.15 }}>
        {isLoading ? (
          <TableBlockLoadingPlaceholder />
        ) : (
          <TableBlockTable
            space={spaceId}
            columns={columns}
            rows={rows}
            shownColumnIds={shownColumnIds}
            placeholder={placeholder}
            view={view}
            source={source}
          />
        )}
        {hasPagination && (
          <>
            <Spacer height={12} />
            <PageNumberContainer>
              {pageNumber > 1 && (
                <>
                  <PageNumber number={1} onClick={() => setPage(0)} />
                  {pageNumber > 2 ? (
                    <Text color="grey-03" variant="metadataMedium">
                      ...
                    </Text>
                  ) : null}
                </>
              )}
              {hasPreviousPage && <PageNumber number={pageNumber} onClick={() => setPage('previous')} />}
              <PageNumber isActive number={pageNumber + 1} />
              {hasNextPage && <PageNumber number={pageNumber + 2} onClick={() => setPage('next')} />}
              <Spacer width={8} />
              <PreviousButton isDisabled={!hasPreviousPage} onClick={() => setPage('previous')} />
              <NextButton isDisabled={!hasNextPage} onClick={() => setPage('next')} />
            </PageNumberContainer>
          </>
        )}
      </motion.div>
    </motion.div>
  );
});

const DEFAULT_PLACEHOLDER_COLUMN_WIDTH = 784 / 3;

type TableBlockPlaceholderProps = {
  className?: string;
  columns?: number;
  rows?: number;
};

export function TableBlockLoadingPlaceholder({ className = '', columns = 3, rows = 10 }: TableBlockPlaceholderProps) {
  const PLACEHOLDER_COLUMNS = new Array(columns).fill(0);
  const PLACEHOLDER_ROWS = new Array(rows).fill(0);

  return (
    <div className="overflow-hidden rounded-lg border border-grey-02 p-0">
      <div className={cx('overflow-x-clip rounded-lg', className)}>
        <table className="relative w-full border-collapse border-hidden bg-white" cellSpacing={0} cellPadding={0}>
          <thead>
            <tr>
              {PLACEHOLDER_COLUMNS.map((_item: number, index: number) => (
                <th
                  key={index}
                  className="lg:min-w-none border border-b-0 border-grey-02 p-[10px] text-left"
                  style={{ minWidth: DEFAULT_PLACEHOLDER_COLUMN_WIDTH }}
                >
                  <p className="h-5 w-16 animate-pulse rounded-sm bg-divider align-middle"></p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLACEHOLDER_ROWS.map((_item: number, index: number) => (
              <tr key={index}>
                {PLACEHOLDER_COLUMNS.map((_item: number, index: number) => (
                  <td key={index} className="animate-pulse border border-grey-02 bg-transparent p-[10px] align-top">
                    <p className="h-5 rounded-sm bg-divider" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TableBlockError({ spaceId, blockId }: { spaceId: string; blockId: string }) {
  return (
    <div className="overflow-hidden rounded border border-red-02 p-0">
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

async function addTypesToEntityId(entityId: string, spaceId: string, typeIds: string[]) {
  const types = await Promise.all(typeIds.map(typeId => mergeEntityAsync(EntityId(typeId))));

  for (const type of types) {
    upsertRelation({
      spaceId,
      relation: {
        index: INITIAL_RELATION_INDEX_VALUE,
        space: spaceId,
        fromEntity: {
          id: EntityId(entityId),
          name: null,
        },
        toEntity: {
          id: type.id,
          name: type.name,
          renderableType: 'RELATION',
          value: type.id,
        },
        typeOf: {
          id: EntityId(SYSTEM_IDS.TYPES),
          name: 'Types',
        },
      },
    });
  }
}

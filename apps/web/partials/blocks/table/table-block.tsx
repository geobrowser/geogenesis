'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import produce from 'immer';

import * as React from 'react';

import { upsertCollectionItemRelation } from '~/core/blocks/data/collection';
import { Filter } from '~/core/blocks/data/filters';
import { Source } from '~/core/blocks/data/source';
import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useSource } from '~/core/blocks/data/use-source';
import { useView } from '~/core/blocks/data/use-view';
import { upsert } from '~/core/database/write';
import { useCreateEntityFromType } from '~/core/hooks/use-create-entity-from-type';
import { useSpaces } from '~/core/hooks/use-spaces';
import { ID } from '~/core/id';
import { EntityId, SpaceId } from '~/core/io/schema';
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
  const { spaces } = useSpaces();

  const { properties, rows, setPage, isLoading, hasNextPage, hasPreviousPage, pageNumber } = useDataBlock();
  const { filterState, setFilterState } = useFilters();
  const { shownColumnIds, view, placeholder } = useView();
  const { source } = useSource();

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
  const filtersWithPropertyName = filterState.map(f => {
    if (f.columnId === SYSTEM_IDS.NAME_ATTRIBUTE) {
      return {
        ...f,
        propertyName: 'Name',
      };
    }

    if (f.columnId === SYSTEM_IDS.TYPES_ATTRIBUTE) {
      return {
        ...f,
        propertyName: 'Types',
      };
    }

    if (f.columnId === SYSTEM_IDS.SPACE_FILTER) {
      return {
        ...f,
        propertyName: 'Space',
        value: spaces.find(s => s.id.toLowerCase() === f.value.toLowerCase())?.spaceConfig?.name ?? f.value,
      };
    }

    if (f.columnId === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE) {
      return {
        ...f,
        propertyName: 'Relation type',
      };
    }

    if (f.columnId === SYSTEM_IDS.RELATION_FROM_ATTRIBUTE) {
      return {
        ...f,
        propertyName: 'From',
      };
    }

    return {
      ...f,
      propertyName: properties.find(c => c.id === f.columnId)?.name ?? '',
    };
  });

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

          <DataBlockViewMenu activeView={view} isLoading={isLoading} />
          <TableBlockContextMenu />

          <CreateEntityButton filterState={filterState} spaceId={spaceId} source={source} />
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

              {filtersWithPropertyName.map((f, index) => {
                return (
                  <TableBlockFilterPill
                    key={`${f.columnId}-${f.value}`}
                    filter={f}
                    onDelete={() => {
                      const newFilterState = produce(filterState, draft => {
                        draft.splice(index, 1);
                      });

                      setFilterState(newFilterState, source);
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
          <>
            <TableBlockLoadingPlaceholder />
          </>
        ) : (
          <TableBlockTable
            space={spaceId}
            properties={properties}
            rows={rows}
            placeholder={placeholder}
            view={view}
            source={source}
            shownColumnIds={shownColumnIds}
            filterState={filterState}
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

function CreateEntityButton({
  filterState,
  spaceId,
  source,
}: {
  filterState: Filter[];
  spaceId: string;
  source: Source;
}) {
  const filteredTypes: Array<string> = filterState
    .filter(filter => filter.columnId === SYSTEM_IDS.TYPES_ATTRIBUTE)
    .map(filter => filter.value);

  const { onClick, nextEntityId } = useCreateEntityFromType(spaceId, filteredTypes);

  const onCreate = () => {
    upsert(
      {
        attributeId: SYSTEM_IDS.NAME_ATTRIBUTE,
        entityId: nextEntityId,
        entityName: null,
        attributeName: 'Name',
        value: { type: 'TEXT', value: 'New entity' },
      },
      spaceId
    );
    onClick();

    if (source.type === 'COLLECTION') {
      const id = ID.createEntityId();

      upsertCollectionItemRelation({
        relationId: EntityId(id),
        collectionId: EntityId(source.value),
        spaceId: SpaceId(spaceId),
        toEntity: {
          id: nextEntityId,
          name: 'New entity',
        },
      });
    }
  };

  return (
    <button onClick={onCreate}>
      <Create />
    </button>
  );
}

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

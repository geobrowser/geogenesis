'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';
import BoringAvatar from 'boring-avatars';
import cx from 'classnames';
import type { Change as Difference } from 'diff';
import { diffWords } from 'diff';

import * as React from 'react';

import { createFiltersFromGraphQLString } from '~/core/blocks-sdk/table';
import { Environment } from '~/core/environment';
import { Subgraph } from '~/core/io';
import { fetchColumns } from '~/core/io/fetch-columns';
import { Services } from '~/core/services';
import { TableBlockFilter } from '~/core/state/table-block-store';
import { BlockChange, BlockId } from '~/core/utils/change/change';
import { Entity } from '~/core/utils/entity';
import { getImagePath } from '~/core/utils/utils';

import { colors } from '~/design-system/theme/colors';

import { TableBlockPlaceholder } from '../blocks/table/table-block';

type ChangedBlockProps = {
  blockId: BlockId;
  block: BlockChange;
};

export const ChangedBlock = ({ blockId, block }: ChangedBlockProps) => {
  const { before, after } = block;

  // Don't show dead changes
  if (!before && !after) return <></>;

  // Don't show unchanged blocks
  if (JSON.stringify(before) === JSON.stringify(after)) return <></>;

  switch (block.type) {
    case 'markdownContent': {
      const { markdownType: beforeMarkdownType, markdownContent: beforeMarkdownContent } = parseMarkdown(before ?? '');
      const { markdownType: afterMarkdownType, markdownContent: afterMarkdownContent } = parseMarkdown(after ?? '');

      const differences = diffWords(beforeMarkdownContent, afterMarkdownContent);

      const BeforeComponent = beforeMarkdownType;
      const AfterComponent = afterMarkdownType;

      return (
        <div key={blockId} className="flex gap-8">
          <div className="ProseMirror flex-1 py-4">
            <BeforeComponent>
              {differences
                .filter(item => !item.added)
                .map((difference: Difference, index: number) => (
                  <span key={index} className={cx(difference.removed && 'bg-errorTertiary line-through')}>
                    {difference.value}
                  </span>
                ))}
            </BeforeComponent>
          </div>
          <div className="ProseMirror flex-1 py-4">
            <AfterComponent>
              {differences
                .filter(item => !item.removed)
                .map((difference: Difference, index: number) => (
                  <span key={index} className={cx(difference.added && 'bg-successTertiary')}>
                    {difference.value}
                  </span>
                ))}
            </AfterComponent>
          </div>
        </div>
      );
    }
    case 'imageBlock': {
      return (
        <div key={blockId} className="flex gap-8">
          <div className="flex-1 py-4">
            <div>
              {before && (
                <span className="inline-block rounded bg-errorTertiary p-1">
                  <img src={getImagePath(before)} className="rounded" />
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 py-4">
            <div>
              {after && (
                <span className="inline-block rounded bg-successTertiary p-1">
                  <img src={getImagePath(after)} className="rounded" />
                </span>
              )}
            </div>
          </div>
        </div>
      );
    }
    case 'tableBlock': {
      const isNewTableBlock = before === null;
      const differences = diffWords(before ?? '', after ?? '');

      return (
        <div key={blockId} className="flex gap-8">
          <div className="flex-1 py-4">
            {!isNewTableBlock && (
              <>
                <div className="flex items-center gap-2">
                  <span className="overflow-hidden rounded">
                    <BoringAvatar
                      size={16}
                      square={true}
                      variant="bauhaus"
                      name={before ?? 'Untitled'}
                      colors={[colors.light['grey-03'], colors.light['grey-02'], colors.light['grey-01']]}
                    />
                  </span>
                  <div className="text-smallTitle">
                    {differences
                      .filter(item => !item.added)
                      .map((difference: Difference, index: number) => (
                        <span key={index} className={cx(difference.removed && 'bg-errorTertiary line-through')}>
                          {difference.value}
                        </span>
                      ))}
                  </div>
                </div>
                <TableBlockPlaceholder
                  columns={2}
                  rows={2}
                  className="mt-2 !overflow-hidden rounded border border-grey-02 p-0 opacity-50 shadow-button"
                />
              </>
            )}
          </div>
          <div className="flex-1 py-4">
            {after && (
              <>
                <div className="flex items-center gap-2">
                  <span className="overflow-hidden rounded">
                    <BoringAvatar
                      size={16}
                      square={true}
                      variant="bauhaus"
                      name={after ?? 'Untitled'}
                      colors={[colors.light['grey-03'], colors.light['grey-02'], colors.light['grey-01']]}
                    />
                  </span>
                  <div className="text-smallTitle">
                    {differences
                      .filter(item => !item.removed)
                      .map((difference: Difference, index: number) => (
                        <span key={index} className={cx(difference.added && 'bg-successTertiary')}>
                          {difference.value}
                        </span>
                      ))}
                  </div>
                </div>
                <TableBlockPlaceholder
                  columns={2}
                  rows={2}
                  className="mt-2 !overflow-hidden rounded border border-grey-02 p-0 opacity-50 shadow-button"
                />
              </>
            )}
          </div>
        </div>
      );
    }
    case 'tableFilter': {
      const isNewTableFilter = before === null;

      return (
        <div key={blockId} className="flex gap-8">
          <div className="flex-1 py-4">
            {!isNewTableFilter && (
              <div className="flex flex-wrap gap-2">
                <TableFilters rawFilter={before} />
              </div>
            )}
          </div>
          <div className="flex-1 py-4">
            {after && (
              <div className="flex flex-wrap gap-2">
                <TableFilters rawFilter={after} />
              </div>
            )}
          </div>
        </div>
      );
    }
    default: {
      // required for <ChangedBlock /> to be valid JSX
      return <React.Fragment />;
    }
  }
};

type MarkdownType = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

const markdownComponent: Record<number, MarkdownType> = {
  0: 'p',
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
  5: 'h5',
  6: 'h6',
};

// Parse raw markdown into basic formatting
// faster than rendering TipTap editor
function parseMarkdown(markdownString: string) {
  let markdownType: MarkdownType = 'p';
  let markdownContent = markdownString;
  let markdownLevel = 0;

  while (markdownContent.startsWith('#')) {
    markdownContent = markdownContent.substring(1);
    markdownLevel++;
  }

  markdownType = markdownComponent[markdownLevel];
  markdownContent = markdownContent.trim();

  return { markdownType, markdownContent };
}

type TableFiltersProps = {
  rawFilter: string;
};

const TableFilters = ({ rawFilter }: TableFiltersProps) => {
  const [filters, isLoading] = useFilters(rawFilter);

  if (isLoading || !filters || filters.length === 0) return null;

  return (
    <>
      {filters.map((filter, index) => (
        <TableFilter key={index} filter={filter} />
      ))}
    </>
  );
};

type TableFilterProps = {
  filter: TableBlockFilter & { columnName: string };
};

const TableFilter = ({ filter }: TableFilterProps) => {
  const value = filter.valueType === 'entity' ? filter.valueName : filter.value;

  return (
    <div className="flex items-center gap-2 rounded bg-divider py-1 pl-2 pr-1 text-metadata">
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        <path
          d="M9.12976 0L2.87024 0C1.6588 0 0.947091 1.36185 1.63876 2.35643L4.45525 6.40634C4.48438 6.44823 4.5 6.49804 4.5 6.54907L4.5 10.5C4.5 11.3284 5.17157 12 6 12C6.82843 12 7.5 11.3284 7.5 10.5L7.5 6.54907C7.5 6.49804 7.51562 6.44823 7.54475 6.40634L10.3612 2.35642C11.0529 1.36185 10.3412 0 9.12976 0Z"
          fill={colors.light['text']}
        />
      </svg>
      <div className="flex items-center gap-1">
        <span>{filter.columnName ?? `[ID]`} is</span>
        <span>·</span>
        <span>{value}</span>
      </div>
    </div>
  );
};

const useFilters = (rawFilter: string) => {
  const { subgraph, config } = Services.useServices();
  const { data, isLoading } = useQuery({
    queryKey: [`${rawFilter}`],
    queryFn: async () => getFilters(rawFilter, subgraph, config),
  });

  return [data, isLoading] as const;
};

const getFilters = async (rawFilter: string, subgraph: Subgraph.ISubgraph, config: Environment.AppConfig) => {
  const filters = await createFiltersFromGraphQLString(
    rawFilter,
    async id => await subgraph.fetchEntity({ id, endpoint: config.subgraph })
  );
  const serverColumns = await fetchColumns({
    params: { skip: 0, first: 0, filter: '', endpoint: config.subgraph },
    api: {
      fetchEntity: subgraph.fetchEntity,
      fetchTriples: subgraph.fetchTriples,
    },
  });
  const filtersWithColumnName = filters.map(f => {
    if (f.columnId === SYSTEM_IDS.NAME) {
      return {
        ...f,
        columnName: 'Name',
      };
    }
    return {
      ...f,
      columnName: Entity.name(serverColumns.find(c => c.id === f.columnId)?.triples ?? []) ?? '',
    };
  });

  return filtersWithColumnName;
};

'use client';

import { SystemIds } from '@graphprotocol/grc-20';
import BoringAvatar from 'boring-avatars';
import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { diffWords } from 'diff';
import type { Change as Difference } from 'diff';
import Image from 'next/image';

import * as React from 'react';

import { useQueryEntity } from '~/core/sync/use-store';
import { BlockChange, EntityChange, RenderableChange, TripleChangeValue } from '~/core/utils/change/types';
import { GeoDate, GeoNumber, getImagePath, groupBy } from '~/core/utils/utils';

import { Checkbox, getChecked } from '~/design-system/checkbox';
import { Minus } from '~/design-system/icons/minus';
import { Spacer } from '~/design-system/spacer';
import { colors } from '~/design-system/theme/colors';

import { TableBlockLoadingPlaceholder } from '~/partials/blocks/table/table-block';

type ChangedEntityProps = {
  change: EntityChange;
  deleteAllComponent?: React.ReactNode;
  renderAttributeStagingComponent?: (attributeId: string) => React.ReactNode;
  // unstagedChanges: Record<string, Record<string, boolean>>;
  // setUnstagedChanges: (value: Record<string, Record<string, boolean>>) => void;
};

const getIsNewRelation = (changes: RenderableChange[]) => {
  return (
    changes.some(change => change.before === null && change.attribute.id === SystemIds.RELATION_FROM_ATTRIBUTE) &&
    changes.some(change => change.before === null && change.attribute.id === SystemIds.RELATION_TO_ATTRIBUTE)
  );
};

export const ChangedEntity = ({ change, deleteAllComponent, renderAttributeStagingComponent }: ChangedEntityProps) => {
  const { changes, blockChanges } = change;

  const isEmpty = changes.length === 0 && blockChanges.length === 0;

  if (isEmpty) {
    return null;
  }

  const isNewRelation = getIsNewRelation(changes);

  if (isNewRelation) {
    return null;
  }

  return (
    <div className="relative -top-12 pt-12">
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 top-12 flex justify-center">
        <div className="h-full w-px bg-divider" />
      </div>
      <div className="flex flex-col gap-5">
        <div className="flex w-1/2 items-center gap-4 pr-8">
          <div className="relative size-10 shrink-0 overflow-clip rounded bg-grey-01">
            {change.avatar && (
              <img
                src={getImagePath(change.avatar)}
                className="absolute inset-0 h-full w-full object-cover object-center"
                alt=""
              />
            )}
          </div>
          <div className="truncate text-mediumTitle">{change.name ?? change.id}</div>
        </div>
        <div className="flex gap-16">
          <div className="mb-4 flex-1 border-b border-divider pb-4 text-body">Current version</div>
          <div className="mb-4 flex-1 border-b border-divider pb-4 text-body">
            Proposed edits
            {deleteAllComponent}
          </div>
        </div>
      </div>
      {blockChanges.length > 0 && (
        <div className="mb-4">
          {blockChanges.map((blockChange, index) => (
            <ChangedBlock key={index} index={index} blockChange={blockChange} />
          ))}
        </div>
      )}
      {changes.length > 0 && (
        <div className="mt-2" key={change.id}>
          <ChangedAttribute renderAttributeStagingComponent={renderAttributeStagingComponent} changes={changes} />
        </div>
      )}
    </div>
  );
};

type ChangedBlockProps = {
  index: number;
  blockChange: BlockChange;
};

const ChangedBlock = ({ index, blockChange }: ChangedBlockProps) => {
  const { before, after } = blockChange;

  // Don't show dead changes
  if (!before && !after) return null;
  if (before === after) return null;

  switch (blockChange.type) {
    case 'textBlock': {
      const { markdownType: beforeMarkdownType, markdownContent: beforeMarkdownContent } = parseMarkdown(before ?? '');
      const { markdownType: afterMarkdownType, markdownContent: afterMarkdownContent } = parseMarkdown(after ?? '');

      const differences = diffWords(beforeMarkdownContent, afterMarkdownContent);

      const BeforeComponent = beforeMarkdownType;
      const AfterComponent = afterMarkdownType;

      return (
        <div key={index} className="flex gap-16">
          <div className="ProseMirror flex-1 py-4">
            <BeforeComponent>
              {differences
                .filter(item => !item.added)
                .map((difference: Difference, index: number) => (
                  <span key={index} className={cx(difference.removed && 'rounded-sm bg-errorTertiary line-through')}>
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
                  <span key={index} className={cx(difference.added && 'rounded-sm bg-successTertiary')}>
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
        <div key={index} className="flex gap-16">
          <div className="flex-1 py-4">
            <div>
              {before && (
                <span className="inline-block w-full rounded-lg bg-errorTertiary p-1">
                  <Image
                    src={getImagePath(before)}
                    className="!h-auto !w-full !rounded-lg"
                    width={560}
                    height={560}
                    alt=""
                  />
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 py-4">
            <div>
              {after && (
                <span className="inline-block w-full rounded-lg bg-successTertiary p-1">
                  <Image
                    src={getImagePath(after)}
                    className="!h-auto !w-full !rounded-lg"
                    width={560}
                    height={560}
                    alt=""
                  />
                </span>
              )}
            </div>
          </div>
        </div>
      );
    }
    case 'dataBlock': {
      const isNewDataBlock = before === null;
      const differences = diffWords(before ?? '', after ?? '');

      return (
        <div key={index} className="flex gap-16">
          <div className="flex-1 py-4">
            {!isNewDataBlock && (
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
                <div className="mt-2">
                  <TableBlockLoadingPlaceholder
                    columns={2}
                    rows={2}
                    className="!overflow-hidden rounded-lg p-0 opacity-50 shadow-button"
                  />
                </div>
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
                <div className="mt-2">
                  <TableBlockLoadingPlaceholder
                    columns={2}
                    rows={2}
                    className="!overflow-hidden rounded-lg p-0 opacity-50 shadow-button"
                    shimmer={false}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      );
    }
    // case 'tableFilter': {
    //   const isNewTableFilter = before === null;

    //   return (
    //     <div key={blockId} className="flex gap-16">
    //       <div className="flex-1 py-4">
    //         {!isNewTableFilter && (
    //           <div className="flex flex-wrap gap-2">
    //             <TableFilters rawFilter={before} />
    //           </div>
    //         )}
    //       </div>
    //       <div className="flex-1 py-4">
    //         {after && (
    //           <div className="flex flex-wrap gap-2">
    //             <TableFilters rawFilter={after} />
    //           </div>
    //         )}
    //       </div>
    //     </div>
    //   );
    // }
    default: {
      return <div key={index} />;
    }
  }
};

type ChangedAttributeProps = {
  changes: EntityChange['changes'];
  renderAttributeStagingComponent?: (attributeId: string) => React.ReactNode;
};

const ChangedAttribute = ({ changes, renderAttributeStagingComponent }: ChangedAttributeProps) => {
  const groupedChanges = groupBy(changes, c => c.attribute.id);

  return (
    <div className="relative">
      <Corners />
      {Object.entries(groupedChanges).map(([attributeId, changes], index) => {
        // Don't show page blocks
        if (attributeId === SystemIds.BLOCKS) return null;

        if (changes.length === 0) {
          return <h2 key={attributeId}>This entity has no changes between the two versions.</h2>;
        }

        const changeType = changes[0].type;
        const attributeName = changes[0].attribute.name;
        const name = attributeName ?? attributeId;

        switch (changeType) {
          case 'NUMBER': {
            return (
              <div key={index} className="-mt-px flex gap-16">
                <div className="flex-1 border border-grey-02 p-4">
                  <div className="text-bodySemibold capitalize">{name}</div>
                  <div className="break-all text-body">
                    {changes.map(c => {
                      return (
                        <NumberDiff
                          key={`${attributeId}-before-${c.before?.value}`}
                          before={c.before as TripleChangeValue | null}
                          after={c.after as TripleChangeValue | null}
                          mode="before"
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="group relative max-w-full flex-1 border border-grey-02 p-4">
                  {renderAttributeStagingComponent?.(attributeId)}
                  <div className="text-bodySemibold capitalize">{name}</div>
                  <div className="break-all text-body">
                    {changes.map(c => {
                      return (
                        <NumberDiff
                          key={`${attributeId}-after-${c.after?.value}`}
                          before={c.before as TripleChangeValue | null}
                          after={c.after as TripleChangeValue | null}
                          mode="after"
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          }
          case 'TEXT': {
            return (
              <div key={index} className="-mt-px flex gap-16">
                <div className="flex-1 border border-grey-02 p-4">
                  <div className="text-bodySemibold capitalize">{name}</div>
                  <div className="break-all text-body">
                    {changes.map(c => {
                      const checkedBefore = c.before ? c.before.value : '';
                      const checkedAfter = c.after ? c.after.value : '';
                      const differences = diffWords(checkedBefore, checkedAfter);

                      return differences
                        .filter(item => !item.added)
                        .map((difference, index) => (
                          <span
                            key={index}
                            className={cx(difference.removed && 'rounded bg-errorTertiary line-through')}
                          >
                            {difference.value}
                          </span>
                        ));
                    })}
                  </div>
                </div>
                <div className="group relative max-w-full flex-1 border border-grey-02 p-4">
                  {renderAttributeStagingComponent?.(attributeId)}
                  <div className="text-bodySemibold capitalize">{name}</div>
                  <div className="break-all text-body">
                    {changes.map(c => {
                      const checkedBefore = c.before ? c.before.value : '';
                      const checkedAfter = c.after ? c.after.value : '';
                      const differences = diffWords(checkedBefore, checkedAfter);

                      return differences
                        .filter(item => !item.removed)
                        .map((difference, index) => (
                          <span key={index} className={cx(difference.added && 'rounded bg-successTertiary')}>
                            {difference.value}
                          </span>
                        ));
                    })}
                  </div>
                </div>
              </div>
            );
          }
          case 'CHECKBOX': {
            return (
              <div key={index} className="-mt-px flex gap-16">
                <div className="flex-1 border border-grey-02 p-4">
                  <div className="text-bodySemibold capitalize">{name}</div>
                  <div className="text-body">
                    {changes.map((c, index) => {
                      if (!c.before) return null;

                      const checked = getChecked(c.before.value);

                      return <Checkbox key={index} checked={checked} />;
                    })}
                  </div>
                </div>
                <div className="group relative flex-1 border border-grey-02 p-4">
                  {renderAttributeStagingComponent?.(attributeId)}
                  <div className="text-bodySemibold capitalize">{name}</div>
                  <div className="text-body">
                    {changes.map((c, index) => {
                      if (!c.after) return null;

                      const checked = getChecked(c.after.value);

                      return <Checkbox key={index} checked={checked} />;
                    })}
                  </div>
                </div>
              </div>
            );
          }
          case 'RELATION': {
            return (
              <div key={index} className="-mt-px flex gap-16">
                <div className="flex-1 border border-grey-02 p-4">
                  <div className="text-bodySemibold capitalize">{name}</div>
                  <div className="flex flex-wrap gap-2">
                    {changes.map(c => {
                      if (c.before === null) return null;

                      return (
                        <Chip key={`${c.attribute.id}-${c.before.value}`} status={c.before.type}>
                          {c.before.valueName ?? c.before.value}
                        </Chip>
                      );
                    })}
                  </div>
                </div>
                <div className="group relative flex-1 border border-grey-02 p-4">
                  {renderAttributeStagingComponent?.(attributeId)}
                  <div className="text-bodySemibold capitalize">{name}</div>
                  <div className="flex flex-wrap gap-2">
                    {changes.map(c => {
                      if (c.after === null) return null;

                      return (
                        <Chip key={`${c.attribute.id}-${c.after.value}`} status={c.after.type}>
                          {c.after.valueName ?? c.after.value}
                        </Chip>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          }
          case 'IMAGE': {
            return (
              <div key={index} className="-mt-px flex gap-16">
                <div className="flex-1 border border-grey-02 p-4">
                  <div className="text-bodySemibold capitalize">{name}</div>
                  <div>
                    {changes.map(c => {
                      if (!c.before?.value) return null;

                      return (
                        <span key={c.before.value} className="inline-block rounded-lg bg-errorTertiary p-1">
                          <img src={getImagePath(c.before.value)} className="h-24 w-auto rounded-lg" />
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="group relative flex-1 border border-grey-02 p-4">
                  {/* <div className="absolute right-0 top-0 inline-flex items-center gap-4 p-4">
                    <SquareButton
                      onClick={handleDeleteActions}
                      icon={<Trash />}
                      className="opacity-0 group-hover:opacity-100"
                    />
                    <SquareButton onClick={handleStaging} icon={unstaged ? <Blank /> : <Tick />} />
                  </div> */}
                  <div className="text-bodySemibold capitalize">{name}</div>
                  <div>
                    {changes.map(c => {
                      if (!c.after?.value) return null;

                      return (
                        <span key={c.after.value} className="inline-block rounded-lg bg-successTertiary p-1">
                          <img src={getImagePath(c.after.value)} className="h-24 w-auto rounded-lg" />
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          }
          case 'TIME': {
            return (
              <div key={index} className="-mt-px flex gap-16">
                <div className="flex-1 border border-grey-02 p-4">
                  <div className="text-bodySemibold capitalize">{name}</div>
                  <div className="text-body">
                    {changes.map(c => {
                      const { before, after } = c;
                      return (
                        before && (
                          <DateTimeDiff
                            mode="before"
                            before={before as TripleChangeValue}
                            after={after as TripleChangeValue}
                          />
                        )
                      );
                    })}
                  </div>
                </div>
                <div className="flex-1 border border-grey-02 p-4">
                  {renderAttributeStagingComponent?.(attributeId)}
                  <div className="text-bodySemibold capitalize">{name}</div>
                  <div className="text-body">
                    {changes.map(c => {
                      const { before, after } = c;
                      return (
                        after && (
                          <DateTimeDiff
                            mode="after"
                            before={before as TripleChangeValue}
                            after={after as TripleChangeValue}
                          />
                        )
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          }
          case 'URL': {
            return (
              <div key={index} className="-mt-px flex gap-16">
                <div className="flex-1 border border-grey-02 p-4">
                  <div className="text-bodySemibold capitalize">{name}</div>
                  <div className="truncate text-wrap text-ctaPrimary no-underline">
                    {changes.map(c => {
                      const checkedBefore = c.before ? c.before.value : '';
                      const checkedAfter = c.after ? c.after.value : '';
                      const differences = diffWords(checkedBefore, checkedAfter);

                      return differences
                        .filter(item => !item.added)
                        .map((difference, index) => (
                          <span
                            key={index}
                            className={cx(difference.removed && 'rounded bg-errorTertiary line-through')}
                          >
                            {difference.value}
                          </span>
                        ));
                    })}
                  </div>
                </div>
                <div className="group relative flex-1 border border-grey-02 p-4">
                  {renderAttributeStagingComponent?.(attributeId)}
                  <div className="text-bodySemibold capitalize">{name}</div>
                  <div className="truncate text-wrap text-ctaPrimary no-underline">
                    {changes.map(c => {
                      const checkedBefore = c.before ? c.before.value : '';
                      const checkedAfter = c.after ? c.after.value : '';
                      const differences = diffWords(checkedBefore, checkedAfter);

                      return differences
                        .filter(item => !item.removed)
                        .map((difference, index) => (
                          <span key={index} className={cx(difference.added && 'rounded bg-successTertiary')}>
                            {difference.value}
                          </span>
                        ));
                    })}
                  </div>
                </div>
              </div>
            );
          }
          default: {
            return null;
          }
        }
      })}
    </div>
  );
};

interface NumberDiffProps {
  before: TripleChangeValue | null;
  after: TripleChangeValue | null;
  mode: 'before' | 'after';
}

const NumberDiff = ({ before, after, mode }: NumberDiffProps) => {
  const hasFormatChanged = before?.options?.format !== after?.options?.format;

  const { entity: beforeUnitEntity } = useQueryEntity({ id: before?.options?.unit });
  const { entity: afterUnitEntity } = useQueryEntity({ id: after?.options?.unit });

  const [currencySignBefore, currencySignAfter] = [
    before?.options?.unit &&
      beforeUnitEntity?.triples.find(t => t.attributeId === SystemIds.CURRENCY_SIGN_ATTRIBUTE)?.value?.value,
    after?.options?.unit &&
      afterUnitEntity?.triples.find(t => t.attributeId === SystemIds.CURRENCY_SIGN_ATTRIBUTE)?.value?.value,
  ];

  const formattedNumberBefore = before?.value
    ? GeoNumber.format(before.value, before?.options?.format, currencySignBefore)
    : null;
  const formattedNumberAfter = after?.value
    ? GeoNumber.format(after.value, after?.options?.format, currencySignAfter)
    : null;

  const [formattedNumber, rawNumber, highlightClassName] =
    mode === 'before'
      ? [formattedNumberBefore, before?.value, 'rounded bg-errorTertiary']
      : [formattedNumberAfter, after?.value, 'rounded bg-successTertiary'];

  return (
    <>
      <span className={highlightClassName}>{rawNumber}</span>
      {hasFormatChanged && formattedNumber && (
        <p className="py-2 text-sm text-grey-04">
          Browse format · <span className={highlightClassName}>{formattedNumber}</span>
        </p>
      )}
    </>
  );
};

type DateTimeProps = {
  mode: 'before' | 'after';
  before: TripleChangeValue | null;
  after: TripleChangeValue | null;
};

type DateTimeType = {
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
  meridiem: 'am' | 'pm';
};

export const DateTimeDiff = ({ mode, before, after }: DateTimeProps) => {
  const formattedDateBefore = before?.value ? GeoDate.format(before.value, before?.options?.format) : null;
  const formattedDateAfter = after?.value ? GeoDate.format(after.value, after?.options?.format) : null;

  const [formattedDate, highlightClassName] =
    mode === 'before'
      ? [formattedDateBefore, 'rounded bg-errorTertiary']
      : [formattedDateAfter, 'rounded bg-successTertiary'];

  if (!formattedDate) return null;

  return (
    <>
      {formattedDate && (
        <p className="py-2 text-body">
          <span className={highlightClassName}>{formattedDate}</span>
        </p>
      )}
    </>
  );
};

type ChipProps = {
  status?: 'ADD' | 'UPDATE' | 'REMOVE' | 'UNCHANGED';
  children: React.ReactNode;
};

const chip = cva(
  'inline-flex min-h-[1.5rem] items-center rounded-sm px-2 py-1 text-left text-metadataMedium shadow-inner shadow-text',
  {
    variants: {
      status: {
        ADD: 'bg-successTertiary',
        UPDATE: 'bg-successTertiary',
        REMOVE: 'bg-errorTertiary line-through',
        UNCHANGED: 'bg-white',
      },
    },
  }
);

export const Chip = ({ status = 'UNCHANGED', children }: ChipProps) => {
  return <span className={chip({ status })}>{children}</span>;
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

// type TableFiltersProps = {
//   rawFilter: string;
// };

// const TableFilters = ({ rawFilter }: TableFiltersProps) => {
//   const [filters, isLoading] = useFilters(rawFilter);

//   if (isLoading || !filters || filters.length === 0) return null;

//   return (
//     <>
//       {filters.map((filter, index) => (
//         <TableFilter key={index} filter={filter} />
//       ))}
//     </>
//   );
// };

// type TableFilterProps = {
//   filter: TableBlockFilter & { columnName: string };
// };

// const TableFilter = ({ filter }: TableFilterProps) => {
//   const value = filter.valueType === 'ENTITY' ? filter.valueName : filter.value;

//   return (
//     <div className="flex items-center gap-2 rounded bg-divider py-1 pl-2 pr-1 text-metadata">
//       <svg
//         width="12"
//         height="12"
//         viewBox="0 0 12 12"
//         fill="none"
//         xmlns="http://www.w3.org/2000/svg"
//         className="flex-shrink-0"
//       >
//         <path
//           d="M9.12976 0L2.87024 0C1.6588 0 0.947091 1.36185 1.63876 2.35643L4.45525 6.40634C4.48438 6.44823 4.5 6.49804 4.5 6.54907L4.5 10.5C4.5 11.3284 5.17157 12 6 12C6.82843 12 7.5 11.3284 7.5 10.5L7.5 6.54907C7.5 6.49804 7.51562 6.44823 7.54475 6.40634L10.3612 2.35642C11.0529 1.36185 10.3412 0 9.12976 0Z"
//           fill={colors.light['text']}
//         />
//       </svg>
//       <div className="flex items-center gap-1">
//         <span>{filter.columnName ?? `[ID]`} is</span>
//         <span>·</span>
//         <span>{value}</span>
//       </div>
//     </div>
//   );
// };

// const useFilters = (rawFilter: string) => {
//   const { data, isLoading } = useQuery({
//     queryKey: [`${rawFilter}`],
//     queryFn: async () => getFilters(rawFilter),
//   });

//   return [data, isLoading] as const;
// };

// const getFilters = async (rawFilter: string) => {
//   // @TODO(data blocks): fix
//   const filters = await createFiltersFromGraphQLStringAndSource(
//     rawFilter,
//     { type: 'SPACES', value: [SpaceId('')] },
//     async id => await fetchEntity({ id })
//   );

//   const serverColumns = await fetchColumns({
//     typeIds: [],
//   });
//   const filtersWithColumnName = filters.map(f => {
//     if (f.columnId === SystemIds.NAME_ATTRIBUTE) {
//       return {
//         ...f,
//         columnName: 'Name',
//       };
//     }
//     return {
//       ...f,
//       columnName: serverColumns.find(c => c.id === f.columnId)?.name ?? '',
//     };
//   });

//   return filtersWithColumnName;
// };

const Corners = () => {
  return (
    <>
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex gap-16">
        <div className="relative flex-1">
          <div className="absolute left-0 top-0 inline-block bg-white">
            <div className="size-4 rounded-tl-lg border-l border-t border-grey-02 bg-white" />
          </div>
          <div className="absolute right-0 top-0 inline-block bg-white">
            <div className="size-4 rounded-tr-lg border-r border-t border-grey-02 bg-white" />
          </div>
        </div>
        <div className="relative flex-1">
          <div className="absolute left-0 top-0 inline-block bg-white">
            <div className="size-4 rounded-tl-lg border-l border-t border-grey-02 bg-white" />
          </div>
          <div className="absolute right-0 top-0 inline-block bg-white">
            <div className="size-4 rounded-tr-lg border-r border-t border-grey-02 bg-white" />
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-0 right-0 z-10 flex gap-16">
        <div className="relative flex-1">
          <div className="absolute left-0 top-0 inline-block bg-white">
            <div className="size-4 rounded-bl-lg border-b border-l border-grey-02 bg-white" />
          </div>
          <div className="absolute right-0 top-0 inline-block bg-white">
            <div className="size-4 rounded-br-lg border-b border-r border-grey-02 bg-white" />
          </div>
        </div>
        <div className="relative flex-1">
          <div className="absolute left-0 top-0 inline-block bg-white">
            <div className="size-4 rounded-bl-lg border-b border-l border-grey-02 bg-white" />
          </div>
          <div className="absolute right-0 top-0 inline-block bg-white">
            <div className="size-4 rounded-br-lg border-b border-r border-grey-02 bg-white" />
          </div>
        </div>
      </div>
    </>
  );
};

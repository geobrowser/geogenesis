'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { diffWords } from 'diff';

import * as React from 'react';

import { EntityChange, RelationChange } from '~/core/utils/change/types';
import { GeoDate, groupBy } from '~/core/utils/utils';

import { Checkbox, getChecked } from '~/design-system/checkbox';
import { Minus } from '~/design-system/icons/minus';
import { Spacer } from '~/design-system/spacer';

type ChangedEntityProps = {
  change: EntityChange;
  deleteAllComponent?: React.ReactNode;
  renderAttributeStagingComponent?: (attributeId: string) => React.ReactNode;
  // unstagedChanges: Record<string, Record<string, boolean>>;
  // setUnstagedChanges: (value: Record<string, Record<string, boolean>>) => void;
};

export const ChangedEntity = ({ change, deleteAllComponent, renderAttributeStagingComponent }: ChangedEntityProps) => {
  if (change.changes.length === 0) {
    return (
      <h2 className="text-center text-mediumTitle" key={change.id}>
        There are no changes between the two versions
      </h2>
    );
  }

  return (
    <div className="relative -top-12 pt-12">
      <div className="flex flex-col gap-5">
        <div className="text-mediumTitle">{change.name ?? change.id}</div>
        <div className="flex gap-8">
          <div className="flex-1 text-body">Current version</div>
          <div className="relative flex-1 text-body">
            Proposed edits
            {deleteAllComponent}
          </div>
        </div>
      </div>
      {/* {blocks.length > 0 && (
        <div className="mt-4">
          {blocks.map(blockChange => (
            <ChangedBlock key={blockChange.id} blockId={blockChange.after.value} block={blocks[blockId]} />
          ))}
        </div>
      )} */}
      <div className="mt-2">
        <ChangedAttribute
          renderAttributeStagingComponent={renderAttributeStagingComponent}
          key={`${change.id}-${change.id}`}
          changes={change.changes}
        />
      </div>
    </div>
  );
};

// type ChangedBlockProps = {
//   blockId: BlockId;
//   block: BlockChange;
// };

// const ChangedBlock = ({ blockId, block }: ChangedBlockProps) => {
//   const { before, after } = block;

//   // Don't show dead changes
//   if (!before && !after) return null;

//   switch (block.type) {
//     case 'markdownContent': {
//       const { markdownType: beforeMarkdownType, markdownContent: beforeMarkdownContent } = parseMarkdown(before ?? '');
//       const { markdownType: afterMarkdownType, markdownContent: afterMarkdownContent } = parseMarkdown(after ?? '');

//       const differences = diffWords(beforeMarkdownContent, afterMarkdownContent);

//       const BeforeComponent = beforeMarkdownType;
//       const AfterComponent = afterMarkdownType;

//       return (
//         <div key={blockId} className="flex gap-8">
//           <div className="ProseMirror flex-1 py-4">
//             <BeforeComponent>
//               {differences
//                 .filter(item => !item.added)
//                 .map((difference: Difference, index: number) => (
//                   <span key={index} className={cx(difference.removed && 'bg-errorTertiary line-through')}>
//                     {difference.value}
//                   </span>
//                 ))}
//             </BeforeComponent>
//           </div>
//           <div className="ProseMirror flex-1 py-4">
//             <AfterComponent>
//               {differences
//                 .filter(item => !item.removed)
//                 .map((difference: Difference, index: number) => (
//                   <span key={index} className={cx(difference.added && 'bg-successTertiary')}>
//                     {difference.value}
//                   </span>
//                 ))}
//             </AfterComponent>
//           </div>
//         </div>
//       );
//     }
//     case 'imageBlock': {
//       return (
//         <div key={blockId} className="flex gap-8">
//           <div className="flex-1 py-4">
//             <div>
//               {before && (
//                 <span className="-lg inline-block bg-errorTertiary p-1">
//                   <img src={getImagePath(before)} className="rounded-lg" />
//                 </span>
//               )}
//             </div>
//           </div>
//           <div className="flex-1 py-4">
//             <div>
//               {after && (
//                 <span className="inline-block rounded-lg bg-successTertiary p-1">
//                   <img src={getImagePath(after)} className="rounded-lg" />
//                 </span>
//               )}
//             </div>
//           </div>
//         </div>
//       );
//     }
//     case 'tableBlock': {
//       const isNewTableBlock = before === null;
//       const differences = diffWords(before ?? '', after ?? '');

//       return (
//         <div key={blockId} className="flex gap-8">
//           <div className="flex-1 py-4">
//             {!isNewTableBlock && (
//               <>
//                 <div className="flex items-center gap-2">
//                   <span className="overflow-hidden rounded">
//                     <BoringAvatar
//                       size={16}
//                       square={true}
//                       variant="bauhaus"
//                       name={before ?? 'Untitled'}
//                       colors={[colors.light['grey-03'], colors.light['grey-02'], colors.light['grey-01']]}
//                     />
//                   </span>
//                   <div className="text-smallTitle">
//                     {differences
//                       .filter(item => !item.added)
//                       .map((difference: Difference, index: number) => (
//                         <span key={index} className={cx(difference.removed && 'bg-errorTertiary line-through')}>
//                           {difference.value}
//                         </span>
//                       ))}
//                   </div>
//                 </div>
//                 <div className="mt-2">
//                   <TableBlockPlaceholder
//                     columns={2}
//                     rows={2}
//                     className="!overflow-hidden rounded-lg p-0 opacity-50 shadow-button"
//                   />
//                 </div>
//               </>
//             )}
//           </div>
//           <div className="flex-1 py-4">
//             {after && (
//               <>
//                 <div className="flex items-center gap-2">
//                   <span className="overflow-hidden rounded">
//                     <BoringAvatar
//                       size={16}
//                       square={true}
//                       variant="bauhaus"
//                       name={after ?? 'Untitled'}
//                       colors={[colors.light['grey-03'], colors.light['grey-02'], colors.light['grey-01']]}
//                     />
//                   </span>
//                   <div className="text-smallTitle">
//                     {differences
//                       .filter(item => !item.removed)
//                       .map((difference: Difference, index: number) => (
//                         <span key={index} className={cx(difference.added && 'bg-successTertiary')}>
//                           {difference.value}
//                         </span>
//                       ))}
//                   </div>
//                 </div>
//                 <div className="mt-2">
//                   <TableBlockPlaceholder
//                     columns={2}
//                     rows={2}
//                     className="!overflow-hidden rounded-lg p-0 opacity-50 shadow-button"
//                   />
//                 </div>
//               </>
//             )}
//           </div>
//         </div>
//       );
//     }
//     case 'tableFilter': {
//       const isNewTableFilter = before === null;

//       return (
//         <div key={blockId} className="flex gap-8">
//           <div className="flex-1 py-4">
//             {!isNewTableFilter && (
//               <div className="flex flex-wrap gap-2">
//                 <TableFilters rawFilter={before} />
//               </div>
//             )}
//           </div>
//           <div className="flex-1 py-4">
//             {after && (
//               <div className="flex flex-wrap gap-2">
//                 <TableFilters rawFilter={after} />
//               </div>
//             )}
//           </div>
//         </div>
//       );
//     }
//     default: {
//       return null;
//     }
//   }
// };

type ChangedAttributeProps = {
  changes: EntityChange['changes'];
  renderAttributeStagingComponent?: (attributeId: string) => React.ReactNode;
};

const ChangedAttribute = ({ changes, renderAttributeStagingComponent }: ChangedAttributeProps) => {
  const groupedChanges = groupBy(changes, c => c.attribute.id);

  return Object.entries(groupedChanges).map(([attributeId, changes]) => {
    // Don't show page blocks
    if (attributeId === SYSTEM_IDS.BLOCKS) return null;

    if (changes.length === 0) {
      return <h2 key={attributeId}>This entity has no changes between the two versions.</h2>;
    }

    const changeType = changes[0].type;
    const attributeName = changes[0].attribute.name;
    const name = attributeName ?? attributeId;

    switch (changeType) {
      case 'TEXT': {
        return (
          <div key={attributeId} className="-mt-px flex gap-8">
            <div className="flex-1 border border-grey-02 p-4 first:rounded-t-lg last:rounded-b-lg">
              <div className="text-bodySemibold capitalize">{name}</div>
              <div className="text-body">
                {changes.map(c => {
                  const checkedBefore = c.before ? c.before.value : '';
                  const checkedAfter = c.after ? c.after.value : '';
                  const differences = diffWords(checkedBefore, checkedAfter);

                  return differences
                    .filter(item => !item.added)
                    .map((difference, index) => (
                      <span key={index} className={cx(difference.removed && 'bg-errorTertiary line-through')}>
                        {difference.value}
                      </span>
                    ));
                })}
              </div>
            </div>
            <div className="group relative flex-1 border border-grey-02 p-4 first:rounded-b-lg last:rounded-t-lg">
              {renderAttributeStagingComponent?.(attributeId)}
              <div className="text-bodySemibold capitalize">{name}</div>
              <div className="text-body">
                {changes.map(c => {
                  const checkedBefore = c.before ? c.before.value : '';
                  const checkedAfter = c.after ? c.after.value : '';
                  const differences = diffWords(checkedBefore, checkedAfter);

                  return differences
                    .filter(item => !item.removed)
                    .map((difference, index) => (
                      <span key={index} className={cx(difference.added && 'bg-successTertiary')}>
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
          <div key={attributeId} className="-mt-px flex gap-8">
            <div className="flex-1 border border-grey-02 p-4 first:rounded-t-lg last:rounded-b-lg">
              <div className="text-bodySemibold capitalize">{name}</div>
              <div className="text-body">
                {changes.map((c, index) => {
                  if (!c.before) return null;

                  const checked = getChecked(c.before.value);

                  return <Checkbox key={index} checked={checked} />;
                })}
              </div>
            </div>
            <div className="group relative flex-1 border border-grey-02 p-4 first:rounded-b-lg last:rounded-t-lg">
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
          <div key={attributeId} className="-mt-px flex gap-8">
            <div className="flex-1 border border-grey-02 p-4 first:rounded-b-lg last:rounded-t-lg">
              <div className="text-bodySemibold capitalize">{name}</div>
              <div className="flex flex-wrap gap-2">
                {changes.map(c => {
                  return c.before && <Chip status={c.before.type}>{c.before.valueName ?? c.before.value}</Chip>;
                })}
              </div>
            </div>
            <div className="group relative flex-1 border border-grey-02 p-4 first:rounded-t-lg last:rounded-b-lg">
              {renderAttributeStagingComponent?.(attributeId)}
              <div className="text-bodySemibold capitalize">{name}</div>
              <div className="flex flex-wrap gap-2">
                {changes.map(c => {
                  return (
                    <Chip key={c.after.value} status={c.after.type}>
                      {c.after.valueName ?? c.after.value}
                    </Chip>
                  );
                })}
              </div>
            </div>
          </div>
        );
      }
      // @TODO(relations): Add image support
      // case 'IMAGE': {
      //   return (
      //     <div key={attributeId} className="-mt-px flex gap-8">
      //       <div className="flex-1 border border-grey-02 p-4 first:rounded-t-lg last:rounded-b-lg">
      //         <div className="text-bodySemibold capitalize">{name}</div>
      //         <div>
      //           {typeof before !== 'object' && (
      //             <span className="inline-block rounded-lg bg-errorTertiary p-1">
      //               <img src={getImagePath(before)} className="rounded-lg" />
      //             </span>
      //           )}
      //         </div>
      //       </div>
      //       <div className="group relative flex-1 border border-grey-02 p-4 first:rounded-t-lg last:rounded-b-lg">
      //         <div className="absolute right-0 top-0 inline-flex items-center gap-4 p-4">
      //           <SquareButton
      //             onClick={handleDeleteActions}
      //             icon={<Trash />}
      //             className="opacity-0 group-hover:opacity-100"
      //           />
      //           <SquareButton onClick={handleStaging} icon={unstaged ? <Blank /> : <Tick />} />
      //         </div>
      //         <div className="text-bodySemibold capitalize">{name}</div>
      //         <div>
      //           {typeof after !== 'object' && (
      //             <span className="inline-block rounded-lg bg-successTertiary p-1">
      //               <img src={getImagePath(after)} className="rounded-lg" />
      //             </span>
      //           )}
      //         </div>
      //       </div>
      //     </div>
      //   );
      // }
      case 'TIME': {
        return (
          <div key={attributeId} className="-mt-px flex gap-8">
            <div className="flex-1 border border-grey-02 p-4 first:rounded-t-lg last:rounded-b-lg">
              <div className="text-bodySemibold capitalize">{name}</div>
              <div className="text-body">
                {changes.map(c => {
                  const { before, after } = c;
                  return before && <DateTimeDiff mode="before" before={before.value} after={after.value} />;
                })}
              </div>
            </div>
            <div className="flex-1 border border-grey-02 p-4 first:rounded-t-lg last:rounded-b-lg">
              {renderAttributeStagingComponent?.(attributeId)}
              <div className="text-bodySemibold capitalize">{name}</div>
              <div className="text-body">
                {changes.map(c => {
                  const { before, after } = c;
                  return before && <DateTimeDiff mode="after" before={before.value} after={after.value} />;
                })}
              </div>
            </div>
          </div>
        );
      }
      case 'URI': {
        return (
          <div key={attributeId} className="-mt-px flex gap-8">
            <div className="flex-1 border border-grey-02 p-4 first:rounded-t-lg last:rounded-b-lg">
              <div className="text-bodySemibold capitalize">{name}</div>
              <div className="truncate text-ctaPrimary no-underline">
                {changes.map(c => {
                  const checkedBefore = c.before ? c.before.value : '';
                  const checkedAfter = c.after ? c.after.value : '';
                  const differences = diffWords(checkedBefore, checkedAfter);

                  return differences
                    .filter(item => !item.added)
                    .map((difference, index) => (
                      <span key={index} className={cx(difference.removed && 'bg-errorTertiary line-through')}>
                        {difference.value}
                      </span>
                    ));
                })}
              </div>
            </div>
            <div className="group relative flex-1 border border-grey-02 p-4 first:rounded-t-lg last:rounded-b-lg">
              {renderAttributeStagingComponent?.(attributeId)}
              <div className="text-bodySemibold capitalize">{name}</div>
              <div className="truncate text-ctaPrimary no-underline">
                {changes.map(c => {
                  const checkedBefore = c.before ? c.before.value : '';
                  const checkedAfter = c.after ? c.after.value : '';
                  const differences = diffWords(checkedBefore, checkedAfter);

                  return differences
                    .filter(item => !item.removed)
                    .map((difference, index) => (
                      <span key={index} className={cx(difference.added && 'bg-successTertiary')}>
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
  });
};

type DateTimeProps = {
  mode: 'before' | 'after';
  before: string | null;
  after: string | null;
};

type DateTimeType = {
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
};

export const DateTimeDiff = ({ mode, before, after }: DateTimeProps) => {
  let beforeDateTime = null;
  let afterDateTime = null;

  if (before) {
    beforeDateTime = GeoDate.fromISOStringUTC(before);
  }

  if (after) {
    afterDateTime = GeoDate.fromISOStringUTC(after);
  }

  const renderedDateTime: DateTimeType = (mode === 'before' ? beforeDateTime : afterDateTime) as DateTimeType;
  const highlightClassName = mode === 'before' ? 'bg-errorTertiary' : 'bg-successTertiary';

  return (
    <div className="flex items-start gap-4">
      <div className="flex w-[164px] gap-3">
        <div className="flex w-full flex-[2] flex-col">
          <p className={cx(beforeDateTime?.month !== afterDateTime?.month && highlightClassName, dateFieldClassNames)}>
            {renderedDateTime.month.padStart(2, '0')}
          </p>
          <span className={labelClassNames}>Month</span>
        </div>
        <span className="w-full flex-[1] pt-[3px] text-grey-02">/</span>
        <div className="flex flex-[2] flex-col items-center">
          <p className={cx(beforeDateTime?.day !== afterDateTime?.day && highlightClassName, dateFieldClassNames)}>
            {renderedDateTime.day.padStart(2, '0')}
          </p>
          <span className={labelClassNames}>Day</span>
        </div>
        <span className="flex-[1] pt-[3px] text-grey-02">/</span>
        <div className="flex w-full flex-[4] flex-col items-center">
          <p className={cx(beforeDateTime?.year !== afterDateTime?.year && highlightClassName, dateFieldClassNames)}>
            {renderedDateTime.year}
          </p>
          <span className={labelClassNames}>Year</span>
        </div>
      </div>
      <div className="flex items-center">
        <Minus color="grey-03" />
        <Spacer width={18} />
        <div className="flex items-center gap-1">
          <p className={cx(beforeDateTime?.hour !== afterDateTime?.hour && highlightClassName, timeClassNames)}>
            {renderedDateTime.hour.padStart(2, '0')}
          </p>
          <span>:</span>
          <p className={cx(beforeDateTime?.minute !== afterDateTime?.minute && highlightClassName, timeClassNames)}>
            {renderedDateTime.minute.padStart(2, '0')}
          </p>
        </div>
        <p
          className={cx(
            (!before || !after || Number(beforeDateTime?.hour) < 12 !== Number(afterDateTime?.hour) < 12) &&
              highlightClassName,
            'uppercase',
            timeClassNames
          )}
        >
          {Number(renderedDateTime.hour) < 12 ? 'am' : 'pm'}
        </p>
      </div>
    </div>
  );
};

const dateFieldClassNames = `w-full bg-transparent text-center text-body tabular-nums`;
const labelClassNames = `text-footnote text-grey-04`;
const timeClassNames = `w-[21px] tabular-nums bg-transparent p-0 m-0 text-body`;

type ChipProps = {
  status?: RelationChange['after']['type'] | 'UNCHANGED';
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

// type MarkdownType = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

// const markdownComponent: Record<number, MarkdownType> = {
//   0: 'p',
//   1: 'h1',
//   2: 'h2',
//   3: 'h3',
//   4: 'h4',
//   5: 'h5',
//   6: 'h6',
// };

// // Parse raw markdown into basic formatting
// // faster than rendering TipTap editor
// function parseMarkdown(markdownString: string) {
//   let markdownType: MarkdownType = 'p';
//   let markdownContent = markdownString;
//   let markdownLevel = 0;

//   while (markdownContent.startsWith('#')) {
//     markdownContent = markdownContent.substring(1);
//     markdownLevel++;
//   }

//   markdownType = markdownComponent[markdownLevel];
//   markdownContent = markdownContent.trim();

//   return { markdownType, markdownContent };
// }

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
//     if (f.columnId === SYSTEM_IDS.NAME) {
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

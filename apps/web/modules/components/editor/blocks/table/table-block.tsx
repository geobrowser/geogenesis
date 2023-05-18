import * as React from 'react';
import cx from 'classnames';
import Link from 'next/link';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { Trigger, Root, Content, Portal } from '@radix-ui/react-popover';
import { motion, AnimatePresence } from 'framer-motion';
import produce from 'immer';
import BoringAvatar from 'boring-avatars';

import { TableBlockFilter, useTableBlock } from './table-block-store';
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
import { valueTypes } from '~/modules/value-types';
import { Entity as IEntity, TripleValueType } from '~/modules/types';
import { Input } from '~/modules/design-system/input';
import { Select } from '~/modules/design-system/select';
import { TextButton } from '~/modules/design-system/text-button';
import { ResultContent, ResultsList } from '~/modules/components/entity/autocomplete/results-list';
import { useAutocomplete } from '~/modules/search';
import { useSpaces } from '~/modules/spaces/use-spaces';
import { Entity } from '~/modules/entity';
import { ResizableContainer } from '~/modules/design-system/resizable-container';
import { Menu } from '~/modules/design-system/menu';
import { Context } from '~/modules/design-system/icons/context';
import { Close } from '~/modules/design-system/icons/close';
import { NavUtils } from '~/modules/utils';

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
  const { editable } = useEditable();
  const { isEditor } = useAccessControl(spaceId);
  const isEditing = editable && isEditor;

  const shownColumns = [
    ...(blockEntity?.triples
      .filter(triple => triple.attributeId === SYSTEM_IDS.SHOWN_COLUMNS)
      .flatMap(item => item.value.id) ?? []),
    'name',
  ];

  const renderedColumns = columns.filter(item => shownColumns.includes(item.id));

  const filtersWithColumnName = filterState.map(f => {
    if (f.columnId === SYSTEM_IDS.NAME) {
      return {
        ...f,
        columnName: 'Name',
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
            <Link href={`/space/${spaceId}/${blockEntity?.id}`}>
              <a className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 hover:bg-bg">
                <Text variant="button" className="hover:!text-text">
                  View data
                </Text>
              </a>
            </Link>
          </Menu>
          <span>
            {isEditing && (
              <>
                <Spacer width={12} />
                <Link href={NavUtils.toCreateEntity(spaceId, typeId, filterId, filterValue)} passHref>
                  <a>
                    <SmallButton className="whitespace-nowrap">New entity</SmallButton>
                  </a>
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
              <EditableFilters />

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

      <div>
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
      </div>
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
  const { setFilterState, columns, filterState } = useTableBlock();

  const filterableColumns: (TableBlockFilter & { columnName: string })[] = [
    { columnId: 'name', columnName: 'Name', valueType: valueTypes[SYSTEM_IDS.TEXT], value: '', valueName: null },
    ...columns
      .map(c => ({
        columnId: c.id,
        columnName: Entity.name(c.triples) ?? '',
        valueType: valueTypes[Entity.valueTypeId(c.triples) ?? ''],
        value: '',
        valueName: null,
      }))
      .flatMap(c => (c.columnName !== '' ? [c] : [])),
  ];

  const onCreateFilter = ({
    columnId,
    value,
    valueType,
    valueName,
  }: {
    columnId: string;
    value: string;
    valueType: TripleValueType;
    valueName: string | null;
  }) => {
    setFilterState([
      ...filterState,
      {
        valueType,
        columnId,
        value,
        valueName,
      },
    ]);
  };

  return (
    <div className="flex items-center gap-2">
      <TableBlockFilterPrompt
        options={filterableColumns}
        onCreate={onCreateFilter}
        trigger={
          <SmallButton icon="createSmall" variant="secondary">
            Filter
          </SmallButton>
        }
      />

      {/* <SmallButton icon="chevronDownSmall" variant="secondary">
        Clear
      </SmallButton> */}
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

function TableBlockFilterPill({
  filter,
  onDelete,
}: {
  filter: TableBlockFilter & { columnName: string };
  onDelete: () => void;
}) {
  const { editable } = useEditable();

  const value = filter.valueType === 'entity' ? filter.valueName : filter.value;

  return (
    <div className="flex items-center gap-2 rounded bg-divider py-1 pl-2 pr-1 text-metadata">
      {/* @TODO: Use avatar if the filter is not published */}
      <PublishedFilterIconFilled />
      <div className="flex items-center gap-1">
        <span>{filter.columnName} contains</span>
        <span>·</span>
        <span>{value}</span>
      </div>
      {editable && <IconButton icon="checkCloseSmall" color="grey-04" onClick={onDelete} />}
    </div>
  );
}

interface TableBlockFilterPromptProps {
  trigger: React.ReactNode;
  options: (TableBlockFilter & { columnName: string })[];
  onCreate: (filter: { columnId: string; value: string; valueType: TripleValueType; valueName: string | null }) => void;
}

const TableBlockFilterPromptContent = motion(Content);

function TableBlockFilterPrompt({ trigger, onCreate, options }: TableBlockFilterPromptProps) {
  const [open, setOpen] = React.useState(false);

  const [selectedColumn, setSelectedColumn] = React.useState<string>(SYSTEM_IDS.NAME);
  const [value, setValue] = React.useState<
    | string
    | {
        entityId: string;
        entityName: string | null;
      }
  >('');

  const onOpenChange = (open: boolean) => {
    setSelectedColumn(SYSTEM_IDS.NAME);
    setValue('');
    setOpen(open);
  };

  const onDone = () => {
    onCreate({
      columnId: selectedColumn,
      value: typeof value === 'string' ? value : value.entityId,
      valueType: options.find(o => o.columnId === selectedColumn)?.valueType ?? 'string',
      valueName: typeof value === 'string' ? null : value.entityName,
    });
    setOpen(false);
    setSelectedColumn(SYSTEM_IDS.NAME);
    setValue('');
  };

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Trigger>{trigger}</Trigger>
      <Portal>
        <AnimatePresence>
          {open && (
            <TableBlockFilterPromptContent
              forceMount={true}
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                duration: 0.1,
                ease: 'easeInOut',
              }}
              avoidCollisions={true}
              className="z-10 w-[472px] origin-top-left rounded border border-grey-02 bg-white p-2 shadow-lg"
              sideOffset={8}
              align="start"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-smallButton">New filter</span>
                  <TextButton onClick={onDone}>Done</TextButton>
                </div>

                <Spacer height={12} />

                <div className="flex items-center justify-center gap-3">
                  <div className="flex flex-1">
                    <Select
                      options={options.map(o => ({ value: o.columnId, label: o.columnName }))}
                      value={selectedColumn}
                      onChange={fieldId => {
                        setSelectedColumn(fieldId);
                        setValue('');
                      }}
                    />
                  </div>
                  <span className="rounded bg-divider px-3 py-[8.5px] text-button">Contains</span>
                  <div className="relative flex flex-1">
                    {options.find(o => o.columnId === selectedColumn)?.valueType === 'entity' ? (
                      <TableBlockEntityFilterInput
                        selectedValue={typeof value === 'string' ? '' : value.entityName ?? ''}
                        onSelect={r =>
                          setValue({
                            entityId: r.id,
                            entityName: r.name,
                          })
                        }
                      />
                    ) : (
                      <Input
                        value={typeof value === 'string' ? value : ''}
                        onChange={e => setValue(e.currentTarget.value)}
                      />
                    )}
                  </div>
                </div>
              </div>
            </TableBlockFilterPromptContent>
          )}
        </AnimatePresence>
      </Portal>
    </Root>
  );
}

interface TableBlockEntityFilterInputProps {
  onSelect: (result: IEntity) => void;
  selectedValue: string;
}

function TableBlockEntityFilterInput({ onSelect, selectedValue }: TableBlockEntityFilterInputProps) {
  const autocomplete = useAutocomplete();
  const { spaces } = useSpaces();

  return (
    <div className="relative w-full">
      <Input
        value={autocomplete.query === '' ? selectedValue : autocomplete.query}
        onChange={e => autocomplete.onQueryChange(e.target.value)}
      />
      {autocomplete.query && (
        <div className="absolute top-[36px] z-[1] flex max-h-[340px] w-[254px] flex-col overflow-hidden rounded bg-white shadow-inner-grey-02">
          <ResizableContainer duration={0.125}>
            <ResultsList>
              {autocomplete.results.map((result, i) => (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.02 * i }}
                  key={result.id}
                >
                  <ResultContent
                    key={result.id}
                    onClick={() => {
                      autocomplete.onQueryChange('');
                      onSelect(result);
                    }}
                    spaces={spaces}
                    alreadySelected={false}
                    result={result}
                  />
                </motion.div>
              ))}
            </ResultsList>
          </ResizableContainer>
        </div>
      )}
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

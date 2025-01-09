import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';

import * as React from 'react';

import { Filter } from '~/core/blocks-sdk/table';
import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { useSearch } from '~/core/hooks/use-search';
import { useSpaces } from '~/core/hooks/use-spaces';
import { Space } from '~/core/io/dto/spaces';
import { Source } from '~/core/state/editor/types';
import { useTableBlock } from '~/core/state/table-block-store';
import { FilterableValueType } from '~/core/value-types';

import { ResultContent, ResultsList } from '~/design-system/autocomplete/results-list';
import { ResultItem } from '~/design-system/autocomplete/results-list';
import { Breadcrumb } from '~/design-system/breadcrumb';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Input } from '~/design-system/input';
import { ResizableContainer } from '~/design-system/resizable-container';
import { Select } from '~/design-system/select';
import { Spacer } from '~/design-system/spacer';
import { Tag } from '~/design-system/tag';
import { Text } from '~/design-system/text';
import { TextButton } from '~/design-system/text-button';

interface TableBlockFilterPromptProps {
  trigger: React.ReactNode;
  options: (Filter & { columnName: string })[];
  onCreate: (filter: {
    columnId: string;
    value: string;
    valueType: FilterableValueType;
    valueName: string | null;
  }) => void;
}

/**
 * We allow users to filter by Name, Space, or any Text or Relation column. We need to support
 * different autocomplete experiences for the filter inputs for each of these cases. Each data
 * model for these cases is also different, and we represent the different cases in the filter UI
 * with the InterfaceFilterValue type below.
 */
type InterfaceFilterValue =
  | { type: 'string'; value: string }
  | {
      type: 'entity';
      entityId: string;
      entityName: string | null;
    }
  | { type: 'space'; spaceId: string; spaceName: string | null };

function getFilterValue(interfaceFilterValue: InterfaceFilterValue) {
  switch (interfaceFilterValue.type) {
    case 'string':
      return interfaceFilterValue.value;
    case 'entity':
      return interfaceFilterValue.entityId;
    case 'space':
      return interfaceFilterValue.spaceId;
  }
}

function getFilterValueName(interfaceFilterValue: InterfaceFilterValue) {
  switch (interfaceFilterValue.type) {
    case 'string':
      return interfaceFilterValue.value;
    case 'entity':
      return interfaceFilterValue.entityName;
    case 'space':
      return interfaceFilterValue.spaceName;
  }
}

type PromptState = {
  selectedColumn: string;
  value: InterfaceFilterValue;
  open: boolean;
};

type PromptAction =
  | {
      type: 'open';
    }
  | { type: 'close' }
  | { type: 'onOpenChange'; payload: { open: boolean } }
  | { type: 'selectColumn'; payload: { columnId: string } }
  | {
      type: 'selectEntityValue' | 'selectSpaceValue';
      payload: { id: string; name: string | null };
    }
  | {
      type: 'selectStringValue';
      payload: { value: string };
    }
  | {
      type: 'done';
    };

const reducer = (state: PromptState, action: PromptAction): PromptState => {
  switch (action.type) {
    case 'open':
      return {
        ...state,
        open: true,
      };
    case 'close':
      return {
        ...state,
        open: false,
      };
    case 'onOpenChange':
      return {
        ...state,
        open: action.payload.open,
      };
    case 'selectColumn':
      // @TODO: The value should be based on the selected column value type
      return {
        ...state,
        selectedColumn: action.payload.columnId,
      };
    case 'selectEntityValue':
      return {
        ...state,
        value: {
          type: 'entity',
          entityId: action.payload.id,
          entityName: action.payload.name,
        },
      };
    case 'selectSpaceValue':
      return {
        ...state,
        value: {
          type: 'space',
          spaceId: action.payload.id,
          spaceName: action.payload.name,
        },
      };
    case 'selectStringValue':
      return {
        ...state,
        value: {
          type: 'string',
          value: action.payload.value,
        },
      };
    case 'done':
      return {
        open: false,
        selectedColumn: SYSTEM_IDS.NAME_ATTRIBUTE,
        value: {
          type: 'string',
          value: '',
        },
      };
  }
};

function getInitialState(source: Source): PromptState {
  if (source.type === 'ENTITY') {
    return {
      selectedColumn: SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE,
      value: {
        type: 'entity',
        entityId: source.value,
        entityName: source.name,
      },
      open: false,
    };
  }

  return {
    selectedColumn: SYSTEM_IDS.NAME_ATTRIBUTE,
    value: {
      type: 'string',
      value: '',
    },
    open: false,
  };
}

export function TableBlockFilterPrompt({ trigger, onCreate, options }: TableBlockFilterPromptProps) {
  const { columnRelationTypes, source } = useTableBlock();

  const [state, dispatch] = React.useReducer(reducer, getInitialState(source));

  React.useEffect(() => {
    if (source.type === 'ENTITY') {
      dispatch({
        type: 'selectColumn',
        payload: {
          columnId: SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE,
        },
      });
    }
  }, [source]);

  const onOpenChange = (open: boolean) => dispatch({ type: 'onOpenChange', payload: { open } });

  const onDone = () => {
    onCreate({
      columnId: state.selectedColumn,
      value: getFilterValue(state.value),
      valueType: options.find(o => o.columnId === state.selectedColumn)?.valueType ?? 'TEXT',
      valueName: getFilterValueName(state.value),
    });
    dispatch({ type: 'done' });
  };

  const onSelectColumnToFilter = (columnId: string) => dispatch({ type: 'selectColumn', payload: { columnId } });

  const onSelectEntityValue = (entity: { id: string; name: string | null }) =>
    dispatch({ type: 'selectEntityValue', payload: { id: entity.id, name: entity.name } });

  const onSelectSpaceValue = (space: { id: string; name: string | null }) =>
    dispatch({ type: 'selectSpaceValue', payload: { id: space.id, name: space.name } });

  return (
    <Root open={state.open} onOpenChange={onOpenChange}>
      <Trigger>{trigger}</Trigger>
      <Portal>
        <AnimatePresence>
          {state.open && (
            <Content
              forceMount={true}
              avoidCollisions={true}
              className="z-10 w-[472px] origin-top-left rounded-lg border border-grey-02 bg-white p-2 shadow-lg"
              sideOffset={8}
              align="start"
            >
              <form
                onSubmit={e => {
                  e.preventDefault();
                  onDone();
                }}
              >
                <div className="flex items-center justify-between ">
                  <span className="text-smallButton">New filter</span>
                  <AnimatePresence>
                    {getFilterValue(state.value) !== '' && (
                      <motion.span
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.1 }}
                      >
                        <TextButton color="ctaPrimary" onClick={onDone}>
                          Done
                        </TextButton>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>

                <Spacer height={12} />

                <div className="flex items-center justify-center gap-3">
                  <div className="flex flex-1">
                    <Select
                      options={options.map(o => ({ value: o.columnId, label: o.columnName }))}
                      // For some reason setting this as the initial value in the reducer doesn't work,
                      // so for now we hard code it for this specific source type
                      value={state.selectedColumn}
                      onChange={onSelectColumnToFilter}
                    />
                  </div>
                  <span className="rounded bg-divider px-3 py-[8.5px] text-button">Is</span>
                  <div className="relative flex flex-1">
                    {state.selectedColumn === SYSTEM_IDS.SPACE_FILTER ? (
                      <TableBlockSpaceFilterInput
                        selectedValue={getFilterValueName(state.value) ?? ''}
                        onSelect={onSelectSpaceValue}
                      />
                    ) : options.find(o => o.columnId === state.selectedColumn)?.valueType === 'RELATION' ? (
                      <TableBlockEntityFilterInput
                        filterByTypes={columnRelationTypes[state.selectedColumn]?.map(t => t.typeId)}
                        selectedValue={getFilterValueName(state.value) ?? ''}
                        onSelect={onSelectEntityValue}
                      />
                    ) : (
                      <Input
                        value={getFilterValue(state.value)}
                        onChange={e =>
                          dispatch({ type: 'selectStringValue', payload: { value: e.currentTarget.value } })
                        }
                      />
                    )}
                  </div>
                </div>
              </form>
            </Content>
          )}
        </AnimatePresence>
      </Portal>
    </Root>
  );
}

interface TableBlockEntityFilterInputProps {
  onSelect: (result: { id: string; name: string | null }) => void;
  selectedValue: string;
  filterByTypes?: string[];
}

function TableBlockEntityFilterInput({ onSelect, selectedValue, filterByTypes }: TableBlockEntityFilterInputProps) {
  const autocomplete = useSearch(filterByTypes ? { filterByTypes } : undefined);

  return (
    <div className="relative w-full">
      <Input
        value={autocomplete.query === '' ? selectedValue : autocomplete.query}
        onChange={e => autocomplete.onQueryChange(e.target.value)}
      />
      {autocomplete.query && (
        <div className="absolute top-10 z-[1] flex max-h-[340px] w-[254px] flex-col overflow-hidden rounded bg-white shadow-inner-grey-02">
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

interface TableBlockSpaceFilterInputProps {
  onSelect: (result: { id: string; name: string | null }) => void;
  selectedValue: string;
}

function TableBlockSpaceFilterInput({ onSelect, selectedValue }: TableBlockSpaceFilterInputProps) {
  const [query, onQueryChange] = React.useState('');
  const debouncedQuery = useDebouncedValue(query, 100);
  const { spaces } = useSpaces();

  const results = spaces.filter(s => s.spaceConfig?.name?.toLowerCase().startsWith(debouncedQuery.toLowerCase()));

  const onSelectSpace = (space: Space) => {
    onQueryChange('');

    onSelect({
      id: space.id,
      name: space.spaceConfig?.name ?? null,
    });
  };

  return (
    <div className="relative w-full">
      <Input value={query === '' ? selectedValue : query} onChange={e => onQueryChange(e.target.value)} />
      {query && (
        <div className="absolute top-10 z-[1] flex max-h-[340px] w-[254px] flex-col overflow-hidden rounded bg-white shadow-inner-grey-02">
          <ResizableContainer duration={0.125}>
            <ResultsList>
              {results.map((result, i) => (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.02 * i }}
                  key={result.id}
                >
                  <ResultItem onClick={() => onSelectSpace(result)}>
                    <div className="flex w-full items-center justify-between leading-[1rem]">
                      <Text as="li" variant="metadataMedium" ellipsize className="leading-[1.125rem]">
                        {result.spaceConfig?.name ?? result.id}
                      </Text>
                    </div>
                    <Spacer height={4} />
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      {(result.spaceConfig?.name ?? result.id) && (
                        <Breadcrumb img={result.spaceConfig?.image ?? ''}>
                          {result.spaceConfig?.name ?? result.id}
                        </Breadcrumb>
                      )}
                      <span style={{ rotate: '270deg' }}>
                        <ChevronDownSmall color="grey-04" />
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Tag>Space</Tag>
                      </div>
                    </div>
                  </ResultItem>
                </motion.div>
              ))}
            </ResultsList>
          </ResizableContainer>
        </div>
      )}
    </div>
  );
}

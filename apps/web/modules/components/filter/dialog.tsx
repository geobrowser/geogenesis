import * as React from 'react';
import { useState } from 'react';
import cx from 'classnames';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';
import produce from 'immer';

import { Filter } from '~/modules/design-system/icons/filter';
import { initialFilterState } from '~/modules/triple';
import { FilterClause, FilterField, FilterState } from '~/modules/types';
import { intersperse } from '~/modules/utils';
import { Button } from '../../design-system/button';
import { Spacer } from '../../design-system/spacer';
import { Text } from '../../design-system/text';
import { FilterInputGroup } from './input-group';
import { useWindowSize } from '~/modules/hooks/use-window-size';

const MotionContent = motion(PopoverPrimitive.Content);

interface Props {
  inputContainerWidth: number;
  filterState: FilterState;
  setFilterState: (filterState: FilterState) => void;
}

const FIELD_LABELS: Record<FilterField, string> = {
  'entity-name': 'Entity contains',
  'attribute-name': 'Attribute contains',
  value: 'Value contains',
  'entity-id': 'Entity ID',
  'attribute-id': 'Attribute ID',
  'linked-to': 'Linked to Entity ID',
};

const FIELD_OPTIONS = (Object.entries(FIELD_LABELS) as [FilterField, string][]).map(([value, label]) => ({
  value,
  label,
}));

function getFilterOptions(filterState: FilterState, value?: FilterClause) {
  return FIELD_OPTIONS.filter(
    option => option.value === value?.field || !filterState.find(item => item.field === option.value)
  );
}

export function FilterDialog({ inputContainerWidth, filterState, setFilterState }: Props) {
  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);
  const { width } = useWindowSize();

  return (
    <PopoverPrimitive.Root onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          className={cx(
            open ? 'bg-grey-01' : 'bg-white',
            'border-l-none h-full rounded-r py-2 px-3 text-grey-04 transition-colors duration-150 ease-in-out hover:cursor-pointer hover:bg-grey-01 hover:text-text focus:text-text focus:ring-ctaPrimary active:text-text active:ring-ctaPrimary'
          )}
          aria-label="advanced-filter-button"
        >
          <Filter />
        </button>
      </PopoverPrimitive.Trigger>
      <AnimatePresence mode="wait">
        {open ? (
          <MotionContent
            forceMount={true} // We force mounting so we can control exit animations through framer-motion
            initial={{ opacity: 0, y: -10 }}
            exit={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.1,
              ease: 'easeInOut',
            }}
            avoidCollisions={true}
            className="relative z-[1] rounded border border-grey-02 bg-white p-3 shadow-button md:mx-auto md:w-[98vw] md:self-start"
            style={{ width: `calc(${inputContainerWidth}px / 2)` }}
            sideOffset={6}
            alignOffset={-1}
            align={width > 768 ? 'end' : 'start'}
          >
            <Text variant="button">Show triples</Text>
            <Spacer height={12} />
            {intersperse(
              filterState.map((filterClause, index) => (
                <FilterInputGroup
                  label={index === 0 ? 'Where' : 'And'}
                  key={`filter-state-item-${index}`}
                  options={getFilterOptions(filterState, filterClause)}
                  filterClause={filterClause}
                  onChange={newFilterClause => {
                    const newFilterState = produce(filterState, draft => {
                      draft[index] = newFilterClause;
                    });

                    setFilterState(newFilterState);
                  }}
                  isDeletable={filterState.length > 1}
                  onDelete={() => {
                    const newFilterState = produce(filterState, draft => {
                      draft.splice(index, 1);
                    });

                    setFilterState(newFilterState);
                  }}
                />
              )),
              ({ index }) => (
                <Spacer key={`filter-state-spacer-${index}`} height={12} />
              )
            )}
            <Spacer height={12} />
            <div className="flex items-center justify-between">
              <Button
                icon="create"
                variant="secondary"
                disabled={getFilterOptions(filterState).length === 0}
                onClick={() => {
                  const defaultOption = getFilterOptions(filterState)[0];

                  const newFilterState = produce(filterState, draft => {
                    draft.push({ field: defaultOption.value, value: '' });
                  });

                  setFilterState(newFilterState);
                }}
              >
                And
              </Button>
              <div className="flex items-center justify-between">
                <Button
                  icon="trash"
                  variant="secondary"
                  onClick={() => {
                    setFilterState(initialFilterState());
                  }}
                >
                  Clear all
                </Button>
              </div>
            </div>
          </MotionContent>
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Root>
  );
}

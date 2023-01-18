import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';
import produce from 'immer';
import React, { useState } from 'react';
import { Filter } from '~/modules/design-system/icons/filter';
import { useWindowSize } from '~/modules/hooks/use-window-size';
import { initialFilterState } from '~/modules/triple';
import { FilterClause, FilterField, FilterState } from '~/modules/types';
import { intersperse } from '~/modules/utils';
import { Button } from '../../design-system/button';
import { Spacer } from '../../design-system/spacer';
import { Text } from '../../design-system/text';
import { FilterInputGroup } from './input-group';

interface ContentProps {
  children: React.ReactNode;
  width: number;
  alignOffset?: number;
  sideOffset?: number;
}

const StyledContent = styled(PopoverPrimitive.Content)<ContentProps>(props => ({
  borderRadius: props.theme.radius,
  padding: props.theme.space * 3,
  width: `calc(${props.width}px / 2)`,
  backgroundColor: props.theme.colors.white,
  boxShadow: props.theme.shadows.dropdown,
  zIndex: 1,

  border: `1px solid ${props.theme.colors['grey-02']}`,

  '@media (max-width: 768px)': {
    margin: '0 auto',
    width: '98vw',
  },
}));

const MotionContent = motion(StyledContent);

const ButtonGroup = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});

const StyledIconButton = styled.button<{ open: boolean }>(props => ({
  all: 'unset',
  backgroundColor: props.open ? props.theme.colors['grey-01'] : props.theme.colors.white,
  color: props.theme.colors['grey-04'],
  padding: `${props.theme.space * 2.5}px ${props.theme.space * 3}px`,
  transition: 'colors 0.15s ease-in-out',
  borderRadius: `0 ${props.theme.radius}px ${props.theme.radius}px 0`,
  borderLeft: 'none',

  '&:hover': {
    cursor: 'pointer',
    backgroundColor: props.theme.colors['grey-01'],
    color: props.theme.colors.text,
  },

  '&:active': {
    color: props.theme.colors.text,
    outlineColor: props.theme.colors.ctaPrimary,
  },

  '&:focus': {
    color: props.theme.colors.text,
    outlineColor: props.theme.colors.ctaPrimary,
  },
}));

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
  const theme = useTheme();
  const { width } = useWindowSize();

  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);

  return (
    <PopoverPrimitive.Root onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <StyledIconButton aria-label="advanced-filter-button" open={open}>
          <Filter />
        </StyledIconButton>
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
            width={inputContainerWidth}
            sideOffset={theme.space * 2.5 + 2}
            alignOffset={-(theme.space * 2) + 4}
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
            <ButtonGroup>
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
              <ButtonGroup>
                <Button
                  icon="trash"
                  variant="secondary"
                  onClick={() => {
                    setFilterState(initialFilterState());
                  }}
                >
                  Clear all
                </Button>
              </ButtonGroup>
            </ButtonGroup>
          </MotionContent>
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Root>
  );
}

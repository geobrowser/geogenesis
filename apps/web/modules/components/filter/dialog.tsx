import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import produce from 'immer';
import React, { useState } from 'react';
import { Filter } from '~/modules/design-system/icons/filter';
import { initialFilterState } from '~/modules/state/triple-store';
import { FilterClause, FilterField, FilterState } from '~/modules/types';
import { intersperse } from '~/modules/utils';
import { Button, IconButton } from '../../design-system/button';
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

  border: `1px solid ${props.theme.colors['grey-02']}`,
}));

const ButtonGroup = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});

const StyledIconButton = styled.button(props => ({
  all: 'unset',
  color: props.theme.colors['grey-04'],
  padding: `${props.theme.space * 2.5}px ${props.theme.space * 3}px`,

  '&:hover': {
    cursor: 'pointer',

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
  'linked-by': 'Linked by Entity ID',
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

  const [open, setOpen] = useState(false);

  return (
    <PopoverPrimitive.Root onOpenChange={setOpen} open={open}>
      <PopoverPrimitive.Trigger asChild>
        <StyledIconButton>
          <Filter />
        </StyledIconButton>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <StyledContent
          width={inputContainerWidth}
          sideOffset={theme.space * 2.5 + 2}
          alignOffset={-(theme.space * 2.5)}
          align="end"
        >
          <Text variant="button">Show triples</Text>
          <Spacer height={12} />
          {intersperse(
            filterState.map((filterClause, index) => (
              <FilterInputGroup
                label={index === 0 ? 'Where' : 'And'}
                key={index}
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
            <Spacer height={12} />
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
        </StyledContent>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

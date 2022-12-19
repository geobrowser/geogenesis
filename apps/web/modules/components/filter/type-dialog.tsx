import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
import { Input } from '~/modules/design-system/input';
import { useWindowSize } from '~/modules/hooks/use-window-size';
import { useTables } from '~/modules/state/use-tables';
import { FilterClause, FilterField, FilterState, Triple } from '~/modules/types';
import { Spacer } from '../../design-system/spacer';
import { Text } from '../../design-system/text';
import { ResultItem, ResultList } from '../entity/entity-text-autocomplete';

interface ContentProps {
  children: React.ReactNode;
  width: number;
  alignOffset?: number;
  sideOffset?: number;
}

const StyledTrigger = styled.div(props => ({
  all: 'unset',
  ...props.theme.typography.button,
  color: props.theme.colors.text,
  flex: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderRadius: props.theme.radius,
  padding: `${props.theme.space * 2}px ${props.theme.space * 3}px`,
  backgroundColor: props.theme.colors.white,
  boxShadow: `inset 0 0 0 1px ${props.theme.colors['grey-02']}`,
  textWrap: 'nowrap',
  whiteSpace: 'pre',
  width: 103,

  '&:hover': {
    boxShadow: `inset 0 0 0 1px ${props.theme.colors.text}`,
    cursor: 'pointer',
  },

  '&:focus': {
    boxShadow: `inset 0 0 0 2px ${props.theme.colors.text}`,
    outline: 'none',
  },

  '&[data-placeholder]': { color: props.theme.colors.text },
}));

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

export function TypeDialog({ inputContainerWidth }: Props) {
  const theme = useTheme();
  const tableStore = useTables();

  const { width } = useWindowSize();

  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);

  const [filter, setFilter] = useState('');

  const types = tableStore.types || [];
  const filteredTypes = types.filter(type => (type.entityName || '').toLowerCase().includes(filter.toLowerCase()));

  const handleSelect = (type: Triple) => {
    tableStore.setType(type);
    setOpen(false);
  };

  return (
    <PopoverPrimitive.Root onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <StyledTrigger open={open}>{tableStore.type.entityName}</StyledTrigger>
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
            <Text variant="button">All types</Text>
            <Spacer height={12} />
            <Input
              value={filter}
              onChange={e => {
                setFilter(e.target.value);
              }}
            />
            <Spacer height={12} />

            <ResultList>
              {filteredTypes.map(type => (
                <ResultItem onClick={() => handleSelect(type)} key={type.id}>
                  {type.entityName}
                </ResultItem>
              ))}
            </ResultList>
          </MotionContent>
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Root>
  );
}

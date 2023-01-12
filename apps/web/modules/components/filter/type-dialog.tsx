import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
import { ChevronDownSmall } from '~/modules/design-system/icons/chevron-down-small';
import { Input } from '~/modules/design-system/input';
import { useWindowSize } from '~/modules/hooks/use-window-size';
import { useEntityTable } from '~/modules/triple';
import { FilterState, Triple } from '~/modules/types';
import { Spacer } from '../../design-system/spacer';
import { Text } from '../../design-system/text';
import { ResultItem, ResultsList } from '../entity/autocomplete/results-list';

interface ContentProps {
  children: React.ReactNode;
  width: number;
  alignOffset?: number;
  sideOffset?: number;
}

const StyledTrigger = styled.button(props => ({
  all: 'unset',
  ...props.theme.typography.button,
  color: props.theme.colors.text,
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderRadius: props.theme.radius,
  padding: `${props.theme.space * 2}px ${props.theme.space * 3}px`,
  backgroundColor: props.theme.colors.white,
  boxShadow: `inset 0 0 0 1px ${props.theme.colors['grey-02']}`,
  textWrap: 'nowrap',
  whiteSpace: 'pre',
  width: 230,

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
  zIndex: 100,

  border: `1px solid ${props.theme.colors['grey-02']}`,

  '@media (max-width: 768px)': {
    margin: '0 auto',
    width: '98vw',
  },
}));

const MotionContent = motion(StyledContent);

interface Props {
  inputContainerWidth: number;
  filterState: FilterState;
  setFilterState: (filterState: FilterState) => void;
}

export function TypeDialog({ inputContainerWidth }: Props) {
  const theme = useTheme();
  const entityTableStore = useEntityTable();

  const { width } = useWindowSize();

  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);

  const [filter, setFilter] = useState('');

  const types = entityTableStore.types || [];
  const filteredTypes = types.filter(type => (type.entityName || '').toLowerCase().includes(filter.toLowerCase()));

  const handleSelect = (type: Triple) => {
    entityTableStore.setType(type);
    setOpen(false);
  };

  return (
    <PopoverPrimitive.Root onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <StyledTrigger aria-label="type-filter-dropdown">
          {entityTableStore.selectedType?.entityName || 'No Types Found'} <Spacer width={8} />
          <ChevronDownSmall color="ctaPrimary" />
        </StyledTrigger>
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

            <ResultsList>
              {filteredTypes.map(type => (
                <ResultItem onClick={() => handleSelect(type)} key={type.id}>
                  {type.entityName}
                </ResultItem>
              ))}
            </ResultsList>
          </MotionContent>
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Root>
  );
}

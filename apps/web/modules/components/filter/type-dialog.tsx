import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
import { SYSTEM_IDS } from '~/../../packages/ids';
import { useActionsStoreContext } from '~/modules/action';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { Button } from '~/modules/design-system/button';
import { ChevronDownSmall } from '~/modules/design-system/icons/chevron-down-small';
import { Input } from '~/modules/design-system/input';
import { useEntityTable } from '~/modules/entity';
import { useWindowSize } from '~/modules/hooks/use-window-size';
import { ID } from '~/modules/id';
import { Triple } from '~/modules/triple';
import { EntityValue, FilterState, StringValue, Triple as TripleType } from '~/modules/types';
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

const AddEntityContainer = styled.div(() => ({
  display: 'flex',
  justifyContent: 'space-between',
  order: -1,
  // @goose - this is a hack to get the input box focused when the popover opens, we are setting internal components flex order to -1
}));

const AddTypeContainer = styled.div(() => ({
  display: 'flex',
  flexDirection: 'column',
}));

interface CancelButtonProps {
  onClick: () => void;
}

const CancelButton = styled(Text)<CancelButtonProps>(() => ({
  color: '#3963FE',
  cursor: 'pointer',
}));

const MotionContent = motion(StyledContent);

interface Props {
  inputContainerWidth: number;
  filterState: FilterState;
  setFilterState: (filterState: FilterState) => void;
  spaceId: string;
}

export function TypeDialog({ inputContainerWidth, spaceId }: Props) {
  const theme = useTheme();
  const entityTableStore = useEntityTable();
  const ActionStore = useActionsStoreContext();
  const { isEditor } = useAccessControl(spaceId);

  const { width } = useWindowSize();

  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);

  const [displayCreateType, setDisplayCreateType] = useState(false);

  const [filter, setFilter] = useState('');

  const { types } = entityTableStore;
  const filteredTypes = types.filter(type => (type.entityName || '').toLowerCase().includes(filter.toLowerCase()));

  const searchMode = filteredTypes.length >= 1 && !displayCreateType;

  const handleSelect = (type: TripleType) => {
    entityTableStore.setType(type);
    setOpen(false);
  };

  const handleCancel = () => {
    setFilter('');
    setDisplayCreateType(false);
  };

  const handleCreateType = () => {
    const newId = ID.createEntityId();
    const nameTriple = Triple.withId({
      space: spaceId,
      entityId: newId,
      entityName: filter,
      attributeId: 'name',
      attributeName: 'Name',
      value: { id: SYSTEM_IDS.NAME, type: 'string', value: filter } as StringValue,
    });
    const typeTriple = Triple.withId({
      space: spaceId,
      entityId: newId,
      entityName: filter,
      attributeId: SYSTEM_IDS.TYPES,
      attributeName: 'Types',
      value: {
        id: SYSTEM_IDS.SCHEMA_TYPE,
        type: 'entity',
        name: 'Type',
      } as EntityValue,
    });
    ActionStore.create(nameTriple);
    ActionStore.create(typeTriple);
    setFilter('');
    setDisplayCreateType(false);
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
            <AddTypeContainer>
              <Spacer height={12} />
              <Input
                value={filter}
                onChange={e => {
                  setFilter(e.target.value);
                }}
              />
              <AddEntityContainer>
                <Text variant="button">All types</Text>
                {filter.length > 0 && (
                  <CancelButton variant="button" onClick={handleCancel}>
                    Cancel
                  </CancelButton>
                )}
              </AddEntityContainer>
              <Spacer height={12} />

              <ResultsList>
                {searchMode
                  ? filteredTypes.map(type => (
                      <ResultItem onClick={() => handleSelect(type)} key={type.id}>
                        {type.entityName}
                      </ResultItem>
                    ))
                  : isEditor && <Button onClick={handleCreateType}>Create Type</Button>}
              </ResultsList>
            </AddTypeContainer>
          </MotionContent>
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Root>
  );
}

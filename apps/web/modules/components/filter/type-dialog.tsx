import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useState } from 'react';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { useActionsStoreContext } from '~/modules/action';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { Button, SmallButton } from '~/modules/design-system/button';
import { ChevronDownSmall } from '~/modules/design-system/icons/chevron-down-small';
import { Input } from '~/modules/design-system/input';
import { useEntityTable } from '~/modules/entity';
import { ID } from '~/modules/id';
import { Triple } from '~/modules/triple';
import { FilterState, Triple as TripleType } from '~/modules/types';
import { Spacer } from '../../design-system/spacer';
import { Text } from '../../design-system/text';
import { ResultContent, ResultItem, ResultsList } from '../entity/autocomplete/results-list';
import { EntityAutocompleteDialog } from '../entity/autocomplete/entity-autocomplete';
import { Search } from '~/modules/design-system/icons/search';
import { useAutocomplete } from '~/modules/search';
import { useSpaces } from '~/modules/spaces/use-spaces';
import { useTypeAutocomplete } from '~/modules/search/autocomplete';

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
  width: `calc(${props.width}px / 2)`,
  backgroundColor: props.theme.colors.white,
  boxShadow: props.theme.shadows.button,
  zIndex: 100,
  border: `1px solid ${props.theme.colors['grey-02']}`,

  '@media (max-width: 768px)': {
    margin: '0 auto',
    width: '98vw',
  },
}));

const MotionContent = motion(StyledContent);

const CreateButton = styled(Button)(props => ({
  margin: `0 ${props.theme.space * 2}px ${props.theme.space * 2}px ${props.theme.space * 2}px`,
}));

const ImportButton = styled(SmallButton)(props => ({
  margin: `0 ${props.theme.space * 2}px ${props.theme.space * 2}px ${props.theme.space * 2}px`,
}));

const SearchContainer = styled.div(props => ({
  display: 'flex',
  flexDirection: 'column',
  padding: props.theme.space * 2,
}));

const SearchIconContainer = styled.div(props => ({
  position: 'absolute',
  left: props.theme.space * 3,
  top: props.theme.space * 2.5,
  zIndex: 100,
}));

const InputContainer = styled.div(props => ({
  position: 'relative',
  margin: `${props.theme.space * 2}px`,
}));

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
  const {spaces} = useSpaces();

  // we need some way to get all of the types, regardless of the space
  // normally we would do this via the network class, however for some reason the network object is private within the entityTableStore. Maybe we want to change this?

  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [showAllTypes, setShowAllTypes] = useState(false);
  const filteredTypes = entityTableStore.types.filter(type =>
    (type.entityName || '').toLowerCase().includes(filter.toLowerCase())
  );

  const hasResults = filteredTypes.length >= 1;

  const handleSelect = (type: TripleType) => {
    entityTableStore.setType(type);
    setOpen(false);
  };

  const handleCreateType = () => {
    const newId = ID.createEntityId();
    const nameTriple = Triple.withId({
      space: spaceId,
      entityId: newId,
      entityName: filter,
      attributeId: 'name',
      attributeName: 'Name',
      value: { id: SYSTEM_IDS.NAME, type: 'string', value: filter },
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
      },
    });
    ActionStore.create(nameTriple);
    ActionStore.create(typeTriple);
    setFilter('');
  };

  const handleImportType = () => {
    setShowAllTypes(true);
    const space = spaces.find(space => space.id === spaceId);
    if(!space?.spaceConfigurationId) {
    // create a space configuration entity
    // create an entity for the space config
    // create a triple (SampleSpaceConfig -> Types -> SPACE_CONFIGURATION) Type triple
    // create a triple (SampleSpaceConfig -> Name -> "Sample Space Config") Name triple
    }
    // create a triple (SampleSpaceConfig -> ForeignTypes -> Type) ForeignType triple
    console.log("Importing type");
  }
  

  const autocomplete = useTypeAutocomplete(spaceId);

  useEffect(() => {
    if(showAllTypes) {
      autocomplete.onQueryChange(filter);
    }
  }, [filter, showAllTypes]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <StyledTrigger aria-label="type-filter-dropdown">
          {entityTableStore.selectedType?.entityName || 'No Types Found'}
          <Spacer width={8} />
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
            width={inputContainerWidth}
            sideOffset={theme.space * 2}
            align="start"
          >
            {!hasResults && (
              <>
                <Spacer height={8} />
                <Text className="p-2" variant="smallButton">
                  Create new type
                </Text>
              </>
            )}

            <motion.div layout="position">
              <SearchContainer>
                <Input value={filter} onChange={e => {
                  setFilter(e.currentTarget.value)
                }} />
              </SearchContainer>
            </motion.div>

            {hasResults && (
              <Text className="p-2" variant="smallButton">
                All types
              </Text>
            )}


            <ResultsList>
              {hasResults && !showAllTypes
                ? filteredTypes.map(type => (
                    <ResultItem onClick={() => handleSelect(type)} key={type.id}>
                      {type.entityName}
                    </ResultItem>
                  ))
                : showAllTypes 
                ? (
                autocomplete.results.map(result => (
                  <ResultContent
                    key={result.id}
                    onClick={() => {}}
                    alreadySelected={false}
                    result={result}
                    spaces={spaces}
                  />)))
                : isEditor && (
                <>
                <CreateButton onClick={handleCreateType}>Create Type</CreateButton>
                <ImportButton variant="secondary" borderColor="#0000" onClick={handleImportType}>
                  <Text className="pb-2 self-center" variant="smallButton" color="ctaPrimary">
                  Add type from another space
                  </Text>
                </ImportButton>
                </>
                )}
            </ResultsList>
          </MotionContent>
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Root>
  );
}

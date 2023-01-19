import styled from '@emotion/styled';
import { useRect } from '@radix-ui/react-use-rect';
import { useRef } from 'react';
import { useEntityTable } from '~/modules/entity';
import { CheckCloseSmall } from '../../design-system/icons/check-close-small';
import { Search } from '../../design-system/icons/search';
import { Input } from '../../design-system/input';
import { Spacer } from '../../design-system/spacer';
import { FilterClause } from '../../types';
import { TypeDialog } from '../filter/type-dialog';

const SearchInputContainer = styled.div(props => ({
  position: 'relative',
  width: '100%',

  '@media (max-width: 640px)': {
    marginLeft: 0,
  },
}));

const SearchIconContainer = styled.div(props => ({
  position: 'absolute',
  left: props.theme.space * 3,
  top: props.theme.space * 2.5,
  zIndex: 10,
}));

const InputContainer = styled.div(props => ({
  overflow: 'hidden',
  display: 'flex',
  width: '100%',
  position: 'relative',
  gap: props.theme.space * 4,

  '@media (max-width: 640px)': {
    flexDirection: 'column',
    gap: props.theme.space,
  },
}));

const TriplesInputField = styled(Input)(props => ({
  width: '100%',
  borderRadius: props.theme.radius,
  paddingLeft: props.theme.space * 10,
}));

const AdvancedFilters = styled.div(props => ({
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  gap: props.theme.space,
  width: '100%',
  borderRadius: `${props.theme.radius}px 0 0 ${props.theme.radius}px`,
  boxShadow: `inset 0 0 0 1px ${props.theme.colors['grey-02']}`,
  paddingLeft: props.theme.space * 10,
  backgroundColor: props.theme.colors.white,
}));

export function EntityInput() {
  const entityTableStore = useEntityTable();
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const showBasicFilter =
    entityTableStore.filterState.length === 1 && entityTableStore.filterState[0].field === 'entity-name';
  const inputRect = useRect(inputContainerRef.current);

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    entityTableStore.setQuery(event.target.value);
  };

  const onAdvancedFilterClick = (field: FilterClause['field']) => {
    const filteredFilters = entityTableStore.filterState.filter(filter => filter.field !== field);
    entityTableStore.setFilterState(filteredFilters);
  };

  return (
    <InputContainer ref={inputContainerRef}>
      <TypeDialog
        inputContainerWidth={Math.min(inputRect?.width || 0, 678)}
        filterState={entityTableStore.filterState}
        setFilterState={entityTableStore.setFilterState}
      />

      <SearchInputContainer>
        <SearchIconContainer>
          <Search />
        </SearchIconContainer>
        {showBasicFilter ? (
          <TriplesInputField placeholder="Search entities..." value={entityTableStore.query} onChange={onChange} />
        ) : (
          <AdvancedFilters>
            {entityTableStore.filterState.map(filter => (
              <AdvancedFilterPill
                key={filter.field}
                filterClause={filter}
                onClick={() => onAdvancedFilterClick(filter.field)}
              />
            ))}
          </AdvancedFilters>
        )}
      </SearchInputContainer>
    </InputContainer>
  );
}

const AdvancedFilterPillContainer = styled.button(props => ({
  ...props.theme.typography.metadataMedium,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  display: 'flex',
  alignItems: 'center',
  padding: `${props.theme.space}px ${props.theme.space * 2}px`,
  borderRadius: props.theme.space,
  backgroundColor: props.theme.colors.white,
  boxShadow: `inset 0 0 0 1px ${props.theme.colors['grey-02']}`,

  '&:hover': {
    backgroundColor: props.theme.colors.bg,
    boxShadow: `inset 0 0 0 1px ${props.theme.colors.text}`,
    cursor: 'pointer',
  },

  '&:focus': {
    backgroundColor: props.theme.colors.bg,
    boxShadow: `inset 0 0 0 2px ${props.theme.colors.text}`,
    outline: 'none',
  },
}));

interface AdvancedFilterPillprops {
  filterClause: FilterClause;
  onClick: () => void;
}

function getFilterLabel(field: FilterClause['field']) {
  switch (field) {
    case 'entity-id':
      return 'Entity ID is';
    case 'entity-name':
      return 'Entity name contains';
    case 'attribute-name':
      return 'Attribute name contains';
    case 'attribute-id':
      return 'Attribute ID is';
    case 'value':
      return 'Value contains';
    case 'linked-to':
      return 'Entity contains reference to';
  }
}

function AdvancedFilterPill({ filterClause, onClick }: AdvancedFilterPillprops) {
  const { field, value } = filterClause;
  const label = getFilterLabel(field);

  return (
    <AdvancedFilterPillContainer onClick={onClick}>
      {label} {value}
      <Spacer width={8} />
      <CheckCloseSmall />
    </AdvancedFilterPillContainer>
  );
}

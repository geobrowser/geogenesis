import styled from '@emotion/styled';
import { useRect } from '@radix-ui/react-use-rect';
import { useRef } from 'react';
import { CheckCloseSmall } from '../design-system/icons/check-close-small';
import { Search } from '../design-system/icons/search';
import { Input } from '../design-system/input';
import { Spacer } from '../design-system/spacer';
import { useTriples } from '../triple/use-triples';
import { FilterClause } from '../types';
import { FilterDialog } from './filter/dialog';

const SearchIconContainer = styled.div(props => ({
  position: 'absolute',
  left: props.theme.space * 3,
  top: props.theme.space * 2.5,
  zIndex: 100,
}));

const FilterIconContainer = styled.div(props => ({
  display: 'flex',
  alignItems: 'center',
  backgroundColor: props.theme.colors.white,
  border: `1px solid ${props.theme.colors['grey-02']}`,
  borderRadius: `0 ${props.theme.radius}px ${props.theme.radius}px 0`,
  borderLeft: 'none',
  color: props.theme.colors['grey-04'],
}));

const InputContainer = styled.div({
  overflow: 'hidden',
  display: 'flex',
  position: 'relative',
});

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

export function TripleInput() {
  const tripleStore = useTriples();
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const inputRect = useRect(inputContainerRef.current);
  const showBasicFilter = tripleStore.filterState.length === 1 && tripleStore.filterState[0].field === 'entity-name';

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    tripleStore.setQuery(event.target.value);
  };

  const onAdvancedFilterClick = (field: FilterClause['field']) => {
    const filteredFilters = tripleStore.filterState.filter(filter => filter.field !== field);
    tripleStore.setFilterState(filteredFilters);
  };

  return (
    <InputContainer ref={inputContainerRef}>
      <SearchIconContainer>
        <Search />
      </SearchIconContainer>
      {showBasicFilter ? (
        <Input
          withExternalSearchIcon
          withFilterIcon
          placeholder="Search facts..."
          value={tripleStore.query}
          onChange={onChange}
        />
      ) : (
        <AdvancedFilters>
          {tripleStore.filterState.map(filter => (
            <AdvancedFilterPill
              key={filter.field}
              filterClause={filter}
              onClick={() => onAdvancedFilterClick(filter.field)}
            />
          ))}
        </AdvancedFilters>
      )}
      <FilterIconContainer>
        <FilterDialog
          inputContainerWidth={inputRect?.width || 578}
          filterState={tripleStore.filterState}
          setFilterState={tripleStore.setFilterState}
        />
      </FilterIconContainer>
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

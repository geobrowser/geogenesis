import styled from '@emotion/styled';
import React from 'react';
import { CheckCloseSmall } from '../../design-system/icons/check-close-small';
import { Search } from '../../design-system/icons/search';
import { Input } from '../../design-system/input';
import { Spacer } from '../../design-system/spacer';
import { FilterClause, FilterState } from '../../types';
import { FilterDialog } from '../filter/dialog';

export const InputContainer = styled.div({
  overflow: 'hidden',
  display: 'flex',
  position: 'relative',
  width: '100%',
});

export const InputField = styled(Input)(props => ({
  width: '100%',
  borderRadius: `${props.theme.radius}px 0 0 ${props.theme.radius}px`,
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

export const SearchIconContainer = styled.div(props => ({
  position: 'absolute',
  left: props.theme.space * 3,
  top: props.theme.space * 2.5,
  zIndex: 100,
}));

export const FilterIconContainer = styled.div<{ shouldRoundBorder?: boolean }>(props => ({
  display: 'flex',
  alignItems: 'center',
  backgroundColor: props.theme.colors.white,
  border: `1px solid ${props.theme.colors['grey-02']}`,
  borderLeft: 'none',
  color: props.theme.colors['grey-04'],

  ...(props.shouldRoundBorder && {
    borderRadius: `0 ${props.theme.radius}px ${props.theme.radius}px 0`,
    overflow: 'hidden',
  }),
}));

interface Props {
  filterState: FilterState;
  onFilterStateChange: (filterState: FilterState) => void;
  query: string;
  onQueryChange: (query: string) => void;
  predefinedQueryTrigger?: React.ReactNode;
  inputContainerWidth?: number;
}

export function TableSearchInput({
  filterState,
  query,
  onQueryChange,
  onFilterStateChange,
  predefinedQueryTrigger,
  inputContainerWidth,
}: Props) {
  const showBasicFilter = filterState.length === 1 && filterState[0].field === 'entity-name';

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onQueryChange(event.target.value);
  };

  const onAdvancedFilterClick = (field: FilterClause['field']) => {
    const filteredFilters = filterState.filter(filter => filter.field !== field);
    onFilterStateChange(filteredFilters);
  };

  return (
    <InputContainer>
      <SearchIconContainer>
        <Search />
      </SearchIconContainer>
      {showBasicFilter ? (
        <InputField placeholder="Search facts..." value={query} onChange={onChange} />
      ) : (
        <AdvancedFilters>
          {filterState.map(filter => (
            <AdvancedFilterPill
              key={filter.field}
              filterClause={filter}
              onClick={() => onAdvancedFilterClick(filter.field)}
            />
          ))}
        </AdvancedFilters>
      )}
      <FilterIconContainer shouldRoundBorder={!predefinedQueryTrigger}>
        <FilterDialog
          inputContainerWidth={inputContainerWidth || 578}
          filterState={filterState}
          setFilterState={onFilterStateChange}
          limitedFilters={!predefinedQueryTrigger}
        />
      </FilterIconContainer>
      {predefinedQueryTrigger && predefinedQueryTrigger}
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
      <div>
        <CheckCloseSmall />
      </div>
    </AdvancedFilterPillContainer>
  );
}

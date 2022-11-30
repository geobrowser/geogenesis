import styled from '@emotion/styled';
import { useRect } from '@radix-ui/react-use-rect';
import debounce from 'lodash.debounce';
import { useRef } from 'react';
import { IconButton } from '../design-system/button';
import { Search } from '../design-system/icons/search';
import { Input } from '../design-system/input';
import { useTriples } from '../state/use-triples';
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
  borderLeft: 'none',
}));

const PresetIconContainer = styled(FilterIconContainer)<{ showPredefinedQueries: boolean }>(props => ({
  cursor: 'pointer',
  borderRadius: `0 ${props.theme.radius}px ${props.theme.radius}px 0`,
  backgroundColor: props.showPredefinedQueries ? props.theme.colors['grey-01'] : props.theme.colors.white,
  borderLeft: 'none',
  transition: 'colors 0.15s ease-in-out',

  '&:hover': {
    backgroundColor: props.theme.colors['grey-01'],
  },

  button: {
    padding: `${props.theme.space * 2.5}px ${props.theme.space * 3}px`,

    '&:active': {
      color: props.theme.colors.text,
      outlineColor: props.theme.colors.ctaPrimary,
    },

    '&:focus': {
      color: props.theme.colors.text,
      outlineColor: props.theme.colors.ctaPrimary,
    },
  },
}));

const InputContainer = styled.div({
  width: '100%',
  display: 'flex',
  position: 'relative',
});

const TriplesInputField = styled(Input)(props => ({
  width: '100%',
  borderRadius: `${props.theme.radius}px 0 0 ${props.theme.radius}px`,
  paddingLeft: props.theme.space * 10,
}));

interface Props {
  showPredefinedQueries: boolean;
  onShowPredefinedQueriesChange: (showPredefinedQueries: boolean) => void;
}

export function TriplesInput({ showPredefinedQueries, onShowPredefinedQueriesChange }: Props) {
  const tripleStore = useTriples();
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const inputRect = useRect(inputContainerRef.current);

  return (
    <InputContainer ref={inputContainerRef}>
      <SearchIconContainer>
        <Search />
      </SearchIconContainer>
      <TriplesInputField
        defaultValue={tripleStore.query}
        placeholder="Search facts..."
        onChange={e => debounce(tripleStore.setQuery, 500)(e.target.value)}
      />
      <FilterIconContainer>
        <FilterDialog
          inputContainerWidth={inputRect?.width || 578}
          filterState={tripleStore.filterState}
          setFilterState={tripleStore.setFilterState}
        />
      </FilterIconContainer>
      <PresetIconContainer showPredefinedQueries={showPredefinedQueries}>
        <IconButton onClick={() => onShowPredefinedQueriesChange(!showPredefinedQueries)} icon="preset" />
      </PresetIconContainer>
    </InputContainer>
  );
}

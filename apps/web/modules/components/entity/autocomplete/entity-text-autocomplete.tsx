import styled from '@emotion/styled';
import { useEffect, useRef } from 'react';
import { Text } from '~/modules/design-system/text';
import { useAutocomplete } from '~/modules/entity/autocomplete';
import { Entity } from '~/modules/types';
import { ResultContent, ResultsList } from './results-list';

const Container = styled.div({
  position: 'relative',
  width: '100%',
});

const QueryInput = styled.input(props => ({
  ...props.theme.typography.body,
  width: '100%',
  height: '100%',
  padding: 0,
  margin: 0,
  backgroundColor: 'transparent',

  '&::placeholder': {
    color: props.theme.colors['grey-02'],
  },

  '&:focus': {
    outline: 'none',
  },
}));

const ResultListContainer = styled.div(props => ({
  top: 36,
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: props.theme.radius,
  backgroundColor: props.theme.colors.white,
  zIndex: 1,
  width: 384,
  height: 340,
  overflow: 'hidden',
  boxShadow: `inset 0 0 0 1px ${props.theme.colors['grey-02']}`,
}));

const ResultListHeader = styled.p(props => ({
  padding: props.theme.space * 2.5,
}));

export const ResultItem = styled.li<{ existsOnEntity?: boolean }>(props => ({
  all: 'unset',
  padding: props.theme.space * 2.5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',

  '&:hover': {
    backgroundColor: props.theme.colors['grey-01'],
    ...(!props.existsOnEntity && {
      cursor: 'pointer',
    }),
  },

  ...(props.existsOnEntity && {
    backgroundColor: props.theme.colors['grey-01'],
    cursor: 'not-allowed',
  }),
}));

interface Props {
  placeholder?: string;
  onDone: (result: Entity) => void;
  itemIds: string[];
}

export function EntityTextAutocomplete({ placeholder, itemIds, onDone }: Props) {
  const { query, results, onQueryChange } = useAutocomplete();
  const containerRef = useRef<HTMLDivElement>(null);
  const itemIdsSet = new Set(itemIds);

  useEffect(() => {
    document.addEventListener('click', e => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onQueryChange('');
      }
    });
  }, [onQueryChange]);

  // TODO: Implement keyboard navigation

  return (
    <Container>
      <QueryInput
        placeholder={placeholder}
        defaultValue={'banana'}
        value={query}
        onChange={e => onQueryChange(e.target.value)}
      />
      {query && (
        <ResultListContainer ref={containerRef}>
          <ResultListHeader>
            <Text variant="smallButton">Add a relation</Text>
          </ResultListHeader>
          <ResultsList>
            {results.map(result => (
              <ResultContent
                key={result.id}
                onClick={() => {
                  if (!itemIdsSet.has(result.id)) onDone(result);
                }}
                alreadySelected={itemIdsSet.has(result.id)}
                result={result}
              />
            ))}
          </ResultsList>
        </ResultListContainer>
      )}
    </Container>
  );
}

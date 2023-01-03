import styled from '@emotion/styled';
import { useEffect, useRef } from 'react';
import { Text } from '~/modules/design-system/text';
import { useAutocomplete } from '~/modules/entity/autocomplete';

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

export const ResultList = styled.ul({
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-start',
  margin: 0,
  padding: 0,
  overflowY: 'auto',
});

const ResultListHeader = styled.p(props => ({
  padding: props.theme.space * 2.5,
}));

export const ResultItem = styled.li(props => ({
  all: 'unset',
  ...props.theme.typography.metadataMedium,
  padding: props.theme.space * 2.5,
  cursor: 'pointer',

  '&:hover': {
    backgroundColor: props.theme.colors['grey-01'],
  },
}));

interface Props {
  placeholder?: string;
  onDone: (result: { id: string; name: string | null }) => void;
}

export function EntityTextAutocomplete({ placeholder, onDone }: Props) {
  const { query, results, onQueryChange } = useAutocomplete();
  const containerRef = useRef<HTMLDivElement>(null);

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
          <ResultList>
            {results.map(result => (
              <ResultItem onClick={() => onDone(result)} key={result.id}>
                {result.name}
              </ResultItem>
            ))}
          </ResultList>
        </ResultListContainer>
      )}
    </Container>
  );
}

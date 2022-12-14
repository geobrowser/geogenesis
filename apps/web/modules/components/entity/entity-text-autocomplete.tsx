import styled from '@emotion/styled';
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

const ResultList = styled.ul({
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

const ResultItem = styled.li(props => ({
  all: 'unset',
  ...props.theme.typography.metadataMedium,
  padding: props.theme.space * 2.5,
  cursor: 'pointer',

  '&:hover': {
    backgroundColor: props.theme.colors['grey-01'],
  },
}));

export function EntityTextAutocomplete() {
  const { query, results, onQueryChange } = useAutocomplete();

  return (
    <Container>
      <QueryInput value={query} onChange={e => onQueryChange(e.target.value)} />
      {results.length > 0 && (
        <ResultListContainer>
          <ResultListHeader>
            <Text variant="smallButton">Add a relation</Text>
          </ResultListHeader>
          <ResultList>
            {results.map(result => (
              <ResultItem key={result.id}>{result.name}</ResultItem>
            ))}
          </ResultList>
        </ResultListContainer>
      )}
    </Container>
  );
}

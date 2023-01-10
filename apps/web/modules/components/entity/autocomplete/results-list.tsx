import styled from '@emotion/styled';
import { A, pipe } from '@mobily/ts-belt';
import { CheckCircleSmall } from '~/modules/design-system/icons/check-circle-small';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { Entity } from '~/modules/types';

export const ResultsList = styled.ul({
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-start',
  margin: 0,
  padding: 0,

  maxHeight: 340,
  overflowY: 'auto',
});

export const ResultItem = styled.button<{ existsOnEntity?: boolean }>(props => ({
  all: 'unset',
  display: 'flex',
  flexDirection: 'column',
  padding: `${props.theme.space * 2}px`,

  '&:hover': {
    backgroundColor: props.theme.colors['grey-01'],
    ...(!props.existsOnEntity && {
      cursor: 'pointer',
    }),
  },

  '&:focus': {
    outline: 'none',
    backgroundColor: props.theme.colors['grey-01'],
  },

  ...(props.existsOnEntity && {
    backgroundColor: props.theme.colors['grey-01'],
    cursor: 'not-allowed',
  }),
}));

const ResultText = styled(Text)(props => ({
  // HACK: Increase line-height a bit to avoid clipping descenders
  lineHeight: props.theme.typography.input.lineHeight,
}));

const ResultHeader = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  lineHeight: '1rem',
});

const ResultDisambiguationTypesContainer = styled.div(props => ({
  display: 'flex',
  alignItems: 'center',
  gap: props.theme.space,
}));

/**
 * Depending on the results from the Entity search we want to provide
 * some metadata in order to disambiguate between entities that have the
 * same name.
 *
 * 1. If there are multiple Entity results in the list with the same name, and they
 *    have the same set of Types, then show a description for each result if
 *    description exists.
 * 2. If an Entity result has Types, show those
 * 3. If an Entity result does not have Types, but does have a Description, show that
 * 4. Show nothing
 */
function ResultDisambiguation({ result, results }: { result: Entity; results: Entity[] }) {
  const resultTypes = new Set(result.types);

  const isDuplicateNameAndTypes = pipe(
    results,
    // Remove the current result from the list of results
    A.filter(r => r.name === result.name && r.id !== result.id),
    // If any of the remaining results have the exact same collection of types
    // as the current result, then we have a duplicate
    A.filter(duplicate => duplicate.types.every(type => resultTypes.has(type))),
    A.length,
    length => length > 0
  );

  if (isDuplicateNameAndTypes && result.description) {
    return <Text variant="footnote">{result.description}</Text>;
  }

  if (!A.isEmpty(result.types)) {
    return (
      <ResultDisambiguationTypesContainer>
        {result.types.map((type, index) => (
          <Text variant="footnote" key={`${type}-${index}`}>
            {type}
          </Text>
        ))}
      </ResultDisambiguationTypesContainer>
    );
  }

  if (result.description) {
    return <Text variant="footnote">{result.description}</Text>;
  }

  return null;
}

interface Props {
  onClick: () => void;
  result: Entity;
  results: Entity[];
  alreadySelected?: boolean;
}

export function ResultContent({ onClick, result, alreadySelected, results }: Props) {
  return (
    <ResultItem onClick={onClick} existsOnEntity={Boolean(alreadySelected)}>
      <ResultHeader>
        <ResultText as="li" variant="metadataMedium" ellipsize>
          {result.name ?? result.id}
        </ResultText>
        {alreadySelected && <CheckCircleSmall color="grey-04" />}
      </ResultHeader>
      {(result.description || !A.isEmpty(result.types)) && (
        <>
          <Spacer height={4} />
          <ResultDisambiguation result={result} results={results} />
        </>
      )}
    </ResultItem>
  );
}

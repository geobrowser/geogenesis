import styled from '@emotion/styled';
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

function ResultDisambiguation({ result }: { result: Entity }) {
  if (result.types.length > 0) {
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
  alreadySelected?: boolean;
}

export function ResultContent({ onClick, result, alreadySelected }: Props) {
  return (
    <ResultItem onClick={onClick} existsOnEntity={Boolean(alreadySelected)}>
      <ResultHeader>
        <ResultText as="li" variant="metadataMedium" ellipsize>
          {result.name ?? result.id}
        </ResultText>
        {alreadySelected && <CheckCircleSmall color="grey-04" />}
      </ResultHeader>
      {(result.description || result.types.length > 0) && (
        <>
          <Spacer height={4} />
          <ResultDisambiguation result={result} />
        </>
      )}
    </ResultItem>
  );
}

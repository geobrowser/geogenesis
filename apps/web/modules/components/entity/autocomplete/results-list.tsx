import styled from '@emotion/styled';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { Breadcrumb } from '~/modules/design-system/breadcrumb';
import { CheckCircleSmall } from '~/modules/design-system/icons/check-circle-small';
import { ChevronDownSmall } from '~/modules/design-system/icons/chevron-down-small';
import { Spacer } from '~/modules/design-system/spacer';
import { Tag } from '~/modules/design-system/tag';
import { Text } from '~/modules/design-system/text';
import { Entity, Space } from '~/modules/types';

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

interface Props {
  onClick: () => void;
  result: Entity;
  alreadySelected?: boolean;
  spaces: Space[];
}

const BreadcrumbsContainer = styled.div(props => ({
  display: 'flex',
  alignItems: 'center',
  gap: props.theme.space * 1.5,
  overflow: 'hidden',
}));

const TagsContainer = styled.div(props => ({
  display: 'flex',
  alignItems: 'center',
  gap: props.theme.space * 1.5,
}));

export function ResultContent({ onClick, result, alreadySelected, spaces }: Props) {
  const space = spaces.find(space => space.id === result.nameTripleSpace);

  const spaceImg = space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? '';
  const spaceName = space?.attributes[SYSTEM_IDS.NAME];

  const showBreadcrumbs = spaceName || result.types.length > 0;
  const showBreadcrumbChevron = spaceName && result.types.length > 0;

  return (
    <ResultItem onClick={onClick} existsOnEntity={Boolean(alreadySelected)}>
      <ResultHeader>
        <ResultText as="li" variant="metadataMedium" ellipsize>
          {result.name ?? result.id}
        </ResultText>
        {alreadySelected && <CheckCircleSmall color="grey-04" />}
      </ResultHeader>

      {showBreadcrumbs && (
        <>
          <Spacer height={4} />
          <BreadcrumbsContainer>
            {spaceName && <Breadcrumb img={spaceImg}>{spaceName}</Breadcrumb>}
            {showBreadcrumbChevron && (
              <span style={{ rotate: '270deg' }}>
                <ChevronDownSmall color="grey-04" />
              </span>
            )}
            {result.types.length > 0 && (
              <TagsContainer>
                {result.types.map(type => (
                  <Tag key={type}>{type}</Tag>
                ))}
              </TagsContainer>
            )}
          </BreadcrumbsContainer>
        </>
      )}
      {result.description && (
        <>
          <Spacer height={4} />
          <Text variant="footnote">{result.description}</Text>
        </>
      )}
    </ResultItem>
  );
}

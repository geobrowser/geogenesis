import { Theme } from '@emotion/react';
import styled from '@emotion/styled';
import { CaretUp } from '~/modules/design-system/icons/caret-up';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';

type DefaultSpaceStyle = {
  backgroundColor: string;
  borderColor: string;
};

function getSpaceBackgroundColors(space: string, theme: Theme): DefaultSpaceStyle {
  switch (space) {
    case 'Health':
      return {
        backgroundColor: '#D2E5DA',
        borderColor: '#8FBCA2',
      };
    case 'San Francisco':
      return {
        backgroundColor: '#D5E2F2',
        borderColor: '#739ACA',
      };
    case 'Values':
      return {
        backgroundColor: '#E5E5E7',
        borderColor: theme.colors['grey-03'],
      };
    default:
      return {
        backgroundColor: theme.colors.white,
        borderColor: theme.colors.text,
      };
  }
}

const Container = styled.div<{ name: string }>(({ theme, name }) => {
  const { backgroundColor, borderColor } = getSpaceBackgroundColors(name, theme);

  return {
    position: 'relative',
    backgroundColor,
    border: `1px solid ${borderColor}`,
    borderRadius: theme.radius,
    padding: `${theme.space * 4}px ${theme.space * 3}px`,
    width: '100%',
  };
});

const ArrowContainer = styled.div<{ name: string }>(({ theme, name }) => {
  const { borderColor } = getSpaceBackgroundColors(name, theme);

  return {
    rotate: '180deg',
    position: 'absolute',
    right: 13,
    bottom: -10,

    svg: {
      color: borderColor,
    },
  };
});

interface Props {
  name: string;
}

export function PredefinedQueriesContainer({ name }: Props) {
  return (
    <Container name={name}>
      <Text variant="bodySemibold" as="h2">
        Preset {name} queries
      </Text>
      <Spacer height={4} />
      <Text>
        These queries will help you get a better idea of how to structure your own searches, as well as what kinds of
        data you can find within Geo.
      </Text>
      <ArrowContainer name={name}>
        <CaretUp />
      </ArrowContainer>
    </Container>
  );
}

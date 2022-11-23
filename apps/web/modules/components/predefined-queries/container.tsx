import { Theme } from '@emotion/react';
import styled from '@emotion/styled';
import { Text } from '~/modules/design-system/text';

type DefaultSpace = 'Health' | 'San Francisco' | 'Values';
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
        borderColor: theme.colors['grey-03'],
      };
  }
}

const Container = styled.div<{ name: string }>(({ theme, name }) => {
  const { backgroundColor, borderColor } = getSpaceBackgroundColors(name, theme);

  return {
    display: 'flex',
    alignItems: 'center',
    backgroundColor,
    border: `1px solid ${borderColor}`,
    borderRadius: theme.radius,
    padding: `${theme.space * 4}px ${theme.space * 3}px`,
    width: '100%',
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
    </Container>
  );
}

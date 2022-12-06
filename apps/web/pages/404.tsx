import styled from '@emotion/styled';
import Link from 'next/link';
import { Button } from '~/modules/design-system/button';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';

const ErrorContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '75vh',
  position: 'relative',
});

const Content = styled.div({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10,
});

export default function Custom404() {
  return (
    <ErrorContainer>
      <Content>
        <img src="/404.svg" alt="Image of a 404 error." />
        <Spacer height={24} />
        <Text as="h1" variant="bodySemibold">
          This page could not be found :-(
        </Text>
        <Spacer height={16} />
        <Button>
          <Link href="/spaces" passHref>
            <a>
              <Text variant="button" color="white">
                Go to all spaces
              </Text>
            </a>
          </Link>
        </Button>
      </Content>

      <img
        src="/405.svg"
        style={{ position: 'absolute', opacity: 1, zIndex: 5 }}
        alt="Background image of a 404 error"
      />
      <img
        src="/406.svg"
        style={{ position: 'absolute', opacity: 1, zIndex: 4 }}
        alt="Background image of a 404 error"
      />
      <img
        src="/407.svg"
        style={{ position: 'absolute', opacity: 1, zIndex: 3 }}
        alt="Background image of a 404 error"
      />
    </ErrorContainer>
  );
}

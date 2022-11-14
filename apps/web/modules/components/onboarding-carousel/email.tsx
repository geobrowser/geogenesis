import styled from '@emotion/styled';
import React, { useState } from 'react';
import { Button } from '~/modules/design-system/button';
import { Input } from '~/modules/design-system/input';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';

const Container = styled.div(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  backgroundColor: theme.colors.divider,
  borderRadius: theme.radius,
  padding: 60,
  overflow: 'hidden',
}));

const EmailRow = styled.div({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: 340,

  '@media (max-width: 455px)': {
    flexDirection: 'column',
    maxWidth: '100%',
  },
});

const InputContainer = styled.div({
  width: 243,
});

export function Email() {
  const rerender = useState({})[1];
  const inputRef = React.useRef<HTMLInputElement>(null);

  const onSubmitEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (inputRef.current && inputRef.current.value === '') {
      return;
    }

    if (inputRef.current) {
      try {
        const result = await fetch('/api/email/submit?address=' + inputRef.current.value, {
          method: 'POST',
        });

        if (result.status === 201) {
          inputRef.current.value = '';
        }

        if (result.status === 500) {
          console.error('Something went wrong while submitting your email address.');
        }
      } catch (error) {
        console.error('Something went wrong while submitting your email address.');
      }
    }

    rerender({});
  };

  return (
    <form name="email" onSubmit={onSubmitEmail}>
      <Container>
        <Text as="h2" variant="largeTitle">
          Stay updated with the latest content
        </Text>
        <Text as="h3">New content is added by the Geo community every day - never miss out on a thing!</Text>

        <Spacer height={16} />

        <EmailRow>
          <InputContainer>
            <Input aria-label="Email" ref={inputRef} name="address" type="email" placeholder="Email..." />
          </InputContainer>

          <Button>Notify me</Button>
        </EmailRow>

        <Spacer height={32} />

        <img src="/example-spaces.svg" alt="images of example Spaces like Vitamic C, Fungi, Storms" />
      </Container>
    </form>
  );
}

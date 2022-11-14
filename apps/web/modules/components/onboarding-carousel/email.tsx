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
}));

const EmailRow = styled.div({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  // backgroundColor: 'red',
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

    if (inputRef.current) {
      try {
        await fetch('/api/email/submit?address=' + inputRef.current.value, {
          method: 'POST',
        });

        inputRef.current.value = '';
      } catch (error) {
        console.log('error', error);
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
      </Container>
    </form>
  );
}

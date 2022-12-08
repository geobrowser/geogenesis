import styled from '@emotion/styled';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useReducer } from 'react';
import { Button, ButtonVariant } from '~/modules/design-system/button';
import { Tick } from '~/modules/design-system/icons/tick';
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
  position: 'relative',
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

const ErrorContainer = styled.div({
  alignSelf: 'start',
});

const MotionErrorContainer = motion(ErrorContainer);

const ButtonTextContainer = styled.div(props => ({
  padding: `1px ${props.theme.space * 6}px`,
}));

const MotionButtonTextContainer = motion(ButtonTextContainer);

type EmailState = {
  type: 'idle' | 'pending' | 'success' | 'error';
  message?: string;
};

type EmailAction = {
  type: 'idle' | 'pending' | 'success' | 'error';
  message?: string;
};

function reducer(state: EmailState, action: EmailAction): EmailState {
  switch (action.type) {
    case 'idle':
      return { type: 'idle' };
    case 'pending':
      return { type: 'pending' };
    case 'success':
      return { type: 'success', message: action.message };
    case 'error':
      return { type: 'error', message: action.message };
    default:
      return state;
  }
}

export function Email() {
  const [state, dispatch] = useReducer(reducer, { type: 'idle' });
  const inputRef = React.useRef<HTMLInputElement>(null);

  const onSubmitEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (inputRef.current && inputRef.current.value === '') {
      return;
    }

    if (inputRef.current) {
      try {
        // write a regex to validate an email
        const emailRegex = new RegExp(
          /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
        );

        if (!emailRegex.test(inputRef.current.value)) {
          dispatch({ type: 'error', message: "This email address doesn't appear to be valid." });
          return;
        }

        dispatch({ type: 'pending' });

        const result = await fetch('/api/email/submit?address=' + inputRef.current.value, {
          method: 'POST',
        });

        if (result.status === 201) {
          dispatch({ type: 'success' });
          inputRef.current.value = '';
          setTimeout(() => dispatch({ type: 'idle' }), 3600);
        }

        if (result.status === 500) {
          dispatch({ type: 'error', message: 'Something went wrong while submitting your email address.' });
          console.error('Something went wrong while submitting your email address.');
        }
      } catch (error) {
        dispatch({ type: 'error' });
        console.error('Something went wrong while submitting your email address.');
      }
    }
  };

  return (
    <form name="email" onSubmit={onSubmitEmail} noValidate>
      <Container>
        <Text as="h2" variant="largeTitle">
          Stay updated with the latest content
        </Text>
        <Text as="h3">New content is added by the Geo community every day - never miss out on a thing!</Text>

        <Spacer height={16} />

        <div>
          <EmailRow>
            <InputContainer>
              <Input aria-label="Email" ref={inputRef} name="address" type="email" placeholder="Email..." />
            </InputContainer>

            <Button variant={getButtonVariant(state)}>
              <AnimatePresence mode="wait" initial={false}>
                {state.type === 'pending' && (
                  <MotionButtonTextContainer
                    initial={{ scale: 0.1 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.1 }}
                    transition={{ duration: 0.1 }}
                    key="email-pending"
                  >
                    <EmailSpinner />
                  </MotionButtonTextContainer>
                )}
                {(state.type === 'idle' || state.type === 'error') && (
                  <motion.span
                    initial={{ scale: 0.1 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.1 }}
                    transition={{ duration: 0.1 }}
                    key="email-idle"
                  >
                    Notify me
                  </motion.span>
                )}
                {state.type === 'success' && (
                  <MotionButtonTextContainer
                    initial={{ scale: 0.1 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.1 }}
                    transition={{ duration: 0.1 }}
                    key="email-success"
                  >
                    <Tick />
                  </MotionButtonTextContainer>
                )}
              </AnimatePresence>
            </Button>

            <AnimatePresence>
              {state.message && (
                <MotionErrorContainer
                  style={{ position: 'absolute', bottom: -18 }}
                  initial={{ y: -10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  key="email-error-container"
                >
                  <Text variant="smallButton" color="red">
                    {state.message}
                  </Text>
                </MotionErrorContainer>
              )}
            </AnimatePresence>
          </EmailRow>
        </div>

        <Spacer height={32} />

        <img src="/example-spaces.svg" alt="images of example Spaces like Vitamic C, Fungi, Storms" />
      </Container>
    </form>
  );
}

function getButtonVariant(state: EmailState): ButtonVariant {
  switch (state.type) {
    case 'idle':
    case 'pending':
    case 'error':
      return 'primary';
    case 'success':
      return 'done';
    default:
      return 'primary';
  }
}

function EmailSpinner() {
  return (
    <motion.svg
      width="17"
      height="16"
      viewBox="0 0 17 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      initial={{ rotate: '0deg' }}
      animate={{ rotate: '360deg' }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    >
      <circle cx="8.5" cy="8" r="7.5" stroke="url(#paint0_angular_4611_41406)" />
      <defs>
        <radialGradient id="paint0_angular_4611_41406" cx="0" cy="0" r="1">
          <stop stop-color="#ffffff" />
          <stop offset="1" stopColor="#ffffff" stopOpacity={0.1} />
        </radialGradient>
      </defs>
    </motion.svg>
  );
}

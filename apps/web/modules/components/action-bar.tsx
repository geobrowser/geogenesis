import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useState } from 'react';
import { useSigner } from 'wagmi';
import { Button } from '../design-system/button';
import { Divider } from '../design-system/divider';
import { LeftArrowLong } from '../design-system/icons/left-arrow-long';
import { Trash } from '../design-system/icons/trash';
import { Spacer } from '../design-system/spacer';
import { Text } from '../design-system/text';
import { useTriples } from '../state/hook';

const Container = styled.div(props => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  position: 'fixed',
  bottom: props.theme.space * 10,

  margin: '0 auto',
  backgroundColor: props.theme.colors.white,
  boxShadow: `0px 1px 2px #F0F0F0`,
  padding: props.theme.space * 2,
  border: `1px solid ${props.theme.colors['grey-02']}`,
  borderRadius: props.theme.radius,
}));

const MotionContainer = motion(Container);

export function ActionBar() {
  const { data: signer } = useSigner();
  const { changedTriples, publish } = useTriples();
  const [reviewState, setReviewState] = useState<'idle' | 'reviewing' | 'publishing'>('idle');

  const changeCount = changedTriples.length;

  // TODO: Reset the review state to idle on publish

  return (
    <AnimatePresence>
      {changeCount > 0 ? (
        <MotionContainer
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{
            duration: 0.3,
          }}
          key="action-bar"
        >
          {reviewState === 'idle' && <Idle changeCount={changeCount} onNext={() => setReviewState('reviewing')} />}
          {reviewState === 'reviewing' && (
            <Review changeCount={changeCount} onBack={() => setReviewState('idle')} onNext={() => publish(signer!)} />
          )}
        </MotionContainer>
      ) : null}
    </AnimatePresence>
  );
}

interface IdleProps {
  changeCount: number;
  onNext: () => void;
}

function Idle({ changeCount, onNext }: IdleProps) {
  const theme = useTheme();

  return (
    <>
      <Spacer width={8} />
      <Trash color={theme.colors['grey-04']} />
      <Spacer width={8} />
      <Text color="grey-04" variant="button">
        {changeCount} changes
      </Text>

      <Spacer width={16} />
      <Divider type="vertical" />
      <Spacer width={16} />

      <Button variant="primary" onClick={onNext} icon="eye">
        Review changes
      </Button>
    </>
  );
}

const TextButton = styled.button(props => ({
  display: 'flex',
  alignItems: 'center',

  border: 'none',
  backgroundColor: props.theme.colors.white,
  cursor: 'pointer',

  ':hover': {
    border: `inset 0 0 0 1px ${props.theme.colors.ctaPrimary}`,
  },

  ':focus': {
    boxShadow: `inset 0 0 0 2px ${props.theme.colors.ctaPrimary}`,
    outline: 'none',
  },
}));

interface ReviewProps extends IdleProps {
  onBack: () => void;
}

function Review({ changeCount, onNext, onBack }: ReviewProps) {
  const theme = useTheme();

  return (
    <>
      <Spacer width={8} />
      <TextButton onClick={onBack}>
        <LeftArrowLong color={theme.colors['grey-04']} />
        <Spacer width={8} />
        <Text color="grey-04" variant="button">
          Back
        </Text>
      </TextButton>

      <Spacer width={16} />
      <Divider type="vertical" />
      <Spacer width={16} />

      <Trash color={theme.colors['grey-04']} />
      <Spacer width={8} />
      <Text color="grey-04" variant="button">
        {changeCount} changes
      </Text>

      <Spacer width={16} />
      <Divider type="vertical" />
      <Spacer width={16} />

      <Text variant="button">Happy with these changes?</Text>

      <Spacer width={16} />

      <Button variant="primary" onClick={onNext} icon="publish">
        Publish
      </Button>
    </>
  );
}
